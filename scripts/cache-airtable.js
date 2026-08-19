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

// Movement Assessment Sources Database (see airtable-schema.json)
const sourceFields = {
  publication: "Publication",
  publicationType: "Publication type",
  orgType: "Org Type",
  accessNotes: "Access Notes",
  priority: "Priority (Source)",
  label: "Label",
};

const articleFields = {
  title: "Article",
  edition: "Edition / Title",
  link: "Article Link",
  docLink: "Article Doc Link",
  read: "Article Read",
  priority: "Priority (Article)",
};

const maCaseStudyFields = {
  title: "Name",
  date: "Date of case study",
  quotes: "Quotes from articles",
  tags: "Tags",
  notes: "Notes",
  details: "Details for further research",
  startDate: "Start Date",
  endDate: "End Date",
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

export const normalizeSource = (record) => ({
  id: record.id,
  publication: String(record.get(sourceFields.publication) ?? ""),
  publicationType: String(record.get(sourceFields.publicationType) ?? ""),
  orgType: String(record.get(sourceFields.orgType) ?? ""),
  accessNotes: String(record.get(sourceFields.accessNotes) ?? ""),
  priority: String(record.get(sourceFields.priority) ?? ""),
  label: String(record.get(sourceFields.label) ?? ""),
});

export const normalizeArticle = (record) => ({
  id: record.id,
  title: String(record.get(articleFields.title) ?? ""),
  edition: String(record.get(articleFields.edition) ?? ""),
  link: String(record.get(articleFields.link) ?? ""),
  docLink: String(record.get(articleFields.docLink) ?? ""),
  read: Boolean(record.get(articleFields.read)),
  priority: String(record.get(articleFields.priority) ?? ""),
});

export const normalizeMaCaseStudy = (record) => ({
  id: record.id,
  title: String(record.get(maCaseStudyFields.title) ?? ""),
  date: String(record.get(maCaseStudyFields.date) ?? ""),
  quotes: String(record.get(maCaseStudyFields.quotes) ?? ""),
  tags: list(record.get(maCaseStudyFields.tags)),
  notes: String(record.get(maCaseStudyFields.notes) ?? ""),
  details: String(record.get(maCaseStudyFields.details) ?? ""),
  startDate: String(record.get(maCaseStudyFields.startDate) ?? ""),
  endDate: String(record.get(maCaseStudyFields.endDate) ?? ""),
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
  let records;
  try {
    records = await table
      .select({ view: view || "Grid view", fields: Object.values(fields) })
      .all();
  } catch (error) {
    if (isAirtablePermissionError(error)) {
      const reason = new Error(
        `${error.message} (fetching "${label}" from base ${baseId}, table "${tableName}"` +
          (view ? `, view "${view}"` : "") +
          `). This usually means the API key/token is invalid or expired, lacks the ` +
          `data.records:read scope, or hasn't been granted access to this base/table. ` +
          `Airtable API keys were deprecated in Feb 2024 - use a Personal Access Token instead.`,
      );
      reason.status = error.status ?? error.statusCode;
      throw reason;
    }
    throw error;
  }
  const items = records.map(normalize).filter((item) => item[filterKey]);
  const output = fileURLToPath(new URL(`../public/${fileName}`, import.meta.url));

  await mkdir(fileURLToPath(new URL("../public", import.meta.url)), {
    recursive: true,
  });
  await writeFile(output, `${JSON.stringify(items, null, 2)}\n`);
  console.log(`Cached ${items.length} ${label} in public/${fileName}`);
  return items;
}

async function airtableMetaGet(apiKey, path) {
  const res = await fetch(`https://api.airtable.com/v0/meta/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed: ${res.status} ${res.statusText}\n${text}`);
  }

  return res.json();
}

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseIdList = (value) =>
  (value || "")
    .split(";")
    .map((id) => id.trim())
    .filter(Boolean);

export const isAirtablePermissionError = (error) => {
  const message =
    typeof error === "string" ? error : String(error?.message ?? "");
  if (/not authorized|unauthorized/i.test(message)) return true;
  const status = error?.status ?? error?.statusCode;
  return status === 401 || status === 403;
};

// Generic fallback: given just an API key + base ID (no table name), discover
// every table in the base via the Metadata API and cache each one verbatim
// (record id + raw field values) to public/<slugified-table-name>.json.
//
// `includeIds`/`excludeIds` are optional arrays of Airtable table IDs
// (e.g. "tblAHzBiQWTwED2jN"). If `includeIds` is non-empty, only those
// tables are cached. Otherwise, if `excludeIds` is non-empty, every table
// except those is cached.
async function cacheAllTables({ apiKey, baseId, includeIds = [], excludeIds = [] }) {
  const { tables } = await airtableMetaGet(apiKey, `bases/${baseId}/tables`);

  if (!tables || tables.length === 0) {
    console.log(`No tables found in base ${baseId}`);
    return;
  }

  const includeSet = new Set(includeIds);
  const excludeSet = new Set(excludeIds);
  const filteredTables = tables.filter(({ id }) => {
    if (includeSet.size > 0) return includeSet.has(id);
    if (excludeSet.size > 0) return !excludeSet.has(id);
    return true;
  });

  for (const { id, name } of tables) {
    if (!filteredTables.some((table) => table.id === id)) {
      console.log(`Skipping table "${name}" (${id})`);
    }
  }

  const base = new Airtable({ apiKey }).base(baseId);
  await mkdir(fileURLToPath(new URL("../public", import.meta.url)), {
    recursive: true,
  });

  for (const { name } of filteredTables) {
    const records = await base(name).select().all();
    const items = records.map((record) => ({ id: record.id, ...record.fields }));
    const fileName = `${slugify(name)}.json`;
    const output = fileURLToPath(new URL(`../public/${fileName}`, import.meta.url));

    await writeFile(output, `${JSON.stringify(items, null, 2)}\n`);
    console.log(`Cached ${items.length} records from "${name}" in public/${fileName}`);
  }
}

async function cacheAirtable() {
  const {
    AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID,
    AIRTABLE_TABLE_NAME,
    AIRTABLE_VIEW,
    AIRTABLE_CASESTUDIES_TABLE_NAME,
    AIRTABLE_CASESTUDIES_VIEW,
    AIRTABLE_MA_BASE_ID,
    AIRTABLE_SOURCES_TABLE_NAME,
    AIRTABLE_SOURCES_VIEW,
    AIRTABLE_ARTICLES_TABLE_NAME,
    AIRTABLE_ARTICLES_VIEW,
    AIRTABLE_MA_CASESTUDIES_TABLE_NAME,
    AIRTABLE_MA_CASESTUDIES_VIEW,
    INCLUDE_TABLE_IDS,
    EXCLUDE_TABLE_IDS,
  } = process.env;

  if (!AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY is required");
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is required");

  // If no table name is configured, fall back to dumping every table in the
  // base generically instead of the curated groups/case-study caching below.
  if (!AIRTABLE_TABLE_NAME) {
    console.log(
      `AIRTABLE_TABLE_NAME not set; dumping all tables from base ${AIRTABLE_BASE_ID}`,
    );
    await cacheAllTables({
      apiKey: AIRTABLE_API_KEY,
      baseId: AIRTABLE_BASE_ID,
      includeIds: parseIdList(INCLUDE_TABLE_IDS),
      excludeIds: parseIdList(EXCLUDE_TABLE_IDS),
    });
    return;
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

  // Movement Assessment Sources Database (see airtable-schema.json).
  // Falls back to AIRTABLE_BASE_ID if a dedicated base isn't configured.
  const maBaseId = AIRTABLE_MA_BASE_ID || AIRTABLE_BASE_ID;

  const optionalFetchAndCache = async (options) => {
    try {
      await fetchAndCache(options);
    } catch (error) {
      if (isAirtablePermissionError(error)) {
        console.warn(
          `Skipping ${options.label} cache (table: ${options.tableName}) because Airtable access is not authorized`,
        );
        return;
      }
      throw error;
    }
  };

  await optionalFetchAndCache({
    apiKey: AIRTABLE_API_KEY,
    baseId: maBaseId,
    tableName: AIRTABLE_SOURCES_TABLE_NAME || "Sources",
    view: AIRTABLE_SOURCES_VIEW,
    fields: sourceFields,
    normalize: normalizeSource,
    filterKey: "publication",
    fileName: "sources.json",
    label: "sources",
  });

  await optionalFetchAndCache({
    apiKey: AIRTABLE_API_KEY,
    baseId: maBaseId,
    tableName: AIRTABLE_ARTICLES_TABLE_NAME || "Articles",
    view: AIRTABLE_ARTICLES_VIEW,
    fields: articleFields,
    normalize: normalizeArticle,
    filterKey: "title",
    fileName: "articles.json",
    label: "articles",
  });

  await optionalFetchAndCache({
    apiKey: AIRTABLE_API_KEY,
    baseId: maBaseId,
    tableName: AIRTABLE_MA_CASESTUDIES_TABLE_NAME || "Case Studies",
    view: AIRTABLE_MA_CASESTUDIES_VIEW,
    fields: maCaseStudyFields,
    normalize: normalizeMaCaseStudy,
    filterKey: "title",
    fileName: "ma-casestudies.json",
    label: "MA case studies",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cacheAirtable().catch((error) => {
    console.error(error.message);
    if (isAirtablePermissionError(error)) {
      console.error(
        "\nHint: check that AIRTABLE_API_KEY is a valid, non-expired Personal " +
          "Access Token (legacy Airtable API keys stopped working in Feb 2024), " +
          "that it has the data.records:read scope, and that it has been given " +
          "access to the specific base(s) configured here.",
      );
    }
    process.exitCode = 1;
  });
}
