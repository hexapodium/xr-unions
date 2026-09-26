# Group grid

`public/group-grid.js` renders Markdown supplied in the `groups` attribute of
`<group-grid>`. It includes its own CSS. The only published files are the
script, `public/icons/`, and `public/index.html` (a small component preview).
No documents, Markdown drafts, JSON caches, or Airtable credentials are served.

**Squarespace:** Copy `squarespace/group-grid-snippet.html` into a Code Block.
Edit the Markdown between `groups="` and `"` in that block; sections start
with `##`, groups with `###`, optional icons use `icon: https://...`, and
collapsible blocks start with `+++`. Avoid literal double quotes in this HTML
attribute (use single quotes). Icons must use published URLs with exact case.
The snippet carries the current hand-edited group content; the preview uses
two small example groups rather than republishing the full content.

**Google Docs drafts:** Export group documents as `.docx` into `wcpwriteups/`
(ignored by Git), run `npm ci`, then `npm run parse-wcpwriteups`. This creates
`.generated/groups.md` for review and hand editing, plus an intermediate JSON
file; both stay outside `public/` and are ignored by Git. Copy edited Markdown
into the Squarespace Code Block; this does **not** update the live snippet
automatically. `drafts/groups.md` holds the earlier conversion for reference;
running the parser never overwrites it or the hand-edited snippet. Airtable
view links in the documents remain links, not expanded records.

Run `npm test` for the grid data check. Serve `public/` with a local static
server; the preview page can load the local Squarespace snippet or a Markdown
draft without publishing either file. GitHub Pages publishes `public/` from
`main` on push; this `group-grid` branch does not change the live site until
merged. The `expandos` branch retains the previous Airtable/expando experiments.
