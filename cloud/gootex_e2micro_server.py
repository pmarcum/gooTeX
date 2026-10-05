# GooTeX VM Server Engine
# Migrated from Google Colab to E2-micro VM.
#
# Architecture:
#   - All config via environment variables
#   - Persistent flat cache per doc_id at CACHE_BASE/{doc_id}/
#   - Delta image sync via /check_cache endpoint
#   - Aux files (.aux .bbl .toc .lof) cached between compiles
#   - PDF returned as base64 in compile response
#   - Zip saved to cache, download token returned for second fetch
#   - BibMan integration for missing .bib files
#   - Auth via X-GooTeX-Credential header on every endpoint

from flask import Flask, request, jsonify, send_file
from google import genai
from functools import wraps
import os, subprocess, json, re, time, shutil, datetime, traceback, logging, tempfile, base64, secrets
import concurrent.futures
import requests as http_requests

app = Flask(__name__)
logging.getLogger('werkzeug').setLevel(logging.ERROR)

# ==========================================
# 🔐 ENVIRONMENT VARIABLE CONFIG
# ==========================================
GEMINI_API_KEY    = os.environ.get('GEMINI_API_KEY', '')
BIBMAN_SECRET     = os.environ.get('BIBMAN_CREDENTIAL', '')
GOOTEX_SECRET     = os.environ.get('GOOTEX_CREDENTIAL', '')
NGROK_SKIP_HEADER = '69420'
RCLONE_REMOTE     = os.environ.get('RCLONE_REMOTE_NAME', 'gdrive')
# Paths default to the service user's home so the server is portable across
# installs (on the reference VM, ~ resolves to /home/bibman). Override via env.
CACHE_BASE        = os.environ.get('GOOTEX_CACHE_BASE', os.path.expanduser('~/gootex_cache'))
PROCESSING_BASE   = os.environ.get('GOOTEX_PROCESSING_BASE', os.path.expanduser('~/gootex_processing'))
# BibMan export endpoint (localhost, same host) and AI model — env-tunable.
BIBMAN_URL        = os.environ.get('BIBMAN_URL', 'http://localhost:8081/api/export/bib')
GEMINI_MODEL      = os.environ.get('GOOTEX_GEMINI_MODEL', 'gemini-2.5-flash')

# In-memory token store for zip downloads: {token: {'path': ..., 'expires': ...}}
_download_tokens = {}
# Per-document compile locks — prevents simultaneous compiles of same doc
_compile_locks_mutex = __import__('threading').Lock()

def _get_lock_path(doc_id):
    return os.path.join(CACHE_BASE, doc_id, 'compile.lock')
# ==========================================
# 🤖 AI CLIENT INIT
# ==========================================
ai_client  = genai.Client(api_key=GEMINI_API_KEY, http_options={'api_version': 'v1'}) if GEMINI_API_KEY else None
ai_enabled = (ai_client is not None)

# ==========================================
# 📡 RESPONSE HEADERS
# ==========================================
@app.after_request
def add_header(response):
    response.headers['ngrok-skip-browser-warning'] = NGROK_SKIP_HEADER
    return response

# ==========================================
# 🔒 AUTH DECORATOR
# Every endpoint requires X-GooTeX-Credential
# header matching the shared secret.
# ==========================================
def gootex_auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not GOOTEX_SECRET:
            # No secret configured — log warning but allow through
            # so the server works during initial setup
            print("  ⚠️  GOOTEX_CREDENTIAL not set — auth disabled!")
            return f(*args, **kwargs)
        credential = request.headers.get('X-GooTeX-Credential', '')
        if credential != GOOTEX_SECRET:
            return jsonify({'status': 'error', 'log': '🔒 Unauthorized.'}), 403
        return f(*args, **kwargs)
    return decorated

# ==========================================
# 🧠 UTILITIES (unchanged from Colab version)
# ==========================================

def clean_latex(text):
    if not text: return ""
    MACROS = { r"\\apj": "ApJ", r"\\apjl": "ApJ Lett", r"\\aap": "A&A",
               r"\\mnras": "MNRAS", r"\\aj": "AJ", r"\\nat": "Nature" }
    for mac, rep in MACROS.items(): text = re.sub(mac, rep, text, flags=re.IGNORECASE)
    text = re.sub(r'\\[a-zA-Z]+\{(.*?)\}', r'\1', text)
    return text.replace('{', '').replace('}', '').strip()

def format_log_item(filename, line, type_label, source, message):
    return f"{filename}:{line}:{type_label}:{source}:{message}"

def parse_latex_log(log_text):
    parsed_items = []
    seen = set()
    lines = log_text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        match      = re.match(r"^(.*?\.[a-zA-Z0-9]+):(\d+):\s+(.*)$", line)
        match_bang = re.match(r"^! (.*)$", line)
        if match or match_bang:
            if match:
                filename, lineno, msg = match.groups()
                type_lbl = "Error"
            else:
                filename, lineno, msg, type_lbl = "Global", "0", match_bang.group(1), "Global"
            context = []
            i += 1
            while i < len(lines):
                nxt = lines[i].rstrip()
                if re.match(r"^(.*?\.[a-zA-Z0-9]+):(\d+):", nxt) or re.match(r"^! ", nxt):
                    i -= 1; break
                if not nxt.strip(): break
                context.append(nxt)
                i += 1
            full_msg = msg
            if context:
                safe_html = "<br>".join([c.replace("<", "&lt;") for c in context[:5]])
                full_msg += f"<div style='font-family:monospace; font-size:0.8em; color:#888; margin-top:3px;'>{safe_html}</div>"
            item = format_log_item(filename, lineno, type_lbl, "Compiler", full_msg)
            if item not in seen: parsed_items.append(item); seen.add(item)
        else: i += 1
    return "\n".join(parsed_items)

