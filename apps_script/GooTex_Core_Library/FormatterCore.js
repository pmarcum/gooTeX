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

// Colors the formatter itself applies. Any OTHER foreground color is treated as a
// manual mark and left untouched by the reset. All are deliberately off the standard
// Google Docs palette, so a color picked from that menu never collides with one.
var FORMATTER_FG = {"#5e81a8":1,"#8a6a92":1,"#5f8a57":1,"#a9815f":1,"#3f8fbf":1,
                    "#b06a6a":1,"#6f9bbd":1,"#9a9a9a":1,"#c31d03":1,"#000000":1,
                    "#aaaaaa":1,"#888888":1,"#2e7d32":1};
var FORMATTER_HL = "#fce100";  // the %! / %!! highlight; off-standard so manual yellow survives

// Reset only the formatter's own colors, preserving manual font colors and highlights.
// Foreground: black-out formatter colors (and unset/black runs); keep manual colors.
// Background: clear only the %! highlight (re-applied below for lines still %!); keep
// manual highlights and the error highlight, which the error system owns.
function _resetFormatterColors(t, len) {
  var rs = 0, prev = t.getForegroundColor(0);
  for (var i = 1; i <= len; i++) {
    var cur = (i < len) ? t.getForegroundColor(i) : null;
    if (i === len || cur !== prev) {
      if (prev === null || FORMATTER_FG[String(prev).toLowerCase()]) t.setForegroundColor(rs, i - 1, "#000000");
      rs = i; prev = cur;
    }
  }
  rs = 0; prev = t.getBackgroundColor(0);
  for (var j = 1; j <= len; j++) {
    var curb = (j < len) ? t.getBackgroundColor(j) : null;
    if (j === len || curb !== prev) {
      if (prev !== null && String(prev).toLowerCase() === FORMATTER_HL) t.setBackgroundColor(rs, j - 1, null);
      rs = j; prev = curb;
    }
  }
}

function runStyleRules(container) {
    // Reset only the formatter's own styling before re-applying syntax colors, so a
    // stale formatter color clears (e.g. after un-commenting a line) while any manual
    // font color or highlight the author added is preserved. Bold/italic are always
    // cleared — there's no way to tell a manual bold from a formatter bold, and the
    // author prefers clean text. See _resetFormatterColors.
    const _reset = container.editAsText();
    const _rlen  = _reset.getText().length;
    if (_rlen > 0) {
      _reset.setBold(0, _rlen - 1, false);
      _reset.setItalic(0, _rlen - 1, false);
      _resetFormatterColors(_reset, _rlen);
    }
    styleRegex(container, "\\\\[a-zA-Z]+", "#5e81a8", false, false);
    styleRegex(container, "\\\\(begin|end)\\{[^\\}]+\\}", "#8a6a92", false, true);
    styleRegex(container, "([^\\\\]|^)\\$[^$]+\\$", "#5f8a57", false, false);
    styleRegex(container, "\\\\cite[a-z*]*(\\[[^\\]]*\\])*\\{[^\\}]+\\}", "#a9815f", false, true);
    styleRegex(container, "\\\\ref\\{[^\\}]+\\}", "#3f8fbf", false, false);
    styleRegex(container, "\\\\(sub)*section(\\*?)\\{[^\\}]+\\}", "#b06a6a", true, false);
    // Custom proposal headings (from proposal.sty) act like \section — color them the same.
    styleRegex(container, "\\\\proposal(Nested)?Component(\\[[^\\]]*\\])*\\{[^\\}]+\\}", "#b06a6a", true, false);
    styleRegex(container, "\\\\proposalReferences(\\[[^\\]]*\\])*", "#b06a6a", true, false);
    styleRegex(container, "\\\\label\\{[^\\}]+\\}", "#6f9bbd", false, false);
    styleRegex(container, "\\}", "#000000", false, false);
    // Comment family — each bounded to its own visual line so a % comment on one
    // Shift+Enter line never spills its color onto the lines below it.
    styleCommentLine(container, /(^|[^\\])%[^\u000b\n\r]*/g, "#9a9a9a", false, true, null);
    styleCommentLine(container, /%!(?!!)[^\u000b\n\r]*/g, "#000000", true, false, "#FCE100");
    styleCommentLine(container, /%!![^\u000b\n\r]*/g, "#C31D03", true, true, "#FCE100");
}

/**
 * Color a comment-style match from its `%` to the end of its visual line only.
 * Unlike a greedy ".*" findText, the pattern stops at a line break (\u000b soft
 * break, or \n / \r), so a comment never bleeds across Shift+Enter lines that
 * share one Google Docs paragraph.
 */
function styleCommentLine(container, re, color, isBold, isItalic, bgColor) {
  const textElement = container.editAsText();
  const s = textElement.getText();
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    const lead = m[1] ? m[1].length : 0;   // skip the non-"\" char the base rule captures before %
    const start = m.index + lead;
    const end = m.index + m[0].length - 1; // inclusive
    if (start <= end) {
      if (color) textElement.setForegroundColor(start, end, color);
      textElement.setBold(start, end, !!isBold);
      textElement.setItalic(start, end, !!isItalic);
      if (bgColor) textElement.setBackgroundColor(start, end, bgColor);
    }
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
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
    if (text.includes('\\section{') || text.includes('\\proposalComponent') ||
        text.includes('\\proposalNestedComponent') || text.includes('\\proposalReferences'))
       target = DocumentApp.ParagraphHeading.HEADING1;
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
