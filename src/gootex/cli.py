import os, subprocess, hashlib, io, platform, json
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

def sync_assets(folder_id, local_path="."):
    """Recursively syncs assets and resolves shortcuts."""
    results = drive_service.files().list(
        q=f"'{folder_id}' in parents and trashed = false",
        fields="files(id, name, md5Checksum, mimeType, shortcutDetails)"
    ).execute()
    files = results.get('files', [])

    for f in files:
        file_id = f.get('id')
        name = f.get('name')
        mime_type = f.get('mimeType')
        remote_md5 = f.get('md5Checksum')
        target_path = os.path.join(local_path, name)

        # 1. Handle Subfolders
        if mime_type == 'application/vnd.google-apps.folder':
            if not os.path.exists(target_path):
                os.makedirs(target_path)
            sync_assets(file_id, target_path)
            continue

        # 2. Handle Shortcuts (pointing to .bib, .cls, .sty, etc.)
        if mime_type == 'application/vnd.google-apps.shortcut':
            details = f.get('shortcutDetails', {})
            target_id = details.get('targetId')
            if target_id:
                # We update the file_id so the download pulls the REAL data,
                # but we keep the shortcut's 'name' so it saves as variables.sty
                file_id = target_id
                # UPDATE mime_type so the downloader knows if the target is a Google Doc
                mime_type = details.get('targetMimeType', mime_type)
                print(f"  🔗 Resolved shortcut '{name}' to ID: {file_id}")

        # 3. Filter and Download
        valid_exts = ('.png', '.jpg', '.jpeg', '.pdf', '.bib', '.cls', '.sty', '.bbl', '.bst')
        if name.lower().endswith(valid_exts):
            # If the file is missing locally, download it.
            if not os.path.exists(target_path):
                print(f"  📥 Syncing: {target_path}...")
                
                # Check if it's a native Google Doc (like variables.sty or Extragalactic.bib)
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
                        
                else:
                    # Original Binary Download
                    request = drive_service.files().get_media(fileId=file_id)
                    with io.FileIO(target_path, 'wb') as fh:
                        downloader = MediaIoBaseDownload(fh, request)
                        done = False
                        while not done:
                            _, done = downloader.next_chunk()
            else:
                print(f"  ✅ {name} already exists. Skipping.")

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

def compile_locally():
    print("🔄 Initializing asset sync...")
    sync_assets(PROJECT_FOLDER_ID)
    
    print("📥 Pulling LaTeX source...")
    doc = docs_service.documents().get(
        documentId=DOCUMENT_ID,
        suggestionsViewMode='PREVIEW_SUGGESTIONS_ACCEPTED'
    ).execute()

    full_latex_string = ""
    for element in doc.get('body').get('content', []):
        full_latex_string += extract_text(element)

    with open(f"{JOB_NAME}.tex", "w", encoding="utf-8") as f:
        f.write(full_latex_string)
        
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
        
        # UPLOAD REMOVED to bypass Service Account 403 storageQuotaExceeded error
        # file_metadata = {'name': pdf_file, 'parents': [COMPILED_FOLDER_ID]}
        # media = MediaFileUpload(pdf_file, mimetype='application/pdf')
        # drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        
        clean_temp_files()
        open_pdf(pdf_file)
        print("✅ Done!")
    else:
        print(f"❌ Compilation failed. Check {JOB_NAME}.log for details.")

if __name__ == '__main__':
    compile_locally()
