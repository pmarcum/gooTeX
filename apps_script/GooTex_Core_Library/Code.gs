/** * 🦠 GOOTEX CORE LIBRARY **/

/******************************/
var GOOTEX_CORE_VERSION   = 2;
/******************************/

function getCoreVersion() {return GOOTEX_CORE_VERSION;}

// Receives the local configuration from the attached script and stores it for
// use throughout this library. Called at the start of every entry point because
// each server-side call is stateless — the library forgets everything between calls.
var _CONFIG = null;
function setConfig(cfg) { _CONFIG = cfg; }

function onOpen() {
  const ui   = DocumentApp.getUi();
  const menu = ui.createMenu(GOOTEX_MENU_TITLE + " v" + getCoreVersion() + "." + (_CONFIG["GOOTEX_ATTACHED_VERSION"] || "?"));
  // 🚀 Main control panel — one click to open
  menu.addItem('🚀 Control Panel', 'taskOpenSidebar');
  // 📖 Help & Documentation
  menu.addSeparator();
  menu.addSubMenu(ui.createMenu('📖 Help & Guides')
      .addItem('❓ User Guide',    'taskShowHelp'))
  // 🛠️ User Utilities
  menu.addSeparator();
  menu.addSubMenu(ui.createMenu('🛠️ Utilities')
      .addItem('📝 Count Selected Words',  'taskSelectionCount')
      .addItem('📉 Compress Image',        'taskOptimizeImages')
      .addItem('🤝 Invite Co-Author',      'taskInviteCoAuthor'));
  // 🔧 Admin Only
  menu.addSeparator();
  menu.addSubMenu(ui.createMenu('🔧 Admin Only')
      .addItem('📖 Admin Manual',          'taskShowAdminHelp')
      .addSeparator()
      .addItem('📋 Create User gooTeX/BibMan Access List', 'setupDrive')
      .addItem('🕵️ Check System Status',   'checkStatus')
      .addSeparator()
      .addItem('🧹 Reset Connection',      'masterSync'));
  menu.addToUi();
}

function checkVersion() {
  if (!_CONFIG) {
    console.warn("⚠️ _CONFIG not set — setConfig() not called before onOpen()!");
    return;
  }
  console.log("🦠GooTeX Hierarchy Aware Engine v" + getCoreVersion() + " Active.");
  try {
    var response = UrlFetchApp.fetch(GOOTEX_VERSION_URL, {muteHttpExceptions: true});
    if (response.getResponseCode() !== 200) return;
    var data = JSON.parse(response.getContentText());
    var latestCore    = data["gootex_core_version"];
    var latestClient  = data["gootex_attached_version"];
    var currentCore   = getCoreVersion();
    var currentClient = _CONFIG["GOOTEX_ATTACHED_VERSION"];
    var msgs = [];
    console.log("DEBUG versions — core: " + currentCore + " vs " + latestCore + " | client: " + currentClient + " vs " + latestClient);
    if (latestCore   > currentCore)   msgs.push("• GooTeX Core library: you have v" + currentCore   + ", latest is v" + latestCore   + "\n  → Extensions → Libraries → update GooTeX_Core");
    if (latestClient > currentClient) msgs.push("• Attached script: you have v" + currentClient + ", latest is v" + latestClient + "\n  → Make a fresh copy of the GooTeX template:\n  " + GOOTEX_TEMPLATE_URL);
    if (msgs.length > 0) {
      DocumentApp.getUi().alert(
        "⚠️ GooTeX Update Available",
        "Your GooTeX installation is out of date:\n\n" + msgs.join("\n\n"),
        DocumentApp.getUi().ButtonSet.OK
      );
    }
  } catch(e) {
    console.warn("checkVersion failed: " + e.message);
  }
}

/** ------------------------------------------------------------------
 * 🖼️ THUMBNAIL GENERATOR (Bloodhound Edition)
 * ------------------------------------------------------------------ */
function getThumbnailBase64(filename) {
  if (!filename) return null;
  try {
    const cleanPath = filename.replace(/[{}]/g, "").trim();
    const cleanName = cleanPath.split('/').pop();
    const projectFolder = _getTrueProjectRoot();
    if (!projectFolder) return null;
    let candidates = [cleanName];
    if (cleanName.indexOf('.') === -1) { candidates.push(cleanName + ".png", cleanName + ".jpg", cleanName + ".jpeg"); }
    let file = null;
    for (const nameToTry of candidates) {
        if (file) break;
        file = recursiveFindInfo(projectFolder, nameToTry);
    }
    if (file) {
      const blob = file.getBlob();
      const type = blob.getContentType();
      if (type.indexOf('pdf') > -1 || type.indexOf('tex') > -1) return null;
      return "data:" + type + ";base64," + Utilities.base64Encode(blob.getBytes());
    }
  } catch (e) { console.warn("Thumbnail Fail: " + e.message); }
  return null;
}

function _getTrueProjectRoot() {
  const props = PropertiesService.getDocumentProperties();
  const cachedId = props.getProperty(GOOTEX_CACHE_KEY_ROOT);
  if (cachedId) { try { return DriveApp.getFolderById(cachedId); } catch(e) {} }
  try {
    const docId = DocumentApp.getActiveDocument().getId();
    const folder = DriveApp.getFileById(docId).getParents().next();
    props.setProperty(GOOTEX_CACHE_KEY_ROOT, folder.getId());
    return folder;
  } catch(e) { console.warn("Project root lookup failed: " + e.message); }
  return null;
}

function debugConfig() {
  console.log("Server URL:    " + (_CONFIG.GOOTEX_SERVER_URL   || "NOT SET"));
  console.log("Credential:    " + (_CONFIG.GOOTEX_CREDENTIAL   ? "SET" : "NOT SET"));
  console.log("BibMan cred:   " + (_CONFIG.BIBMAN_CREDENTIAL   ? "SET" : "NOT SET"));
  console.log("Access Sheet:  " + (_CONFIG.GOOTEX_ACCESS_SHEET_ID || "NOT SET"));
}

function taskShowAdminHelp() {
  const template = HtmlService.createTemplateFromFile('AdminHelp');
  template.teamFolder = _getProjectName();
  const html = template.evaluate().setTitle('Admin / Host Manual').setWidth(600).setHeight(500);
  DocumentApp.getUi().showModelessDialog(html, 'gooTeX Admin Guide');
}

function taskOpenSidebar() {
  try { checkVersion(); } catch(e) {}
  const ui = DocumentApp.getUi();
  const html = HtmlService.createTemplateFromFile('Sidebar')
      .evaluate()
      .setTitle(GOOTEX_SIDEBAR_TITLE)
      .setWidth(350);
  ui.showSidebar(html);
}

function taskShowHelp() {
  const html = HtmlService.createTemplateFromFile('Help')
      .evaluate()
      .setTitle('gooTeX Global Overview')
      .setWidth(600)
      .setHeight(500);
  DocumentApp.getUi().showModelessDialog(html, 'gooTeX Documentation');
}

/** 🚀 v1.0 MASTER COMPILE */
function taskCompile() {
  if (!requireAuthorization()) return { status: "error", log: "🔒 Not authorized." };
  const lock = LockService.getDocumentLock();
  try { lock.waitLock(60000); } catch (e) {
    return { status: "error", log: "⚠️ System Busy." };
  }
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!_CONFIG.GOOTEX_SERVER_URL) return { status: "error", log: "❌ SERVER URL MISSING — check Config.gs" };
    let text = getCleanText(doc.getId());
    const result = executeTask('compile', doc.getName(), text, doc);
    if (result && result.status === 'success') {
      let user = Session.getActiveUser().getEmail().split('@')[0];
      const time = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "E MM/dd/yyyy hh:mma");
      PropertiesService.getDocumentProperties().setProperties({'LAST_COMPILE_USER': user, 'LAST_COMPILE_TIME': time });
    }
    if (result) { result.doc_name = doc.getName(); }
    doc.saveAndClose();
    return handleResponse(result);
  } catch (e) {
    return { status: "error", log: "🚫 Script Crash: " + e.message };
  } finally {
    if (lock.hasLock()) { lock.releaseLock(); }
  }
}

/** 📊 Restored Character-Capped HUD */
function handleResponse(result) {
  if (!result) return { status: "offline" };
  const propsService = PropertiesService.getDocumentProperties();
  if (result.page_count && result.page_count !== "0") { propsService.setProperty('LAST_PAGE_COUNT', result.page_count.toString()); }
  const pData = propsService.getProperties();
  // 🏷️ USERNAME CAP: Limits to 6 chars + ... if longer
  let rawUser = pData.LAST_COMPILE_USER || "System";
  let displayUser = rawUser.length > 6 ? rawUser.substring(0, 6) + ".." : rawUser;
  // 🕒 TIME CAP: Ensures 3-letter Day (e.g., Wed)
  let lastTime = (pData.LAST_COMPILE_TIME || "--:--").replace(/^([A-Za-z]{4,})/, m => m.substring(0, 3));
  // 🏗️ ASSEMBLE HUD
  result.full_hud = `w:${result.word_count || "0"}|p:${result.page_count || pData.LAST_PAGE_COUNT || "0"}|${displayUser}|${lastTime}`;
  return result;
}

