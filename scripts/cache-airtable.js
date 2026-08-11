import Airtable from "airtable";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const fields = {
  name: "Group / Org name",
  documents: "Relevant docs & articles",
  intro: "Group intro",
  activities: "Key activities",
  additionalInfo: "Additional info",
};

const list = (value) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
};

export const normalizeRecord = (record) => ({
  id: record.id,
  name: String(record.get(fields.name) ?? ""),
  documents: list(record.get(fields.documents)),
  intro: String(record.get(fields.intro) ?? ""),
  activities: list(record.get(fields.activities)).slice(0, 4),
  additionalInfo: String(record.get(fields.additionalInfo) ?? ""),
});

async function cacheAirtable() {
  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME, AIRTABLE_VIEW } =
    process.env;
  for (const [name, value] of Object.entries({
    AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_NAME,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }

  const table = new Airtable({ apiKey: AIRTABLE_API_KEY })
    .base(AIRTABLE_BASE_ID)(AIRTABLE_TABLE_NAME);
  const records = await table
    .select({ view: AIRTABLE_VIEW || "Grid view", fields: Object.values(fields) })
    .all();
  const groups = records.map(normalizeRecord).filter((group) => group.name);
  const output = fileURLToPath(new URL("../public/groups.json", import.meta.url));

  await mkdir(fileURLToPath(new URL("../public", import.meta.url)), {
    recursive: true,
  });
  await writeFile(output, `${JSON.stringify(groups, null, 2)}\n`);
  console.log(`Cached ${groups.length} groups in public/groups.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cacheAirtable().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
