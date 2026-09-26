// Converts public/groups-table.json (the flattened WCP26 group write-ups
// produced by scripts/parse-wcpwriteups.js) into the Markdown format that
// <group-grid groups="..."> now expects, ready for hand-editing.
//
// The output is written to public/groups.md and is meant to be pasted into
// the `groups` attribute of a <group-grid> tag (see
// squarespace/groups-table-snippet.html) and then maintained by hand — the
// JSON is no longer the source of truth for the groups grid.
//
// Formatting choices favour human readability/editability over density:
//   - one ## section per broad grouping (edit the SECTIONS map below to
//     re-order or re-group; the order here is the order shown on the page);
//   - a blank line between every block, and between groups;
//   - "Relevant docs" and "Links" become +++ collapsible dropdowns (closed
//     by default), per the client's request;
//   - [text](url) links are kept inline, exactly as they read in the source
//     Google Docs;
//   - fields that are empty for a group are omitted entirely.
//
// Run with:  node scripts/groups-table-to-markdown.js
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const INPUT = join(process.cwd(), "public", "groups-table.json");
const OUTPUT = join(process.cwd(), "public", "groups.md");

// ---------------------------------------------------------------------------
// Section grouping. Maps each record `id` to a section heading, in the order
// the sections should appear on the page. Ids not listed here fall into
// FALLBACK_SECTION. Edit these to taste — this is the human-curated bit.
// ---------------------------------------------------------------------------
const SECTION_ORDER = [
  "Union green groups & networks",
  "Worker-climate campaigns & projects",
  "Environmental NGOs & allies",
  "Think tanks & research",
];

const SECTION_BY_ID = {
  // Union green groups & networks
  "BFAWU Green Reps": "Union green groups & networks",
  "Equity for a GND": "Union green groups & networks",
  "GMB GND": "Union green groups & networks",
  "Green Unison": "Union green groups & networks",
  "PCS Green Reps": "Union green groups & networks",
  "UCU Green Reps": "Union green groups & networks",
  "Unite GCJC": "Union green groups & networks",

  // Worker-climate campaigns & projects
  "CACCTU": "Worker-climate campaigns & projects",
  "CJC": "Worker-climate campaigns & projects",
  "CJCTUC": "Worker-climate campaigns & projects",
  "Heat Strike": "Worker-climate campaigns & projects",
  "JTP": "Worker-climate campaigns & projects",
  "JTW": "Worker-climate campaigns & projects",
  "New Lucas Plan": "Worker-climate campaigns & projects",
  "Safe Landing": "Worker-climate campaigns & projects",
  "Scot E3": "Worker-climate campaigns & projects",
  "TUED": "Worker-climate campaigns & projects",
  "TUCAN": "Worker-climate campaigns & projects",
  "WCCA": "Worker-climate campaigns & projects",
  "Workers Co-op": "Worker-climate campaigns & projects",
  "Workers Planet": "Worker-climate campaigns & projects",
  "XRTU": "Worker-climate campaigns & projects",

  // Environmental NGOs & allies
  "FoE": "Environmental NGOs & allies",
  "FoES": "Environmental NGOs & allies",
  "GJA": "Environmental NGOs & allies",
  "NEON": "Environmental NGOs & allies",
  "Platform": "Environmental NGOs & allies",
  "Tipping Point": "Environmental NGOs & allies",

  // Think tanks & research
  "NEF": "Think tanks & research",
};

const FALLBACK_SECTION = "Other";

// ---------------------------------------------------------------------------
// Field -> Markdown mapping. The order of this list is the order blocks
// appear within a group. `dropdown: true` renders the field as a +++
// collapsible block (closed by default).
// ---------------------------------------------------------------------------
const FIELDS = [
  { key: "Group Intro", heading: null }, // intro = lead paragraph(s)
  { key: "Key Group Activities", heading: "Key group activities" },
  { key: "Additional Info", heading: "Additional info" },
  { key: "GKN Solidarity Campaign Info", heading: "GKN solidarity campaign" },
  { key: "Suggested additions", heading: "Suggested additions" },
  { key: "Relevant Docs and Articles", heading: "Relevant docs", dropdown: true },
  { key: "Relevant Links", heading: "Links", dropdown: true },
];

function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.every(isEmpty);
  return String(value).trim() === "";
}

// Renders a field's value as Markdown lines (without any heading).
function valueLines(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => !isEmpty(item)).map((item) => `- ${String(item).trim()}`);
  }
  return [String(value).trim()];
}

function groupMarkdown(record) {
  const lines = [];
  lines.push(`### ${String(record["Group Name"] ?? record.id).trim()}`);
  lines.push("");

  for (const field of FIELDS) {
    const value = record[field.key];
    if (isEmpty(value)) continue;

    if (field.dropdown) {
      lines.push(`+++ ${field.heading}`);
      lines.push("");
      lines.push(...valueLines(value));
    } else if (field.heading) {
      lines.push(`**${field.heading}**`);
      lines.push("");
      lines.push(...valueLines(value));
    } else {
      // Lead intro: no heading, just the paragraph(s).
      lines.push(...valueLines(value));
    }
    lines.push("");
  }

  // Trim trailing blank lines so groups are separated by exactly one.
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function main() {
  const records = JSON.parse(readFileSync(INPUT, "utf8"));

  // Bucket records into sections, preserving the JSON's order within each.
  const buckets = new Map();
  for (const name of [...SECTION_ORDER, FALLBACK_SECTION]) buckets.set(name, []);
  for (const record of records) {
    const section = SECTION_BY_ID[record.id] ?? FALLBACK_SECTION;
    buckets.get(section).push(record);
  }

  const out = [];
  out.push("<!--");
  out.push("  WCP26 group write-ups, converted from groups-table.json by");
  out.push("  scripts/groups-table-to-markdown.js for hand-editing.");
  out.push("");
  out.push("  Paste the content below (without this comment block) into the");
  out.push('  groups="..." attribute of a <group-grid> tag. See');
  out.push("  squarespace/groups-table-snippet.html for the format.");
  out.push("");
  out.push("  Reminder: the content lives inside a double-quoted HTML");
  out.push('  attribute, so use single quotes (\') not double quotes (") in');
  out.push("  the text.");
  out.push("-->");
  out.push("");

  for (const [section, groups] of buckets) {
    if (!groups.length) continue;
    out.push(`## ${section}`);
    out.push("");
    for (const record of groups) {
      out.push(groupMarkdown(record));
      out.push("");
    }
  }

  writeFileSync(OUTPUT, out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n");
  const groupCount = records.length;
  const sectionCount = [...buckets.values()].filter((g) => g.length).length;
  console.log(`Wrote ${groupCount} groups in ${sectionCount} sections to ${relative(process.cwd(), OUTPUT)}`);
}

main();
