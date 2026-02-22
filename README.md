<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor ecosystem. It utilizes Google Docs as the primary editor, providing built-in collaborative features like edit-tracking, commenting, and real-time chat. 

The <span style="color:green; font-weight:bold;">gooTeX</span> template includes an integrated script that provides:
* **LaTeX Linting:** Basic syntax checking within the Doc.
* **BibMan Integration:** A searchable, clickable sidebar populated from your `.bib` file.
* **Live PDF Viewer:** A separate browser tab for viewing the rendered manuscript and inspection logs.

---

## Compilation Modes

<span style="color:green; font-weight:bold;">gooTeX</span> offers two ways to transform your Google Doc into a finished PDF:

### 1. The Standard Cloud Path (Default)
Triggered directly from the Google Doc "gooTeX" menu. This uses a cloud-based handshake between Google Apps Script and Google Colab to perform the compilation. It requires no local software installation but depends on cloud processing times and network latency.

### 2. The Local Express Path (Optional Accelerator)
For users who require faster turnaround times or frequent recompilations, this repository provides a local Python engine. By running the engine on your own machine, you bypass the cloud handshake entirely. The local engine pulls the manuscript text directly, compiles it using your local TeX distribution, and pushes the result back to Drive instantly.

---

### The Template
To get started with either method, you must first create your manuscript from the <span style="color:green; font-weight:bold;">gooTeX</span> template:
[https://docs.google.com/document/d/1Y5WeR3lr1AepJEe5M1x7TT9k7JqnIQ-JBTpEq3ESP88/copy](https://docs.google.com/document/d/1Y5WeR3lr1AepJEe5M1x7TT9k7JqnIQ-JBTpEq3ESP88/copy)

---

## Local Engine Installation (Optional)

If you wish to use the **Local Express Path**, follow these steps to set up your environment.

### 1. System Prerequisites
The local engine relies on your computer's TeX distribution:
* **Python:** 3.10 or higher.
* **LaTeX Distribution:** (TeX Live for Linux/WSL, MacTeX for macOS).
* **Required Classes:** Ensure your distribution includes `aastex631.cls`, `revtex4-1.cls`, etc.

### 2. Installation
Install the tool via `pipx` to add the `gootex-ui` command to your global system path:
```bash
pipx install git+[https://github.com/pmarcum/gooTeX.git](https://github.com/pmarcum/gooTeX.git)