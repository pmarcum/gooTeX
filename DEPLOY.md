# Deploying Your Own gooTeX Instance

This guide is for a **research group lead who wants to stand up an independent gooTeX instance** for their own group — their own compile server, their own credentials, their own Google Drive workspace. If you are simply *using* gooTeX in a group that already runs it, you do not need any of this; see the main [README](README.md).

> **Secrets note:** Nothing in this repository contains real credentials — every secret is a `REPLACE_ME` placeholder. As you follow this guide you will generate your own. **Never commit your filled-in `Config.gs`, your systemd override, or any key/token back to a public repository.**

---

## Quick start (the whole arc at a glance)

Each step is detailed in the sections below — this is just the shape of it.

**Server half:**
```bash
# 1. Get the code; install the LaTeX toolchain + Python deps
git clone https://github.com/pmarcum/gooTeX.git
cd gooTeX
bash cloud/provision_vm.sh

# 2. Set your secrets, then enable the service
sudo systemctl edit gootex          # add GOOTEX_CREDENTIAL — see §3.4
sudo systemctl enable --now gootex
```

**Google half:** copy the public template, fill in its `Config.gs`, and run **GooTeX ▸ Server Setup ▸ Initialize Drive Folder** (§4).

The two halves meet at one shared secret: **`GOOTEX_CREDENTIAL` must be identical** in the server (step 2) and in the template's `Config.gs`.

---

## 1. How gooTeX is put together

gooTeX has two halves, and you install both:

| Half | Runs on | What it is |
| :--- | :--- | :--- |
| **Google half** | Google's cloud | A shared Apps Script library (`GooTeX_Core_Library`) plus a **template Google Doc** whose bound script calls that library and draws the `GooTeX` menu. All Google Drive reading/writing happens here, under each user's own Google login. |
| **Server half** | A persistent Linux server (e.g. a GCE `e2-micro`) | A small Flask/Gunicorn service that receives document text + images, runs the LaTeX toolchain, and returns the compiled PDF. **Pure compute — it holds no Google credentials.** |

Key consequence: the **compile server never touches Google Drive.** The Apps Script sends the document and images to the server in the request and writes the returned PDF back to Drive itself. That means your server needs *no* service account, *no* Drive mount, and *no* Google OAuth — it only needs a LaTeX toolchain and a couple of shared secrets.

Optionally, gooTeX integrates with **BibMan** (a companion reference manager) for live bibliographies. BibMan is a **separate project with its own deployment**; this guide covers only the gooTeX hooks into it.

---

## 2. Prerequisites

- A Google account and a Google Drive (or Shared Drive) folder to hold your group's papers.
- A persistent Debian/Ubuntu server (the reference install runs **Debian 12 "bookworm"**; Ubuntu works too). An `e2-micro` with 1 GB RAM + 2 GB swap is sufficient.
- A way to expose that server at a **stable HTTPS URL** — a tunnel (DuckDNS is the worked example below) or a real domain. The server listens only on localhost, so it needs a public front door the Google Doc's script can reach.
- A **Gemini API key** (optional, but needed for the in-editor AI assistant — see §5).

---

## 3. Server half — stand up the compile server

### 3.1 Create the server
Provision a Debian 12 VM with ~2 GB swap. Open the port(s) your tunnel/proxy will use. You will run everything below as a dedicated user (this guide assumes a user named `bibman`, matching the reference install; any user works — adjust paths).

### 3.2 Clone and provision
```bash
git clone https://github.com/pmarcum/gooTeX.git
cd gooTeX
bash cloud/provision_vm.sh      # installs the LaTeX toolchain + supporting tools
```
`provision_vm.sh` is the authoritative provisioning script (TeX Live, `chktex`, `imagemagick`, `poppler-utils`, `texcount`, `pandoc`, and the astronomy document classes). Review it and trim the publisher `.cls` downloads to match your field.

