# gooTeX Maintenance Guide

For the person running a live gooTeX instance. This is the map of **where everything lives** and **what to touch when something changes**. It is not needed to *use* gooTeX, and it is separate from one-time setup (see [DEPLOY.md](DEPLOY.md)).

> This covers the **gooTeX** side only. If you also run **BibMan**, it has its own secrets and services (its own credential, database, search index, and tunnel) documented separately.

---

## 1. Where everything lives

**Server half** (reference paths from the `e2-micro` install; adjust to yours):

| Thing | Location |
| :--- | :--- |
| Compile server code | `/home/bibman/gootex/gootex_e2micro_server.py` |
| Python venv | `/home/bibman/gootex/venv/` |
| systemd unit | `/etc/systemd/system/gootex.service` |
| **Secrets** (credentials, optional Gemini key) | systemd drop-in: `/etc/systemd/system/gootex.service.d/override.conf` |
| Per-document compile cache | `/home/bibman/gootex_cache/{doc_id}/` |
| Scratch/processing dir | `/home/bibman/gootex_processing/` |
| Cache-cleanup script | `/home/bibman/gootex/gootex_cache_cleanup.py` (monthly cron) |
| Cleanup log | `/home/bibman/gootex_cache_cleanup.log` |

**Google half:**

| Thing | Location |
| :--- | :--- |
| Core logic + non-secret settings | `GooTeX_Core_Library` → `Config.gs` (version URL, template URL, Gemini **model**, menu cosmetics) |
| **Per-group secrets** | The team template Doc's **bound script** → `Config.gs` → `CONFIG` object |
| Allowed-users list | The `allowed_users` Google Sheet (ID in `CONFIG.GOOTEX_ACCESS_SHEET_ID`) |
| Per-paper template | Your filled-in copy of the public template |

---

## 2. Secrets & settings inventory

| Item | Lives in | Notes |
| :--- | :--- | :--- |
| `GOOTEX_CREDENTIAL` | server drop-in **+** template `CONFIG` | Shared secret authenticating Apps Script → server. **Must be identical in both.** |
| `BIBMAN_CREDENTIAL` | server drop-in **+** template `CONFIG` **+** BibMan's own config | Only if BibMan is in use. gooTeX sends it as the `X-BibMan-Credential` header. |
| `GEMINI_API_KEY` | template `CONFIG` (live path) — optionally also server drop-in (dormant route) | One shared key for the whole group. See §4. |
| Gemini **model** | library `Config.gs` → `GOOTEX_GEMINI_MODEL` | Live path. The server's hardcoded `gemini-2.5-flash` only matters if the server AI route is lit. |
| `GOOTEX_SERVER_URL` | template `CONFIG` | The public HTTPS endpoint (ends in `/gootex`). |
| `GOOTEX_ACCESS_SHEET_ID` | template `CONFIG` | ID of the `allowed_users` sheet. |
| LaTeX toolchain | the server OS | Installed by `provision_vm.sh`. |
| **Not used by gooTeX** | — | No Google service account, no rclone, no Drive mount. All Drive I/O is Apps Script side. |

---

## 3. "If X changes, do Y" runbook

**Rotate `GOOTEX_CREDENTIAL`:**
1. Generate a new value (`python3 -c "import secrets; print(secrets.token_hex(16))"`).
2. Update the server drop-in (`sudo systemctl edit gootex`) → `sudo systemctl restart gootex`.
3. Update `CONFIG.GOOTEX_CREDENTIAL` in the template's bound script.
   They must match or every compile returns `🔒 Unauthorized` (HTTP 403).

**Rotate `BIBMAN_CREDENTIAL`:** same pattern, and also update BibMan's own config — all three must match.

**Change the Gemini key:** update `CONFIG.GEMINI_API_KEY` in the template's bound script (and the server drop-in too, only if you use the server-side AI route — then restart the service). Rotate the old key in Google AI Studio.

**Change the Gemini model:** edit `GOOTEX_GEMINI_MODEL` in the library's `Config.gs`. (If you have lit the server-side AI route, also change the hardcoded model in `gootex_e2micro_server.py` and restart.)

**Server URL / tunnel changes:** update `CONFIG.GOOTEX_SERVER_URL` in the template's bound script. Nothing else references it — there is no comm-file mechanism anymore.

**Add / remove a user:** edit the `allowed_users` Google Sheet. No restart needed.

**Update the gooTeX code (new release):** pull the new server code onto the VM and `sudo systemctl restart gootex`; update the `GooTeX_Core_Library` Apps Script; bump `version.json` in the repo so running instances show the "update available" banner.

**Cache growing too large / change retention:** edit `MAX_AGE_DAYS` in `gootex_cache_cleanup.py` (default 90), or run it by hand: `~/gootex/venv/bin/python3 ~/gootex/gootex_cache_cleanup.py`. Set `DRY_RUN = True` to preview without deleting.

---

## 4. The Gemini AI key — tiers & billing

