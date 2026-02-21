<p><img style="float: left;" src="https://github.com/user-attachments/assets/2a6b4c9d-e7f1-48bd-89c9-486153174ba2" height="100px"></p>

<span style="color:green; font-weight:bold;">gooTeX</span> is a LaTeX compiler + editor. The editor utilizes a Google Doc, providing all the useful associated built-in features such as edit-tracking, the ability to comment, a chat feature, etc. The Google Doc has an attached script that performs some basic LaTeX linting, sets a sidebar that provides a searchable/clickable list of your `.bib` file, and opens up a separate browser tab window where the compiled LaTeX PDF file is displayed and where the controls are located for performing compilation and error/warning inspection. The attached script also provides some helpful features such as recognizing certain LaTeX commenting characters to be automatically yellow-highlighted to grab colleagues' attention, and/or to appear as a marker in the document's outline for quick reference.

Behind the scenes, <span style="color:green; font-weight:bold;">gooTeX</span> operates via a hybrid local compilation engine. Instead of relying on remote servers or GitHub Actions, a local Python command-line tool securely connects to your Google Drive, downloads the manuscript and associated assets (figures, `.bib`, `.sty`), and performs a multi-pass `pdflatex` compilation directly on your local machine. If the compilation encounters a fatal error, the logs are immediately visible in the local GUI interface.

This approach gives users complete control over their LaTeX environment, allowing them to perform the compilation using their preferred local TeX distribution while keeping the collaborative writing process centralized in Google Docs.

### The Template
The link below provides access to the <span style="color:green; font-weight:bold;">gooTeX</span> template (a Google Doc):
[https://docs.google.com/document/d/1OX4gX1A2F9QsRknSIN9ed7jkZ9lxOZ46R1ZyF43mqrM/copy](https://docs.google.com/document/d/1OX4gX1A2F9QsRknSIN9ed7jkZ9lxOZ46R1ZyF43mqrM/copy)

If you hit the "Make a copy" button, a copy of the Google Doc template will appear in your Google Drive. We recommend moving this template into a designated folder for the specific paper or proposal you are working on.

---

## 1. System Prerequisites

While the <span style="color:green; font-weight:bold;">gooTeX</span> engine is installed via Python, it relies on your local TeX distribution to generate the PDF.

* **Python:** 3.10 or higher.
* **LaTeX Distribution:** * **Linux/WSL:** TeX Live (`sudo apt install texlive-full` recommended for astronomy packages).
  * **macOS:** MacTeX.
* **Required LaTeX Classes:** Ensure your TeX distribution includes `aastex631.cls`, `revtex4-1.cls`, `natbib.sty`, and standard science/math utilities.

## 2. Installation

We recommend installing the tool via `pipx`, which automatically creates an isolated virtual environment and adds the command to your system's global `$PATH`.

**Install pipx (if not already installed):**
* macOS: `brew install pipx && pipx ensurepath`
* Ubuntu/WSL: `sudo apt install pipx && pipx ensurepath`

**Install gooTeX:**
Once `pipx` is installed, run the following command to download and install the tool directly from this repository:
```bash
pipx install git+[https://github.com/pmarcum/gooTeX.git](https://github.com/pmarcum/gooTeX.git)