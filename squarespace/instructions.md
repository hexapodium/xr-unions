# Embedding the data tables in Squarespace

The current cached data lives in `public/articles.json`,
`public/case-studies.json`, `public/sources.json` (raw Airtable field
dumps — see the repo README's "Movement Assessment Sources Database"
section), and `public/groups-table.json` (a curated, flattened view of the
WCP26 group write-ups — see `scripts/parse-wcpwriteups.js`). `public/index.html`
browses the first three with `data-table.js`, and the groups table with a
dedicated 4-across icon grid, `group-grid.js` — plus `copy-link.js` for the
direct/CORS links — and this is the recommended way to embed them
elsewhere too.

## Quick start

Paste-ready snippets (already pointing at
`https://hexapodium.github.io/xr-unions`, no placeholders to fill in) are
provided for each table:

- `articles-table-snippet.html` → `articles.json`
- `case-studies-table-snippet.html` → `case-studies.json`
- `sources-table-snippet.html` → `sources.json`
- `groups-table-snippet.html` → `groups-table.json` (WCP26 group write-ups,
  rendered as a 4-across icon grid via `group-grid.js` rather than
  `data-table.js` — see "Icon grid for groups" below)

1. Open the snippet file for the table you want.
2. Copy its full contents into a Squarespace Code Block.
3. If you deploy from a fork or different repo/org, update the
   `hexapodium.github.io/xr-unions` origin in the snippet to match.

If you're deploying somewhere other than `hexapodium.github.io/xr-unions`,
use the generic placeholder version instead, `data-table-snippet.html`:

```html
<script type="module" src="https://SITE_ORIGIN/data-table.js"></script>
<script type="module" src="https://SITE_ORIGIN/copy-link.js"></script>
<link rel="stylesheet" href="https://SITE_ORIGIN/styles.css">

<copy-link href="https://SITE_ORIGIN/FILE"></copy-link>
<data-table src="https://SITE_ORIGIN/FILE" label="rows"></data-table>
```

Replace `SITE_ORIGIN` with your deployed origin (e.g.
`hexapodium.github.io/xr-unions`) and `FILE` with one of `articles.json`,
`case-studies.json`, `sources.json`, or `groups-table.json`.

You can repeat the `<copy-link>`/`<data-table>` pair as many times as you
like on one page (e.g. once per file) — the two `<script type="module">`
tags only need to be included once.

## How it works

- **`data-table.js`** defines `<data-table src="..." label="...">`. It
  fetches the JSON, infers table columns from the union of keys seen across
  all records, hides columns that only ever contain internal Airtable
  record IDs, renders Markdown-style `[text](url)` links and bare URLs as
  clickable links, truncates long cells (45 words by default, including the
  combined word count across all items in bullet-list columns) to a
  visible preview with a "More" toggle to reveal the rest, and adds a
  live search box. Two optional attributes:
  - `name-column="Group Name"` renders that column as a full-width banner
    row spanning above each record's remaining columns, instead of a normal
    grid cell — used on the groups table (see
    `groups-table-snippet.html`).
  - `word-limits='{"Group Intro": 30}'` overrides the 45-word default
    per column name; any column not listed keeps using the default.
- **`copy-link.js`** defines `<copy-link href="...">`. It resolves the given
  path to an absolute URL and renders a readonly input plus a **Copy**
  button (uses the Clipboard API with a `document.execCommand` fallback).
- Both elements are dependency-free vanilla JS/CSS, so they work fine
  injected into a Squarespace Code Block or via Settings → Advanced → Code
  Injection.
- This only works cross-origin because GitHub Pages serves `public/*.json`
  with permissive CORS headers by default. If you host the JSON somewhere
  else, make sure `Access-Control-Allow-Origin` is set.

## Icon grid for groups

`group-grid.js` defines `<group-grid src="..." label="..." name-column="Group
Name">`. It fetches `groups-table.json` and renders every record as a tile in
a 4-across grid (fewer columns on narrower embeds, via CSS container
queries) instead of a table row:

- Each tile shows either a manually-cached icon (looked up by the record's
  `id` field in an `ICONS` map maintained in `group-grid.js`, overridable/
  extendable per-embed via an `icons='{"FoE":"https://.../foe.svg"}'`
  attribute) or, if no icon is set, a placeholder circle with the group
  name's first letter.
- Clicking a tile expands a summary panel beneath it showing only **Group
  name, Relevant docs, Relevant links, Group intro, Key group activities,
  Additional info** (`Relevant Docs and Articles`/`Relevant Links` render
  Markdown-style `[text](url)` links and bare URLs as clickable links, same
  as `data-table.js`) — every other Airtable column is dropped from the
  view entirely, and clicking again collapses it.
