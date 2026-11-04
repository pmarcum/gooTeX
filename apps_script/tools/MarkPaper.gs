/**
 * 🧬 gooTeX: mark a paper that was started before gooTeX Core 6 (one time, by an administrator)
 * ---------------------------------------------------------------------------------------------
 * Since Core 6, gooTeX only works in a Doc that carries its own Doc ID as its hidden "lineage" (a named range,
 * see LINEAGE in the Core library). New papers get it automatically when they are copied from the template, and the
 * template marks itself; a paper started before Core 6 has none and must be marked once with this script:
 *
 *   1. Open the paper, then Extensions → Apps Script.
 *   2. Click + next to Files → Script, name it MarkPaper, and paste this whole file into it.
 *   3. Choose markThisPaper in the function menu and click Run. The log says what the Doc carried before and after.
 *   4. Delete the MarkPaper file again (⋮ next to its name → Delete), so that nobody runs it in a copy later.
 *
 * Only mark Docs that really are papers of your group: marking a copy of another paper turns gooTeX on in that copy.
 */
function markThisPaper() {
  const doc = DocumentApp.getActiveDocument(), id = doc.getId(), P = 'gootex_lineage:';
  const before = doc.getNamedRanges().map(n => n.getName()).filter(n => n.indexOf(P) === 0);
  doc.getNamedRanges().forEach(n => { if (n.getName().indexOf(P) === 0) n.remove(); });
  doc.addNamedRange(P + id, doc.newRange().addElement(doc.getBody()).build());
  const was = before.length ? before.map(n => n.substring(P.length)).join(', ') : '(nothing)';
  Logger.log(`"${doc.getName()}" (ID ${id})\n  lineage before: ${was}${before.some(n => n !== P + id && n !== P) ? '   ← another Doc\'s ID: this Doc was a copy' : ''}\n  lineage now:    ${id}\nDone. Now delete the MarkPaper file from this script.`);
}
