import os, subprocess, hashlib, io, platform, json, webbrowser
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

# --- 1. AUTHENTICATE ---
SCOPES = [
    'https://www.googleapis.com/auth/documents.readonly', 
    'https://www.googleapis.com/auth/drive'
]
SERVICE_ACCOUNT_FILE = 'service_account.json'
CONFIG_FILE = 'config.json'

try:
    creds = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    docs_service = build('docs', 'v1', credentials=creds)
    drive_service = build('drive', 'v3', credentials=creds)
except FileNotFoundError:
    print("ERROR: service_account.json not found.")
    exit()

# --- 2. LOAD CONFIGURATION ---
try:
    with open(CONFIG_FILE, 'r') as f:
        config = json.load(f)
    DOCUMENT_ID = config['DOCUMENT_ID']
    PROJECT_FOLDER_ID = config['PROJECT_FOLDER_ID']
    COMPILED_FOLDER_ID = config['COMPILED_FOLDER_ID']
    JOB_NAME = config['JOB_NAME']
except (FileNotFoundError, KeyError) as e:
    print(f"ERROR: Configuration issue in {CONFIG_FILE}: {e}")
    exit()

def get_local_md5(filename):
    if not os.path.exists(filename):
        return None
    hash_md5 = hashlib.md5()
    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def clean_temp_files():
    print("🧹 Cleaning temporary LaTeX files...")
    # Added .bbl and .blg to the list
    extensions = ['.aux', '.log', '.out', '.toc', '.fls', '.fdb_latexmk', '.synctex.gz', '.bbl', '.blg']
    for ext in extensions:
        temp_file = f"{JOB_NAME}{ext}"
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
def open_pdf(filename):
    print(f"📖 Opening {filename}...")
    try:
        if os.name == 'nt':
            os.startfile(filename)
        elif platform.system() == 'Darwin':
            subprocess.run(["open", filename])
        else:
            if 'microsoft' in platform.release().lower() or 'wsl' in platform.release().lower():
                subprocess.run(["explorer.exe", filename], stderr=subprocess.DEVNULL)
            else:
                subprocess.run(["xdg-open", filename], stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"⚠️ Could not open PDF automatically: {e}")

def extract_text(element):
    text = ""
    if 'paragraph' in element:
        for el in element.get('paragraph').get('elements', []):
            if 'textRun' in el:
                text += el.get('textRun').get('content')
    elif 'table' in element:
        for row in element.get('table').get('tableRows', []):
            for cell in row.get('tableCells', []):
                for content_element in cell.get('content', []):
                    text += extract_text(content_element)
    return text

def sync_assets(folder_id, local_path="."):
    """Recursively syncs assets and resolves shortcuts."""
    import datetime
    results = drive_service.files().list(
        q=f"'{folder_id}' in parents and trashed = false",
        fields="files(id, name, md5Checksum, mimeType, modifiedTime, shortcutDetails)"
    ).execute()
    files = results.get('files', [])

    for f in files:
        file_id = f.get('id')
        name = f.get('name')
        mime_type = f.get('mimeType')
        remote_md5 = f.get('md5Checksum')
        remote_time = f.get('modifiedTime')
        target_path = os.path.join(local_path, name)

        # 1. Handle Subfolders
        if mime_type == 'application/vnd.google-apps.folder':
            if not os.path.exists(target_path):
                os.makedirs(target_path)
            sync_assets(file_id, target_path)
            continue

        # 2. Handle Shortcuts
        if mime_type == 'application/vnd.google-apps.shortcut':
            details = f.get('shortcutDetails', {})
            target_id = details.get('targetId')
            if target_id:
                file_id = target_id
                mime_type = details.get('targetMimeType', mime_type)
                print(f"  🔗 Resolved shortcut '{name}' to ID: {file_id}")
                # Fetch metadata for the actual target to ensure delta checks work
                try:
                    target_meta = drive_service.files().get(fileId=file_id, fields="md5Checksum, modifiedTime").execute()
                    remote_md5 = target_meta.get('md5Checksum')
                    remote_time = target_meta.get('modifiedTime')
                except Exception:
                    pass

        # 3. Filter and Download
        valid_exts = ('.tex', '.png', '.jpg', '.jpeg', '.pdf', '.bib', '.cls', '.sty', '.bbl', '.bst')
        
        # EXCLUSION ADDED HERE
        if name.lower().endswith(valid_exts) and "UNCOMPRESSED" not in name.upper():
            needs_download = False
            
            if not os.path.exists(target_path):
                needs_download = True
            else:
                # Delta Checks
                if mime_type == 'application/vnd.google-apps.document':
                    if remote_time:
                        r_time = remote_time.replace('Z', '+00:00')
                        remote_ts = datetime.datetime.fromisoformat(r_time).timestamp()
                        local_ts = os.path.getmtime(target_path)
                        if remote_ts > local_ts:
                            needs_download = True
                else:
                    local_md5 = get_local_md5(target_path)
                    if remote_md5 and local_md5 != remote_md5:
                        needs_download = True

            if needs_download:
                print(f"  📥 Syncing: {target_path}...")
                
                if mime_type == 'application/vnd.google-apps.document':
                    print(f"     ↳ Detected Google Doc format. Extracting text with suggested edits accepted...")
                    doc_data = docs_service.documents().get(
                        documentId=file_id,
                        suggestionsViewMode='PREVIEW_SUGGESTIONS_ACCEPTED'
                    ).execute()
                    
                    doc_text = ""
                    for element in doc_data.get('body').get('content', []):
                        doc_text += extract_text(element)
                        
                    with open(target_path, "w", encoding="utf-8") as out_f:
                        out_f.write(doc_text)
                        
                    # Sync local timestamp to remote to prevent constant re-downloads
                    if remote_time:
                        r_time = remote_time.replace('Z', '+00:00')
                        remote_ts = datetime.datetime.fromisoformat(r_time).timestamp()
                        os.utime(target_path, (remote_ts, remote_ts))
                        
                else:
                    # Original Binary Download
                    request = drive_service.files().get_media(fileId=file_id)
                    with io.FileIO(target_path, 'wb') as fh:
                        downloader = MediaIoBaseDownload(fh, request)
                        done = False
                        while not done:
                            _, done = downloader.next_chunk()
            else:
                print(f"  ✅ {name} is up to date. Skipping.")


