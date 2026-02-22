<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor ecosystem. It utilizes Google Docs as the primary editor, providing built-in collaborative features like edit-tracking, commenting, and real-time chat. 

The <span style="color:green; font-weight:bold;">gooTeX</span> template includes an integrated script that provides:
* **Figure, Table Referencing:** Searchable, clickable sidebars populated with thumbnails of your figures and table/figure captions. Buttons provide reference to the figure or table as well as to the sections hosting them. 
* **.bib File Integration:** A searchable, clickable sidebar populated from your `.bib` file.
* **Live PDF Viewer:** A separate browser tab for viewing the rendered manuscript and inspection logs.
* **Outline Markers:** Recognizes certain LaTeX commenting characters, automatically highlighting them to grab colleagues' attention or marking them in the document's outline for quick reference.
* **LaTeX Errors:** Compilation errors/warnings are presented in a sidebar; clicking goes to relevant location in document, and a button provides targeted AI assistance.
* **LaTeX Linting:** Basic syntax checking within the Doc.

Behind the scenes, <span style="color:green; font-weight:bold;">gooTeX</span> operates via a hybrid architecture, allowing you to compile your manuscript using a cloud-based server or a high-speed local Python engine.

---

## Getting Started: The Setup Matrix

Your setup requirements depend entirely on your role in the group and how fast you want your PDFs to compile. Find your specific situation in the matrix below.

| Your Role | Desired Compile Speed | Google Doc Action | Local Software Install? | `service_account.json` Source |
| :--- | :--- | :--- | :--- | :--- |
| **Server Host** (Providing LaTeX compiler) | **Standard** (Cloud) | Click *Initialize Drive Folder*, Run Colab | None | Not required |
| **Server Host** (Providing LaTeX compiler) | **Express** (Local) | Click *Initialize Drive Folder* | Install via `pipx` | Generate in Google Cloud Console |
| **Author** (Starting or joining paper)| **Dependent on Host** | Just write! | None | Not required |
| **Author** (Starting or joining paper)| **Express** (Local) | None | Install via `pipx` | Ask the Host to send you their file |

---

### Phase 1: Workspace Setup (Server Hosts Only)
If you are the designated **Server Host** for your research group, you must initialize the shared workspace once:
1. Create a dedicated root folder in Google Drive for your group's papers (e.g., `Shared Drive/gooTeX_Projects/`).
2. Open any blank Google Doc inside this folder, wait for the custom menu, and click **GooTeX > 🔧 Server Setup > 📂 Initialize Drive Folder**. Accept the permissions. 
3. *For Cloud hosting:* Open the newly created Colab notebook in that folder and run the cells to activate the compiler for everyone using this workspace.

---

### Phase 2: Starting or Joining a Paper (Authors)
If the Server Host has already initialized your group's Drive folder, you do not need to install any software.

**If you are starting a NEW paper:**
1. Make a copy of the [gooTeX Template](https://docs.google.com/document/d/1Y5WeR3lr1AepJEe5M1x7TT9k7JqnIQ-JBTpEq3ESP88/copy).
2. Move the copied Google Doc into the group's initialized Google Drive folder (or a sub-folder within it). Place your `.bib` and images alongside it.
3. Open the Doc and use **GooTeX > 🤝 Invite Co-Author** to bring in collaborators.
4. Use the Google Doc menu to compile your PDF using the Host's server.

**If you are JOINING an existing paper:**
1. Check your email for the collaboration invitation. It will contain links to both the Google Doc and the Project Folder.
2. **Crucial Step:** Open the link to the Project Folder. Click the folder name at the top, select **Organize**, and click **Add shortcut**. Place this shortcut in your **"My Drive"**. 
   > *Why?* <span style="color:green; font-weight:bold;">gooTeX</span> must map the folder tree to find references and figures. If the folder remains only in your "Shared with me" tab, the compilation and sidebar features will fail.
3. Open the Google Doc and start writing.

---

### Phase 3: Local Express Engine Installation (Optional)
*Only required if your matrix row says "Install via pipx".*

If you want to bypass the cloud server to compile instantly on your own machine using your local TeX distribution, install the local Python engine.

#### 1. System Prerequisites
* **Python:** 3.10 or higher.
* **LaTeX Distribution:** TeX Live (Linux/WSL) or MacTeX (macOS).

#### 2. Installation
Install the engine globally using `pipx`:
```bash
pipx install git+[https://github.com/pmarcum/gooTeX.git](https://github.com/pmarcum/gooTeX.git)