function collectSubDocs(mainText, taskName) {
  var payload  = {};
  var regex    = /\\(input|include|usepackage|bibliography|addbibresource|bibliographystyle|documentclass)(?:\[.*?\])?\{([^}]+)\}/g;
  var match;
  const docId  = DocumentApp.getActiveDocument().getId();
  const props  = PropertiesService.getDocumentProperties();
  let projectIndex = null;
  let localFolder  = null;
  const SKIP_LIST = new Set(["article","report","book","letter","beamer","revtex4","revtex4-1","revtex4-2","aastex63","aastex631","mnras","emulateapj","standalone","graphicx","geometry","amsmath","amssymb","amsfonts","natbib","hyperref","url","bm","dcolumn","times","color","xcolor","tikz","float","caption","subcaption","listings","longtable","booktabs","array","multirow","multicol","wrapfig","enumitem","titlesec","fancyhdr","setspace","lipsum","blindtext","inputenc","fontenc","babel","csquotes","biblatex","authblk","etoolbox","microtype","siunitx","physics","todonotes","ulem","soul","cancel","tcolorbox","framed","mdframed","calc","ifthen","xparse","expl3","pgfplots"]);
  // ── Text files ─────────────────────────────────────────────
  while ((match = regex.exec(mainText)) !== null) {
    try {
      var cmd       = match[1];
      var rawPath   = match[2];
      var cleanName = rawPath.replace(/\.(tex|sty|bib|bst|cls)$/i, "").trim();
      if (SKIP_LIST.has(cleanName.split('/').pop().toLowerCase())) continue;
      if (!projectIndex) {
        localFolder  = DriveApp.getFileById(docId).getParents().next();
        projectIndex = buildProjectIndex(localFolder);
      }
      var saveExt = ".tex";
      if (cmd === 'usepackage')        saveExt = ".sty";
      if (cmd === 'bibliographystyle') saveExt = ".bst";
      if (cmd === 'documentclass')     saveExt = ".cls";
      let targetName = cleanName.split('/').pop().toLowerCase();
      let fileFound  = null;
      if (cmd === 'bibliography' || cmd === 'addbibresource') {
        fileFound = projectIndex[targetName] || projectIndex[targetName + ".bib"];
      } else {
        fileFound = projectIndex[targetName + saveExt];
        if (!fileFound) fileFound = projectIndex[targetName];
      }
      if (fileFound) {
        var content = "";
        if (fileFound.getMimeType() === MimeType.GOOGLE_DOCS) {
          content = fetchDocContent(fileFound.getId());
          if (saveExt === ".tex") {
            content = content.replace(/^\\documentclass[\s\S]*?\\begin\{document\}/, "")
                             .replace(/\\end\{document\}[\s\S]*$/, "");
          }
        } else {
          content = fileFound.getBlob().getDataAsString();
        }
        var simpleFilename = cleanName.split('/').pop() + (cmd.includes('bib') ? ".bib" : saveExt);
        payload[simpleFilename] = content;
      }
    } catch(e) {}
  }
  // ── Images (compile only) ──────────────────────────────────
  if (taskName === 'compile') {
    try {
      if (!localFolder) {
        localFolder  = DriveApp.getFileById(docId).getParents().next();
        projectIndex = buildProjectIndex(localFolder);
      }
      const imageManifest = [];
      const imagesToFetch = new Map();
      const IMAGE_EXTS_RE = /\{([^{}]*\.(png|pdf|jpg|jpeg|eps|ps|tif|tiff|svg))\}/gi;
      let imgMatch;
      while ((imgMatch = IMAGE_EXTS_RE.exec(mainText)) !== null) {
        const rawPath  = imgMatch[1].trim();
        const flatName = rawPath.split('/').pop();  // original case
        imagesToFetch.set(flatName, flatName);
      }
      let fileIdCache      = {};
      let fileIdCacheDirty = false;
      try {
        const cached = props.getProperty('IMAGE_FILE_ID_CACHE');
        if (cached) fileIdCache = JSON.parse(cached);
      } catch(e) {}
      imagesToFetch.forEach(function(originalName, keyName) {
        try {
          let fileFound = null;
          if (fileIdCache[keyName]) {
            try {
              fileFound = DriveApp.getFileById(fileIdCache[keyName]);
            } catch(e) {
              delete fileIdCache[keyName];
              fileIdCacheDirty = true;
            }
          }
          if (!fileFound && projectIndex) {
            fileFound = projectIndex[keyName.toLowerCase()];
          }
          if (!fileFound) return;
          const fileId = fileFound.getId();
          if (fileIdCache[keyName] !== fileId) {
            fileIdCache[keyName] = fileId;
            fileIdCacheDirty = true;
          }
          const modified = fileFound.getLastUpdated().toISOString();
          imageManifest.push({ filename: keyName, modified: modified });
          const blob     = fileFound.getBlob();
          const mimeType = blob.getContentType();
          if (!mimeType || (!mimeType.startsWith('image/') && mimeType !== 'application/pdf')) return;
          payload['__image__' + keyName] = {
            base64:    Utilities.base64Encode(blob.getBytes()),
            mime_type: mimeType,
            filename:  keyName,
            modified:  modified
          };
        } catch(e) {
          console.warn("Image fetch failed for " + keyName + ": " + e.message);
        }
      });
      if (fileIdCacheDirty) {
        try { props.setProperty('IMAGE_FILE_ID_CACHE', JSON.stringify(fileIdCache)); } catch(e) {}
      }
      payload['__image_manifest__'] = imageManifest;
      if (imageManifest.length > 0) {
        console.log("📷 Image manifest: " + imageManifest.length + " images.");
      }
    } catch(e) {
      console.warn("Image collection error: " + e.message);
    }
  }
  return payload;
}

function executeTask(taskName, targetName, content, doc) {
  // - Adds X-GooTeX-Credential header
  // - Adds doc_id to all payloads
  // - Two-step compile: cache check then compile with needed images
  // - Single step for all other tasks
  const docId       = doc.getId();
  let fullText       = content || getCleanText(docId);
  const dependencies = collectSubDocs(fullText, taskName);
  if (!_CONFIG.GOOTEX_SERVER_URL) { return { status: "offline", log: "❌ SERVER URL MISSING — check Config.gs" }; }
  const credential = _CONFIG.GOOTEX_CREDENTIAL || "";
  const baseUrl = _CONFIG.GOOTEX_SERVER_URL.endsWith('/') ? _CONFIG.GOOTEX_SERVER_URL : _CONFIG.GOOTEX_SERVER_URL + '/';
  const calculatedPath = targetName || "main.tex";
  const authHeaders = {
    "ngrok-skip-browser-warning": "true",
    "X-GooTeX-Credential": credential
  };
  // ── TWO-STEP COMPILE ──────────────────────────────────────
  if (taskName === 'compile') {
    const imageManifest = dependencies.__image_manifest__ || [];
    let neededImages    = [];
    if (imageManifest.length > 0) {
      try {
        const manifestResp = UrlFetchApp.fetch(
          baseUrl + "check_cache",
          {
            "method":             "post",
            "contentType":        "application/json",
            "payload":            JSON.stringify({ "doc_id": docId, "images": imageManifest }),
            "muteHttpExceptions": true,
            "headers":            authHeaders
          }
        );
        if (manifestResp.getResponseCode() === 200) {
          neededImages = JSON.parse(manifestResp.getContentText()).needed || [];
          console.log("📷 Images needed: " + neededImages.length + " of " + imageManifest.length);
        }
      } catch(e) {
        console.warn("Cache check failed, proceeding without images: " + e.message);
      }
    }
    const subDocs = buildSubDocs(dependencies, neededImages);
    const payload = {
      "task":      taskName,
      "doc_id":    docId,
      "main_text": fullText,
      "main_name": targetName || "main.tex",
      "full_path": calculatedPath,
      "sub_docs":  subDocs
    };
    try {
      const response = UrlFetchApp.fetch(baseUrl, {
        "method":             "post",
        "contentType":        "application/json",
        "payload":            JSON.stringify(payload),
        "muteHttpExceptions": true,
        "headers":            authHeaders
      });
      return processResponse(response, taskName, doc);
    } catch(e) {
      return { status: "offline", log: "Server unreachable: " + e.message };
    }
  }
  // ── SINGLE-STEP ALL OTHER TASKS ───────────────────────────
  const subDocs = buildSubDocs(dependencies, []);
  const payload = {
    "task":      taskName,
    "doc_id":    docId,
    "main_text": fullText,
    "main_name": targetName || "main.tex",
    "full_path": calculatedPath,
    "sub_docs":  subDocs
  };
  try {
    const response = UrlFetchApp.fetch(baseUrl, {
      "method":             "post",
      "contentType":        "application/json",
      "payload":            JSON.stringify(payload),
      "muteHttpExceptions": true,
      "headers":            authHeaders
    });
    return processResponse(response, taskName, doc);
  } catch(e) {
    return { status: "offline", log: "Server unreachable: " + e.message };
  }
}

function isUserAuthorized() {
  // Reads Sheet on first call per doc session per user.
  // Caches in DocumentProperties (user+doc scoped).
  // Cache cleared by masterSync().
  try {
    const props    = PropertiesService.getDocumentProperties();
    const cacheKey = 'AUTH_ALLOWED_EMAILS';
    const cached   = props.getProperty(cacheKey);
    let allowedEmails;
    if (cached) {
      try { allowedEmails = JSON.parse(cached); } catch(e) { allowedEmails = null; }
    }
    if (!allowedEmails) {
      // Cache empty — read Sheet fresh
      const sheet = _getAccessSheet();
      if (!sheet) {
        // No Sheet found — fail open during initial setup
        console.warn("⚠️ GooTeX_Access sheet not found — allowing access.");
        return true;
      }
      const tab = sheet.getSheetByName('allowed_users');
      if (!tab) {
        console.warn("⚠️ allowed_users tab not found — allowing access.");
        return true;
      }
      const data = tab.getDataRange().getValues();
      allowedEmails = data.slice(1)  // skip header row
        .map(function(row) { return (row[0] || '').toString().toLowerCase().trim(); })
        .filter(function(email) { return email.length > 0; });
      props.setProperty(cacheKey, JSON.stringify(allowedEmails));
      console.log("✅ Auth cache populated: " + allowedEmails.length + " users.");
    }
    const userEmail = Session.getActiveUser().getEmail().toLowerCase();
    return allowedEmails.indexOf(userEmail) > -1;
  } catch(e) {
    console.warn("Auth check error: " + e.message);
    return false;
  }
}

