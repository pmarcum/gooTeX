#!/bin/bash
# GooTeX Cloud Environment Provisioner
# Target: Parity with Colab Master Initialization v37.1 + v45.1

echo "📦 Step 1: Mounting Google Drive (Handled by Python Bootstrap)..."
# Note: actual drive.mount is handled in the Colab cell to allow user interaction.

echo "🐍 Step 2: Installing Python Dependencies..."
pip install pyngrok flask google-genai requests --quiet

echo "📥 Step 3: Installing Stable LaTeX & Infrastructure (takes ~90s)..."
apt-get update --fix-missing -qq > /dev/null 2>&1
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
    poppler-utils \
    texcount \
    pandoc \
    imagemagick -qq > /dev/null 2>&1

echo "🔭 Step 4: Installing Astronomy Publisher Templates..."
# Ensure local TeX tree exists
mkdir -p /usr/share/texlive/texmf-dist/tex/latex/base/

wget -q https://journals.aas.org/wp-content/uploads/2021/01/aastex631.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/aastex631.cls
wget -q https://mirror.ctan.org/macros/latex/contrib/mnras/mnras.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/mnras.cls
wget -q https://input.edpsciences.org/latex/aa.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/aa.cls
wget -q https://iopscience.iop.org/full/10.3847/1538-4357/aabc50/media/emulateapj.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/emulateapj.cls

# Rebuild TeX filename database
texhash > /dev/null 2>&1

echo "🧠 Step 5: Cleaning Environment (Preserves Parity with v31)..."
# Unset specific TeX variables to prevent path confusion
for var in "TEXMFCNF" "TEXMFDIST" "TEXMFSYSVAR" "TEXMFSYSCONFIG" "TEXMF"; do
    unset $var
done

# Regenerate all formats
fmtutil-sys --all > /dev/null 2>&1

# Fix Magick Alias (Colab v6 -> v7 compatibility)
if [ ! -f "/usr/local/bin/magick" ]; then
    ln -s /usr/bin/convert /usr/local/bin/magick
fi

echo "✅ SYSTEM ENVIRONMENT READY"