def compile_locally():
    import datetime
    import shutil
    import sys
    
    # NEW: Safety check for pdflatex before starting
    if shutil.which("pdflatex") is None:
        print("❌ ERROR: 'pdflatex' not found. Compilation aborted.")
        return

    print("🔄 Initializing asset sync...")
    sync_assets(PROJECT_FOLDER_ID)
    
    print("📥 Checking Main Document status...")
    main_target = f"{JOB_NAME}.tex"
    needs_main_download = True
    
    try:
        main_meta = drive_service.files().get(fileId=DOCUMENT_ID, fields="modifiedTime").execute()
        remote_time = main_meta.get('modifiedTime')
        if os.path.exists(main_target) and remote_time:
            r_time = remote_time.replace('Z', '+00:00')
            remote_ts = datetime.datetime.fromisoformat(r_time).timestamp()
            local_ts = os.path.getmtime(main_target)
            if remote_ts <= local_ts:
                needs_main_download = False
    except Exception as e:
        pass # Force download if metadata fails
        
    if needs_main_download:
        print("  📥 Pulling LaTeX source (Updates detected)...")
        doc = docs_service.documents().get(
            documentId=DOCUMENT_ID,
            suggestionsViewMode='PREVIEW_SUGGESTIONS_ACCEPTED'
        ).execute()

        full_latex_string = ""
        for element in doc.get('body').get('content', []):
            full_latex_string += extract_text(element)

        with open(main_target, "w", encoding="utf-8") as f:
            f.write(full_latex_string)
            
        if 'remote_ts' in locals():
            os.utime(main_target, (remote_ts, remote_ts))
    else:
        print("  ✅ Main Document is up to date. Skipping download.")
        
    print("⚙️ Compiling with local pdflatex (Multi-pass)...")
    
    # Pass 1: Initial pdflatex (finds \cite keys)
    subprocess.run(["pdflatex", "-interaction=nonstopmode", f"{JOB_NAME}.tex"], stdout=subprocess.DEVNULL)
    
    # Pass 2: BibTeX (generates bibliography)
    print("  📚 Resolving citations with BibTeX...")
    subprocess.run(["bibtex", JOB_NAME], stdout=subprocess.DEVNULL)
    
    # Pass 3: Second pdflatex (links bibliography)
    subprocess.run(["pdflatex", "-interaction=nonstopmode", f"{JOB_NAME}.tex"], stdout=subprocess.DEVNULL)
    
    # Pass 4: Final pdflatex (resolves pagination and ?? marks)
    result = subprocess.run(["pdflatex", "-interaction=nonstopmode", f"{JOB_NAME}.tex"], stdout=subprocess.DEVNULL)

    if result.returncode == 0:
        pdf_file = f"{JOB_NAME}.pdf"
        clean_temp_files()
        open_pdf(pdf_file)
        print("✅ Done!")
    else:
        print(f"❌ Compilation failed. Check {JOB_NAME}.log for details.")
        sys.exit(1)  # Stop execution and signal failure to GUI

