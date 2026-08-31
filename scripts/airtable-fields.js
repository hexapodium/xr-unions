// Shared Airtable field-name constants for the "Articles" table (see
// airtable-schema.json), used by both scripts/cache-airtable.js (the
// generic table dump) and scripts/parse-wcpwriteups.js (the group docs/
// articles expansion) so the same public-facing rule — combine the title
// and link into one `[title](link)` value, and never surface the internal
// "Article Doc Link" working link — can't drift apart between the two.
export const ARTICLE_TITLE_FIELD = "Article";
export const ARTICLE_LINK_FIELD = "Article Link";
export const ARTICLE_DOC_LINK_FIELD = "Article Doc Link";