### 3.3 Python environment
```bash
python3 -m venv ~/gootex/venv
~/gootex/venv/bin/pip install -r cloud/requirements.txt   # flask, gunicorn, requests, google-genai
```

### 3.4 Configure the systemd service
Copy the example unit and its secret drop-in into place:
```bash
sudo cp cloud/gootex.service.example /etc/systemd/system/gootex.service
sudo systemctl edit gootex        # opens the drop-in override editor
```
In the override, set your secrets (these live **only** here, never in a committed file):
```ini
[Service]
Environment="GOOTEX_CREDENTIAL=<a long random string you generate>"
Environment="BIBMAN_CREDENTIAL=<only if you run BibMan; must match BibMan's secret>"
# Optional — lights up the server-side AI route (see §5). Most installs leave this unset
# and let the Apps Script side handle AI instead:
# Environment="GEMINI_API_KEY=<your Gemini key>"
```
Generate `GOOTEX_CREDENTIAL` with e.g. `python3 -c "import secrets; print(secrets.token_hex(16))"`. **Write it down — you must paste the identical value into the Google-half `Config.gs` (§4.3).**

### 3.5 Start it
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gootex
sudo systemctl status gootex        # confirm "active (running)"
```
The service binds `127.0.0.1:8082` with one Gunicorn worker (appropriate for an `e2-micro`; pdflatex is serialised anyway).

### 3.6 Expose it over HTTPS (worked example: DuckDNS + nginx)
The Google Doc's script must reach the server at a stable `https://` URL. The reference install uses a **DuckDNS** subdomain (free) as the primary tunnel, with **nginx** path-routing in front of the local Gunicorn port:

```nginx
# gooTeX lives under /gootex ; the trailing path is stripped before proxying.
# The long read/send timeouts matter — pdflatex on an e2-micro can take ~30–60s.
location /gootex/ {
    proxy_pass            http://127.0.0.1:8082/;
    proxy_set_header      Host              $host;
    proxy_set_header      X-Real-IP         $remote_addr;
    proxy_set_header      X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header      X-Forwarded-Proto $scheme;
    proxy_read_timeout    130s;
    proxy_send_timeout    130s;
    proxy_connect_timeout 10s;
    client_max_body_size  16M;
}
```
Use `certbot --nginx` to obtain a TLS certificate for your subdomain. The resulting base URL — e.g. `https://<you>.duckdns.org/gootex` — is what you put in `Config.gs` (§4.3). Any equivalent approach (a real domain, a Cloudflare Tunnel, a VPS with a public IP) works; the only requirement is a stable HTTPS endpoint that proxies to `127.0.0.1:8082`.

> The BibMan companion, if present, sits on the *same* host behind the same front door at a sibling path (the script derives BibMan's URL by stripping `/gootex` from the gooTeX URL). You only wire that up if you deploy BibMan.

### 3.7 Schedule cache cleanup
The server keeps a per-document cache under `~/gootex_cache/` that grows over time. Add the monthly eviction cron (removes caches not compiled in 90+ days):
```bash
crontab -e
# add:
0 10 1 * * /home/bibman/gootex/venv/bin/python3 /home/bibman/gootex/gootex_cache_cleanup.py >> /home/bibman/gootex_cache_cleanup.log 2>&1
```

---

## 4. Google half — set up the Apps Script + template

### 4.1 The library — pick your level of independence

gooTeX's logic lives in an Apps Script library, **`GooTeX_Core_Library`**. The library holds **no secrets** (only the version-check URL, the Gemini model name, and menu cosmetics); all of your group's credentials live in your template's `Config.gs` (§4.3). The public template already comes **pre-wired to the maintainer's library**, so by default you don't touch the library at all. Three levels, easiest to most independent:

**Level 1 — Use the maintainer's library (simplest; the default).** Do nothing about the library. The template you copy (§4.2) already has the maintainer's `GooTeX_Core_Library` script ID installed — just fill in `CONFIG` and go. Core-behavior updates arrive automatically. Trade-off: a runtime dependency on the maintainer keeping that library shared and available. (No quota cost to the maintainer — Apps Script charges library execution to the user running it, not the owner.)

**Level 2 — Your own copy (independence).** Remove the runtime dependency:
1. In the Apps Script editor, open `GooTeX_Core_Library` and use **Make a copy** — this creates your own library project (all files included) with its **own new script ID**. Note that ID (⚙️ **Project Settings**).
2. In your copied template's ⚙️ **Project Settings → Libraries**, swap the pre-installed (maintainer's) script ID for *your* copy's script ID (keep the identifier exactly `GooTeX_Core_Library`).
   No command-line tools needed. You still get update notices (`version.json` points at the canonical repo); apply updates by re-copying or editing your library. (Optional: `clasp` can clone/push the library instead of **Make a copy**.)