def flatten_latex_project(base_dir, main_content):
    def replace_input(match):
        filename = match.group(1).strip()
        if not filename.endswith('.tex'): filename += '.tex'
        path = os.path.join(base_dir, filename)
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    return flatten_latex_project(base_dir, f.read())
            except: pass
        return match.group(0)
    return re.sub(r'\\(?:input|include)\{([^}]+)\}', replace_input, main_content)

def get_page_count_live(work_dir, job_name):
    log_path = os.path.join(work_dir, f"{job_name}.log")
    if os.path.exists(log_path):
        try:
            with open(log_path, 'rb') as f:
                f.seek(0, 2); size = f.tell()
                f.seek(max(0, size - 30000))
                content = f.read().decode('utf-8', errors='ignore')
                match = re.search(r'(?:Output written on .*? )?\((\d+)\s+pages?', content)
                if match: return match.group(1)
        except: pass
    return "0"

def inject_metadata(tex_content, user_email, doc_name):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    tex_content = tex_content.replace("[INSERT-TIMESTAMP]", now_str)
    clean_user  = re.sub(r'[^a-zA-Z0-9@.]', '', str(user_email))
    clean_title = re.sub(r'[^a-zA-Z0-9 _-]', '', str(doc_name))
    meta_cmd = f"\\pdfinfo{{ /Title ({clean_title}) /Author ({clean_user}) /Creator (GooTeX v47.0) }}"
    if "\\documentclass" in tex_content:
        return tex_content.replace("\\documentclass", f"{meta_cmd}\n\\documentclass", 1)
    return f"{meta_cmd}\n{tex_content}"

def run_linter(tex_content):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.tex', delete=True) as f:
        f.write(tex_content); f.flush()
        cmd = ["chktex", "-q", "-v0", "-nall", "-w1", "-w15", "-w16", "-w17",
               "-f", "%l:%d:%m\n", f.name]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True)
            formatted = []
            for line in res.stdout.split('\n'):
                p = line.split(':')
                if len(p) >= 3:
                    formatted.append(format_log_item("Lint", p[0], "Warning", "Linter", p[2]))
            return "\n".join(formatted)
        except: return ""

def run_image_optimizer(search_root):
    tasks = []
    for root, dirs, files in os.walk(search_root):
        if "Compiled" in root: continue
        for f in files:
            if "_UNCOMPRESSED" in f: continue
            if "_NOCOMPRESS" in f: continue
            if not f.lower().endswith(('.png', '.jpg', '.jpeg', '.tif')): continue
            full_path = os.path.join(root, f)
            try:
                if os.path.getsize(full_path) > 1.5 * 1024 * 1024:
                    tasks.append((root, f, full_path))
            except: continue
    def compress_worker(task_tuple):
        root_path, filename, f_path = task_tuple
        try:
            name, ext = os.path.splitext(filename)
            backup_path = os.path.join(root_path, f"{name}_UNCOMPRESSED{ext}")
            if os.path.exists(backup_path): return None
            os.rename(f_path, backup_path)
            subprocess.run(
                f"magick convert \"{backup_path}\" -quality 82 -thumbnail '975x1350>' \"{f_path}\"",
                shell=True)
            return filename
        except: return None
    results = []
    if tasks:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            results = list(executor.map(compress_worker, tasks))
    return len([r for r in results if r]), [r for r in results if r]

def get_used_citations_from_aux(work_dir, doc_name):
    used = set()
    aux = os.path.join(work_dir, doc_name.replace('.tex', '.aux'))
    if os.path.exists(aux):
        try:
            with open(aux, 'r') as f:
                for m in re.findall(r'\\citation\{([^}]+)\}', f.read()):
                    for k in m.split(','): used.add(k.strip())
        except: pass
    return used

# ==========================================
# 🗂️  PERSISTENT CACHE MANAGEMENT
# Cache structure (all flat, no subfolders):
#   CACHE_BASE/{doc_id}/image.png
#   CACHE_BASE/{doc_id}/paper.aux
#   CACHE_BASE/{doc_id}/cache_manifest.json
#
# cache_manifest.json tracks:
#   - per-image: filename → modified timestamp
#   - last_compiled: ISO timestamp
#   - bib_source: "user" or "bibman"
# ==========================================

def get_cache_dir(doc_id):
    """Returns the cache directory for a doc_id, creating it if needed."""
    cache_dir = os.path.join(CACHE_BASE, doc_id)
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir

def load_cache_manifest(doc_id):
    """Loads the cache manifest for a doc_id. Returns empty dict if not found."""
    manifest_path = os.path.join(CACHE_BASE, doc_id, 'cache_manifest.json')
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, 'r') as f:
                return json.load(f)
        except: pass
    return {}