function requireAuthorization() {
  if (!isUserAuthorized()) {
    DocumentApp.getUi().alert(
      "🔒 Not Authorized",
      "You are not authorized to use this gooTeX installation.\n\n" +
      "Contact your research group administrator to request access.",
      DocumentApp.getUi().ButtonSet.OK
    );
    return false;
  }
  return true;
}

function buildSubDocs(dependencies, neededImages) {
  const neededSet = new Set(neededImages);  // no lowercasing — original case throughout
  const subDocs   = [];
  Object.keys(dependencies).forEach(function(key) {
    if (key === '__image_manifest__') return;
    if (key.startsWith('__image__')) {
      if (neededSet.size === 0) return;
      const filename = key.substring('__image__'.length);
      if (neededSet.has(filename)) {
        subDocs.push({ name: key, content: dependencies[key] });
      }
    } else {
      subDocs.push({ name: key, content: dependencies[key] });
    }
  });
  return subDocs;
}

function processResponse(res, taskName, doc) {
  let result;
  const rawText = res.getContentText();
  const code    = res.getResponseCode();
  if (code === 403) { return { status: "error", log: "🔒 Server rejected request. Administrator: check GOOTEX_CREDENTIAL in Config.gs of the attached script." }; }
  if (code === 502 || code === 504) { return { status: "offline", log: "⚠️ Gateway Error. Server may be restarting." };  }
  try {
    result = JSON.parse(rawText);
  } catch(e) {
    if (rawText.indexOf("ngrok") > -1) { return { status: "offline", log: "Connection Lost. VM server tunnel may be restarting." }; }
    return { status: "error", log: "CRITICAL SERVER ERROR:\n" + rawText.substring(0, 300) };
  }
  // ── Write PDF to Drive ────────────────────────────────────
  if (taskName === 'compile' && result.pdf_base64 && result.pdf_filename) {
    try {
      const pdfBytes = Utilities.base64Decode(result.pdf_base64);
      const pdfBlob  = Utilities.newBlob(pdfBytes, 'application/pdf', result.pdf_filename);
      const parent   = DriveApp.getFileById(doc.getId()).getParents().next();
      let compiledFolder;
      const existing = parent.getFoldersByName("Compiled");
      compiledFolder = existing.hasNext() ? existing.next() : parent.createFolder("Compiled");
      const existingPdfs = compiledFolder.getFilesByName(result.pdf_filename);
      if (existingPdfs.hasNext()) {
        // Overwrite existing file — same ID retained
        const existingFile = existingPdfs.next();
        Drive.Files.update({}, existingFile.getId(), pdfBlob);
        console.log("✅ PDF overwritten in Drive: " + result.pdf_filename);
      } else {
        // First compile — create new file
        compiledFolder.createFile(pdfBlob);
        console.log("✅ PDF created in Drive: " + result.pdf_filename);
      }
      delete result.pdf_base64;
    } catch(e) {
      console.warn("⚠️ PDF write failed: " + e.message);
    }
  }
  // ── Write .log to Drive (always, even on error) ───────────
  if (taskName === 'compile' && result.log_base64 && result.log_filename) {
    try {
        const logBytes = Utilities.base64Decode(result.log_base64);
        const logBlob  = Utilities.newBlob(logBytes, 'text/plain', result.log_filename);
        const parent   = DriveApp.getFileById(doc.getId()).getParents().next();

        let compiledFolder;
        const existing = parent.getFoldersByName("Compiled");
        compiledFolder = existing.hasNext() ? existing.next() : parent.createFolder("Compiled");

        const existingLogs = compiledFolder.getFilesByName(result.log_filename);
        if (existingLogs.hasNext()) {
            Drive.Files.update({}, existingLogs.next().getId(), logBlob);
        } else {
            compiledFolder.createFile(logBlob);
        }
        console.log("✅ Log written to Drive: " + result.log_filename);
        delete result.log_base64;
    } catch(e) {
        console.warn("⚠️ Log write failed: " + e.message);
    }
  }
  // ── Write .bib to Drive ───────────────────────────────────
  if (taskName === 'compile' && result.bib_base64 && result.bib_filename) {
    try {
        const bibBytes = Utilities.base64Decode(result.bib_base64);
        const bibBlob  = Utilities.newBlob(bibBytes, 'text/plain', result.bib_filename);
        const parent   = DriveApp.getFileById(doc.getId()).getParents().next();
        let compiledFolder;
        const existing = parent.getFoldersByName("Compiled");
        compiledFolder = existing.hasNext() ? existing.next() : parent.createFolder("Compiled");
        const existingBibs = compiledFolder.getFilesByName(result.bib_filename);
        if (existingBibs.hasNext()) {
            Drive.Files.update({}, existingBibs.next().getId(), bibBlob);
        } else {
            compiledFolder.createFile(bibBlob);
        }
        console.log("✅ Bib written to Drive: " + result.bib_filename);
        delete result.bib_base64;
    } catch(e) {
        console.warn("⚠️ Bib write failed: " + e.message);
    }
  }
  // ── Write .tex file(s) to Drive ──────────────────────────
  if (taskName === 'compile' && result.tex_files) {
    try {
        const parent = DriveApp.getFileById(doc.getId()).getParents().next();
        let compiledFolder;
        const existing = parent.getFoldersByName("Compiled");
        compiledFolder = existing.hasNext() ? existing.next() : parent.createFolder("Compiled");
        result.tex_files.forEach(function(texFile) {
            const texBlob = Utilities.newBlob(texFile.content, 'text/plain', texFile.filename);
            const existingTex = compiledFolder.getFilesByName(texFile.filename);
            if (existingTex.hasNext()) {
                Drive.Files.update({}, existingTex.next().getId(), texBlob);
            } else {
                compiledFolder.createFile(texBlob);
            }
            console.log("✅ Tex written to Drive: " + texFile.filename);
        });
        delete result.tex_files;
    } catch(e) {
        console.warn("⚠️ Tex write failed: " + e.message);
    }
  }
  // ── Fetch and write zip to Drive ──────────────────────────
  if (taskName === 'zip' && result.download_token && result.zip_filename) {
    try {
      const credential = _CONFIG.GOOTEX_CREDENTIAL || "";
      const baseUrl    = _CONFIG.GOOTEX_SERVER_URL.endsWith('/')
                        ? _CONFIG.GOOTEX_SERVER_URL
                        : _CONFIG.GOOTEX_SERVER_URL + '/';
      const zipResp = UrlFetchApp.fetch(
        baseUrl + "download/" + result.download_token,
        {
          "method":             "get",
          "muteHttpExceptions": true,
          "headers": {
            "ngrok-skip-browser-warning": "true",
            "X-GooTeX-Credential": credential
          }
        }
      );
      if (zipResp.getResponseCode() === 200) {
        const zipBlob = zipResp.getBlob().setName(result.zip_filename);
        const parent  = DriveApp.getFileById(doc.getId()).getParents().next();
        let compiledFolder;
        const existing = parent.getFoldersByName("Compiled");
        compiledFolder = existing.hasNext() ? existing.next() : parent.createFolder("Compiled");
        const existingZips = compiledFolder.getFilesByName(result.zip_filename);
        if (existingZips.hasNext()) {
          Drive.Files.update({}, existingZips.next().getId(), zipBlob);
          console.log("✅ Zip overwritten in Drive: " + result.zip_filename);
        } else {
          compiledFolder.createFile(zipBlob);
          console.log("✅ Zip created in Drive: " + result.zip_filename);
        }
        result.log = "✅ Submission package saved to Compiled/ folder.";
      } else {
        result.log = "⚠️ Zip download failed: HTTP " + zipResp.getResponseCode();
      }
      delete result.download_token;
    } catch(e) {
      console.warn("⚠️ Zip fetch failed: " + e.message);
      result.log = "⚠️ Zip fetch failed: " + e.message;
    }
  }
  // ── Update document properties ────────────────────────────
  let compileLog = result.log || result.error || "";
  if (compileLog.length > 3000) compileLog = compileLog.substring(0, 3000) + "\n... [TRUNCATED]";
  PropertiesService.getDocumentProperties().setProperties({
    'LATEST_LOG':      compileLog,
    'LATEST_UPDATE':   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "h:mm a"),
    'IS_COMPILE_MODE': (taskName === 'compile' ? 'true' : 'false')
  });
  return result;
}

function _getBibManLibraryName(text) {
  // Extracts library name from \bibliography{bibman:LibraryName.bib}
  if (!text) return null;
  const match = text.match(/\\bibliography\{bibman:([^}]+?)(?:\.bib)?\}/);
  return match ? match[1].trim() : null;
}