**Level 3 — Rebuild from the repo (insurance).** If the maintainer's live library and template ever disappear, rebuild them from the source committed in this repo's `apps_script/` folder — paste the files into fresh Apps Script projects. Slowest path, needed only as a fallback.

> All three levels end at the same template-copy and configuration steps below (§4.2 onward).

### 4.2 Copy the public template
Make a copy of the **public gooTeX template Doc** (linked from the README). Its bound Apps Script carries a `Config.gs` whose `CONFIG` object is all placeholders — this copy becomes **your group's** per-paper template once filled in.

### 4.3 Fill in `Config.gs` (the template's bound script)
Open the copied Doc → **Extensions → Apps Script** → `Config.gs`, and set the `CONFIG` values:
```javascript
var CONFIG = {
  GOOTEX_SERVER_URL:      "https://<you>.duckdns.org/gootex",  // from §3.6
  GOOTEX_CREDENTIAL:      "<the exact value from §3.4>",        // MUST match the server
  BIBMAN_CREDENTIAL:      "<only if using BibMan; match BibMan>",
  GEMINI_API_KEY:         "<your Gemini key; see §5>",
  GOOTEX_ACCESS_SHEET_ID: "<filled in by step 4.4>",
};
```

**Also allow your server in the script's whitelist.** In the same bound script, open ⚙️ **Project Settings → "Show appsscript.json manifest file"**, and in `urlFetchWhitelist` replace `https://YOUR-SERVER-DOMAIN-HERE/` with your own server's domain (e.g. `https://yourname.duckdns.org/`). **Without this, the script silently refuses to contact your compile server** and nothing happens on compile. While you're there, change `timeZone` if you're not in US Pacific. (Level-2 adopters also swap the `libraries` → `libraryId` for their own copy — see §4.1.)

### 4.4 Initialize the Drive workspace
From the Doc's `GooTeX` menu → **🔧 Server Setup → 📂 Initialize Drive Folder**. This creates the `allowed_users` access spreadsheet, adds you as the first allowed user, and shows its **File ID** in an alert. Paste that ID into `GOOTEX_ACCESS_SHEET_ID` in `Config.gs`.

### 4.5 Add your BibMan dashboard link (optional)
If you run BibMan, paste your BibMan dashboard URL into the placeholder at the top of the template Doc, so your authors have a one-click reference.

### 4.6 Authorize your users
Add each collaborator's Google email to the `allowed_users` sheet. Only listed users can compile.

### 4.7 Hand the template to your group
Your filled-in copy is now **your group's template**. Share a "make a copy" link to it with your authors — each new paper is a copy of this template, inheriting your `CONFIG`.

---

## 5. The Gemini AI assistant — where the key is needed and how to get one

**Where the need arises:** the sidebar **Log tab** offers an AI assistant that explains LaTeX compile errors and supports a follow-up chat. This is the *only* feature that uses a Gemini key. **Compilation works fully without it** — if no key is set, the AI button simply reports that AI is unavailable.

