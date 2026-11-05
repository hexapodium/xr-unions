# Case study browser — deployment

`<case-study-browser>` (`public/case-studies.js`) is a filterable table over a
JSON dump of the Airtable **Case Studies (LIVE)** table, view
**Case Studies Overview**. GitHub Actions regenerates the JSON every 24 hours
and publishes both files to GitHub Pages; Squarespace only holds a small
snippet that points at them.

```
Airtable ──(daily, GitHub Action)──> public/data/case-studies.json ─┐
                                     public/case-studies.js ────────┴─> GitHub Pages ──> Squarespace page
```

## 1. One-time GitHub setup

1. **Pages:** Settings → Pages → Build and deployment → Source → **GitHub Actions**
   (see the main README).
2. **Airtable token:** create a personal access token at
   <https://airtable.com/create/tokens> with scopes `data.records:read` and
   `schema.bases:read`, with access to the base only. Prefer a read-only token
   dedicated to this job.
3. **Secret:** Settings → Secrets and variables → Actions → **New repository
   secret** → name `AIRTABLE_API_KEY`, value = the token.

`.github/workflows/publish.yml` then does the rest. It runs on every push to
`main`, once a day at 06:17 UTC (`cron: "17 6 * * *"`), and on demand
(Actions → *Publish group grid* → **Run workflow**). Each run does
`npm ci`, `npm test`, `npm run dump:case-studies`, then deploys `public/`.
If the Airtable call fails the run fails and the previously deployed JSON
stays live.

Notes:

- Scheduled workflows only run on the default branch, and GitHub pauses them
  after 60 days without repository activity — re-enable under the Actions tab
  or push a commit.
- `public/data/case-studies.json` is git-ignored; it exists only locally and in
  the deployed site.
- **Everything in the view becomes world-readable.** Hide private fields in the
  Airtable view before publishing. Attachment URLs in the dump expire after a
  couple of hours.

## 2. Check the published files

After a successful run (replace `hexapodium.github.io/xr-unions` if the repo
moves):

- <https://hexapodium.github.io/xr-unions/data/case-studies.json> shows JSON
  with a recent `generatedAt`.
- <https://hexapodium.github.io/xr-unions/case-studies.js> shows the script.

GitHub Pages sends `Access-Control-Allow-Origin: *`, so the browser on your
Squarespace domain may fetch the JSON cross-origin.

## 3. Add it to Squarespace

Requires a Squarespace plan that allows Code Blocks (Business or higher).

1. Edit the page → add a block (`+`) → **Code**.
2. Turn **Display Source Code** off (so the HTML runs), and paste:

```html
<script type="module" src="https://hexapodium.github.io/xr-unions/case-studies.js"></script>
<case-study-browser
  src="https://hexapodium.github.io/xr-unions/data/case-studies.json"
  columns="Name,Date of case study,Tags,Quotes from articles"
  tag-field="Tags"
  sort="Name"
></case-study-browser>
```

3. Save. Code Blocks don't run in the editor preview on some templates —
   view the live or preview URL to check.
4. Give the block full width (drag the block edges, or use a full-width
   section) — the table is wide.

The same snippet is in `squarespace/case-studies-snippet.html`.

### Configuration

All attributes are optional.

| Attribute   | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `src`       | URL of the JSON dump                                                 |
| `columns`   | Comma-separated field names, in display order                        |
| `tag-field` | Multi-select field behind the tag cloud (default `Tags`)             |
| `sort`      | Initial sort field; prefix with `-` for descending, e.g. `-ID`       |
| `show-picker` | Show the visitor-facing "Information Displayed" picker (hidden by default) |

Field names must match Airtable exactly. By default all five columns (Name,
Date, Articles, Quotes, Tags) are shown and the picker is hidden. Add
`show-picker` to let visitors show/hide columns (choices are not saved). An
explicit `columns` attribute sets the starting columns:

```html
<case-study-browser
  src="https://hexapodium.github.io/xr-unions/data/case-studies.json"
  columns="Name,Tags,Article summary"
  show-picker
></case-study-browser>
```

Several browsers on one site (e.g. different column sets) work — add the
`<script>` tag once per page and one `<case-study-browser>` per block.

### Updating

- **Data** changes need nothing in Squarespace: the page reads fresh JSON, so
  Airtable edits appear after the next daily run (or trigger one manually).
  Browsers may cache the JSON briefly.
- **Behaviour/style** changes: merge to `main`; the snippet loads
  `case-studies.js` from Pages, so the page picks it up without re-pasting.
- **Other column views:** change `columns`; no rebuild required.

## 4. Local testing

```powershell
npm run dump:case-studies   # needs AIRTABLE_API_KEY in .env
npm run serve               # http://localhost:8080/case-studies-playground.html
```

## Troubleshooting

| Symptom                                   | Likely cause                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Could not load case studies (404 …)"     | JSON not deployed yet: run the workflow, check the URL in section 2                               |
| Block shows raw code text                 | *Display Source Code* is on                                                                       |
| Nothing renders, console shows CORS error | `src` points somewhere other than GitHub Pages; the host must send `Access-Control-Allow-Origin`  |
| Workflow fails at the dump step           | Missing/expired `AIRTABLE_API_KEY`, or token lacks `schema.bases:read` / base access (HTTP 401/403) |
| Daily runs stopped                        | Workflow auto-disabled after 60 days of inactivity — re-enable it in the Actions tab              |
