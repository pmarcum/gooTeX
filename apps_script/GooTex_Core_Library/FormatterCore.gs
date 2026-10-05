/** =================================================================
 * SERVER-SIDE FORMATTER LOGIC (Dependency Injected)
 * ================================================================= */

function processSpotlightForDoc(id, centerIndex) {
    const doc = DocumentApp.openById(id);
    const body = doc.getBody();
    const totalChildren = body.getNumChildren();
    const WINDOW_SIZE = 30;
    let start = Math.max(0, centerIndex - WINDOW_SIZE);
    let end = Math.min(totalChildren, centerIndex + WINDOW_SIZE);
    console.log("🔦 Spotlight: " + id + " (" + start + "-" + end + ")");
    updateDocumentOutline(body);
    for (let i = start; i < end; i++) {
       const element = body.getChild(i);
       if (element.getType() === DocumentApp.ElementType.PARAGRAPH || 
           element.getType() === DocumentApp.ElementType.LIST_ITEM) {
           runStyleRules(element); 
       }
    }
    doc.saveAndClose();
}

function runStyleRules(container) {
    styleRegex(container, "\\\\[a-zA-Z]+", "#4a88c7", true, false); 
    styleRegex(container, "\\\\(begin|end)\\{[^\\}]+\\}", "#C586C0", true, true);
    styleRegex(container, "([^\\\\]|^)\\$[^$]+\\$", "#6A9955", false, false); 
    styleRegex(container, "\\\\cite[a-z*]*(\\[[^\\]]*\\])*\\{[^\\}]+\\}", "#CE9178", false, true);
    styleRegex(container, "\\\\ref\\{[^\\}]+\\}", "#4FC1FF", false, true);
    styleRegex(container, "\\\\(sub)*section(\\*?)\\{[^\\}]+\\}", "#D16969", true, true);
    styleRegex(container, "\\\\label\\{[^\\}]+\\}", "#9CDCFE", true, false);
    styleRegex(container, "\\}", "#000000", false, false); 
    styleRegex(container, "([^\\\\]|^)%.*", "#b0b0b0", false, true, null, false); 
    capCommentEnds(container);
    styleRegex(container, "%![^!].*", "#000000", true, false, "#FCE100", false); 
    styleRegex(container, "%!!.*", "#C31D03", true, true, "#FCE100", false);
}

function capCommentEnds(container) {
  let found = container.findText("([^\\\\]|^)%.*");
  while (found) {
    const end = found.getEndOffsetInclusive();
    const text = found.getElement().asText();
    if (end > 0) {
       text.setForegroundColor(end, end, "#000000");
       text.setItalic(end, end, false);
       text.setBold(end, end, false);
    }
    found = container.findText("([^\\\\]|^)%.*", found);
  }
}

function styleRegex(container, regex, color, isBold, isItalic, bgColor, isStrike) {
  let found = container.findText(regex);
  while (found) {
    let start = found.getStartOffset();
    const end = found.getEndOffsetInclusive();
    const textElement = found.getElement().asText();
    const fullText = textElement.getText();
    const firstChar = fullText.charAt(start);
    if ((regex.includes("\\$") || regex.includes("%")) && 
        firstChar !== '$' && firstChar !== '%' && firstChar !== '\\') {
       start++; 
    }
    if (color) {
        const attrs = textElement.getAttributes(start);
        const isColorMatch = (attrs[DocumentApp.Attribute.FOREGROUND_COLOR] || '#000000') === color;
        const isBoldMatch = !!attrs[DocumentApp.Attribute.BOLD] === !!isBold;
        const isItalicMatch = !!attrs[DocumentApp.Attribute.ITALIC] === !!isItalic;
        const isBgMatch = (attrs[DocumentApp.Attribute.BACKGROUND_COLOR] || null) === (bgColor || null);
        if (isColorMatch && isBoldMatch && isItalicMatch && isBgMatch) {
            found = container.findText(regex, found);
            continue; 
        }
    }
    if (start <= end) {
      textElement.setLinkUrl(start, end, null);
      if (isBold !== null) textElement.setBold(start, end, !!isBold);
      if (isItalic !== null) textElement.setItalic(start, end, !!isItalic);
      if (isStrike != null) textElement.setStrikethrough(start, end, !!isStrike);
      if (color) textElement.setForegroundColor(start, end, color);
      if (bgColor) textElement.setBackgroundColor(start, end, bgColor);
    }
    found = container.findText(regex, found);
  }
}

function updateDocumentOutline(body) {
  const paragraphs = body.getParagraphs();
  paragraphs.forEach(p => {
    const text = p.getText();
    let target = DocumentApp.ParagraphHeading.NORMAL;
    if (text.includes('\\section{')) target = DocumentApp.ParagraphHeading.HEADING1;
    else if (text.includes('\\subsection{')) target = DocumentApp.ParagraphHeading.HEADING2;
    else if (text.includes('\\subsubsection{')) target = DocumentApp.ParagraphHeading.HEADING3;
    else if (text.includes('\\paragraph{')) target = DocumentApp.ParagraphHeading.HEADING4;
    else if (text.includes('%!!')) target = DocumentApp.ParagraphHeading.HEADING5;
    else if (text.includes('\\begin{figure}') || text.includes('\\begin{table}')) target = DocumentApp.ParagraphHeading.HEADING6;
    if (p.getHeading() !== target) {
       p.setHeading(target);
       if (target !== DocumentApp.ParagraphHeading.NORMAL) {
          p.setLineSpacing(1.0);
          p.setSpacingBefore(0);
          p.setSpacingAfter(0);
       }
    }
  });
}
