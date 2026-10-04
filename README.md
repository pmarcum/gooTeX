<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor ecosystem. It utilizes Google Docs as the primary editor, providing built-in collaborative features like edit-tracking, commenting, and real-time chat.

The <span style="color:green; font-weight:bold;">gooTeX</span> template includes an integrated script that provides:
* **Figure, Table Referencing:** Searchable, clickable sidebars populated with thumbnails of your figures and table/figure captions. Buttons provide reference to the figure or table as well as to the sections hosting them.
* **.bib File Integration:** A searchable, clickable sidebar populated from your bibliography — either a static `.bib` file in your project folder or, optionally, a live library served by [BibMan](#optional-bibman-bibliography-integration) (see below).
* **Live PDF Viewer:** A separate browser tab for viewing the rendered manuscript and inspection logs.
* **Outline Markers:** Recognizes certain LaTeX commenting characters, automatically highlighting them to grab colleagues' attention or marking them in the document's outline for quick reference.
* **LaTeX Errors:** Compilation errors/warnings are presented in a sidebar. Clicking an error navigates to the relevant location in the document and briefly highlights the paragraph in the editor. A button launches a targeted Gemini AI assistant — including a follow-up chat — for help resolving the error.
* **LaTeX Linting:** Basic syntax checking within the Doc.

Behind the scenes, <span style="color:green; font-weight:bold;">gooTeX</span> compiles your manuscript on a persistent server running a standard LaTeX toolchain — hosted on whatever platform best suits your group (see Phase 1 below).

---

> ### 👥 Already part of this group? You're done — nothing to set up.
> **If you are a member of Pamela Marcum's research group, gooTeX is already running for you.** You do **not** need to install anything, deploy a server, or configure credentials. Just open the shared Google Doc for your paper and start writing — the server, credentials, and Drive workspace are already in place and maintained for you.
>
> **Want to use gooTeX without the setup burden?** If you'd like to join the existing group and get access to the running system, reach out to the maintainer (Pamela Marcum) by **opening an issue on this repository** to inquire about joining.
>
> **Everything below is for a _different_ research group that wants to stand up its _own_ independent instance** — its own compile server, its own credentials, and its own Google Drive workspace. You only need these instructions if you are deploying gooTeX for a group of your own.

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

#### Server Requirements
Your compile server needs a complete LaTeX toolchain plus a few supporting tools. The repository includes **`cloud/provision_server.sh`**, which installs everything listed below on a fresh Debian/Ubuntu host — run it once:
```bash
bash cloud/provision_server.sh
```
What it installs:
* **Python packages:** `flask`, `requests`, `google-genai` (keep these in sync with the imports at the top of `cloud/server_engine.py`).
* **LaTeX (TeX Live):** `texlive-latex-recommended`, `texlive-latex-extra`, `texlive-fonts-recommended`, `texlive-fonts-extra`, `texlive-pictures`, `texlive-science`, `texlive-bibtex-extra`, `texlive-extra-utils`, `texlive-publishers`.
* **Tooling:** `chktex` (linting), `imagemagick` (figure conversion), `poppler-utils` (PDF utilities), `texcount` (word counts), `pandoc`, `bc`.
* **Astronomy document classes:** `aastex631.cls`, `mnras.cls`, `aa.cls`, and `emulateapj.cls`, fetched from their publishers into the TeX tree. Trim or extend this list in the script to match your field.

Once provisioned, run `cloud/server_engine.py` as a persistent service (e.g. a `systemd` unit that restarts on failure) reachable over HTTP(S), then put that URL in `GOOTEX_SERVER_URL` in `Config.gs`.

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

---

### Organizing Your Project Files
<span style="color:green; font-weight:bold;">gooTeX</span> locates your figures, `.bib` file, local `.sty`/`.cls` files, and any `\input`/`\include`'d `.tex` files automatically. Follow these rules for where files can live and how to reference them:

* **Subfolders are supported.** You may organize supporting files into any nested subfolder structure *beneath the folder that contains your Google Doc*. <span style="color:green; font-weight:bold;">gooTeX</span> searches that folder and all of its subfolders (to any depth) by filename. The `Compiled/` folder and any folder whose name begins with `.` are skipped.
* **Reference files by their bare filename.** The script locates each file by name regardless of which subfolder it sits in, so citing it by name alone is the safe choice and is guaranteed to work — e.g. `\includegraphics{galaxy.png}`. A path prefix such as `\includegraphics{figures/galaxy.png}` may or may not resolve depending on the server's configuration, so prefer the bare filename.
* **Keep filenames unique across the whole project.** Because lookup is by filename alone, two files with the same name in different subfolders will collide, and one will silently shadow the other. Give every figure, `.tex`, and `.bib` file a distinct name.
* **Files must live within the project folder's tree.** Files in a sibling or parent folder (outside the Doc's folder) will not be found. If you must reference a file stored elsewhere in Drive, place a **shortcut** to that file (named to match the referenced filename) inside the project folder. Shortcuts to individual files are resolved; shortcuts to entire folders are not.

---

### Optional: BibMan Bibliography Integration

<span style="color:green; font-weight:bold;">gooTeX</span> works perfectly well with an ordinary `.bib` file, but it can also pull your bibliography live from **BibMan**, a companion reference-management web service. BibMan keeps your references — with paper-level and passage-level tagging and search — in its own database and can export them as BibTeX on demand.

When BibMan runs on the same host as the gooTeX compile server, the two connect over a local, authenticated loopback request: during compilation, gooTeX asks BibMan for the current bibliography and uses the returned BibTeX directly. Your citations then always reflect the latest state of your BibMan library, with no hand-maintained `.bib` file to keep in sync.

This integration is **entirely optional** — gooTeX compiles normally from a static `.bib` file when BibMan is not present. BibMan is a separate project with its own setup and documentation; refer to it to deploy the service and to configure the shared credential that authorizes gooTeX to read from it.
