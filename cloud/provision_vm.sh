#!/usr/bin/env bash
# =============================================================================
# provision_vm.sh — install the gooTeX compile server on a fresh Debian/Ubuntu host
#
# Packaged/cleaned from the reference e2-micro install. Changes from that
# original, all intentional:
#   • Copies gootex_e2micro_server.py (the real service module), not the old
#     server_engine.py name.
#   • Drops rclone + setup_comm_json.py: the current server does ALL Drive I/O
#     through the Apps Script side (base64 in the HTTP response), so it needs
#     no rclone mount, no service account, and no comm-JSON file.
#   • Fixes the ImageMagick policy sed (the original used '|' as both the sed
#     delimiter AND inside read|write, which breaks the command).
#
# Assumptions:
#   • A dedicated service user already exists (default: bibman). Override with
#     GOOTEX_USER=<name> ./provision_vm.sh
#   • nginx + a stable HTTPS front door (DuckDNS/Let's Encrypt or equivalent)
#     are set up separately — see DEPLOY.md §3.6.
#
# Run as the service user (NOT root), with sudo available:
#   chmod +x provision_vm.sh && ./provision_vm.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] && error "Run as your service user, not root."
GOOTEX_USER="${GOOTEX_USER:-bibman}"
[[ $(whoami) != "$GOOTEX_USER" ]] && warn "Expected user '$GOOTEX_USER', got '$(whoami)'. Paths may be wrong."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GOOTEX_DIR="/home/$GOOTEX_USER/gootex"
VENV_DIR="$GOOTEX_DIR/venv"
PROCESSING_DIR="/home/$GOOTEX_USER/gootex_processing"
CACHE_DIR="/home/$GOOTEX_USER/gootex_cache"

# ── 1. TeX Live subset + supporting tools ───────────────────────────────────
# Covers astronomy papers: core LaTeX, AMS math, fonts, BibTeX, science/
# publisher classes (aastex, mnras, aa), graphics, tables, hyperref.
info "Installing TeX Live subset and supporting tools..."
sudo apt-get update -q
sudo apt-get install -y \
    texlive-base texlive-latex-base texlive-latex-recommended texlive-latex-extra \
    texlive-fonts-recommended texlive-fonts-extra texlive-science \
    texlive-bibtex-extra texlive-publishers \
    bibtex chktex texcount poppler-utils imagemagick ghostscript \
    python3-venv python3-pip

# ── 2. ImageMagick PDF policy fix ───────────────────────────────────────────
# Distros ship a policy that blocks PDF read/write, which run_image_optimizer()
# needs. NOTE the '#' sed delimiter so the '|' in read|write is literal.
info "Patching ImageMagick PDF policy..."
for POLICY in /etc/ImageMagick-6/policy.xml /etc/ImageMagick-7/policy.xml; do
    if [[ -f "$POLICY" ]]; then
        sudo sed -i 's#<policy domain="coder" rights="none" pattern="PDF" />#<policy domain="coder" rights="read|write" pattern="PDF" />#g' "$POLICY"
        info "Patched: $POLICY"
    fi
done

# ── 3. Directory structure ──────────────────────────────────────────────────
info "Creating directory structure..."
mkdir -p "$GOOTEX_DIR" "$PROCESSING_DIR" "$CACHE_DIR"

# ── 4. Python venv + dependencies ───────────────────────────────────────────
info "Creating virtualenv at $VENV_DIR..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
if [[ -f "$SCRIPT_DIR/requirements.txt" ]]; then
    "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" --quiet
else
    "$VENV_DIR/bin/pip" install flask gunicorn google-genai requests --quiet
fi
"$VENV_DIR/bin/pip" list | grep -E "flask|gunicorn|google|requests" || true

# ── 5. Application files ─────────────────────────────────────────────────────
for f in gootex_e2micro_server.py gootex_cache_cleanup.py; do
    if [[ -f "$SCRIPT_DIR/$f" ]]; then
        cp "$SCRIPT_DIR/$f" "$GOOTEX_DIR/$f"
        info "$f → $GOOTEX_DIR/$f"
    else
        warn "$f not found next to this script — copy it into $GOOTEX_DIR/ manually."
    fi
done

# ── 6. systemd service (installed, NOT started — set secrets first) ──────────
if [[ -f "$SCRIPT_DIR/gootex.service.example" ]]; then
    sudo cp "$SCRIPT_DIR/gootex.service.example" /etc/systemd/system/gootex.service
    sudo systemctl daemon-reload
    info "Service installed (not enabled). Set secrets before starting (next steps)."
else
    warn "gootex.service.example not found — install the unit manually."
fi

# ── 7. Verify pdflatex ───────────────────────────────────────────────────────
command -v pdflatex &>/dev/null && info "pdflatex: $(pdflatex --version | head -1)" \
    || error "pdflatex not found after install — check apt output above."

# ── 8. Next steps ────────────────────────────────────────────────────────────
cat <<EOF

${GREEN}GOOTEX PROVISIONING COMPLETE — NEXT STEPS${NC}

  1. Set secrets (never in the unit file):
       sudo systemctl edit gootex
     Add:
       [Service]
       Environment="GOOTEX_CREDENTIAL=<long random string>"
       Environment="BIBMAN_CREDENTIAL=<only if using BibMan>"
       # Optional server-side AI: Environment="GEMINI_API_KEY=<key>"

  2. Ensure nginx proxies your HTTPS front door to the service, e.g.:
       location /gootex/ {
           proxy_pass            http://127.0.0.1:8082/;
           proxy_set_header      Host              \$host;
           proxy_set_header      X-Real-IP         \$remote_addr;
           proxy_set_header      X-Forwarded-For   \$proxy_add_x_forwarded_for;
           proxy_set_header      X-Forwarded-Proto \$scheme;
           proxy_read_timeout    130s;
           proxy_send_timeout    130s;
           proxy_connect_timeout 10s;
           client_max_body_size  16M;
       }
     Then: sudo nginx -t && sudo systemctl reload nginx

  3. Enable + start:
       sudo systemctl enable --now gootex
       sudo systemctl status gootex

  4. Verify locally:
       curl -s -X POST http://127.0.0.1:8082/ \\
            -H 'Content-Type: application/json' -d '{"task":"status"}'
     (401/403 is expected once GOOTEX_CREDENTIAL is set — that proves auth works.)

  5. Add the monthly cache-cleanup cron (crontab -e):
       0 10 1 * * $VENV_DIR/bin/python3 $GOOTEX_DIR/gootex_cache_cleanup.py >> /home/$GOOTEX_USER/gootex_cache_cleanup.log 2>&1

  6. Put your server URL (…/gootex) + GOOTEX_CREDENTIAL into the template's
     Config.gs CONFIG — see DEPLOY.md §4.
EOF
