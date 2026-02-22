<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor ecosystem. It utilizes Google Docs as the primary editor, providing built-in collaborative features like edit-tracking, commenting, and real-time chat. 

The <span style="color:green; font-weight:bold;">gooTeX</span> template includes an integrated script that provides:
* **Figure, Table Referencing:** Searchable, clickable sidebars populated with thumbnails of your figures and table/figure captions. Buttons provide reference to the figure or table as well as to the sections hosting them. 
* **.bib File Integration:** A searchable, clickable sidebar populated from your `.bib` file.
* **Live PDF Viewer:** A separate browser tab for viewing the rendered manuscript and inspection logs.
* **Outline Markers:** Recognizes certain LaTeX commenting characters, automatically highlighting them to grab colleagues' attention or marking them in the document's outline for quick reference.
* **LaTeX Linting:** Basic syntax checking within the Doc.

Behind the scenes, <span style="color:green; font-weight:bold;">gooTeX</span> operates via a hybrid architecture, allowing you to compile your manuscript using a cloud-based server or a high-speed local Python engine.

---

## Getting Started: The Setup Matrix

Your setup requirements depend entirely on whether you are hosting the document or just joining one, and how fast you want your PDFs to compile. Find your specific situation in the matrix below.

| Your Role | Desired Compile Speed | Google Doc Action | Local Software Install? | `service_account.json` Source |
| :--- | :--- | :--- | :--- | :--- |
| **Project Host** (Starting new paper) | **Standard** (Cloud) | Click *Initialize Drive Folder*, Run Colab | None | Not required |
| **Project Host** (Starting new paper) | **Express** (Local) | Click *Initialize Drive Folder* | Install via `pipx` | Generate in Google Cloud Console |
| **Co-Author** (Invited to paper) | **Standard** (Cloud) | Just write! | None | Not required |
| **Co-Author** (Invited to paper) | **Express** (Local) | None | Install via `pipx` | Ask the Host to send you their file |

---

### Phase 1: Creating the Project (Hosts Only)
If you are the **Project Host** starting a brand new manuscript:
1. Make a copy of the [gooTeX Template](https://docs.google.com/document/d/1Y5WeR3lr1AepJEe5M1x7TT9k7JqnIQ-JBTpEq3ESP88/copy).
2. Move it to a dedicated Google Drive folder (e.g., `My Drive/My_Paper/`). Place your `.bib` and images here.
3. Open the Doc, wait for the custom menu, and click **GooTeX > 🔧 Server Setup > 📂 Initialize Drive Folder**.
4. Use **GooTeX > 🤝 Invite Co-Author** to bring in your collaborators.
*(Note: If you are an invited Co-Author, skip Phase 1 entirely).*

---

### Phase 2: Local Express Engine Installation (Optional)
*Only required if your matrix row says "Install via pipx".*

If you want to bypass the cloud server and compile instantly on your own machine using your local TeX distribution, install the local Python engine.

#### 1. System Prerequisites
* **Python:** 3.10 or higher.
* **LaTeX Distribution:** TeX Live (Linux/WSL) or MacTeX (macOS).

#### 2. Installation
Install the engine globally using `pipx`:
```bash
pipx install git+[https://github.com/pmarcum/gooTeX.git](https://github.com/pmarcum/gooTeX.git)