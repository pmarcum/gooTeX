from flask import Flask, request, jsonify
from pyngrok import ngrok, conf
from google.colab import userdata
from google import genai
import os, subprocess, json, re, time, shutil, datetime, traceback, logging, getpass, tempfile
import concurrent.futures

app = Flask(__name__)
logging.getLogger('werkzeug').setLevel(logging.ERROR)

@app.after_request
def add_header(response):
    response.headers['ngrok-skip-browser-warning'] = 'true'
    return response

# Standard Utils (Copy-pasted from Original Cell 2)
def clean_latex(text):
    if not text: return ""
    MACROS = { r"\\apj": "ApJ", r"\\apjl": "ApJ Lett", r"\\aap": "A&A", r"\\mnras": "MNRAS", r"\\aj": "AJ", r"\\nat": "Nature" }
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
        match = re.match(r"^(.*?\.[a-zA-Z0-9]+):(\d+):\s+(.*)$", line)
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
                if re.match(r"^(.*?\.[a-zA-Z0-9]+):(\d+):", nxt) or re.match(r"^! ", nxt): i -= 1; break
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
                with open(path, 'r', encoding='utf-8', errors='ignore') as f: return flatten_latex_project(base_dir, f.read())
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
    clean_user = re.sub(r'[^a-zA-Z0-9@.]', '', str(user_email))
    clean_title = re.sub(r'[^a-zA-Z0-9 _-]', '', str(doc_name))
    meta_cmd = f"\\pdfinfo{{ /Title ({clean_title}) /Author ({clean_user}) /Creator (GooTeX v45.1) }}"
    if "\\documentclass" in tex_content: return tex_content.replace("\\documentclass", f"{meta_cmd}\n\\documentclass", 1)
    return f"{meta_cmd}\n{tex_content}"

def run_linter(tex_content):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.tex', delete=True) as f:
        f.write(tex_content); f.flush()
        cmd = ["chktex", "-q", "-v0", "-nall", "-w1", "-w15", "-w16", "-w17", "-f", "%l:%d:%m\n", f.name]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True)
            formatted = []
            for line in res.stdout.split('\n'):
                p = line.split(':')
                if len(p) >= 3: formatted.append(format_log_item("Lint", p[0], "Warning", "Linter", p[2]))
            return "\n".join(formatted)
        except: return ""

@app.route("/", methods=["POST"])
def handle_request():
    global ai_client, ai_enabled
    temp_dir = None
    try:
        data = request.json
        task = data.get("task")
        if task == 'status': return jsonify({'status':'success','ai_active':ai_enabled})
        if task == 'ask_ai':
            if not ai_enabled: return jsonify({'status': 'error', 'answer': "⚠️ API Key missing."})
            error_msg = data.get('error_msg', 'Unknown Error')
            context_snippet = (data.get('context') or "")[-1500:]
            system_gate = ("ACT AS: Technical LaTeX Debugger. CONSTRAINTS: < 50 words. Bulleted shorthand only. NO filler. OUTPUT: 1. Cause. 2. Fix. 3. Warning.")
            try:
                response = ai_client.models.generate_content(model='gemini-2.0-flash', contents=f"{system_gate}\n\nERROR:\n{error_msg}\n\nCONTEXT:\n{context_snippet}")
                return jsonify({'status':'success', 'answer': response.text})
            except Exception as e:
                return jsonify({'status': 'error', 'answer': f"AI Error: {str(e)}"}), 200

        # Compile Logic
        raw_path = data.get("full_path", "").strip()
        # Find project root via COMM_FILE dir
        comm_dir = os.path.dirname(COMM_FILE)
        project_root = os.path.dirname(comm_dir)
        full_path = raw_path if raw_path.startswith("/") else os.path.join(project_root, raw_path.replace("ROOT:/",""))
        if not full_path.endswith(".tex"): full_path += ".tex"
        drive_doc_dir = os.path.dirname(full_path)

        temp_dir = tempfile.mkdtemp(prefix="gootex_", dir="/dev/shm")
        file_name = os.path.basename(full_path)
        job_name = os.path.splitext(file_name)[0]
        raw_text = data.get("main_text", "") or data.get("raw_text", "")
        if task == "compile": raw_text = inject_metadata(raw_text, data.get("user"), file_name)

        with open(os.path.join(temp_dir, file_name), "w") as f: f.write(raw_text)
        
        env = os.environ.copy()
        env['TEXINPUTS'] = f".:{drive_doc_dir}:{project_root}:"
        
        cmd = ["pdflatex", "-synctex=0", "-recorder", "-file-line-error", "-halt-on-error", "-interaction=nonstopmode", f"-jobname={job_name}", file_name]
        sub = subprocess.run(cmd, cwd=temp_dir, capture_output=True, text=True, env=env)
        
        if task == "compile":
            dest = os.path.join(drive_doc_dir, "Compiled")
            os.makedirs(dest, exist_ok=True)
            for ext in ['.pdf', '.log']:
                src = os.path.join(temp_dir, job_name+ext)
                if os.path.exists(src): shutil.copy2(src, os.path.join(dest, job_name+ext))

        return jsonify({ "status": "success" if sub.returncode==0 else "error", "log": parse_latex_log(sub.stdout) }), 200
    except:
        return jsonify({"status":"error","log":traceback.format_exc()}), 500
    finally:
        if temp_dir: shutil.rmtree(temp_dir)

