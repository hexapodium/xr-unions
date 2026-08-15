import Airtable from "airtable";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const groupFields = {
  name: "Group / org name",
  documents: "Relevant docs & articles",
  intro: "Group intro",
  activities: "Key activities",
  additionalInfo: "Additional info",
};

const caseStudyFields = {
  title: "Name",
  org: "Group / org",
  summary: "Notes",
  story: "Full story",
  tags: "Tags",
  links: "Source links",
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
  name: String(record.get(groupFields.name) ?? ""),
  documents: list(record.get(groupFields.documents)),
  intro: String(record.get(groupFields.intro) ?? ""),
  activities: list(record.get(groupFields.activities)).slice(0, 4),
  additionalInfo: String(record.get(groupFields.additionalInfo) ?? ""),
});

export const normalizeCaseStudy = (record) => ({
  id: record.id,
  title: String(record.get(caseStudyFields.title) ?? ""),
  org: String(record.get(caseStudyFields.org) ?? ""),
  summary: String(record.get(caseStudyFields.summary) ?? ""),
  story: String(record.get(caseStudyFields.story) ?? ""),
  tags: list(record.get(caseStudyFields.tags)),
  links: list(record.get(caseStudyFields.links)),
});

async function fetchAndCache({
  apiKey,
  baseId,
  tableName,
  view,
  fields,
  normalize,
  filterKey,
  fileName,
  label,
}) {
  const table = new Airtable({ apiKey }).base(baseId)(tableName);
  const records = await table
    .select({ view: view || "Grid view", fields: Object.values(fields) })
    .all();
  const items = records.map(normalize).filter((item) => item[filterKey]);
  const output = fileURLToPath(new URL(`../public/${fileName}`, import.meta.url));

  await mkdir(fileURLToPath(new URL("../public", import.meta.url)), {
    recursive: true,
  });
  await writeFile(output, `${JSON.stringify(items, null, 2)}\n`);
  console.log(`Cached ${items.length} ${label} in public/${fileName}`);
  return items;
}

async function cacheAirtable() {
  const {
    AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_NAME,
    AIRTABLE_VIEW,
    AIRTABLE_CASESTUDIES_TABLE_NAME,
    AIRTABLE_CASESTUDIES_VIEW,
  } = process.env;

  for (const [name, value] of Object.entries({
    AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_NAME,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }

  await fetchAndCache({
    apiKey: AIRTABLE_API_KEY,
    baseId: AIRTABLE_BASE_ID,
    tableName: AIRTABLE_TABLE_NAME,
    view: AIRTABLE_VIEW,
    fields: groupFields,
    normalize: normalizeRecord,
    filterKey: "name",
    fileName: "groups.json",
    label: "groups",
  });

  if (AIRTABLE_CASESTUDIES_TABLE_NAME) {
    await fetchAndCache({
      apiKey: AIRTABLE_API_KEY,
      baseId: AIRTABLE_BASE_ID,
      tableName: AIRTABLE_CASESTUDIES_TABLE_NAME,
      view: AIRTABLE_CASESTUDIES_VIEW,
      fields: caseStudyFields,
      normalize: normalizeCaseStudy,
      filterKey: "title",
      fileName: "casestudies.json",
      label: "case studies",
    });
  } else {
    console.log(
      "Skipping case studies (AIRTABLE_CASESTUDIES_TABLE_NAME not set)",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cacheAirtable().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
