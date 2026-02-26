#!/bin/bash

# ==============================================================
# GooTeX Environment Setup Script
# Pulled from GitHub by Cell 0 on every Colab session start.
# DO NOT "OPTIMIZE" THIS FILE. Every line is intentional.
# ==============================================================

echo "🐍 Step 1: Installing Python Dependencies..."
pip install pyngrok flask google-genai requests --quiet

echo "📥 Step 2: Installing Stable LaTeX & ImageMagick (This takes ~90s)..."

# Guard against broken apt mirrors (e.g., Illinois r2u repo).
# We disable any third-party sources that might stall, then run with a timeout.
# If the update fails, we proceed anyway — the base Colab image usually has enough.
echo "   Updating apt (with 60s timeout guard)..."
timeout 60 apt-get update --fix-missing -qq > /dev/null 2>&1 || {
    echo "   ⚠️  Primary apt update stalled or failed. Attempting mirror fallback..."
    # Remove any known-broken r2u or third-party sources
    rm -f /etc/apt/sources.list.d/r2u.list /etc/apt/sources.list.d/*.list 2>/dev/null
    # Restore only the official Ubuntu archive
    cat > /etc/apt/sources.list << 'EOF'
deb http://archive.ubuntu.com/ubuntu focal main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu focal-updates main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu focal-security main restricted universe multiverse
EOF
    timeout 60 apt-get update --fix-missing -qq > /dev/null 2>&1 || echo "   ⚠️  Fallback update also failed. Proceeding with cached packages."
}

apt-get install -y bc \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-pictures \
    texlive-science \
    texlive-bibtex-extra \
    texlive-extra-utils \
    texlive-publishers \
    chktex \
    imagemagick -qq > /dev/null 2>&1

# Install additional tools needed by server_engine.py utilities
echo "   Installing poppler-utils, texcount, pandoc..."
apt-get install -y poppler-utils texcount pandoc > /dev/null 2>&1

echo "🔍 Step 3: Installing Astronomy Publisher Templates..."
mkdir -p /usr/share/texlive/texmf-dist/tex/latex/base/
wget -q https://journals.aas.org/wp-content/uploads/2021/01/aastex631.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/aastex631.cls
wget -q https://mirror.ctan.org/macros/latex/contrib/mnras/mnras.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/mnras.cls
wget -q https://input.edpsciences.org/latex/aa.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/aa.cls
wget -q https://iopscience.iop.org/full/10.3847/1538-4357/aabc50/media/emulateapj.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/emulateapj.cls

texhash > /dev/null 2>&1

# CLEANING THE BRAIN (Preserves parity with v31 — do not remove)
for var in "TEXMFCNF" "TEXMFDIST" "TEXMFSYSVAR" "TEXMFSYSCONFIG" "TEXMF"; do
    unset $var
done
fmtutil-sys --all > /dev/null 2>&1

# Fix Magick Alias (ImageMagick 6 installs as 'convert', not 'magick')
if [ ! -f "/usr/local/bin/magick" ]; then
    ln -s /usr/bin/convert /usr/local/bin/magick
fi

echo "✅ SYSTEM IS READY. RUN CELL 2."