def display_team_notes():
    """Fetches and displays the dynamic dark-mode console from GitHub."""
    notes_url = "https://raw.githubusercontent.com/pmarcum/gooTeX/main/cloud/team_notes.html"
    import requests
    from IPython.display import HTML, display
    try:
        # This fetches the dark-background box you had before
        html_content = requests.get(notes_url, timeout=2).text
        display(HTML(html_content))
    except:
        display(HTML("<div style='padding:10px; border:1px solid #ccc; background:#333; color:white;'>⚠️ Team notes unreachable.</div>"))
        
def run_goo_server():
    global COMM_FILE, ai_client, ai_enabled
    # 💀 ZOMBIE KILLER (Add these 6 lines here)
    try:
        from pyngrok import ngrok
        ngrok.kill()
        print("🧹 Cleared existing tunnels.")
    except:
        pass
    # Ngrok and Key Loading (Simplified from Original Cell 2)
    GEMINI_API_KEY = userdata.get('GEMINI_API_KEY')
    NGROK_TOKEN = userdata.get('NGROK_TOKEN')
    if NGROK_TOKEN: ngrok.set_auth_token(NGROK_TOKEN)
    ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
    ai_enabled = (ai_client is not None)

    # 🕵️ ROBUST AUTO-LOCATE
    print("🕵️  Auto-locating connection file...")
    # Added -not -path '*/.Trash/*' to ignore deleted files
    cmd = "find /content/drive/MyDrive -maxdepth 7 -name gootex_doc2colab_communication.json -not -path '*/.Trash/*'"
    found_paths = subprocess.getoutput(cmd).strip().split('\n')
    candidates = [p for p in found_paths if p.strip()]

    if not candidates or not candidates[0]:
        print("❌ ERROR: gootex_doc2colab_communication.json file not found! Check your Drive.")
        return

    # Selection Logic
    if len(candidates) == 1:
        COMM_FILE = candidates[0]
    else:
        print("\n⚠️  MULTIPLE PROJECTS DETECTED:")
        for i, path in enumerate(candidates):
            print(f"   [{i+1}] ...{path.split('/')[-3]}/{path.split('/')[-2]}")
        
        # This will pause the cell and show a text box in Colab
        choice = input("👉 Enter number (1-{}): ".format(len(candidates)))
        COMM_FILE = candidates[int(choice)-1]
    
    # 🌳 FIND NEAREST COMMON ANCESTOR
    # We move up from: .../research_group/GOOTEX_BASE/comm.json
    # Goal: research_group
    comm_dir = os.path.dirname(COMM_FILE)        # /.../GOOTEX_BASE
    project_root = os.path.dirname(comm_dir)     # /.../research_group
    
    print(f"✅ Found Project: {os.path.basename(comm_dir)}")
    print(f"🏠 Project Root: {project_root}")
        
    public_url = ngrok.connect(5000).public_url


    from IPython.display import clear_output, HTML, display
    clear_output()

    display_team_notes()
    
    hud_html = f"""
    <div style='padding: 20px; border: 2px solid #2e7d32; border-radius: 10px; background-color: #f1f8e9; font-family: sans-serif;'>
        <h2 style='color: #2e7d32; margin-top: 0;'>🟢 GooTeX Server is ONLINE</h2>
        <p><b>Public Link:</b> <a href='{public_url}' target='_blank'>{public_url}</a></p>
        <p><b>Project Root:</b> <code>{project_root}</code></p>
        <hr style='border: 0; border-top: 1px solid #c8e6c9;'>
        <p style='font-size: 0.9em; color: #555;'>The server is listening. Keep this tab open while you write.</p>
    </div>
    """
    display(HTML(hud_html))
    # ------------------------------
    
    # Update COMM_FILE
    with open(COMM_FILE, "r") as f: reg = json.load(f)
    reg["gootexCompiler_url"] = public_url
    with open(COMM_FILE, "w") as f: json.dump(reg, f, indent=4)
    
    app.run(port=5000)

if __name__ == "__main__":
    run_goo_server()
