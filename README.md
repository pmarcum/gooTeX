<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor ecosystem. It utilizes Google Docs as the primary editor, providing built-in collaborative features like edit-tracking, commenting, and real-time chat.

The <span style="color:green; font-weight:bold;">gooTeX</span> template includes an integrated script that provides:
* **Figure, Table Referencing:** Searchable, clickable sidebars populated with thumbnails of your figures and table/figure captions. Buttons provide reference to the figure or table as well as to the sections hosting them.
* **.bib File Integration:** A searchable, clickable sidebar populated from your `.bib` file.
* **Live PDF Viewer:** A separate browser tab for viewing the rendered manuscript and inspection logs.
* **Outline Markers:** Recognizes certain LaTeX commenting characters, automatically highlighting them to grab colleagues' attention or marking them in the document's outline for quick reference.
* **LaTeX Errors:** Compilation errors/warnings are presented in a sidebar. Clicking an error navigates to the relevant location in the document and briefly highlights the paragraph in the editor. A button launches a targeted Gemini AI assistant — including a follow-up chat — for help resolving the error.
* **LaTeX Linting:** Basic syntax checking within the Doc.

Behind the scenes, <span style="color:green; font-weight:bold;">gooTeX</span> operates via a hybrid architecture, allowing you to compile your manuscript using a persistent cloud server of your choice or a high-speed local Python engine.

---

## Getting Started: The Setup Matrix

Your setup requirements depend entirely on your role in the group. Find your situation in the matrix below.

| Your Role | Google Doc Action | Server Setup |
| :--- | :--- | :--- |
| **Server Host** (Providing LaTeX compiler) | Click *Initialize Drive Folder*, configure server endpoint in `Config.gs` | Deploy any persistent server capable of running LaTeX; set its URL in `Config.gs` |
| **Author** (Starting or joining a paper) | Just write! (see Phase 2 below) | None — handled by the Host |

---

### Phase 1: Workspace Setup (Server Hosts Only)
If you are the designated **Server Host** for your research group, you must initialize the shared workspace once:
1. Create a dedicated root folder in Google Drive for your group's papers (e.g., `Shared Drive/gooTeX_Projects/`).
2. Open any blank Google Doc inside this folder, wait for the custom menu, and click **GooTeX > 🔧 Server Setup > 📂 Initialize Drive Folder**. Accept the permissions. This creates the user-access spreadsheet and displays its ID in an alert — copy that ID into `GOOTEX_ACCESS_SHEET_ID` in `Config.gs` before proceeding.
3. Ensure your cloud server is running and reachable, then set its endpoint URL in `Config.gs`. Any persistent server that can run a LaTeX toolchain and respond to HTTP requests will work — the specific platform (VM, VPS, container, etc.) is up to you.

---

### Phase 2: Starting or Joining a Paper (Authors)
Once the Server Host has initialized the group's Drive folder, authors do not need to install any software or perform any special Drive configuration.

**If you are starting a NEW paper:**
1. Make a copy of the [gooTeX Template](https://docs.google.com/document/d/1wMrs8uC3gYE5PAqPSfLPgZSEN-zWw-Vw5zSaSXGpzqw/copy).
2. Move the copied Google Doc into the group's initialized Google Drive folder (or a sub-folder within it). Place your `.bib` and images alongside it.
3. Open the Doc and use **GooTeX > 🤝 Invite Co-Author** to bring in collaborators.
4. Use the Google Doc menu to compile your PDF.

**If you are JOINING an existing paper:**
1. Check your email for the collaboration invitation. It will contain a link to the Google Doc.
2. Open the Doc and start writing. All compilation and sidebar features run server-side under the Host's credentials — no special Drive setup is required on your end.
