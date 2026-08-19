// Quick utility: dump Airtable schema (bases + tables + fields) to console and a file.
// Uses the Airtable Metadata API:
//   - List bases:  https://airtable.com/developers/web/api/list-bases
//   - Base schema: https://airtable.com/developers/web/api/get-base-schema
//
// Only requires AIRTABLE_API_KEY (a personal access token with the
// `schema.bases:read` scope). It discovers every base the token can see via
// /v0/meta/bases, then fetches the table/field schema for each one. If
// AIRTABLE_BASE_ID is set, it only dumps that one base instead.
//
// Usage:
//   npm run schema

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const apiKey = process.env.AIRTABLE_API_KEY;
const onlyBaseId = process.env.AIRTABLE_BASE_ID;

if (!apiKey) {
  console.error("Missing AIRTABLE_API_KEY in environment (.env).");
  process.exit(1);
}

async function airtableGet(path) {
  const res = await fetch(`https://api.airtable.com/v0/meta/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed: ${res.status} ${res.statusText}\n${text}`);
  }

  return res.json();
}

async function listBases() {
  const bases = [];
  let offset;
  do {
    const query = offset ? `bases?offset=${offset}` : "bases";
    const data = await airtableGet(query);
    bases.push(...data.bases);
    offset = data.offset;
  } while (offset);
  return bases;
}

async function main() {
  const bases = onlyBaseId
    ? [{ id: onlyBaseId, name: onlyBaseId }]
    : await listBases();

  if (bases.length === 0) {
    console.error("No bases found for this API key/token.");
    process.exit(1);
  }

  const result = [];
  for (const base of bases) {
    const { tables } = await airtableGet(`bases/${base.id}/tables`);
    result.push({ id: base.id, name: base.name, tables });
  }

  console.log(JSON.stringify(result, null, 2));

  const outFile = fileURLToPath(new URL("../airtable-schema.json", import.meta.url));
  await writeFile(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\nSchema written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