**Which key, and who uses it:** gooTeX uses **one shared Gemini API key per installation**, read from `CONFIG.GEMINI_API_KEY` in your template's `Config.gs` (surfaced to the sidebar by the library's `getGeminiKey()`; the model comes from the library's `GOOTEX_GEMINI_MODEL`). Every member of your group uses that single key — **not** their own Google accounts — so there is no per-user sign-up or permission step. Because the key reaches the sidebar in the browser, treat it as visible to your own group members (fine within a trusted group; don't use a key tied to unrelated paid services).

**How to get a key:**
1. Go to **https://aistudio.google.com** → **Get API key**.
2. Create the key in a Google Cloud project you control.
3. **Free vs paid tiers:** a key with no billing is on the **Free tier** (low requests-per-minute/day — a whole group sharing it can hit limits). Enabling billing on the project moves it to **Tier 1** and up, with much higher limits that scale with spend. See the current limits at <https://ai.google.dev/gemini-api/docs/rate-limits> (numbers change over time). For a shared group key, Tier 1 (billing enabled) is the comfortable choice.
4. Paste the key into `CONFIG.GEMINI_API_KEY`.

> **Advanced (optional):** gooTeX's server also has a dormant server-side AI route. To use it instead of the browser-side path, set `GEMINI_API_KEY` in the systemd override (§3.4) and restart the service. Most installs leave it unset and rely on the Apps Script side above.

---

## 6. Verify end-to-end

1. In your template copy, write a minimal document and compile from the `GooTeX` menu.
2. Confirm a PDF appears in the project folder's `Compiled/` subfolder.
3. Introduce a deliberate LaTeX error and confirm it appears in the Log tab; click the AI assistant to confirm the key works.
4. (If using BibMan) add `\bibliography{bibman:<LibraryName>.bib}` and confirm citations resolve.

---

## 7. Repository layout

```
gooTeX/
├── README.md                     Overview + author usage
├── DEPLOY.md                     This guide
├── MAINTENANCE.md                Where everything lives / what to touch when it changes
├── version.json                  Version-check source of truth (points at this repo)
├── cloud/                        The server half
│   ├── gootex_e2micro_server.py  The Flask/Gunicorn compile server
│   ├── gootex_cache_cleanup.py   Monthly cache eviction (cron)
│   ├── provision_vm.sh           LaTeX toolchain + tooling installer
│   ├── requirements.txt          Python deps (flask, gunicorn, requests, google-genai)
│   └── gootex.service.example    systemd unit (secrets are a drop-in override, not here)
└── apps_script/                  The Google half — one subfolder per Apps Script project
    ├── GooTeX_Core_Library/      source of the shared library
    │   ├── Code.gs
    │   ├── FormatterCore.gs
    │   ├── Sidebar.html
    │   ├── Help.html
    │   ├── AdminHelp.html
    │   ├── Config.gs             library config — non-secret (version URL, model, cosmetics)
    │   └── appsscript.json
    └── template_bound_script/    source of the template Doc's bound script
        ├── Code.gs               thin dispatcher that calls the library
        ├── Config.template.gs    CONFIG with REPLACE_ME (commit THIS, not the real Config.gs)
        └── appsscript.json
```

Each Apps Script project gets its own subfolder: the library and the template's bound script both contain a `Code.gs` and a `Config.gs`, so they'd collide if placed flat. This source is the repo's **recovery copy** — if the live Apps Script projects are ever lost, they can be rebuilt from these files (paste them into new projects, or use `clasp`). Adopters don't need this folder day to day; they just copy the live library and template (§4).

---

## 8. What never goes in the repository

- The template project's real `Config.gs` (`CONFIG` with real `GOOTEX_CREDENTIAL`, `BIBMAN_CREDENTIAL`, `GEMINI_API_KEY`, sheet ID). If you ever copy that project's source into the repo, commit only `Config.template.gs` and add the real `apps_script/template_bound_script/Config.gs` to `.gitignore`.
- The systemd secret drop-in (`/etc/systemd/system/gootex.service.d/override.conf`).
- Any service-account JSON, tunnel token, or `credentials.json`.

Keep the committed files as templates with `REPLACE_ME` placeholders.
