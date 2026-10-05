<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor ecosystem. It utilizes Google Docs as the primary editor, providing built-in collaborative features like edit-tracking, commenting, and real-time chat.

The <span style="color:green; font-weight:bold;">gooTeX</span> template includes an integrated script that provides:
* **Figure, Table Referencing:** Searchable, clickable sidebars populated with thumbnails of your figures and table/figure captions. Buttons provide reference to the figure or table as well as to the sections hosting them.
* **.bib File Integration:** A searchable, clickable sidebar populated from your bibliography — either a static `.bib` file in your project folder or, optionally, a live library served by [BibMan](#optional-bibman-bibliography-integration) (see below).
* **Live PDF Viewer:** A separate browser tab for viewing the rendered manuscript and inspection logs.
* **Outline Markers:** Recognizes certain LaTeX commenting characters, automatically highlighting them to grab colleagues' attention or marking them in the document's outline for quick reference.
* **LaTeX Errors:** Compilation errors/warnings are presented in a sidebar. Clicking an error navigates to the relevant location in the document and briefly highlights the paragraph in the editor. A button launches a targeted Gemini AI assistant — including a follow-up chat — for help resolving the error.
* **LaTeX Linting:** Basic syntax checking within the Doc.

Behind the scenes, <span style="color:green; font-weight:bold;">gooTeX</span> compiles your manuscript on a persistent server running a standard LaTeX toolchain — hosted on whatever platform best suits your group. (Standing up that server for your own group is covered in **[DEPLOY.md](DEPLOY.md)**.)

---

> ### 👥 Already part of this group? You're done — nothing to set up.
> **If you are a member of Pamela Marcum's research group, gooTeX is already running for you.** You do **not** need to install anything, deploy a server, or configure credentials. Just open the shared Google Doc for your paper and start writing — the server, credentials, and Drive workspace are already in place and maintained for you.
>
> **Want to use gooTeX without the setup burden?** If you'd like to join the existing group and get access to the running system, reach out to the maintainer (Pamela Marcum) by **opening an issue on this repository** to inquire about joining.
>
> **Setting up gooTeX for a _different_ research group** — your own compile server, credentials, and Google Drive workspace — is a separate job, covered step by step in **[DEPLOY.md](DEPLOY.md)**. The sections below are about *using* gooTeX day to day.

---

## Deploying gooTeX for your own group

Standing up an independent gooTeX instance — your own compile server, credentials, and Google Drive workspace — is covered step by step in **[DEPLOY.md](DEPLOY.md)**. You don't need any of that to *use* gooTeX in a group that already runs it; the rest of this page is for authors.

---

## Starting or Joining a Paper (Authors)
Once your group's workspace is set up, authors do not need to install any software or perform any special Drive configuration.

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

To use it, an author points the document's bibliography at a named BibMan library with a `bibman:` prefix instead of a local filename:
```latex
\bibliography{bibman:Extragalactic.bib}   % pulls the "Extragalactic" library from BibMan
```
When BibMan runs on the same host as the gooTeX compile server, the two connect over a local, authenticated loopback request: during compilation gooTeX fetches that named library, generates the `.bib` on the fly (named after the library), and uses it directly — so your citations always reflect the latest state of your BibMan library, with no hand-maintained `.bib` file to keep in sync.

This integration is **entirely optional** — gooTeX compiles normally from a static `.bib` file when BibMan is not present. BibMan is a separate project with its own setup and documentation; refer to it to deploy the service and to configure the shared credential that authorizes gooTeX to read from it.