The Log-tab AI assistant runs on **one shared key** (`CONFIG.GEMINI_API_KEY`), used by the whole group — not per-user accounts. Its capacity depends on the key's **tier**:

- **Free tier** (no billing on the project): low requests-per-minute/day — a whole group sharing it can hit limits.
- **Tier 1** and up (billing enabled on the project): much higher limits, scaling with cumulative spend.

Check or change the tier in **Google AI Studio / Google Cloud console** for the project behind the key; current limit numbers are at <https://ai.google.dev/gemini-api/docs/rate-limits>. Because the key is shared and reaches users' browsers, keep it dedicated to gooTeX — don't reuse a key tied to other paid services.

---

## 5. Health checks & quick troubleshooting

| Symptom | First thing to check |
| :--- | :--- |
| Compiles return `🔒 Unauthorized` / 403 | `GOOTEX_CREDENTIAL` mismatch between server drop-in and template `CONFIG` |
| Compiles return "SERVER URL MISSING" | `CONFIG.GOOTEX_SERVER_URL` not set in the template script |
| Nothing happens / connection error | Server down or tunnel down — `sudo systemctl status gootex`; test the HTTPS endpoint's `/health` |
| AI button says "API Key missing" | No usable `GEMINI_API_KEY` on the active path (template `CONFIG`, or server drop-in if using that route) |
| Citations don't resolve with `bibman:` | BibMan down, or `BIBMAN_CREDENTIAL` mismatch between gooTeX and BibMan |
| Disk filling up | Cache under `~/gootex_cache/`; run the cleanup script or lower `MAX_AGE_DAYS` |

Useful commands:
```bash
sudo systemctl status gootex          # is it running?
sudo journalctl -u gootex -n 100      # recent server logs
sudo systemctl cat gootex             # unit + secret drop-in (shows current env)
```

---

## 6. Maintaining the library & updates (maintainer)

Adopters pick a level of independence (see DEPLOY.md §4.1): most **use your shared library** directly (Level 1), some **copy it** for independence (Level 2), and the repo is the from-scratch fallback (Level 3). You maintain the canonical source and the update channel for all of them.

- **Canonical source (recovery copy).** The `apps_script/` files in the repo are the durable source of truth — if your live Apps Script projects are ever lost or you're no longer maintaining them, anyone can rebuild them from these files. Keep them roughly in sync when you change the library (paste the changed files in, or use `clasp` if you prefer). Adopters don't use this — they copy your live library/template directly.
- **Ship an update.** Push the new library code, then bump `GOOTEX_ATTACHED_VERSION` (template bound script) and the versions in `version.json` on GitHub. Every running instance fetches that `version.json` and shows an "update available" banner when behind — **Level 1** instances update automatically (they call your live library); **Level 2** instances apply it by re-copying or editing their own library copy.
- **Keep the shared library available.** Level-1 adopters call your `GooTeX_Core_Library` at runtime, so keep it **shared read-only** and don't delete deployed versions still in use — their installs depend on it. (No quota cost to you: Apps Script charges library execution to the running user, not the owner.)
- **Keep the public template pre-wired.** Its bound script's **Libraries** dependency must point at your `GooTeX_Core_Library` script ID (identifier exactly `GooTeX_Core_Library`), so Level-1 adopters need no library step at all. Re-check this after any library re-deploy.
- **Genericize the public template's manifest.** The public template's `appsscript.json` `urlFetchWhitelist` must **not** carry your private server domain or the dead `ngrok` entries — a copy would then silently refuse to reach the adopter's own server. Ship it with the `https://YOUR-SERVER-DOMAIN-HERE/` placeholder instead (see the repo's `apps_script/template_bound_script/appsscript.json`). Apply the same cleanup to the **library's** own `appsscript.json` before committing it, since Level-2 adopters copy the library and would inherit whatever's there.
- **`GOOTEX_TEMPLATE_URL` lives in each template's `CONFIG`, not the library.** It's the "make a fresh copy of the template" link shown when an attached script is out of date, so it is inherently *per-group* — each template points at **itself**. The library already reads it correctly: `Code.gs` line ~64 uses `_CONFIG.GOOTEX_TEMPLATE_URL`, and `_CONFIG` is a module global set by `setConfig()`, so it's in scope. To finish the migration:
  1. **Every template's `CONFIG` must include `GOOTEX_TEMPLATE_URL`** (team, public, and each adopter's) — pointing at that template's own "make a copy" URL. If it's missing, the update banner prints `undefined`.
  2. **Delete the now-unused `var GOOTEX_TEMPLATE_URL`** from the library's `Config.gs` (nothing reads the global anymore).
  3. **Fix the hardcoded template link in `AdminHelp.html`** (Step 1): it points at the team template (`14aKy8…`), but that page is served to every group's admin, so point it at the **PUBLIC** template (`1wMrs8…`). Also add `GOOTEX_TEMPLATE_URL` to the Step 2 config list there.
