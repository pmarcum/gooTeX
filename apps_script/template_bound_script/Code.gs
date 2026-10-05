/**
 * 🦠 GooTeX Attached Thin Client
 * ------------------------------------------------
 * Minimal bridge script — all logic lives in GooTeX_Core library.
 * To deploy GooTeX for a new research group, edit Config.gs only.
 */

/******************************/
var GOOTEX_ATTACHED_VERSION = 1;
/******************************/

// Runs automatically when the document opens. Passes local config to the
// Core library, then builds the GooTeX menu in the Google Docs toolbar.
function onOpen() { GooTeX_Core_Library.setConfig(CONFIG); GooTeX_Core_Library.onOpen(); }

// Relay function called by the sidebar (via google.script.run.dispatch('functionName')).
// The sidebar cannot call Core library functions directly — it can only call functions
// defined in this attached script. dispatch() re-hydrates the Core with the local config
// (since each server-side call is stateless) then forwards the call to the named Core function.
function dispatch(fn) {
  GooTeX_Core_Library.setConfig(CONFIG);
  var args = Array.prototype.slice.call(arguments, 1);
  return GooTeX_Core_Library[fn].apply(GooTeX_Core_Library, args);
}

// ── Menu item functions ──────────────────────────────────────────────────────
// Google Docs menu items can only call functions defined by name in this attached script. These one-liner 
// wrappers expose Core library functions as if they were hardcoded here — each re-hydrates the Core with the 
// local config (since every server-side call is stateless) then forwards to the real implementation in Core.
function taskOpenSidebar()    { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.taskOpenSidebar(); }
function taskShowHelp()       { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.taskShowHelp(); }
function taskSelectionCount() { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.taskSelectionCount(); }
function taskOptimizeImages() { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.taskOptimizeImages(); }
function taskInviteCoAuthor() { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.taskInviteCoAuthor(); }
function taskShowAdminHelp()  { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.taskShowAdminHelp(); }
function setupDrive()         { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.setupDrive(); }
function checkStatus()        { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.checkStatus(); }
function masterSync()         { GooTeX_Core_Library.setConfig(CONFIG); return GooTeX_Core_Library.masterSync(); }
