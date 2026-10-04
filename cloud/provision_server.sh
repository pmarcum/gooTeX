#!/bin/bash
# ==============================================================
# gooTeX Server Provisioning Script  (Debian / Ubuntu)
# Installs the LaTeX toolchain + Python deps that
# cloud/server_engine.py needs on a persistent compile host.
# Run ONCE on a fresh server (e.g. a Google Cloud e2-micro
# running Debian 12 "bookworm"). Safe to re-run after a rebuild.
#
# Adapted from the retired Colab-era setup_env.sh: ngrok, the
# Colab apt-mirror fallback, and all notebook-cell wiring removed.
# ==============================================================

echo "🐍 Step 1/5: Python dependencies for server_engine.py..."
# Keep this list in sync with the imports at the top of server_engine.py.
# --break-system-packages is required for a system-wide install on Debian 12
# (PEP 668); prefer a dedicated venv if your systemd unit points at one.
sudo pip install --break-system-packages flask requests google-genai

echo "📥 Step 2/5: LaTeX toolchain + supporting tools (~3 min)..."
sudo apt-get update --fix-missing -qq
sudo apt-get install -y -qq bc texlive-latex-recommended texlive-latex-extra \
  texlive-fonts-recommended texlive-fonts-extra texlive-pictures texlive-science \
  texlive-bibtex-extra texlive-extra-utils texlive-publishers \
  chktex imagemagick poppler-utils texcount pandoc

echo "🔭 Step 3/5: Astronomy publisher document classes..."
TEXDIR="/usr/share/texlive/texmf-dist/tex/latex/base"
sudo mkdir -p "$TEXDIR"
fetch_cls() { sudo wget -q "$1" -O "$TEXDIR/$2" && echo "   ✓ $2" || echo "   ⚠️  could not fetch $2 ($1) — install manually if your group needs it"; }
fetch_cls https://journals.aas.org/wp-content/uploads/2021/01/aastex631.cls aastex631.cls
fetch_cls https://mirror.ctan.org/macros/latex/contrib/mnras/mnras.cls mnras.cls
fetch_cls https://input.edpsciences.org/latex/aa.cls aa.cls
fetch_cls https://iopscience.iop.org/full/10.3847/1538-4357/aabc50/media/emulateapj.cls emulateapj.cls
sudo texhash

echo "🔧 Step 4/5: Rebuild TeX formats + ImageMagick 'magick' alias..."
sudo fmtutil-sys --all > /dev/null 2>&1 || true
# ImageMagick 6 ships 'convert' but not 'magick'; server_engine.py calls 'magick'.
[ -f /usr/local/bin/magick ] || sudo ln -s "$(command -v convert)" /usr/local/bin/magick

echo "✅ Step 5/5: Provisioning complete."
echo "   Verify:  pdflatex --version  &&  magick --version"
echo "   Next:    run server_engine.py as a persistent systemd service (gootex.service),"
echo "            then point GOOTEX_SERVER_URL in Config.gs at this host."
