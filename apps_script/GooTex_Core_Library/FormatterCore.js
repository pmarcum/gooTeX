/** =================================================================
 * SERVER-SIDE FORMATTER LOGIC (Dependency Injected)
 * ================================================================= */

// A cheap, stable hash of the document text. Formatting only changes colors, weights
// and headings — never the text — so this signature changes only on a real edit.
function _fmtSignature(text) {
    var h = 5381, i = text.length;
    while (i) { h = ((h * 33) ^ text.charCodeAt(--i)) >>> 0; }
    return text.length + ":" + h.toString(36);
}

function processSpotlightForDoc(id, centerIndex) {
    const doc = DocumentApp.openById(id);
    const body = doc.getBody();
    // Skip the whole pass — no styling writes, no save — when the document text is
    // unchanged since we last formatted it. A save re-syncs the open editor and can
    // jerk the cursor/scroll, so an idle pass over already-formatted text (e.g. while
    // the author is positioning the cursor or pausing) must not save. The pass still
    // runs after a real edit, because then the text, and so the signature, has changed.
    let props = null, sig = null;
    try {
      props = PropertiesService.getDocumentProperties();
      sig   = _fmtSignature(body.getText());
      if (props && props.getProperty("fmtSig") === sig) { return; }
    } catch (e) { props = null; }   // properties unavailable on this runtime — format as before
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
    // Record the text we just formatted so the next idle pass can skip. We store the
    // signature computed before formatting (formatting never changes the text); if an
    // edit happened to land mid-pass, the next pass will see a different signature and
    // re-format, so nothing is skipped wrongly.
    try { if (props) props.setProperty("fmtSig", sig); } catch (e) {}
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
    styleCommentLine(container, /(^|[^\\])%[^\u000b\n\r]*/g, "#9a9a9a", false, true, null, true);
    styleCommentLine(container, /%!(?!!)[^\u000b\n\r]*/g, "#000000", true, false, "#FCE100");
    styleCommentLine(container, /%!![^\u000b\n\r]*/g, "#C31D03", true, true, "#FCE100");
}

/**
 * Color a comment-style match from its `%` to the end of its visual line only.
 * Unlike a greedy ".*" findText, the pattern stops at a line break (\u000b soft
 * break, or \n / \r), so a comment never bleeds across Shift+Enter lines that
 * share one Google Docs paragraph.
 */
// Apply bgColor across [start,end] ONLY where the current background is unset or the
// formatter's own highlight; leave any manually-set highlight untouched. Works run by
// run, so an untouched part of a %!/%!! line still gets gold while a part the author
// recolored keeps their color.
function _applyBgPreserving(t, start, end, bgColor) {
  let rs = start, prev = t.getBackgroundColor(start);
  for (let i = start + 1; i <= end; i++) {
    const cur = t.getBackgroundColor(i);
    if (cur !== prev) {
      if (prev === null || String(prev).toLowerCase() === FORMATTER_HL) t.setBackgroundColor(rs, i - 1, bgColor);
      rs = i; prev = cur;
    }
  }
  if (prev === null || String(prev).toLowerCase() === FORMATTER_HL) t.setBackgroundColor(rs, end, bgColor);
}

function styleCommentLine(container, re, color, isBold, isItalic, bgColor, linkify) {
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
      if (bgColor) _applyBgPreserving(textElement, start, end, bgColor);
      if (linkify) {
        // Keep a URL inside the comment looking like a link — blue and underlined —
        // instead of greyed out with the rest of the comment.
        const seg = s.substring(start, end + 1);
        const urlRe = /https?:\/\/[^\s<>\u000b\n\r]+/g;
        let u;
        while ((u = urlRe.exec(seg)) !== null) {
          const us = start + u.index, ue = us + u[0].length - 1;
          textElement.setForegroundColor(us, ue, "#1155cc");
          textElement.setUnderline(us, ue, true);
        }
      }
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

// Return the part of a single line BEFORE its first unescaped % (a LaTeX comment).
// Used so commented-out commands (e.g. "%\section{Abstract}") are ignored by the
// outline and the Sects tab. Handles \% (literal percent) and \\% (escaped
// backslash, then a real comment). Shared across the Core library files.
function _uncommented(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (s[i] === '\\') { out += s[i] + (s[i + 1] || ''); i++; continue; }
    if (s[i] === '%') break;
    out += s[i];
  }
  return out;
}