function _checkBibManStats(library, bibmanBaseUrl, credential) {
  // Lightweight call to get last_rowid for change detection.
  // Returns {count, last_rowid, library} or null on error.
  try {
    const url  = bibmanBaseUrl + "bibman/api/libraries/" +
                 encodeURIComponent(library) + "/stats";
    const resp = UrlFetchApp.fetch(url, {
      "method":             "get",
      "muteHttpExceptions": true,
      "headers": { "X-BibMan-Credential": credential }
    });
    if (resp.getResponseCode() === 200) {
      return JSON.parse(resp.getContentText());
    }
  } catch(e) {
    console.warn("BibMan stats check failed: " + e.message);
  }
  return null;
}

function checkBibManStats() {
  try {
    const doc     = DocumentApp.getActiveDocument();
    const text    = getCleanText(doc.getId());
    const library = _getBibManLibraryName(text);
    if (!library) return null;  // not a BibMan doc
    if (!_CONFIG.GOOTEX_SERVER_URL) return null;
    const bibmanBaseUrl = _CONFIG.GOOTEX_SERVER_URL.replace(/\/gootex\/?$/, '/');
    const credential    = _CONFIG.BIBMAN_CREDENTIAL || "";
    const stats = _checkBibManStats(library, bibmanBaseUrl, credential);
    if (!stats) return null;
    return {
      last_rowid:   String(stats.last_rowid),
      library_name: library
    };
  } catch(e) {
    console.warn("checkBibManStats error: " + e.message);
    return null;
  }
}

function _fetchBibManRefs(library, bibmanBaseUrl, credential) {
  // Fetches full library from BibMan GET endpoint.
  // Returns parsed refs array for Refs tab display.
  try {
    const url  = bibmanBaseUrl + "bibman/api/export/bib-text?library=" +
                 encodeURIComponent(library);
    const resp = UrlFetchApp.fetch(url, {
      "method":             "get",
      "muteHttpExceptions": true,
      "headers": { "X-BibMan-Credential": credential }
    });
    if (resp.getResponseCode() !== 200) {
      console.warn("BibMan library fetch failed: HTTP " + resp.getResponseCode());
      return [];
    }
    return _parseBibContent(resp.getContentText());
  } catch(e) {
    console.warn("BibMan refs fetch failed: " + e.message);
    return [];
  }
}