def save_cache_manifest(doc_id, manifest):
    """Saves the cache manifest for a doc_id."""
    cache_dir = get_cache_dir(doc_id)
    manifest_path = os.path.join(cache_dir, 'cache_manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

def flatten_image_path(raw_path):
    """Strips any directory prefix from an image path, returning bare filename.
    e.g. 'figures/galaxy.png' → 'galaxy.png'
    """
    return os.path.basename(raw_path.strip())

def flatten_tex_image_paths(tex_content):
    """Rewrites all image paths in tex source to bare filenames.
    Finds any {filename.ext} where ext is a known image extension.
    Works for all image commands including \\begin{overpic}[complex options]{path}.
    """
    IMAGE_EXTS = r'(?:png|pdf|jpg|jpeg|eps|ps|tif|tiff|svg)'
    pattern    = r'\{([^{}]*\.(' + IMAGE_EXTS + r'))\}'

    def replacer(m):
        return '{' + flatten_image_path(m.group(1)) + '}'

    return re.sub(pattern, replacer, tex_content, flags=re.IGNORECASE)

# ==========================================
# 📚  BIBMAN INTEGRATION
#
# Two scenarios:
# 1. \bibliography{bibman:LibraryName.bib} in tex:
#    Strip prefix, write empty .bib for first pass,
#    fetch real entries from BibMan after .aux exists.
# 2. No .bib at all in payload:
#    Same flow but no library name known upfront.
# ==========================================

BIBMAN_PREFIX = 'bibman:'

def extract_bibman_library(tex_content):
    """
    Finds \\bibliography{bibman:LibraryName.bib} pattern.
    Returns library_name string or None if not found.
    """
    match = re.search(
        r'\\bibliography\{' + BIBMAN_PREFIX + r'([^}]+?)(?:\.bib)?\}',
        tex_content
    )
    result = match.group(1).strip() if match else None
    print(f"  🔍 extract_bibman_library: {'found=' + result if result else 'NOT FOUND — no bibman: prefix in tex'}")
    return result

def strip_bibman_prefix(tex_content):
    """
    Rewrites \\bibliography{bibman:LibraryName.bib}
    to       \\bibliography{LibraryName}
    so pdflatex sees a normal bibliography command.
    """
    result = re.sub(
        r'(\\bibliography\{)' + BIBMAN_PREFIX + r'([^}]+?)(?:\.bib)?(\})',
        r'\1\2\3',
        tex_content
    )
    if result != tex_content:
        print(f"  🔍 strip_bibman_prefix: prefix stripped successfully")
    return result

def fetch_bib_from_bibman(bibkeys, library=None):
    """
    Calls BibMan POST /api/export/bib directly on gunicorn port 8081.
    Note: NO /bibman prefix — nginx strips that, but we call gunicorn directly.
    Returns (bib_content_string, missing_keys_list) or (None, []) on error.
    Endpoint is the module-level BIBMAN_URL (env-tunable).
    """
    if not bibkeys: return None, []
    if not BIBMAN_SECRET:
        print("  ⚠️  BIBMAN_CREDENTIAL not set — skipping BibMan.")
        return None, []
    payload = {"bibkeys": sorted(bibkeys)}
    if library: payload["library"] = library
    print(f"  🔍 fetch_bib_from_bibman: calling {BIBMAN_URL}")
    print(f"  🔍 payload: keys={sorted(bibkeys)}, library={library}")
    print(f"  🔍 credential set: {bool(BIBMAN_SECRET)} (len={len(BIBMAN_SECRET)})")
    try:
        resp = http_requests.post(
            BIBMAN_URL,
            json=payload,
            headers={"X-BibMan-Credential": BIBMAN_SECRET},
            timeout=15
        )
        print(f"  🔍 BibMan HTTP status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"  🔍 BibMan response body: {resp.text[:200]}")
            print(f"  ⚠️  BibMan returned HTTP {resp.status_code}")
            return None, []
        data        = resp.json()
        bib_content = data.get("bibtex", "")
        missing     = data.get("missing", [])
        found       = data.get("found", 0)
        print(f"  🔍 BibMan response: found={found}, missing={missing}, bibtex_len={len(bib_content)}")
        if missing: print(f"  ⚠️  BibMan: {found} found, {len(missing)} not found: {missing}")
        else:       print(f"  ✅  BibMan: {found} entries retrieved.")
        return (bib_content if bib_content else None), missing
    except http_requests.exceptions.ConnectionError as e:
        print(f"  ⚠️  BibMan connection error: {e}")
        return None, []
    except Exception as e:
        print(f"  ⚠️  BibMan error: {e}")
        return None, []

def apply_bibman_bib(cache_dir, file_name, job_name, library_name):
    """
    Called after first pdflatex pass produces .aux file.
    Extracts cited keys, calls BibMan, writes real .bib file.
    The .bib filename matches the stripped \\bibliography{} command.
    Returns list of missing keys as warnings.
    """
    print(f"  🔍 apply_bibman_bib: cache_dir={cache_dir}, job={job_name}, library={library_name}")
    aux_path = os.path.join(cache_dir, job_name + ".aux")
    print(f"  🔍 .aux file exists: {os.path.exists(aux_path)}")

    cited_keys = get_used_citations_from_aux(cache_dir, file_name)
    print(f"  🔍 cited_keys from .aux: {sorted(cited_keys) if cited_keys else 'NONE'}")
    if not cited_keys:
        print("  ⚠️  No citations found in .aux file — check \\cite{} commands in tex source.")
        return []

    print(f"  ℹ️  Fetching {len(cited_keys)} cited keys from BibMan "
          f"(library: {library_name or 'default'})...")
    bib_content, missing = fetch_bib_from_bibman(cited_keys, library_name)

    if not bib_content:
        print("  ⚠️  BibMan returned no content — bibliography will be empty.")
        return list(cited_keys)

    # Filename matches what \\bibliography{} points to after prefix strip
    bib_name = (library_name or job_name) + ".bib"
    bib_path = os.path.join(cache_dir, bib_name)
    with open(bib_path, "w", encoding="utf-8") as f:
        f.write(bib_content)
    print(f"  ✅  Wrote {bib_name} ({os.path.getsize(bib_path)} bytes, "
          f"{len(cited_keys) - len(missing)}/{len(cited_keys)} keys found).")

    # Verify the file is readable
    print(f"  🔍 .bib file exists after write: {os.path.exists(bib_path)}")
    return missing


# ==========================================
# 📄  PDF ENCODER FOR RESPONSE
# Returns PDF as base64 string for GAS to
# decode and write to Drive via DriveApp.
# ==========================================

def encode_pdf_for_response(cache_dir, job_name):
    pdf_path = os.path.join(cache_dir, job_name + '.pdf')
    if not os.path.exists(pdf_path): return None
    with open(pdf_path, 'rb') as f:
        pdf_b64 = base64.b64encode(f.read()).decode('utf-8')
    print(f"  ✅  PDF encoded ({os.path.getsize(pdf_path):,} bytes)")
    return pdf_b64

# ==========================================
# 🗜️  ZIP DOWNLOAD TOKEN
# Zip is saved to cache dir. A one-time token
# is returned to GAS which fetches it via
# GET /download/<token>. Token expires in 10min.
# ==========================================

def create_download_token(zip_path, filename):
    """Creates a one-time download token for a zip file."""
    token = secrets.token_urlsafe(32)
    expires = time.time() + 600  # 10 minutes
    _download_tokens[token] = {
        'path': zip_path,
        'filename': filename,
        'expires': expires
    }
    return token

def cleanup_expired_tokens():
    """Removes expired download tokens."""
    now = time.time()
    expired = [t for t, v in _download_tokens.items() if v['expires'] < now]
    for t in expired:
        del _download_tokens[t]

# ==========================================
# 🚀 CHECK CACHE ENDPOINT
# GAS sends image manifest, VM returns list
# of filenames it needs (not cached or changed).
# ==========================================

@app.route("/check_cache", methods=["POST"])
@gootex_auth_required
def check_cache():
    try:
        data   = request.json
        doc_id = data.get("doc_id", "")
        images = data.get("images", [])  # [{filename, modified}, ...]

        if not doc_id:
            return jsonify({"status": "error", "needed": []}), 400

        manifest = load_cache_manifest(doc_id)
        img_manifest = manifest.get("images", {})

        needed = []
        print(f"  🔍 img_manifest keys: {list(img_manifest.keys())}")
        for img in images:
            filename = flatten_image_path(img.get("filename", ""))
            modified = img.get("modified", "")
            if not filename: continue
            cached = img_manifest.get(filename, {})
            print(f"  🔍 checking: '{filename}' cached={bool(cached)} modified_match={cached.get('modified')==modified}")
            if cached.get("modified") != modified:
                needed.append(filename)
        print(f"  🔍 needed: {needed}")
        print(f"  🔍 Cache check: {len(images)} images, {len(needed)} needed for doc {doc_id[:8]}...")
        return jsonify({"status": "success", "needed": needed}), 200
    except:
        return jsonify({"status": "error", "needed": [], "log": traceback.format_exc()}), 500

# ==========================================
# 📥 DOWNLOAD ENDPOINT
# Serves zip files to GAS via one-time token.
# ==========================================

@app.route("/download/<token>", methods=["GET"])
@gootex_auth_required
def download_file(token):
    cleanup_expired_tokens()
    entry = _download_tokens.get(token)
    if not entry:
        return jsonify({"status": "error", "log": "Invalid or expired download token."}), 404
    if time.time() > entry['expires']:
        del _download_tokens[token]
        return jsonify({"status": "error", "log": "Download token expired."}), 410
    zip_path = entry['path']
    filename = entry['filename']
    if not os.path.exists(zip_path):
        return jsonify({"status": "error", "log": "File not found."}), 404
    # Invalidate token — one-time use
    del _download_tokens[token]
    return send_file(zip_path, as_attachment=True,
                     download_name=filename,
                     mimetype='application/zip')

# ==========================================
# 🚀 MAIN HANDLER
# ==========================================

@app.route("/", methods=["POST"])
@gootex_auth_required
def handle_request():
    cache_dir      = None
    bibman_warn    = []
    bibman_library = None
    task           = None
    doc_id         = None
    try:
        data    = request.json
        task    = data.get("task")
        doc_id  = data.get("doc_id", "unknown")
        # Reject duplicate compile requests for same document
        if task == "compile":
            os.makedirs(get_cache_dir(doc_id), exist_ok=True)
            lock_path = _get_lock_path(doc_id)
            if os.path.exists(lock_path):
                print(f"  ⚠️  Duplicate compile rejected for {doc_id[:8]}...")
                return jsonify({"status": "busy", "log": "⏳ Compile already in progress — please wait."})
            open(lock_path, 'w').close()
        # ----------------------------------------------------------
        # STATUS
        # ----------------------------------------------------------
        if task == 'status':
            return jsonify({'status': 'success', 'ai_active': ai_enabled})

        # ----------------------------------------------------------
        # ASK AI
        # ----------------------------------------------------------
        if task == 'ask_ai':
            if not ai_enabled:
                return jsonify({'status': 'error', 'answer': "⚠️ API Key missing."})
            error_msg       = data.get('error_msg', 'Unknown Error')
            context_snippet = (data.get('context') or "")[-1500:]
            system_gate     = ("ACT AS: Technical LaTeX Debugger. CONSTRAINTS: < 50 words. "
                               "Bulleted shorthand only. NO filler. "
                               "OUTPUT: 1. Cause. 2. Fix. 3. Warning.")
            try:
                response = ai_client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=f"{system_gate}\n\nERROR:\n{error_msg}\n\nCONTEXT:\n{context_snippet}"
                )
                return jsonify({'status': 'success', 'answer': response.text})
            except Exception as e:
                return jsonify({'status': 'error', 'answer': f"AI Error: {str(e)}"}), 200

        # ----------------------------------------------------------
        # SETUP CACHE DIR
        # ----------------------------------------------------------
        cache_dir  = get_cache_dir(doc_id)
        manifest   = load_cache_manifest(doc_id)

        raw_path   = data.get("full_path", "").strip()
        file_name  = os.path.basename(raw_path)
        if not file_name.endswith(".tex"): file_name += ".tex"
        job_name   = os.path.splitext(file_name)[0]

        # ----------------------------------------------------------
        # OPTIMIZE
        # ----------------------------------------------------------
        if task == "optimize":
            count, files = run_image_optimizer(cache_dir)
            return jsonify({"status": "success", "log": f"✅ Compressed {count} images.", "files": files})

        if task == "compress_image":
            filename  = data.get("filename", "")
            b64       = data.get("base64", "")
            mime_type = data.get("mime", "image/png")
            if not filename or not b64:
                return jsonify({"status": "error", "log": "Missing filename or image data."}), 400
            try:
                img_bytes   = base64.b64decode(b64)
                name, ext   = os.path.splitext(filename)
                tmp_dir     = tempfile.mkdtemp(prefix="gootex_compress_", dir=PROCESSING_BASE)
                src_path    = os.path.join(tmp_dir, filename)
                dst_path    = os.path.join(tmp_dir, f"{name}_compressed{ext}")
                with open(src_path, "wb") as f:
                    f.write(img_bytes)
                subprocess.run(
                    f"magick convert \"{src_path}\" -quality 82 -thumbnail '975x1350>' \"{dst_path}\"",
                    shell=True)
                if not os.path.exists(dst_path):
                    return jsonify({"status": "error", "log": "Compression failed — magick produced no output."}), 500
                with open(dst_path, "rb") as f:
                    compressed_b64 = base64.b64encode(f.read()).decode("utf-8")
                original_size   = len(img_bytes)
                compressed_size = os.path.getsize(dst_path)
                print(f"  🗜️  Manual compress: {filename} ({original_size:,} → {compressed_size:,} bytes)")
                return jsonify({
                    "status":           "success",
                    "compressed_base64": compressed_b64,
                    "original_size":    original_size,
                    "compressed_size":  compressed_size,
                    "log":              f"✅ {filename}: {original_size//1024:,}KB → {compressed_size//1024:,}KB"
                })
            except Exception as e:
                return jsonify({"status": "error", "log": f"Compression error: {e}"}), 500
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

        # ----------------------------------------------------------
        # WRITE TEXT FILES TO CACHE (always fresh)
        # ----------------------------------------------------------
        raw_text = data.get("main_text", "") or data.get("raw_text", "")
        if task == "compile":
            raw_text = inject_metadata(raw_text, data.get("user"), file_name)

        # Flatten image paths in tex source before writing
        # Also strip bibman: prefix so pdflatex sees normal \bibliography{}
        flattened_text = flatten_tex_image_paths(raw_text)
        bibman_library = extract_bibman_library(flattened_text)
        if bibman_library:
            flattened_text = strip_bibman_prefix(flattened_text)
            if task == "compile":
                # Write empty .bib placeholder so pdflatex doesn't crash on first pass
                empty_bib_path = os.path.join(cache_dir, bibman_library + ".bib")
                if not os.path.exists(empty_bib_path):
                    with open(empty_bib_path, "w") as f:
                        f.write("% GooTeX BibMan placeholder — will be populated after first pass\n")
                    print(f"  📄  Created empty placeholder: {bibman_library}.bib")
                # Check for stale .aux — if it doesn't reference the correct
                # bibman library, delete it so pdflatex regenerates it fresh.
                # This happens once when upgrading from pre-bibman: stripping.
                aux_path = os.path.join(cache_dir, job_name + '.aux')
                if os.path.exists(aux_path):
                    with open(aux_path, 'r', errors='ignore') as f:
                        aux_content = f.read()
                    if f'\\bibdata{{{bibman_library}}}' not in aux_content:
                        print(f"  🔍 Stale .aux detected (missing \\bibdata{{{bibman_library}}}) — removing for fresh generation")
                        os.remove(aux_path)
                        bbl_path = os.path.join(cache_dir, job_name + '.bbl')
                        if os.path.exists(bbl_path):
                            os.remove(bbl_path)
                            print(f"  🔍 Removed stale .bbl")

        with open(os.path.join(cache_dir, file_name), "w", encoding="utf-8") as f:
            f.write(flattened_text)

        # Write sub_docs — text files and images
        sub_docs       = data.get("sub_docs", [])
        bib_in_payload = False
        img_manifest   = manifest.get("images", {})
        compression_notes = []

        if isinstance(sub_docs, list):
            for doc_obj in sub_docs:
                d_name    = doc_obj.get("name")
                d_content = doc_obj.get("content")
                if not d_name or d_content is None: continue

                if d_name.startswith("__image__"):
                    # Binary image — decode base64 and write to cache (flat)
                    actual_filename = flatten_image_path(d_name[len("__image__"):])
                    if isinstance(d_content, dict) and "base64" in d_content:
                        try:
                            img_bytes = base64.b64decode(d_content["base64"])
                            img_path  = os.path.join(cache_dir, actual_filename)
                            with open(img_path, "wb") as f:
                                f.write(img_bytes)
                            # Update image manifest with new modified timestamp
                            img_manifest[actual_filename] = {
                                "modified": d_content.get("modified", "")
                            }
                            # Auto-compress if over 1.5MB and not flagged _NOCOMPRESS
                            img_size = len(img_bytes)
                            if img_size > 1.5 * 1024 * 1024 and "_NOCOMPRESS" not in actual_filename:
                                name, ext = os.path.splitext(actual_filename)
                                backup_path = os.path.join(cache_dir, f"{name}_UNCOMPRESSED{ext}")
                                if not os.path.exists(backup_path):
                                    os.rename(img_path, backup_path)
                                    subprocess.run(
                                        f"magick convert \"{backup_path}\" -quality 82 -thumbnail '975x1350>' \"{img_path}\"",
                                        shell=True)
                                    compressed_size = os.path.getsize(img_path) if os.path.exists(img_path) else 0
                                    print(f"  🗜️  Auto-compressed: {actual_filename} ({img_size:,} → {compressed_size:,} bytes)")
                                    compression_notes.append(f"Info:0:Info:GooTeX:🗜️ Auto-compressed: {actual_filename} ({img_size//1024:,}KB → {compressed_size//1024:,}KB)")


                                else:
                                    print(f"  🖼️  Cached image: {actual_filename} ({img_size:,} bytes, already compressed)")
                            else:
                                print(f"  🖼️  Cached image: {actual_filename} ({img_size:,} bytes)")
                        except Exception as e:
                            print(f"  ⚠️  Image decode failed for {actual_filename}: {e}")
                    else:
                        print(f"  ⚠️  Image skipped (unexpected format) for {actual_filename}: type={type(d_content)}")
                else:
                    # Text file — flatten any image paths within it too
                    flat_name = os.path.basename(d_name)
                    content   = flatten_tex_image_paths(d_content) if flat_name.endswith('.tex') else d_content
                    with open(os.path.join(cache_dir, flat_name), "w", encoding="utf-8") as f:
                        f.write(content)
                    if flat_name.lower().endswith(".bib"):
                        bib_in_payload = True

        # Save updated image manifest
        manifest["images"] = img_manifest
        save_cache_manifest(doc_id, manifest)
        print(f"  🔍 compression_notes: {compression_notes}")
        if compression_notes:
            compiler_log_prefix = "\n".join(compression_notes) + "\n"
        else:
            compiler_log_prefix = "" 

        # ----------------------------------------------------------
        # COMPILE ENVIRONMENT
        # TEXINPUTS includes cache_dir so pdflatex finds all files
        # ----------------------------------------------------------
        env = os.environ.copy()
        env['TEXINPUTS'] = f".:{cache_dir}:"
        env['BIBINPUTS'] = f".:{cache_dir}:"
        print(f"🚀 Building: {job_name}  [task={task}]  doc={doc_id[:8]}...")

        def run_wc_task():
            wc = "0"
            try:
                with open(os.path.join(cache_dir, file_name), 'r') as f:
                    flat = flatten_latex_project(cache_dir, f.read())
                wc_file = os.path.join(cache_dir, "wc.tex")
                with open(wc_file, 'w') as f: f.write(flat)
                out   = subprocess.getoutput(f"texcount -sum -1 \"{wc_file}\" 2>/dev/null").strip()
                match = re.search(r'^(\d+)', out)
                if match: wc = match.group(1)
            except: pass
            return wc

        lint_log, wc = "", "0"
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_lint = executor.submit(run_linter, flattened_text)
            future_wc   = executor.submit(run_wc_task)

            # Restore cached aux files before first pdflatex pass
            AUX_EXTS = ['.aux', '.bbl', '.toc', '.lof', '.lot']
            for ext in AUX_EXTS:
                cached = os.path.join(cache_dir, job_name + ext)
                # aux files live in cache_dir which IS the working dir
                # so no copy needed — pdflatex finds them directly

            cmd = ["pdflatex", "-synctex=0", "-recorder", "-file-line-error",
                   "-halt-on-error", "-interaction=nonstopmode", f"-jobname={job_name}"]
            if task in ["draft", "wordcount", "zip"]: cmd.append("-draftmode")
            cmd.append(file_name)

            sub = subprocess.run(cmd, cwd=cache_dir, capture_output=True, text=True, env=env)

            # ----------------------------------------------------------
            # BIBTEX / BIBMAN PASS (compile only)
            #
            # Three cases:
            # A. \bibliography{bibman:LibraryName.bib} in source:
            #    tex was already stripped of prefix before writing.
            #    Write empty .bib placeholder, run first pdflatex pass
            #    to get .aux, then fetch real entries from BibMan.
            # B. .bib arrived in payload (user-supplied):
            #    Use it as-is — BibMan never called.
            # C. No .bib at all:
            #    Try BibMan with no library name specified.
            # ----------------------------------------------------------
            if task == "compile" and os.path.exists(os.path.join(cache_dir, job_name + ".aux")):

                bibman_library = extract_bibman_library(raw_text)
                print(f"  🔍 compile handler: bibman_library={bibman_library}, bib_in_payload={bib_in_payload}")

                if bibman_library:
                    # Case A — bibman: prefix detected
                    print(f"  🔍 Case A: bibman: prefix detected, library={bibman_library}")
                    bibman_warn = apply_bibman_bib(
                        cache_dir, file_name, job_name, bibman_library)
                elif not bib_in_payload:
                    # Case C — no .bib at all
                    print(f"  🔍 Case C: no .bib in payload, trying BibMan without library name")
                    bibman_warn = apply_bibman_bib(
                        cache_dir, file_name, job_name, None)
                else:
                    print(f"  🔍 Case B: .bib arrived in payload — using as-is, BibMan skipped")

                # Log bibtex run
                print(f"  🔍 Running bibtex on {job_name}...")
                bibtex_result = subprocess.run(["bibtex", job_name],
                               cwd=cache_dir, capture_output=True, text=True, env=env)
                print(f"  🔍 bibtex returncode: {bibtex_result.returncode}")
                if bibtex_result.stdout: print(f"  🔍 bibtex stdout: {bibtex_result.stdout[:300]}")
                if bibtex_result.stderr: print(f"  🔍 bibtex stderr: {bibtex_result.stderr[:200]}")

                subprocess.run(cmd, cwd=cache_dir, capture_output=True, env=env)
                sub = subprocess.run(cmd, cwd=cache_dir,
                                     capture_output=True, text=True, env=env)
                print(f"  🔍 final pdflatex returncode: {sub.returncode}")

            lint_log, wc = future_lint.result(), future_wc.result()

        compiler_log = parse_latex_log(sub.stdout)

        # Append BibMan warnings if any keys were missing
        if bibman_warn:
            warn_lines = "\n".join(
                format_log_item("BibMan", "0", "Warning", "BibMan",
                                f"Key not found in BibMan library: {k}")
                for k in bibman_warn
            )
            compiler_log = (compiler_log + "\n" + warn_lines).strip()

        # Update last_compiled in manifest
        manifest["last_compiled"] = datetime.datetime.utcnow().isoformat()
        save_cache_manifest(doc_id, manifest)

        # ----------------------------------------------------------
        # ZIP TASK — build submission package
        # ----------------------------------------------------------
        if task == "zip":
            try:
                staging_dir = os.path.join(cache_dir, "submission_staging")
                if os.path.exists(staging_dir): shutil.rmtree(staging_dir)
                os.makedirs(staging_dir)
                # Use .fls to find exactly what pdflatex read
                fls_path = os.path.join(cache_dir, f"{job_name}.fls")
                included = set()
                if os.path.exists(fls_path):
                    with open(fls_path, 'r') as f:
                        for line in f:
                            if line.startswith("INPUT "):
                                path = line.split("INPUT ")[1].strip()
                                # Resolve relative paths against cache_dir
                                if not os.path.isabs(path):
                                    path = os.path.join(cache_dir, path)
                                if os.path.exists(path):
                                    # Only include files from cache_dir — excludes all system LaTeX files
                                    if not path.startswith(cache_dir):
                                        continue
                                    fname = os.path.basename(path)
                                    # Exclude intermediate files
                                    if not any(path.endswith(e) for e in
                                               ['.aux', '.bbl', '.toc', '.lof', '.lot',
                                                '.log', '.fls', '.out', '.synctex.gz',
                                                'cache_manifest.json']):
                                        included.add(path)

                # Always include .bib files from cache_dir (not in .fls since bibtex reads them)
                for fname in os.listdir(cache_dir):
                    if fname.endswith('.bib') and '_bibman' not in fname:
                        included.add(os.path.join(cache_dir, fname))

                # Copy included files to staging (already flat)
                for path in included:
                    fname = os.path.basename(path)
                    if fname.startswith('_'): continue
                    shutil.copy2(path, os.path.join(staging_dir, fname))

                # Always include the compiled PDF
                pdf_path = os.path.join(cache_dir, job_name + '.pdf')
                if os.path.exists(pdf_path):
                    shutil.copy2(pdf_path, os.path.join(staging_dir, job_name + '.pdf'))

                # Create zip
                zip_name = f"{job_name}_SUBMISSION.zip"
                zip_path = os.path.join(cache_dir, zip_name)
                shutil.make_archive(
                    os.path.join(cache_dir, job_name + "_SUBMISSION"),
                    'zip', staging_dir)

                # Clean up staging dir
                shutil.rmtree(staging_dir)

                # Create download token
                token = create_download_token(zip_path, zip_name)
                return jsonify({
                    "status":        "success",
                    "log":           "✅ Submission package created.",
                    "zip_filename":  zip_name,
                    "download_token": token
                }), 200

            except Exception as e:
                return jsonify({"status": "error", "log": str(e)}), 200

        # ----------------------------------------------------------
        # COMPILE — encode PDF, .log, .bib, and .tex for response
        # All sent back to GAS for writing to Drive.
        # ----------------------------------------------------------
        pdf_b64   = None
        log_b64   = None
        bib_b64   = None
        tex_files = []
        if task == "compile":
            pdf_b64 = encode_pdf_for_response(cache_dir, job_name)
            # Encode .log file
            log_path = os.path.join(cache_dir, job_name + ".log")
            if os.path.exists(log_path):
                with open(log_path, 'rb') as f:
                    log_b64 = base64.b64encode(f.read()).decode('utf-8')
                print(f"  📋  Log encoded ({os.path.getsize(log_path):,} bytes)")
            # Encode .bib file (whichever one was used)
            bib_candidates = [
                os.path.join(cache_dir, job_name + ".bib"),
                os.path.join(cache_dir, job_name + "_bibman.bib"),
            ]
            if bibman_library:
                bib_candidates.insert(0, os.path.join(cache_dir, bibman_library + ".bib"))
            for bib_path in bib_candidates:
                if os.path.exists(bib_path) and os.path.getsize(bib_path) > 100:
                    with open(bib_path, 'rb') as f:
                        bib_b64 = base64.b64encode(f.read()).decode('utf-8')
                    print(f"  📚  Bib encoded: {os.path.basename(bib_path)} ({os.path.getsize(bib_path):,} bytes)")
                    break
            # Encode all .tex files (skip wc.tex — internal word count temp file)
            for fname in sorted(os.listdir(cache_dir)):
                if not fname.endswith('.tex'): continue
                if fname.startswith('wc'): continue
                tex_path = os.path.join(cache_dir, fname)
                try:
                    with open(tex_path, 'r', encoding='utf-8', errors='ignore') as f:
                        tex_files.append({
                            "filename": fname,
                            "content":  f.read()
                        })
                    print(f"  📄  Tex queued for Drive: {fname}")
                except Exception as e:
                    print(f"  ⚠️  Tex read failed for {fname}: {e}")

        response_data = {
            "status":     "success" if sub.returncode == 0 else "error",
            "log":        (compiler_log_prefix + compiler_log + "\n" + lint_log).strip(),
            "word_count": wc,
            "page_count": get_page_count_live(cache_dir, job_name)
        }
        if pdf_b64:
            response_data["pdf_base64"]   = pdf_b64
            response_data["pdf_filename"] = job_name + ".pdf"
        if log_b64:
            response_data["log_base64"]   = log_b64
            response_data["log_filename"] = job_name + ".log"
        if bib_b64:
            response_data["bib_base64"]   = bib_b64
            response_data["bib_filename"] = (bibman_library or job_name) + ".bib"
        if tex_files:
            response_data["tex_files"] = tex_files
        return jsonify(response_data), 200
    except:
        return jsonify({"status": "error", "log": traceback.format_exc()}), 500
    finally:
        if task == "compile" and doc_id:
            lock_path = _get_lock_path(doc_id)
            if os.path.exists(lock_path):
                os.remove(lock_path)
# ===========================================
@app.route("/health", methods=["GET", "POST"])
@gootex_auth_required
def health():
    return jsonify({"status": "healthy"}), 200

# ==========================================
# 🏁 SERVER ENTRY POINT
# ==========================================
def run_goo_server():
    port = int(os.environ.get('GOOTEX_PORT', 8082))
    print(f"🐸 GooTeX VM Server starting on port {port}")
    print(f"   AI enabled:    {ai_enabled}")
    print(f"   Cache base:    {CACHE_BASE}")
    print(f"   Processing:    {PROCESSING_BASE}")
    print(f"   Auth enabled:  {bool(GOOTEX_SECRET)}")
    os.makedirs(CACHE_BASE, exist_ok=True)
    os.makedirs(PROCESSING_BASE, exist_ok=True)
    app.run(host='127.0.0.1', port=port)

if __name__ == "__main__":
    run_goo_server()