- Includes the same live search box as `data-table.js`.
- Automatically keeps its Squarespace Code Block sized to fit all its
  content. Squarespace renders a code block containing a `<script>` inside
  a same-origin iframe sized once from the initial (pre-fetch) content —
  without this, the block would stay stuck at whatever tiny height it had
  while showing just "Loading groups…", clipping the grid. `group-grid.js`
  watches the page's content height (via `ResizeObserver`) and keeps the
  host iframe's height in sync as records load, the grid is filtered, and
  tiles are expanded/collapsed. This is a no-op when not embedded in an
  iframe (e.g. on `public/index.html` directly).

To add real icons: cache image files under `public/icons/` in this repo,
then add entries to the `ICONS` map at the top of `group-grid.js` (keyed by
each group's `id`, e.g. `"FoE": "icons/foe.svg"`) — or, for a one-off
Squarespace embed without editing the repo, pass absolute icon URLs via the
`icons` attribute on the `<group-grid>` tag instead.

## Customizing columns/styling

- `data-table.js` has no configuration for hiding/reordering specific
  columns beyond the automatic "record ID only" filtering — if you need a
  curated subset of fields, it's simplest to pre-filter/reshape the JSON in
  `scripts/cache-airtable.js` before caching, or fork the component. It does
  support `name-column` and `word-limits` attributes though — see "How it
  works" above.
- Copy `public/styles.css` (or the relevant `.filter`, `.table-scroll`,
  `table`, `.copy-link`, `.copy-row` rules from it) into Squarespace's
  custom CSS if you want the embedded table to match the look of
  `public/index.html`; otherwise it'll pick up your Squarespace theme's
  default table/input/button styles. If you use `name-column`, also copy the
  `table.has-name-header` rules so the banner row is styled instead of
  looking like a regular row.
- Copy the `group-grid`, `.group-grid`, `.group-tile`, `.group-icon`,
  `.group-name`, and `.group-detail` rules from `public/styles.css` if you
  want an embedded `<group-grid>` to match the look of `public/index.html`;
  otherwise it'll pick up your Squarespace theme's default button/link
  styles instead of the tile/card layout.

## Inline "expando" cards (current data shape)

`expando2.js`, `expando2.css`, and `expando2-snippet.html` reimplement the
inline expando UX against the *current* raw Airtable dumps — no curated
caching path required.

Paste the contents of `expando2-snippet.html` into a Squarespace Code Block,
then:

1. To insert a case study or article inline in a paragraph, add a link with
   `class="expando-link"` and either `data-article-id="recXXXXXXXXXXXXXX"`
   or `data-casestudy-id="recXXXXXXXXXXXXXX"`, using the record's `id` field
   from `articles.json`/`case-studies.json` (or the `id` column shown by
   `data-table.js`). Multiple space/comma-separated ids on one link render
   several cards side-by-side. Clicking the link expands a card in place
   (built from `Article`/`Article Link`/`Priority (Article)`/etc. for
   articles, or `Name`/`Tags`/`Quotes from articles`/etc. for case studies);
   clicking again collapses it. Cards cross-link: an article card lists its
   linked case studies, and a case study card lists its linked articles, each
   as its own expando-link.
2. For a "table of icons" of every row in `sources.json`, add
   `<div class="expando-gallery" data-sources data-cols="6"></div>`. Each
   source renders as an icon tile (initials, since `sources.json` has no
   logo/icon field) with its `Publication` name as a caption. Clicking a tile
   expands a panel with `Org Type`, `Publication type`, `Editions (Count)`,
   and a list of that source's articles (again as expando-links). Omit
   `data-cols` for a responsive auto-fit grid, or set `data-sources="id1,id2"`
   to show only specific sources.
3. If the snippet isn't served from the same origin as the JSON files, set
   `data-articles-url`, `data-casestudies-url`, and `data-sources-url` on the
   `#expando-root` wrapper to absolute URLs (e.g. your GitHub Pages origin).

Under the hood, `expando2.js` tries several fallback URLs
(`/articles.json`, `/public/articles.json`, etc.) if the configured one
404s, same as the legacy script.

## Legacy inline "expando" cards

`expando.js`, `expando.css`, and `expando-snippet.html` in this folder are an
older, separate embedding mechanism built around a different, curated JSON
shape (`public/groups.json` with `name`/`intro`/`documents`/`activities`
fields, and `public/casestudies.json` with `title`/`org`/`summary`/`story`
fields) that **this repo no longer generates by default** — the currently
cached files are the raw dumps described above instead. Those files are kept
for reference in case you re-enable the curated caching path in
`scripts/cache-airtable.js` (see the README). For the current data shape, use
`expando2.js` (above) for inline cards/icon gallery, or
`data-table-snippet.html` for full filterable tables.