function _parseBibContent(bibContent) {
  // Parses raw .bib text into refs array for Refs tab.
  // Extracted from parseLocalBibliography() for reuse.
  const refs    = [];
  const entries = bibContent.split('@').slice(1);
  entries.forEach(function(entry) {
    const firstLine = entry.split(',')[0];
    const keyMatch  = firstLine.match(/^[a-zA-Z0-9_:-]+\s*\{\s*([^,]+)/);
    if (!keyMatch) return;
    const key = keyMatch[1].trim();
    function extractField(fieldName) {
      const fieldRegex = new RegExp(fieldName + "\\s*=\\s*", "i");
      const m = entry.match(fieldRegex);
      if (!m) return "";
      const startIdx  = m.index + m[0].length;
      const remainder = entry.substring(startIdx);
      if (!remainder.length) return "";
      const delimiter = remainder[0];
      if (delimiter !== '{' && delimiter !== '"') return "";
      const closeChar = (delimiter === '{') ? '}' : '"';
      let depth = 0, result = "";
      for (let i = 0; i < remainder.length; i++) {
        const char = remainder[i];
        if (char === '{') depth++;
        if (char === '}') depth--;
        result += char;
        if (depth === 0 && char === closeChar)
          return result.substring(1, result.length - 1);
      }
      return "";
    }
    const author  = extractField("author");
    const year    = extractField("year");
    const title   = extractField("title").replace(/[\{\}]/g, "").replace(/\\/g, "");
    const journal = extractField("journal").replace(/[\{\}]/g, "").replace(/^\\/, "");
    refs.push({
      key:         key,
      display_key: (author.replace(/[\{\}]/g, "").split(',')[0] || "Auth") + " " + year,
      title:       title,
      journal:     journal,
      volume:      extractField("volume"),
      pages:       extractField("pages"),
      year:        year,
      author:      author.replace(/[\{\}]/g, ""),
      used:        false
    });
  });
  return refs;
}

function getSidebarState(forceRefresh = false) {
  if (!requireAuthorization()) return { status: "error", log: "🔒 Not authorized." };
  if (!forceRefresh) { return getFastAssets(); }
  const lock = LockService.getDocumentLock();
  let updates = {};
  try {
    updates = _checkForUpdates(_CONFIG.GOOTEX_ATTACHED_VERSION || 1);
  } catch(e) {}
  try {
    if (!_CONFIG.GOOTEX_SERVER_URL) return { "status": "offline", "log": "❌ SERVER URL MISSING — check Config.gs" };
    if (!lock.tryLock(2000)) return { "status": "busy", "log": "⏳ Compiling..." };
    const doc = DocumentApp.getActiveDocument();
    const props = PropertiesService.getDocumentProperties();
    let text = "";
    try { text = getCleanText(doc.getId()); } catch (e) { doc.saveAndClose(); return { "status": "error", "log": "Fetch Error" }; }
    // 1. Establish Baselines
    const localAssets = parseLocalAssets(text);
    let localRefs = parseLocalBibliography(doc, text);
    const allBibKeys = localRefs.map(r => r.key);
    const storedCounts = getUsedCitationsLocal(text, allBibKeys);
    // 2. Call Server (Only on Force Refresh)
    const liveResult = executeTask('draft', 'draft.tex', text, doc);
    if (liveResult?.word_count) props.setProperty('LAST_WORD_COUNT', liveResult.word_count.toString());
    if (liveResult?.page_count) props.setProperty('LAST_PAGE_COUNT', liveResult.page_count.toString());
    // ── BibMan auto-refresh ───────────────────────────────────
    const bibmanLibrary = _getBibManLibraryName(text);
    if (bibmanLibrary) {
      const bibmanBaseUrl = _CONFIG.GOOTEX_SERVER_URL
                            ? _CONFIG.GOOTEX_SERVER_URL.replace(/\/gootex\/?$/, '/')
                            : null;
      const credential    = _CONFIG.BIBMAN_CREDENTIAL || "";
      if (bibmanBaseUrl) {
        const stats        = _checkBibManStats(bibmanLibrary, bibmanBaseUrl, credential);
        const currentRowid = stats ? String(stats.last_rowid) : null;
        const cachedRowid  = props.getProperty('BIBMAN_LAST_ROWID');
        if (currentRowid && currentRowid !== cachedRowid) {
          console.log("📚 BibMan library changed — auto-refreshing refs...");
          const freshRefs = _fetchBibManRefs(bibmanLibrary, bibmanBaseUrl, credential);
          if (freshRefs.length > 0) {
            localRefs = freshRefs;
            try {
              props.setProperty('BIBMAN_REFS_CACHE',   JSON.stringify(freshRefs));
              props.setProperty('BIBMAN_LAST_ROWID',   currentRowid);
              props.setProperty('BIBMAN_LIBRARY_NAME', bibmanLibrary);
            } catch(e) {
              console.warn("BibMan refs too large to cache — will fetch fresh each time.");
              props.deleteProperty('BIBMAN_REFS_CACHE');
              props.deleteProperty('BIBMAN_LAST_ROWID');
            }
          }
        }
      }
    }
    // 3. Merge Strategy
    let finalRefs = localRefs;
    if (liveResult?.assets?.references && liveResult.assets.references.length > 0) {
        finalRefs = liveResult.assets.references;
    }
    finalRefs.forEach(r => { r.used = !!storedCounts[r.key]; });
    const finalAssets = {
      references: finalRefs,
      figures: localAssets.figures, // Force Local
      tables: localAssets.tables,   // Force Local
      sections: localAssets.sections
    };

    const lastUser = props.getProperty('LAST_COMPILE_USER') || "System";
    const displayUser = lastUser.length > 6 ? lastUser.substring(0, 6) + "…" : lastUser;
    const lastTime = (props.getProperty('LAST_COMPILE_TIME') || "--:--").replace(/^([A-Za-z]{4,})/, m => m.substring(0, 3));
    return {
      "status":                    liveResult?.status || "offline",
      "log":                       getLogData(liveResult?.log || ""),
      "assets":                    finalAssets,
      "full_hud":                  `w:${props.getProperty('LAST_WORD_COUNT') || 0}|p:~${props.getProperty('LAST_PAGE_COUNT') || 0}|${displayUser}|${lastTime}`,
      "doc_name":                  doc.getName(),
      "broadcast":                 "",
      "coreUpdateAvailable":       updates.coreUpdateAvailable    || false,
      "attachedUpdateAvailable":   updates.attachedUpdateAvailable || false,
      "coreNotes":                 updates.coreNotes              || "",
      "attachedNotes":             updates.attachedNotes          || "",
    };
  } catch (e) {
    return { "status": "error", "log": e.toString() };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/** ------------------------------------------------------------------
 * 🕵️‍♀️ LOCAL ASSET PARSER (Regex Fixed with Whitespace Support)
 * ------------------------------------------------------------------ */
function parseLocalAssets(text) {
  if (!text) return { figures: [], tables: [], sections: [] };
  const figures = [];
  const tables = [];
  const sectionsList = [];
  const sections = [];
  const secRegex = /\\(section|subsection|subsubsection)\*?\s*(?:\[.*?\])?\s*\{(.*?)\}/g;
  let sMatch;
  while ((sMatch = secRegex.exec(text)) !== null) {
      let startIdx = sMatch.index;
      let lvl = 1;
      if (sMatch[1] === 'subsection') lvl = 2;
      if (sMatch[1] === 'subsubsection') lvl = 3;
      // Search for \label{} only until the next \section, \subsection,
      // or \begin{} — whichever comes first. This prevents grabbing
      // labels from inside figures/tables that follow the section.
      let lookaheadText = text.substring(startIdx + sMatch[0].length,
                                         Math.min(text.length, startIdx + 1500));
      const stopMatch = lookaheadText.search(/\\(?:section|subsection|subsubsection|begin)\s*[\*\{]/);
      if (stopMatch > -1) {
          lookaheadText = lookaheadText.substring(0, stopMatch);
      }
      let lblMatch = lookaheadText.match(/\\label\{([^}]+)\}/);
      sections.push({
          start: startIdx,
          level: lvl,
          label: lblMatch ? lblMatch[1] : ""
      });
      sectionsList.push({
          id:    lblMatch ? lblMatch[1] : "sec-" + startIdx,
          title: sMatch[2].replace(/\\/g, '').replace(/[{}]/g, ''),
          level: lvl,
          line:  0,
          label: lblMatch ? lblMatch[1] : "",
          type:  sMatch[1]
      });
  }
  const getParentSection = (pos) => {
      const preceding = sections.filter(s => s.start < pos);
      if (preceding.length === 0) return "";
      let current = preceding[preceding.length - 1];
      const visited = new Set();
      while (current) {
          if (visited.has(current.start)) break;
          visited.add(current.start);
          if (current.label) return current.label;
          let parent = null;
          let currentIndex = preceding.indexOf(current);
          for (let i = currentIndex - 1; i >= 0; i--) {
              if (preceding[i].level < current.level) {
                  parent = preceding[i];
                  break;
              }
          }
          current = parent;
      }
      return "";
  };
  const extractTexContent = (block, regex) => {
      let match = regex.exec(block);
      if (!match) return null;
      let startIndex = match.index + match[0].length;
      let depth = 1;
      let extracted = "";
      for (let i = startIndex; i < block.length; i++) {
        let char = block[i];
        if (char === '{') depth++; else if (char === '}') depth--;
        if (depth === 0) break;
        extracted += char;
      }
      return extracted;
  };
  const cleanTex = (str) => {
      if (!str) return "";
      return str.replace(/\\(label|ref|cite|gls)\{[^}]+\}/g, "")
                .replace(/\\(textbf|textit|emph|thead|colhead|caption|centering)\b(?:\[.*?\])?/g, "")
                .replace(/\\([a-zA-Z@]+)/g, " ")
                .replace(/[{}[\]$]/g, " ")
                .replace(/\\\\/g, " ")
                .replace(/\s+/g, " ").trim();
  };
  const figRegex = /\\begin\{(figure\*?|wrapfigure|sidewaysfigure\*?|marginfigure|SCfigure\*?)\}\s*(?:\[.*?\])?\s*([\s\S]*?)\\end\{\1\}/g;
  let match;
  while ((match = figRegex.exec(text)) !== null) {
      let block      = match[2];
      let cleanBlock = block.replace(/(^|[^\\])%.*$/gm, '$1');
      let label      = (cleanBlock.match(/\\label\{([^}]+)\}/) || [])[1] || "";
      const pattern  = [
          "(?:", "\\\\includegraphics|", "\\\\begin\\{overpic\\}|", "\\\\includesvg|",
          "\\\\adjustimage|", "\\\\plotone|", "\\\\plottwo|", "\\\\epsfig|", "\\\\psfig|", "\\\\input",
          ")", "(?:\\[.*?\\])?", "\\s*", "\\{(.+?)\\}"
      ].join("");
      let fileMatch = cleanBlock.match(new RegExp(pattern));
      let fname     = fileMatch ? fileMatch[1] : null;
      let rawCap    = extractTexContent(cleanBlock, /\\caption(?:\[.*?\])?\{/) || "No caption";
      figures.push({
          label:       label,
          caption:     cleanTex(rawCap),
          filename:    fname,
          section_ref: getParentSection(match.index),
          type:        'fig'
      });
  }
  const tabRegex = /\\begin\{(table\*?|deluxetable\*?|sidewaystable\*?|longtable|wraptable)\}\s*(?:\[.*?\])?\s*(?:\{.*?\})?([\s\S]*?)\\end\{\1\}/g;
  while ((match = tabRegex.exec(text)) !== null) {
      let block       = match[2];
      let cleanBlock  = block.replace(/(^|[^\\])%.*$/gm, '$1');
      let label       = (cleanBlock.match(/\\label\{([^}]+)\}/) || [])[1] || "";
      let rawCap      = extractTexContent(cleanBlock, /\\(?:table)?caption(?:\[.*?\])?\{/) || "Untitled Table";
      let rawComments = extractTexContent(cleanBlock, /\\tablecomments\{/) || "";
      tables.push({
          label:       label,
          caption:     cleanTex(rawCap),
          comments:    cleanTex(rawComments),
          section_ref: getParentSection(match.index),
          type:        'tab'
      });
  }
  return { figures: figures, tables: tables, sections: sectionsList };
}

function getLogData(rawLog) {
  if (!rawLog || !rawLog.trim()) return "⚠️ Server returned no log data.";
  const lines = rawLog.split('\n');
  let parsedErrors = [];
  let seenMessages = new Set();
  let matchFound = false; // TRACKER
  lines.forEach(line => {
    line = line.trim();
    if (!line || line.startsWith("This is pdfTeX")) return;
    const parts = line.split(':');
    if (parts.length >= 3) {
      let lNum = parseInt(parts[1]);
      const formattedLog = `${parts[0]}:${lNum}:${parts[2]}:${parts.slice(3).join(':').trim()}`;
      if (!seenMessages.has(formattedLog)) {
        parsedErrors.push({ sortKey: lNum || 9999, text: formattedLog });
        seenMessages.add(formattedLog);
        matchFound = true;
      }
    }
  });
  if (!matchFound) { return "⚠️ SERVER ERROR (Raw Log):\n\n" + lines.slice(0, 50).join('\n'); }
  parsedErrors.sort((a, b) => a.sortKey - b.sortKey);
  return parsedErrors.map(e => e.text).join('\n');
}

/** 🏗️ OPTIMIZED VIRTUAL AGGREGATOR
 * Builds the full project text in memory.
 * Now optimized to skip redundant Drive fetches.
 */
function getVirtualMasterText(mainDocId) {
  const projectRoot = _getTrueProjectRoot();
  const processedFiles = new Set();
  const fileCache = {}; // Local cache to prevent redundant Drive fetches
  function assemble(docId) {
    if (processedFiles.has(docId)) return "";
    processedFiles.add(docId);
    let content = "";
    try {
      content = fetchDocContent(docId);
    } catch(e) { return ""; }
    const includeRegex = /\\(?:input|include)\s*\{([^}]+)\}/g;
    return content.replace(includeRegex, (fullMatch, fileName) => {
      const cleanName = fileName.trim().replace(/\.tex$/i, "");
      // Check cache first before hitting DriveApp
      if (fileCache[cleanName]) return fileCache[cleanName];
      const fileFound = recursiveFindInfo(projectRoot, cleanName);
      if (fileFound) {
        let subContent = "";
        if (fileFound.getMimeType() === MimeType.GOOGLE_DOCS) {
          subContent = assemble(fileFound.getId());
          // Strip document wrappers for seamless regex matching
          subContent = subContent.replace(/^[\s\S]*?\\begin\{document\}/, "")
                                 .replace(/\\end\{document\}[\s\S]*$/, "");
        } else {
          subContent = fileFound.getBlob().getDataAsString();
        }
        fileCache[cleanName] = subContent;
        return `\n% --- START: ${cleanName} ---\n${subContent}\n% --- END ---\n`;
      }
      return fullMatch;
    });
  }
  return assemble(mainDocId);
}

/** * 🐸 Standardized Entry Point
 */
function getCleanText(docId) {
  // Now returns the entire project tree as one "Virtual" file
  return getVirtualMasterText(docId);
}

function fetchDocContent(targetId) {
  // 'PREVIEW_SUGGESTIONS_ACCEPTED' ensures the scan sees the "Incorporated" text.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const doc = Docs.Documents.get(targetId, {
        'suggestionsViewMode': 'PREVIEW_SUGGESTIONS_ACCEPTED',
        'fields': 'body/content/paragraph/elements/textRun/content,body/content/table/tableRows/tableCells/content/paragraph/elements/textRun/content'
      });
      let text = '';
      if (doc.body && doc.body.content) {
        doc.body.content.forEach(function(obj) {
          if (obj.paragraph && obj.paragraph.elements) {
            obj.paragraph.elements.forEach(function(el) {
              if (el.textRun && el.textRun.content) {
                text += el.textRun.content.replace(/^¶\d+: /, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
              }
            });
          }
          else if (obj.table && obj.table.tableRows) {
             obj.table.tableRows.forEach(function(row) {
                row.tableCells.forEach(function(cell) {
                   cell.content.forEach(function(contentObj) {
                      if (contentObj.paragraph && contentObj.paragraph.elements) {
                         contentObj.paragraph.elements.forEach(function(el) {
                            if (el.textRun && el.textRun.content) {
                              text += el.textRun.content.replace(/^¶\d+: /, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
                            }
                         });
                      }
                   });
                });
             });
          }
        });
      }
      return text;
    } catch (e) { if (attempt === 3) throw e; Utilities.sleep(1000); }
  }
}

