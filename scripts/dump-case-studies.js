// Dumps the "Case Studies Overview" view of the Case Studies (LIVE) table to JSON.
// Usage: node scripts/dump-case-studies.js [outFile]
// Needs AIRTABLE_API_KEY in .env (scopes: data.records:read, schema.bases:read).

import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appS60muYwAqB3S4V";
const TABLE_ID = "tblyttxIhjlMBang4";
const VIEW_ID = "viwTCB19J6wIvgWnx";
const { AIRTABLE_API_KEY } = process.env;
if (!AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is required");

const outFile = resolve(
  process.argv[2] ?? fileURLToPath(new URL("../public/data/case-studies.json", import.meta.url)),
);

const get = async (url) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}\n${await res.text()}`);
  return res.json();
};

// Field metadata, so the viewer knows names/types and the view's field order.
const { tables } = await get(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`);
const table = tables.find((t) => t.id === TABLE_ID);
if (!table) throw new Error(`Table ${TABLE_ID} not found`);
const view = table.views.find((v) => v.id === VIEW_ID);
if (!view) throw new Error(`View ${VIEW_ID} not found`);

const records = [];
let offset;
do {
  const params = new URLSearchParams({ view: VIEW_ID, pageSize: "100" });
  if (offset) params.set("offset", offset);
  const data = await get(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?${params}`);
  records.push(...data.records);
  offset = data.offset;
} while (offset);

// Only keep fields that actually appear in the data for this view.
const used = new Set(records.flatMap((r) => Object.keys(r.fields)));
const fields = table.fields
  .filter((f) => used.has(f.name))
  .map((f) => ({ id: f.id, name: f.name, type: f.type }));

const output = {
  generatedAt: new Date().toISOString(),
  base: BASE_ID,
  table: { id: table.id, name: table.name },
  view: { id: view.id, name: view.name },
  fields,
  records: records.map((r) => ({ id: r.id, createdTime: r.createdTime, fields: r.fields })),
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote ${records.length} records, ${fields.length} fields to ${outFile}`);
