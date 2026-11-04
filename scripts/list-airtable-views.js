// Lists every accessible Airtable base > table > view via the Meta API.
// Usage: AIRTABLE_API_KEY=pat... node scripts/list-airtable-views.js [--json]
// Optional: AIRTABLE_BASE_ID restricts output to one base.
// Token needs the schema.bases:read scope.

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load .env from the repo root regardless of the current working directory.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is required");

const headers = { Authorization: `Bearer ${AIRTABLE_API_KEY}` };

const get = async (url) => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}\n${await res.text()}`);
  return res.json();
};

const listBases = async () => {
  const bases = [];
  let offset;
  do {
    const data = await get(
      `https://api.airtable.com/v0/meta/bases${offset ? `?offset=${offset}` : ""}`,
    );
    bases.push(...data.bases);
    offset = data.offset;
  } while (offset);
  return bases;
};

const bases = AIRTABLE_BASE_ID
  ? [{ id: AIRTABLE_BASE_ID, name: AIRTABLE_BASE_ID }]
  : await listBases();

const result = [];
for (const base of bases) {
  const { tables } = await get(
    `https://api.airtable.com/v0/meta/bases/${base.id}/tables?include=visibleFieldIds`,
  );
  result.push({
    id: base.id,
    name: base.name,
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      views: (t.views ?? []).map((v) => ({ id: v.id, name: v.name, type: v.type })),
    })),
  });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const b of result) {
    console.log(`${b.name} (${b.id})`);
    for (const t of b.tables) {
      console.log(`  ${t.name} (${t.id})`);
      for (const v of t.views) console.log(`    ${v.name} (${v.id}, ${v.type})`);
    }
  }
}
