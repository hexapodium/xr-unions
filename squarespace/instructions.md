# Embedding the data tables in Squarespace

The current cached data lives in `public/articles.json`,
`public/case-studies.json`, and `public/sources.json` (raw Airtable field
dumps — see the repo README's "Movement Assessment Sources Database"
section). `public/index.html` browses all three using two small custom
elements, `data-table.js` and `copy-link.js`, and this is the recommended way
to embed them elsewhere too.

## Quick start

1. Open `public/index.html` on the deployed site (GitHub Pages) and use the
   **Copy** button under the table you want to embed to grab its direct
   JSON link — this is a CORS-friendly URL a Squarespace code block can
   `fetch()` directly.
2. Paste the contents of `data-table-snippet.html` into a Squarespace Code
   Block.
3. Replace `SITE_ORIGIN` with your deployed origin (e.g.
   `hexapodium.github.io/xr-unions`) and `FILE` with one of `articles.json`,
   `case-studies.json`, or `sources.json`.

```html
<script type="module" src="https://SITE_ORIGIN/data-table.js"></script>
<script type="module" src="https://SITE_ORIGIN/copy-link.js"></script>
<link rel="stylesheet" href="https://SITE_ORIGIN/styles.css">

<copy-link href="https://SITE_ORIGIN/FILE"></copy-link>
<data-table src="https://SITE_ORIGIN/FILE" label="rows"></data-table>
```

You can repeat the `<copy-link>`/`<data-table>` pair as many times as you
like on one page (e.g. once per file) — the two `<script type="module">`
tags only need to be included once.

## How it works

- **`data-table.js`** defines `<data-table src="..." label="...">`. It
  fetches the JSON, infers table columns from the union of keys seen across
  all records, hides columns that only ever contain internal Airtable
  record IDs, renders Markdown-style `[text](url)` links and bare URLs as
  clickable links, truncates long text behind a "More" toggle, and adds a
  live search box.
- **`copy-link.js`** defines `<copy-link href="...">`. It resolves the given
  path to an absolute URL and renders a readonly input plus a **Copy**
  button (uses the Clipboard API with a `document.execCommand` fallback).
- Both elements are dependency-free vanilla JS/CSS, so they work fine
  injected into a Squarespace Code Block or via Settings → Advanced → Code
  Injection.
- This only works cross-origin because GitHub Pages serves `public/*.json`
  with permissive CORS headers by default. If you host the JSON somewhere
  else, make sure `Access-Control-Allow-Origin` is set.

## Customizing columns/styling

- `data-table.js` has no configuration for hiding/reordering specific
  columns beyond the automatic "record ID only" filtering — if you need a
  curated subset of fields, it's simplest to pre-filter/reshape the JSON in
  `scripts/cache-airtable.js` before caching, or fork the component.
- Copy `public/styles.css` (or the relevant `.filter`, `.table-scroll`,
  `table`, `.copy-link`, `.copy-row` rules from it) into Squarespace's
  custom CSS if you want the embedded table to match the look of
  `public/index.html`; otherwise it'll pick up your Squarespace theme's
  default table/input/button styles.

## Legacy inline "expando" cards

`expando.js`, `expando.css`, and `expando-snippet.html` in this folder are an
older, separate embedding mechanism built around a different, curated JSON
shape (`public/groups.json` with `name`/`intro`/`documents`/`activities`
fields, and `public/casestudies.json` with `title`/`org`/`summary`/`story`
fields) that **this repo no longer generates by default** — the currently
cached files are the raw dumps described above instead. Those files are kept
for reference in case you re-enable the curated caching path in
`scripts/cache-airtable.js` (see the README), but for browsing/embedding the
current `articles.json`/`case-studies.json`/`sources.json` files, use
`data-table-snippet.html` above instead.

