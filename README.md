# Case study directory

A static, reusable groups table backed by a JSON snapshot of Airtable. GitHub
Pages refreshes the snapshot every six hours, so visitors never need Airtable
credentials.

## Airtable fields

Create a `Groups` table (the names can be changed in the single `fields` map in
`scripts/cache-airtable.js`) with these provisional fields:

| Field | Suggested Airtable type | Format |
| --- | --- | --- |
| Group / org name | Single line text | Required |
| Relevant docs & articles | Long text | One Markdown link per line: `[Title](https://...)` |
| Group intro | Long text | Short introduction |
| Key activities | Long text | One Markdown bullet per line; the first four are used |
| Additional info | Long text | Expanded when the visitor selects **More** |

## Dumping an entire base (no table name configured)

If `.env` only sets `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` (no
`AIRTABLE_TABLE_NAME`), `npm run cache-airtable` skips the curated groups/case-study
caching below entirely and instead discovers every table in the base via the
Airtable Metadata API (requires a token with the `schema.bases:read` scope)
and dumps each one verbatim — record id plus raw field values, no field
mapping or filtering — to `public/<slugified-table-name>.json` (for example
`public/case-studies.json`, `public/ma-team-members.json`).

Use `INCLUDE_TABLE_IDS` and/or `EXCLUDE_TABLE_IDS` (semicolon-separated
Airtable table IDs, e.g. `tblAHzBiQWTwED2jN;tblKPlwSsCpLYPrIP`) to narrow this
down. If `INCLUDE_TABLE_IDS` is set, only those tables are cached and
everything else is skipped. Otherwise, if `EXCLUDE_TABLE_IDS` is set, every
table is cached except those listed.

## Case studies (optional)

Case studies use a separate Airtable table and are cached to
`public/casestudies.json`. They're skipped entirely if
`AIRTABLE_CASESTUDIES_TABLE_NAME` isn't set.

| Field | Suggested Airtable type | Format |
| --- | --- | --- |
| Case study title | Single line text | Required |
| Group / org | Single line text | Optional |
| Summary | Long text | Short summary shown in the list view |
| Full story | Long text | Full text, shown inline via the expando and in the "More" details |
| Tags | Long text | One tag per line |
| Source links | Long text | One Markdown link per line: `[Title](https://...)` |

## Local use

1. Run `npm install`.
2. Copy `.env.example` to `.env`, then expose those values in your shell.
3. Run `npm run cache-airtable`.
4. Serve `public` with any static HTTP server.

For GitHub Pages, add `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` as repository
secrets, then add `AIRTABLE_TABLE_NAME` and `AIRTABLE_VIEW` as repository
variables. To also cache case studies, add `AIRTABLE_CASESTUDIES_TABLE_NAME`
and (optionally) `AIRTABLE_CASESTUDIES_VIEW` as repository variables. Enable
GitHub Actions as the Pages source. The generated `groups.json` and
`casestudies.json` are deployed beside the tables and are publicly readable.

> **Note:** if `.env`/repository config only sets `AIRTABLE_API_KEY` and
> `AIRTABLE_BASE_ID` (the "dump an entire base" mode described above), the
> curated `groups.json`/`casestudies.json` caching is skipped and you'll get
> raw verbatim dumps instead — that's the mode currently in use for this
> repo's `public/articles.json`, `public/case-studies.json`, and
> `public/sources.json` (see below).

## Movement Assessment Sources Database

`scripts/cache-airtable.js` also caches the `Sources`, `Articles`, and
`Case Studies` tables from the Movement Assessment Sources Database (see
`airtable-schema.json` for the full field list) to `public/sources.json`,
`public/articles.json`, and `public/ma-casestudies.json` respectively.

By default these tables are read from the same base as `AIRTABLE_BASE_ID`.
Set `AIRTABLE_MA_BASE_ID` if they live in a different base. Table names
default to `Sources`, `Articles`, and `Case Studies`, but can be overridden
with `AIRTABLE_SOURCES_TABLE_NAME`, `AIRTABLE_ARTICLES_TABLE_NAME`, and
`AIRTABLE_MA_CASESTUDIES_TABLE_NAME`. Matching `*_VIEW` variables
(`AIRTABLE_SOURCES_VIEW`, `AIRTABLE_ARTICLES_VIEW`,
`AIRTABLE_MA_CASESTUDIES_VIEW`) let you restrict each fetch to a specific
view.

In practice this repo currently runs `cache-airtable` in the "dump an entire
base" mode, so `public/articles.json`, `public/case-studies.json`, and
`public/sources.json` are raw, verbatim Airtable field dumps (whatever
columns exist in each table), rather than the normalized `title`/`org`/etc.
shape described above.

## Browsing the data (`public/index.html`)

`public/index.html` renders a filterable table for each of
`public/articles.json`, `public/case-studies.json`, and `public/sources.json`
using two small dependency-free custom elements:

- **`data-table.js`** — `<data-table src="articles.json" label="articles">`
  fetches the JSON, infers columns from the union of keys across all
  records, hides columns that only ever contain internal Airtable record
  IDs, renders arrays/Markdown links/URLs sensibly, and provides a live
  text filter. Two optional attributes:
  - `name-column="Group Name"` — pulls that column out of the normal grid
    and renders it as a full-width spanning banner row above each record's
    remaining columns (used for the groups table, see
    `public/index.html`/`squarespace/groups-table-snippet.html`).
  - `word-limits='{"Group Intro": 30, "Key Group Activities": 60}'` — a
    JSON object overriding, per column name, how many words (counted across
    all bullet items for list columns) a cell can hold before it collapses
    behind a "More"/"Less" toggle. Columns not listed use the default of 45
    words.
- **`copy-link.js`** — `<copy-link href="articles.json">` renders a readonly
  input with the file's absolute URL plus a **Copy** button, so you can
  paste the direct link into another site.

Reuse either component on another page with:

```html
<script type="module" src="/data-table.js"></script>
<data-table src="/articles.json" label="articles"></data-table>

<script type="module" src="/copy-link.js"></script>
<copy-link href="/articles.json"></copy-link>
```

## Embedding in Squarespace

Because `public/*.json` is served with permissive CORS headers (GitHub Pages
default), any of the cached JSON files can be `fetch()`-ed directly from a
Squarespace code block. Copy the direct link shown under each table on
`public/index.html` (or build it yourself as
`https://<your-pages-domain>/<file>.json`) and see `squarespace/instructions.md`
for a ready-to-paste snippet that reuses `data-table.js`/`copy-link.js`.