/** ⚡ ROBUST BIB PARSER (Updated for \apj) */
function parseLocalBibliography(doc, mainText) {
  var refs = [];
  try {
    var regex = /\\(?:bibliography|addbibresource)(?:\[.*?\])?\{([^}]+)\}/;
    var match = mainText.match(regex);
    if (!match) return [];
    var rawName = match[1];
    // ── BibMan path ───────────────────────────────────────────
    if (rawName.startsWith('bibman:')) {
      const library = rawName.replace('bibman:', '').replace(/\.bib$/i, '').trim();
      if (!_CONFIG.GOOTEX_SERVER_URL) return [];
      const bibmanBaseUrl = _CONFIG.GOOTEX_SERVER_URL.replace(/\/gootex\/?$/, '/');
      const credential    = _CONFIG.BIBMAN_CREDENTIAL || "";
      const props         = PropertiesService.getDocumentProperties();
      // Check cache
      const cachedRefs    = props.getProperty('BIBMAN_REFS_CACHE');
      const cachedRowid   = props.getProperty('BIBMAN_LAST_ROWID');
      const cachedLibrary = props.getProperty('BIBMAN_LIBRARY_NAME');
      // Lightweight stats check for change detection
      const stats        = _checkBibManStats(library, bibmanBaseUrl, credential);
      const currentRowid = stats ? String(stats.last_rowid) : null;
      if (cachedRefs && cachedLibrary === library && cachedRowid === currentRowid) {
        try {
          refs = JSON.parse(cachedRefs);
          console.log("📚 Using cached BibMan refs (" + refs.length + " entries).");
          return refs;
        } catch(e) {}
      }
      // Fetch fresh
      console.log("📚 Fetching BibMan library: " + library);
      refs = _fetchBibManRefs(library, bibmanBaseUrl, credential);
      if (refs.length > 0) {
        try {
          props.setProperty('BIBMAN_LIBRARY_NAME', library);
          props.setProperty('BIBMAN_REFS_CACHE',   JSON.stringify(refs));
          if (currentRowid) props.setProperty('BIBMAN_LAST_ROWID', currentRowid);
        } catch(e) {
          console.warn("BibMan refs too large to cache — will fetch fresh each time.");
          props.deleteProperty('BIBMAN_REFS_CACHE');
          props.deleteProperty('BIBMAN_LAST_ROWID');
        }
        console.log("📚 BibMan refs cached: " + refs.length + " entries.");
      }
      return refs;
    }
    // ── Local .bib path ───────────────────────────────────────
    var bibName = rawName.split(',')[0].trim();
    if (!bibName.toLowerCase().endsWith(".bib")) bibName += ".bib";
    var props    = PropertiesService.getDocumentProperties();
    var cachedId = props.getProperty('CACHE_BIB_ID');
    var file     = null;
    if (cachedId) { try { file = DriveApp.getFileById(cachedId); } catch(e) {} }
    if (!file) {
      var parent = DriveApp.getFileById(doc.getId()).getParents().next();
      file = recursiveFindInfo(parent, bibName);
    }
    if (!file) return [];
    return _parseBibContent(file.getBlob().getDataAsString());
  } catch(e) {
    console.warn("Bib Parse Error: " + e.message);
  }
  return refs;
}

var ERROR_HIGHLIGHT_COLOR = '#ff6666';

function highlightErrorParagraph(paraIndex) {
  var doc = DocumentApp.getActiveDocument();
  var paras = doc.getBody().getParagraphs();
  if (paraIndex < 1 || paraIndex > paras.length) return;
  paras[paraIndex - 1].setBackgroundColor(ERROR_HIGHLIGHT_COLOR);
}

function clearErrorHighlight(paraIndex) {
  var doc = DocumentApp.getActiveDocument();
  var paras = doc.getBody().getParagraphs();
  if (paraIndex < 1 || paraIndex > paras.length) return;
  var color = paras[paraIndex - 1].getBackgroundColor();
  if (color && color.toLowerCase() === ERROR_HIGHLIGHT_COLOR) {
    paras[paraIndex - 1].setBackgroundColor(null);
  }
}

function clearAllErrorHighlights() {
  var doc = DocumentApp.getActiveDocument();
  doc.getBody().getParagraphs().forEach(function(p) {
    var color = p.getBackgroundColor();
    if (color && color.toLowerCase() === ERROR_HIGHLIGHT_COLOR) p.setBackgroundColor(null);
  });
}

function gotoLine(lineNum) {
  try {
    let doc = DocumentApp.getActiveDocument();
    if (!doc) throw new Error("Document is stuck.");
    const body = doc.getBody();
    let targetIndex = parseInt(lineNum) - 1;
    if (targetIndex < 0) targetIndex = 0;

    // Simplistic jump for parity
    try {
        let el = body.getChild(targetIndex);
        if (el) doc.setCursor(doc.newPosition(el, 0));
    } catch(e) {}
    doc.saveAndClose();
    return "Jumped to line " + lineNum;
  } catch (e) { throw new Error(e.toString());}
}

function masterSync() {
  PropertiesService.getDocumentProperties().deleteAllProperties();
  const ui = DocumentApp.getUi();
  ui.alert(
    "✅ Connection Reset",
    "Cache cleared. Authorization list and server connection will be re-read fresh on next action.",
    ui.ButtonSet.OK
  );
}

function taskSelectionCount() {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();
  if (!selection) {
    doc.saveAndClose();
    DocumentApp.getUi().alert("⚠️ Select text first.");
    return;
  }
  let rawSelectedText = selection.getRangeElements().map(e => {
    if (e.getElement().editAsText) {
      return e.getElement().asText().getText().substring(e.getStartOffset(), e.getEndOffsetInclusive() + 1);
    }
    return "";
  }).join("\n").trim();
  executeTask('wordcount', 'selection_check.tex', rawSelectedText, doc);
  doc.saveAndClose();
}

/** ⚡ FAST INSERTION ENGINE Strips away verification layers to reduce button lag. **/
function taskInsertTextAtCursor(text) {
  try {
    const doc = DocumentApp.getActiveDocument();
    const cursor = doc.getCursor();
    if (cursor) {
      // 🚀 DIRECT PASS: Insert and move on.
      const element = cursor.insertText(text);
    } else {
      // Fallback: If no cursor, just append to the end
      doc.getBody().appendParagraph(text);
    }
    // Critical: Do NOT call doc.saveAndClose() here.
    // Keeping the session "Warm" reduces the lag for the NEXT button click.
  } catch (e) {
    console.error("Fast Insert Error: " + e.toString());
  }
}

function clearStorage() {
  PropertiesService.getDocumentProperties().deleteAllProperties();
  DocumentApp.getUi().alert("Storage Cleared.");
}

function debugDependencyCheck() {
  const doc = DocumentApp.getActiveDocument();
  const text = getCleanText(doc.getId());
  console.log("🔍 Scanning for Bibliography...");
  const payload = collectSubDocs(text, 'compile');
  const filesFound = Object.keys(payload);
  const hasBib = filesFound.some(f => f.toLowerCase().endsWith(".bib"));
  if (hasBib) {
    const bibFile = filesFound.find(f => f.toLowerCase().endsWith(".bib"));
    DocumentApp.getUi().alert("✅ SUCCESS!\nFound bibliography file: " + bibFile);
  } else {
    DocumentApp.getUi().alert("❌ FAILURE.\nScanned text for \\bibliography{...}\nFound nothing.");
  }
}

/** 📄 ROBUST PDF LOCATOR
 * Uses a retry loop to account for Google Drive indexing latency.
 */
function getPdfUrl(serverProvidedName) {
  try {
    const doc = DocumentApp.getActiveDocument();
    // Use server's job_name if available, fallback to sanitized Doc title
    const baseName = serverProvidedName || doc.getName().replace(/\.(tex|pdf)$/i, "");
    const searchName = baseName.trim() + ".pdf";
    const docFile = DriveApp.getFileById(doc.getId());
    const parent = docFile.getParents().next();
    const compiledFolders = parent.getFoldersByName("Compiled");
    if (!compiledFolders.hasNext()) return null;
    const folder = compiledFolders.next();
    // ⚡ SYNC WINDOW: Check every 2s for 10s to let the indexer catch up
    for (let i = 0; i < 5; i++) {
      const files = folder.getFilesByName(searchName);
      if (files.hasNext()) {
        return files.next().getUrl();
      }
      Utilities.sleep(2000);
    }
  } catch (e) {
    console.warn("PDF URL Sync Failed: " + e.message);
  }
  return null;
}

function triggerSpotlightStyle() {
  clearAllErrorHighlights();
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  let offset = 0;
  if (cursor) {
    let element = cursor.getElement();
    while (element && element.getType() !== DocumentApp.ElementType.PARAGRAPH &&
           element.getType() !== DocumentApp.ElementType.LIST_ITEM &&
           element.getParent()) {
      element = element.getParent();
    }
    if (element) { offset = doc.getBody().getChildIndex(element); }
  }
  triggerWatcherWithCoordinates(doc.getId(), offset);
}

function triggerWatcherWithCoordinates(docId, paragraphIndex) {
  try {
    processSpotlightForDoc(docId, paragraphIndex);
  } catch(e) { console.warn("Spotlight styling failed: " + e.message); }
}

