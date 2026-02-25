#!/bin/bash

# From Original Cell 1
echo "🐍 Step 2: Installing Python Dependencies..."
pip install pyngrok flask google-genai --quiet

echo "📥 Step 3: Installing Stable LaTeX & ImageMagick (This takes ~90s)..."
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
    imagemagick -qq > /dev/null 2>&1

# From Original Cell 2
apt-get update && apt-get install -y poppler-utils texcount pandoc imagemagick > /dev/null 2>&1

echo "🔭 Installing Astronomy Publisher Templates..."
mkdir -p /usr/share/texlive/texmf-dist/tex/latex/base/
wget -q https://journals.aas.org/wp-content/uploads/2021/01/aastex631.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/aastex631.cls
wget -q https://mirror.ctan.org/macros/latex/contrib/mnras/mnras.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/mnras.cls
wget -q https://input.edpsciences.org/latex/aa.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/aa.cls
wget -q https://iopscience.iop.org/full/10.3847/1538-4357/aabc50/media/emulateapj.cls -O /usr/share/texlive/texmf-dist/tex/latex/base/emulateapj.cls

texhash > /dev/null 2>&1

# Cleaning (Parity with v31)
for var in "TEXMFCNF" "TEXMFDIST" "TEXMFSYSVAR" "TEXMFSYSCONFIG" "TEXMF"; do
    unset $var
done
fmtutil-sys --all > /dev/null 2>&1

# Fix Magick Alias
if [ ! -f "/usr/local/bin/magick" ]; then
    ln -s /usr/bin/convert /usr/local/bin/magick
fi

echo "✅ SYSTEM IS READY"