// WorPT table blocks live inside \begin{<name>} environments named after the table
// (not table/table*/longtable/...), so the standard environment regex below never
// matches them. Each block is bounded by '%<colons> start <name> <colons>' and a
// matching end marker, one line each. We buffer a block's paragraphs and, at its end
// marker, give the block's \input{<name>} line a single outline entry — but only when
// the block contains a \caption, i.e. it is a real table. Anchoring on \input keeps
// the entry readable: the \input line always names the table, even when the caption
// holds only markup. The two empty team-summaries blocks and the environment-less
// isANONpapers block have no \caption, so they get no entry (they are not tables).
var _WORPT_START_RE = /^\s*%:+\s+start\s+\S+\s+:+\s*$/;
var _WORPT_END_RE   = /^\s*%:+\s+end\s+\S+\s+:+\s*$/;
function updateDocumentOutline(body) {
  const paragraphs = body.getParagraphs();
  const setHeading = (p, target) => {
    if (p.getHeading() !== target) {
      p.setHeading(target);
      if (target !== DocumentApp.ParagraphHeading.NORMAL) {
        p.setLineSpacing(1.0); p.setSpacingBefore(0); p.setSpacingAfter(0);
      }
    }
  };
  // While inside a WorPT block: collect its paragraphs, remember the \input line and
  // whether any \caption appears, then set headings at the end marker.
  let buf = null;   // { paras: [Paragraph], inputIdx: number, hasCaption: bool }
  const flushWorpt = () => {
    if (!buf) return;
    buf.paras.forEach((bp, i) => {
      const isEntry = buf.hasCaption && i === buf.inputIdx;
      setHeading(bp, isEntry ? DocumentApp.ParagraphHeading.HEADING6 : DocumentApp.ParagraphHeading.NORMAL);
    });
    buf = null;
  };
  paragraphs.forEach(p => {
    const text = p.getText();
    const code = _uncommented(text);   // ignore anything after an unescaped %
    const isSectioning = code.includes('\\section{') || code.includes('\\proposalComponent') ||
        code.includes('\\proposalNestedComponent') || code.includes('\\proposalReferences') ||
        code.includes('\\subsection{') || code.includes('\\subsubsection{') || code.includes('\\paragraph{');
    if (_WORPT_START_RE.test(text)) { flushWorpt(); buf = { paras: [], inputIdx: -1, hasCaption: false }; setHeading(p, DocumentApp.ParagraphHeading.NORMAL); return; }
    if (buf) {
      if (_WORPT_END_RE.test(text)) { flushWorpt(); setHeading(p, DocumentApp.ParagraphHeading.NORMAL); return; }
      if (!isSectioning) {   // accumulate the block's lines
        if (buf.inputIdx === -1 && /\\input\b/.test(code)) buf.inputIdx = buf.paras.length;
        if (/\\(?:table)?caption\b/.test(code)) buf.hasCaption = true;
        buf.paras.push(p);
        return;
      }
      flushWorpt();   // safety: a sectioning line can't sit inside a table block — close it, then fall through
    }
    let target = DocumentApp.ParagraphHeading.NORMAL;
    if (code.includes('\\section{') || code.includes('\\proposalComponent') ||
        code.includes('\\proposalNestedComponent') || code.includes('\\proposalReferences'))
       target = DocumentApp.ParagraphHeading.HEADING1;
    else if (code.includes('\\subsection{')) target = DocumentApp.ParagraphHeading.HEADING2;
    else if (code.includes('\\subsubsection{')) target = DocumentApp.ParagraphHeading.HEADING3;
    else if (code.includes('\\paragraph{')) target = DocumentApp.ParagraphHeading.HEADING4;
    else if (text.includes('%!!')) target = DocumentApp.ParagraphHeading.HEADING5;
    else if (/\\begin\{(figure\*?|wrapfigure|sidewaysfigure\*?|marginfigure|SCfigure\*?|table\*?|deluxetable\*?|sidewaystable\*?|longtable|wraptable)\}/.test(code)) target = DocumentApp.ParagraphHeading.HEADING6;
    setHeading(p, target);
  });
  flushWorpt();   // a block missing its end marker is flushed as a non-table (all NORMAL)
}