function taskToggleMarkers() {
  try {
    const doc = DocumentApp.getActiveDocument();
    const body = doc.getBody();
    const pars = body.getParagraphs();
    let removeMode = false;
    for (let i=0; i<Math.min(5, pars.length); i++) {
      if (pars[i].getText().startsWith("¶")) { removeMode = true; break; }
    }
    if (removeMode) {
      pars.forEach(p => {
        const text = p.getText();
        const match = text.match(/^¶\d+: /);
        if (match) { p.editAsText().deleteText(0, match[0].length - 1); }
      });
    } else {
      let count = 1;
      pars.forEach(p => {
        const t = p.editAsText();
        const label = "¶" + count + ": ";
        t.insertText(0, label);
        t.setForegroundColor(0, label.length-1, GOOTEX_MARKER_COLOR || "#888888");
        t.setFontSize(0, label.length-1, GOOTEX_MARKER_SIZE || 8);
        count++;
      });
    }
    doc.saveAndClose();
    return "Success";
  } catch (e) { return "Error: " + e.message; }
}

function taskInviteCoAuthor() {
  const ui = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  const response = ui.prompt('🤝 Invite a Contributor', 'Enter email:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const email = response.getResponseText().trim();
  if (!email || email.indexOf('@') === -1) { ui.alert("⚠️ Invalid Email"); return; }
  // Add as Google Drive editor on document
  try { doc.addEditor(email); } catch (e) { ui.alert("⚠️ Permission Error: " + e.message); return; }
  // Add as Google Drive editor on project folder
  let folderUrl = "(Could not locate folder link)";
  try {
    const docFolder = DriveApp.getFileById(doc.getId()).getParents().next();
    folderUrl = docFolder.getUrl();
    docFolder.addEditor(email);
  } catch(e) {}
  // Add to GooTeX_Access whitelist so user can compile
  try {
    const sheet = _getAccessSheet();
    if (sheet) {
      const tab = sheet.getSheetByName('allowed_users');
      if (tab) {
        tab.appendRow([email.toLowerCase()]);
        PropertiesService.getDocumentProperties().deleteProperty('AUTH_ALLOWED_EMAILS');
        console.log("✅ Added " + email + " to GooTeX_Access whitelist.");
      }
    }
  } catch(e) {
    console.warn("⚠️ Could not add to whitelist: " + e.message);
  }
  // Send email invitation
  const safeLink = doc.getUrl() + "?mode=suggest";
  try {
    MailApp.sendEmail({
      to: email,
      subject: "Invitation to Collaborate: " + doc.getName(),
      htmlBody: "<p>You are now a contributor to <b>" + doc.getName() + "</b>.</p>" +
                "<p>Link: <a href='" + safeLink + "'>Open Document</a></p>" +
                "<p>Folder: <a href='" + folderUrl + "'>Project Folder</a></p>"
    });
    ui.alert("✅ Success", "Invitation sent and user added to GooTeX access list.", ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("⚠️ Access Granted and whitelist updated, but email notification failed.");
  }
}

function taskOptimizeImages() {
  const ui  = DocumentApp.getUi();
  const doc = DocumentApp.getActiveDocument();
  // Ask which image to compress
  const response = ui.prompt(
    '📉 Compress Image on Drive',
    'Enter the exact filename of the image to compress (e.g. galaxy.png).\n' +
    'Do not include folder path — the system will find it automatically.\n\n' +
    'Note: Images over 1.5MB are compressed automatically during compile.\n' +
    'Use this tool to manually compress a specific image.\n\n' +
    'The original will be preserved as filename_UNCOMPRESSED.png.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const filename = response.getResponseText().trim();
  if (!filename) { ui.alert("⚠️ No filename entered."); return; }
  // Find the file in the project folder
  const projectRoot = _getTrueProjectRoot();
  if (!projectRoot) { ui.alert("❌ Could not locate project folder."); return; }
  const fileFound = recursiveFindInfo(projectRoot, filename);
  if (!fileFound) {
    ui.alert("❌ File not found", "Could not find '" + filename + "' in your project folder.", ui.ButtonSet.OK);
    return;
  }
  // Check it's an image
  const mime = fileFound.getMimeType();
  if (!mime.startsWith('image/')) {
    ui.alert("⚠️ Not an image", "'" + filename + "' does not appear to be an image file.", ui.ButtonSet.OK);
    return;
  }
  // Check size
  const sizeBytes = fileFound.getSize();
  const sizeMB    = (sizeBytes / (1024 * 1024)).toFixed(1);
  if (sizeBytes < 1.5 * 1024 * 1024) {
    const proceed = ui.alert(
      "⚠️ Small Image",
      "'" + filename + "' is only " + sizeMB + "MB — under the 1.5MB threshold.\nCompress anyway?",
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) return;
  }
  // Confirm
  const confirm = ui.alert(
    "📉 Compress Image",
    "Compress '" + filename + "' (" + sizeMB + "MB)?\n\n" +
    "The original will be saved as '" + filename.replace(/(\.[^.]+)$/, '_UNCOMPRESSED$1') + "'.",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;
  // Send to server for compression
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(60000);
    const blob     = fileFound.getBlob();
    const b64      = Utilities.base64Encode(blob.getBytes());
    if (!_CONFIG.GOOTEX_SERVER_URL) { ui.alert("❌ Server offline."); return; }
    const payload = {
      "task":     "compress_image",
      "filename": filename,
      "base64":   b64,
      "mime":     mime
    };
    const url = _CONFIG.GOOTEX_SERVER_URL.endsWith('/')
                ? _CONFIG.GOOTEX_SERVER_URL
                : _CONFIG.GOOTEX_SERVER_URL + '/';
    const result = UrlFetchApp.fetch(url, {
      "method":             "post",
      "contentType":        "application/json",
      "payload":            JSON.stringify(payload),
      "muteHttpExceptions": true,
      "headers": {
        "X-GooTeX-Credential": _CONFIG.GOOTEX_CREDENTIAL || "",
        "ngrok-skip-browser-warning": "true"
      }
    });
    const data = JSON.parse(result.getContentText());
    if (data.status === 'success' && data.compressed_base64) {
      // Write compressed image back to Drive, replacing original
      const compressedBytes = Utilities.base64Decode(data.compressed_base64);
      const compressedBlob  = Utilities.newBlob(compressedBytes, mime, filename);
      // Save original as _UNCOMPRESSED
      const uncompressedName = filename.replace(/(\.[^.]+)$/, '_UNCOMPRESSED$1');
      fileFound.getParents().next().createFile(fileFound.getBlob().setName(uncompressedName));
      // Overwrite original with compressed version
      Drive.Files.update({}, fileFound.getId(), compressedBlob);
      const newSizeMB = (compressedBytes.length / (1024 * 1024)).toFixed(1);
      ui.alert("✅ Compressed",
               "'" + filename + "' compressed from " + sizeMB + "MB → " + newSizeMB + "MB.\n" +
               "Original saved as '" + uncompressedName + "'.",
               ui.ButtonSet.OK);
    } else {
      ui.alert("⚠️ Compression failed", data.log || "Unknown error.", ui.ButtonSet.OK);
    }
  } catch(e) {
    ui.alert("❌ Error: " + e.message, ui.ButtonSet.OK);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function setupDrive() {
  const ui = DocumentApp.getUi();
  try {
    // Check if access sheet already exists
    if (_CONFIG.GOOTEX_ACCESS_SHEET_ID) {
      try {
        SpreadsheetApp.openById(_CONFIG.GOOTEX_ACCESS_SHEET_ID);
        ui.alert("✅ System Already Active",
                 "GooTeX is already configured for this installation.",
                 ui.ButtonSet.OK);
        return;
      } catch(e) {}
    }
    const response = ui.alert("🚀 Create GooTeX / BibMan User Access List",
      "This task will create a new GooTeX_Access spreadsheet for managing compiler access.\n\nProceed?",
      ui.ButtonSet.YES_NO);
    if (response !== ui.Button.YES) return;
    // Create the access sheet in the current folder
    const doc           = DocumentApp.getActiveDocument();
    const currentFolder = DriveApp.getFileById(doc.getId()).getParents().next();
    const sheet         = SpreadsheetApp.create("GooTeX_Access");
    DriveApp.getFileById(sheet.getId()).moveTo(currentFolder);
    const tab = sheet.getActiveSheet();
    tab.setName('allowed_users');
    tab.getRange('A1').setValue('email');
    // Add current user automatically
    const userEmail = Session.getActiveUser().getEmail();
    tab.getRange('A2').setValue(userEmail.toLowerCase());
    ui.alert(
      "✅ Setup Complete",
      "GooTeX_Access spreadsheet created.\n\n" +
      "File ID: " + sheet.getId() + "\n\n" +
      "Copy this ID into GOOTEX_ACCESS_SHEET_ID in Config.gs.",
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert("❌ Setup Failed: " + e.message, ui.ButtonSet.OK);
  }
}

function checkStatus() {
  const ui = DocumentApp.getUi();
  let msg  = "";
  const serverUrl = _CONFIG.GOOTEX_SERVER_URL
                    ? (_CONFIG.GOOTEX_SERVER_URL.endsWith('/') ? _CONFIG.GOOTEX_SERVER_URL : _CONFIG.GOOTEX_SERVER_URL + '/')
                    : null;
  let serverStatus = "🔴 Offline";
  if (serverUrl) {
    try {
      const response = UrlFetchApp.fetch(serverUrl, {
        "method":             "post",
        "contentType":        "application/json",
        "payload":            JSON.stringify({ "task": "status" }),
        "muteHttpExceptions": true,
        "headers":            { "X-GooTeX-Credential": _CONFIG.GOOTEX_CREDENTIAL || "" }
      });
      if (response.getResponseCode() === 200) serverStatus = "🟢 Online";
      else serverStatus = "🔴 Error (HTTP " + response.getResponseCode() + ")";
    } catch (e) {
      serverStatus = "🔴 Unreachable";
    }
  } else {
    serverStatus = "⚠️ No server URL in Config.gs";
  }
  msg += `🖥️  Compiler server: ${serverStatus}\n`;
  msg += `🔑 Credential set:  ${_CONFIG.GOOTEX_CREDENTIAL ? "✅ Yes" : "❌ No"}\n`;
  msg += `📚 BibMan credential: ${_CONFIG.BIBMAN_CREDENTIAL ? "✅ Yes" : "❌ No"}\n`;
  msg += `📋 Access sheet:    ${_CONFIG.GOOTEX_ACCESS_SHEET_ID ? "✅ Yes" : "❌ No"}\n`;
  if (serverStatus.includes("🔴")) { msg += "\n👉 The GooTeX VM server is not responding. Contact your system administrator."; }
  ui.alert("System Diagnosis", msg, ui.ButtonSet.OK);
}

function taskZip() {
  if (!requireAuthorization()) return { status: "error", log: "🔒 Not authorized." };
  if (!_CONFIG.GOOTEX_SERVER_URL) return { status: "error", log: "❌ SERVER URL MISSING — check Config.gs" };
  const doc = DocumentApp.getActiveDocument();
  const text = getCleanText(doc.getId());
  return executeTask('zip', doc.getName(), text, doc);
}

function getGeminiKey()   { return _CONFIG.GEMINI_API_KEY  || null; }
function getGeminiModel() { return GOOTEX_GEMINI_MODEL; }

function _getAccessSheet() {
  try {
    return SpreadsheetApp.openById(_CONFIG.GOOTEX_ACCESS_SHEET_ID);
  } catch(e) {
    console.warn("Access sheet lookup failed: " + e.message);
    return null;
  }
}

/** 📦 ROBUST ZIP LOCATOR
 * Fixes the "Fetching..." hang by waiting for Google's indexer to wake up.
 */
function getZipUrl(filename) {
  try {
    const doc = DocumentApp.getActiveDocument();
    const docFile = DriveApp.getFileById(doc.getId());
    const parent = docFile.getParents().next();
    const compiledFolders = parent.getFoldersByName("Compiled");
    if (!compiledFolders.hasNext()) return null;
    const folder = compiledFolders.next();
    // ⚡ THE WAIT: Drive indexing can take a few seconds after server writes.
    // We check every 2 seconds for a max of 10 seconds.
    for (let i = 0; i < 5; i++) {
      const files = folder.getFilesByName(filename);
      if (files.hasNext()) {
        const file = files.next();
        // Return the link as soon as it's found
        return file.getUrl();
      }
      Utilities.sleep(2000);
    }
  } catch (e) {
    console.warn("Zip URL Handshake Failed: " + e.message);
  }
  return null;
}

function buildProjectIndex(folder, index) {
  if (!index) index = {};
  try {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const nameKey = f.getName().toLowerCase();
      if (f.getMimeType() === "application/vnd.google-apps.shortcut") {
        try { index[nameKey] = DriveApp.getFileById(f.getTargetId()); } catch(e) {}
      } else {
        index[nameKey] = f;
      }
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      const subName = sub.getName();
      if (subName !== "Compiled" && !subName.startsWith(".")) {
        buildProjectIndex(sub, index);
      }
    }
  } catch (e) {}
  return index;
}

function recursiveFindInfo(folder, targetName) {
  const targetLower = targetName.toLowerCase();
  const files = folder.getFiles();
  while (files.hasNext()) {
    let f = files.next();
    let name = f.getName().toLowerCase();
    // 🛡️ EXCLUSION GATE: Strictly ignore any backup/uncompressed files
    if (name.indexOf("_uncompressed") > -1) continue;
    // Exact match check (plus .bib extension check for bibliography tasks)
    if (name === targetLower || name === targetLower + ".bib") {
      if (f.getMimeType() === "application/vnd.google-apps.shortcut") {
        try { return DriveApp.getFileById(f.getTargetId()); } catch(e) { continue; }
      }
      return f;
    }
  }

  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    // Ignore system and compiled folders
    if (sub.getName() === "Compiled" || sub.getName().startsWith(".")) continue;
    const found = recursiveFindInfo(sub, targetName);
    if (found) return found;
  }
  return null;
}

function getFastAssets() {
  const doc   = DocumentApp.getActiveDocument();
  const props = PropertiesService.getDocumentProperties();
  // Use direct body text for local asset parsing — faster than
  // getCleanText() which makes a Docs API call. Figures, tables,
  // and sections are always in the main document body.
  const text  = doc.getBody().getText();
  const localData = parseLocalAssets(text);
  // Parse refs first so we have allBibKeys for citation highlighting
  const refs = parseLocalBibliography(doc, text);
  const allBibKeys = refs.map(r => r.key);
  const storedCounts = getUsedCitationsLocal(text, allBibKeys);
  // Mark each ref as used/unused based on cross-correlation result
  refs.forEach(r => { r.used = !!storedCounts[r.key]; });
  const lastWC = props.getProperty('LAST_WORD_COUNT') || "--";
  const lastPC = props.getProperty('LAST_PAGE_COUNT') || "--";
  const lastUser = props.getProperty('LAST_COMPILE_USER') || "System";
  const displayUser = lastUser.length > 6 ? lastUser.substring(0, 6) + "…" : lastUser;
  const lastTime = (props.getProperty('LAST_COMPILE_TIME') || "--:--").replace(/^([A-Za-z]{4,})/, m => m.substring(0, 3));
  const rawLog = props.getProperty('LATEST_LOG');
  let processedLog = "ℹ️ Local View: Structure updated.";
  if (rawLog) { processedLog = getLogData(rawLog); }
  return {
    status: "local",
    assets: {
      sections: localData.sections,
      figures: localData.figures,
      tables: localData.tables,
      references: refs
    },
    log: processedLog,
    full_hud: `w:${lastWC}|p:~${lastPC}|${displayUser}|${lastTime}`
  };
}

function _getProjectName() {
  try {
    const doc = DocumentApp.getActiveDocument();
    return DriveApp.getFileById(doc.getId()).getParents().next().getName();
  } catch (e) { return "Unknown Folder"; }
}

 /** * ⚡ UPDATED LOCAL ASSET PARSER
 * Now performs the Library-to-Text cross-correlation on the full virtual text.
 */
function getUsedCitationsLocal(text, allBibKeys) {
  if (!text || !allBibKeys || allBibKeys.length === 0) return {};
  // 1. STRIP COMMENTS
  const lines = text.split('\n');
  const uncommentedText = lines.filter(line => !line.trim().startsWith('%')).join('\n');
  // 2. ISOLATE BRACKETS: The "Search Space"
  // This extracts content from ALL curly brackets in the entire project tree
  const bracketContent = (uncommentedText.match(/\{([^}]+)\}/g) || []).join(' ');
  let used = {};
  // 3. CROSS-CORRELATE
  allBibKeys.forEach(key => {
    const safeKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Regex matches Key if it's the start of string, preceded by comma/space,
    // and followed by comma/space or end of string.
    const keyPattern = new RegExp('(^|[,\\s\\{])' + safeKey + '($|[,\\s\\}])');
    if (keyPattern.test(bracketContent)) {  used[key] = 1; }
  });
  return used;
}

function _checkForUpdates(attachedVersion) {
  try {
    const url      = GOOTEX_VERSION_URL + '?t=' + Date.now();
    const response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    if (response.getResponseCode() !== 200) return {};
    const json        = JSON.parse(response.getContentText());
    const coreVersion = getCoreVersion();
    return {
      coreUpdateAvailable:    json.gootex_core_version     > coreVersion,
      attachedUpdateAvailable: json.gootex_attached_version > attachedVersion,
      coreNotes:              json.gootex_core_notes       || "",
      attachedNotes:          json.gootex_attached_notes   || "",
      latestCore:             json.gootex_core_version,
      latestAttached:         json.gootex_attached_version
    };
  } catch(e) {}
  return {};
}

function debugAuth() {
  console.log("Access sheet ID: " + (_CONFIG.GOOTEX_ACCESS_SHEET_ID || "NOT SET"));
  const sheet = _getAccessSheet();
  console.log("Sheet: " + (sheet ? sheet.getName() : "NULL"));
  if (sheet) {
    const tab = sheet.getSheetByName('allowed_users');
    console.log("Tab: " + (tab ? tab.getName() : "NULL"));
    if (tab) {
      const data = tab.getDataRange().getValues();
      console.log("Rows: " + data.length);
      console.log("Row 0 (header): " + JSON.stringify(data[0]));
      if (data.length > 1) console.log("Row 1: " + JSON.stringify(data[1]));
    }
  }
  const userEmail = Session.getActiveUser().getEmail();
  console.log("Current user: " + userEmail);
  const props = PropertiesService.getDocumentProperties();
  const cached = props.getProperty('AUTH_ALLOWED_EMAILS');
  console.log("Cached emails: " + cached);
  console.log("isUserAuthorized: " + isUserAuthorized());
}

function debugTables() {
  const doc  = DocumentApp.getActiveDocument();
  const text = doc.getBody().getText();
  const assets = parseLocalAssets(text);
  let log = "Tables found: " + assets.tables.length + "\n";
  assets.tables.forEach(function(t) {
    log += "Label: " + t.label + " | section_ref: " + (t.section_ref || "NONE") + "\n";
  });
  return log;
}