def prepare_submission():
    """Flattens structure, prunes bib, and creates a tarball for publishers."""
    import shutil, tarfile, re
    
    # Safety Check: Ensure the document has been compiled at least once
    # so that the .aux file exists for bib pruning.
    aux_file = f"{JOB_NAME}.aux"
    if not os.path.exists(aux_file):
        print("⚠️  No compilation data found. Triggering full Sync & Compile first...")
        compile_locally()
    
    sub_dir = f"{JOB_NAME}_submission"
    if os.path.exists(sub_dir):
        shutil.rmtree(sub_dir)
    os.makedirs(sub_dir)
    
    print(f"📦 Preparing submission in {sub_dir}...")

    # 1. Prune the Bibliography using bibexport
    # This relies on the .aux file generated during compilation
    print("  📚 Pruning bibliography to cited items only...")
    subprocess.run(["bibexport", "-o", os.path.join(sub_dir, "references.bib"), aux_file], 
                   stdout=subprocess.DEVNULL)
    
    # 2. Flatten and Fix LaTeX Source
    print("  📝 Flattening LaTeX source and updating paths...")
    with open(f"{JOB_NAME}.tex", "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace bibliography command to point to the new local pruned file
    content = re.sub(r"\\bibliography\{.*\}", r"\\bibliography{references}", content)
    
    # Find all graphics paths and flatten them
    # Example: {FIGURES/image.png} -> {image.png}
    content = re.sub(r"\\includegraphics(\[.*?\])?\{(?:.*?/)?(.*?)\}", r"\\includegraphics\1{\2}", content)
    
    with open(os.path.join(sub_dir, f"{JOB_NAME}.tex"), "w", encoding="utf-8") as f:
        f.write(content)

    # 3. Copy Assets (Images, STY, CLS) to the root of sub_dir
    print("  🖼️  Collecting assets...")
    valid_exts = ('.png', '.jpg', '.jpeg', '.pdf', '.cls', '.sty', '.bst')
    for root, dirs, files in os.walk("."):
        if sub_dir in root: continue 
        for file in files:
            if file.lower().endswith(valid_exts) and "UNCOMPRESSED" not in file.upper():
                shutil.copy2(os.path.join(root, file), os.path.join(sub_dir, file))

    # 4. Create Tarball
    tar_name = f"{sub_dir}.tar.gz"
    print(f"  🗜️  Creating tarball: {tar_name}...")
    with tarfile.open(tar_name, "w:gz") as tar:
        tar.add(sub_dir, arcname=os.path.basename(sub_dir))
    
    print(f"✅ Submission bundle ready: {tar_name}")

def main():
    import sys
    
    help_text = """
gooTeX Science Portal
---------------------
COMMAND: gootex-cli

Usage:
  gootex-cli       : Sync assets and compile PDF.
  gootex-cli -s    : Prepare submission bundle (.tar.gz).
  gootex-cli -h    : Show this help menu.

Prefer the window?
  Run 'gootex-gui' to open the graphical interface.
    """
    
    # Check if any flags were passed (e.g., -h or -s)
    if len(sys.argv) > 1:
        if sys.argv[1] in ["-h", "--help"]:
            print(help_text)
            return
        elif sys.argv[1] == "-s":
            prepare_submission()
            return
        else:
            print(f"Unknown option: {sys.argv[1]}")
            print("Use 'gootex-cli -h' for help.")
            return

    # Default action: If no flags are provided, run the standard compiler
    compile_locally()

def open_in_browser():
    """Opens the Google Doc using whatever browser you've set as default in your OS."""
    import subprocess
    import platform
    import webbrowser

    url = f"https://docs.google.com/document/d/{DOCUMENT_ID}/edit"
    print(f"🌐 Opening in default browser: {url}")

    # 1. WSL Check: This is the 'Handshake' fix for your specific error
    if "microsoft" in platform.uname().release.lower():
        try:
            # We use PowerShell to tell Windows: 'Open this URL with YOUR default browser'
            subprocess.run(["powershell.exe", "-NoProfile", "-Command", f'Start-Process "{url}"'], check=True)
            return
        except Exception as e:
            print(f"⚠️ WSL bridge failed: {e}")

    # 2. Standard Logic: For macOS and native Linux
    webbrowser.open(url)
    
if __name__ == "__main__":
    main()
