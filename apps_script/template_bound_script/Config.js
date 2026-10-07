/**
 * ⚙️ GOOTEX CONFIGURATION  (template — bound script of the group's Google Doc)
 * ---------------------------------------------------------------------------
 * Installation-specific settings for ONE research group. Fill in every
 * REPLACE_ME before use. DO NOT commit a filled-in copy to a public repo —
 * it contains the credentials for your compiler server.
 *
 *   GOOTEX_SERVER_URL      — your compile server's public HTTPS endpoint
 *                            (ends in /gootex), e.g. https://you.duckdns.org/gootex
 *   GOOTEX_CREDENTIAL      — shared secret; MUST match GOOTEX_CREDENTIAL in the
 *                            server's systemd drop-in override
 *   BIBMAN_CREDENTIAL      — only if you run BibMan; set it to BibMan's read-only
 *                            bibliography-export credential (its EXPORT_CREDENTIAL),
 *                            NOT BibMan's master key (gooTeX only reads bibliographies)
 *   GEMINI_API_KEY         — Gemini API key for the Log-tab AI assistant
 *                            (see DEPLOY.md §5; leave "" to disable AI)
 *   GOOTEX_ACCESS_SHEET_ID — ID of the allowed_users sheet, produced by
 *                            GooTeX ▸ Server Setup ▸ Initialize Drive Folder
 *   GOOTEX_TEMPLATE_URL    — the "make a copy" URL of THIS group's own template
 *                            Doc. Shown to users when their attached script is
 *                            out of date ("make a fresh copy of the template").
 *                            Per-group: each group's template points at itself.
 */

/** Fill these in for your own research group. **/
var CONFIG = {
  GOOTEX_ATTACHED_VERSION:  GOOTEX_ATTACHED_VERSION,
  GOOTEX_SERVER_URL:        "REPLACE_ME_https://you.duckdns.org/gootex",
  GOOTEX_CREDENTIAL:        "REPLACE_ME_must_match_server",
  BIBMAN_CREDENTIAL:        "REPLACE_ME_bibman_EXPORT_CREDENTIAL_or_leave_blank",
  GEMINI_API_KEY:           "REPLACE_ME_or_leave_blank",
  GOOTEX_ACCESS_SHEET_ID:   "REPLACE_ME_sheet_id",
  GOOTEX_TEMPLATE_URL:      "REPLACE_ME_make-a-copy_url_of_THIS_groups_template",
};
