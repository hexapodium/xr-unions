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
3. Run `npm run cache`.
4. Serve `public` with any static HTTP server.

For GitHub Pages, add `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` as repository
secrets, then add `AIRTABLE_TABLE_NAME` and `AIRTABLE_VIEW` as repository
variables. To also cache case studies, add `AIRTABLE_CASESTUDIES_TABLE_NAME`
and (optionally) `AIRTABLE_CASESTUDIES_VIEW` as repository variables. Enable
GitHub Actions as the Pages source. The generated `groups.json` and
`casestudies.json` are deployed beside the tables and are publicly readable.

Reuse the components on another page with:

```html
<script type="module" src="/groups-table.js"></script>
<groups-table src="/groups.json"></groups-table>

<script type="module" src="/casestudies-table.js"></script>
<casestudies-table src="/casestudies.json"></casestudies-table>
```

