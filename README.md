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

## Local use

1. Run `npm install`.
2. Copy `.env.example` to `.env`, then expose those values in your shell.
3. Run `npm run cache`.
4. Serve `public` with any static HTTP server.

For GitHub Pages, add `AIRTABLE_API_KEY` and `AIRTABLE_BASE_ID` as repository
secrets, then add `AIRTABLE_TABLE_NAME` and `AIRTABLE_VIEW` as repository
variables. Enable GitHub Actions as the Pages source. The generated
`groups.json` is deployed beside the table and is publicly readable.

Reuse the component on another page with:

```html
<script type="module" src="/groups-table.js"></script>
<groups-table src="/groups.json"></groups-table>
```
