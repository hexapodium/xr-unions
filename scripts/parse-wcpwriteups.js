// One-off parser: reads all "Groups Index Doc" .docx files in wcpwriteups/
// and transcribes their text content into a single public/groups.json file.
//
// This is a *transcription* tool, not a content generator: it walks the
// docx XML directly and copies out paragraph text, bullet points and
// hyperlinks under whichever bold "Header:" paragraph they fall under,
// without rewording or summarising anything.
//
// Usage: node scripts/parse-wcpwriteups.js

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const SOURCE_DIR = join(process.cwd(), "wcpwriteups");
const OUTPUT_PATH = join(process.cwd(), "public", "groups.json");
const TABLE_OUTPUT_PATH = join(process.cwd(), "public", "groups-table.json");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Maps a normalised header string (lowercased, trailing colon stripped,
// trimmed) to a canonical camelCase field name used in the output JSON.
// Anything not listed here is kept verbatim under `extraFields`.
const FIELD_MAP = {
  "written by": "writtenBy",
  "group name": "groupName",
  "relevant docs and articles": "relevantDocsAndArticles",
  "relevant doc and articles": "relevantDocsAndArticles",
  "relevant links": "relevantLinks",
  "group intro": "groupIntro",
  "key group activities": "keyGroupActivities",
  "additional info": "additionalInfo",
  "missing info": "missingInfo",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

// Canonical field keys (and the raw "Source File" column) that are parsed
// for context but deliberately left out of the public JSON/table output.
const EXCLUDED_KEYS = new Set(["writtenBy", "missingInfo"]);

// Matches "notetaking doc"-style entries under Relevant Docs and Articles
// (internal working docs, not meant for public consumption).
const NOTETAKING_DOC = /notetaking/i;

function listDocxFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".docx") && !f.startsWith("~$"))
    .filter((f) => !/TEMPLATE/i.test(f))
    .sort();
}

function loadRelationships(zip) {
  const relsEntry = zip.getEntry("word/_rels/document.xml.rels");
  if (!relsEntry) return {};
  const xml = zip.readAsText(relsEntry);
  const parsed = parser.parse(xml);
  const map = {};
  // parsed is [ { Relationships: [ { Relationship: [], ':@': {...} }, ... ] } ]
  const relationshipsNode = findFirst(parsed, "Relationships");
  const children = relationshipsNode?.Relationships ?? [];
  for (const child of children) {
    const attrs = child[":@"];
    if (attrs && attrs["@_Id"]) {
      map[attrs["@_Id"]] = attrs["@_Target"];
    }
  }
  return map;
}

// Finds the first node object in a preserveOrder-style array that has a key
// equal to `tagName` and returns that node object (which also carries `:@`
// attributes alongside the tag key).
function findFirst(nodeArray, tagName) {
  if (!Array.isArray(nodeArray)) return undefined;
  for (const node of nodeArray) {
    if (Object.prototype.hasOwnProperty.call(node, tagName)) return node;
  }
  return undefined;
}

function findAll(nodeArray, tagName) {
  if (!Array.isArray(nodeArray)) return [];
  return nodeArray.filter((node) =>
    Object.prototype.hasOwnProperty.call(node, tagName)
  );
}

// Recursively collects plain text from a run/hyperlink's children (w:t nodes).
function collectText(children) {
  let text = "";
  if (!Array.isArray(children)) return text;
  for (const node of children) {
    if (Object.prototype.hasOwnProperty.call(node, "w:t")) {
      const tVal = node["w:t"];
      if (Array.isArray(tVal)) {
        for (const t of tVal) {
          if (typeof t["#text"] === "string") text += t["#text"];
        }
      }
    } else if (Object.prototype.hasOwnProperty.call(node, "w:r")) {
      text += collectText(node["w:r"]);
    } else if (Object.prototype.hasOwnProperty.call(node, "w:hyperlink")) {
      text += collectText(node["w:hyperlink"]);
    }
  }
  return text;
}

function runIsBold(run) {
  const rPr = findFirst(run["w:r"], "w:rPr");
  if (!rPr) return false;
  const b = findFirst(rPr["w:rPr"], "w:b");
  if (!b) return false;
  const val = b[":@"]?.["@_w:val"];
  return val === undefined || val === "true" || val === "1";
}

// Parses one <w:p> node into { text, bold, bullet, links }.
function parseParagraph(pNode, rels) {
  const children = pNode["w:p"];
  const pPr = findFirst(children, "w:pPr");
  const bullet = !!(pPr && findFirst(pPr["w:pPr"], "w:numPr"));

  let text = "";
  const links = [];
  let allNonEmptyRunsBold = true;
  let sawRun = false;

  for (const node of children) {
    if (Object.prototype.hasOwnProperty.call(node, "w:r")) {
      const runText = collectText([node]);
      text += runText;
      if (runText.trim()) {
        sawRun = true;
        if (!runIsBold(node)) allNonEmptyRunsBold = false;
      }
    } else if (Object.prototype.hasOwnProperty.call(node, "w:hyperlink")) {
      const hyperlinkText = collectText(node["w:hyperlink"]);
      text += hyperlinkText;
      if (hyperlinkText.trim()) sawRun = true;
      const rId = node[":@"]?.["@_r:id"];
      const target = rId ? rels[rId] : undefined;
      if (target) links.push(target);
      // Hyperlinks are typically not the bold header runs; don't force
      // allNonEmptyRunsBold to false purely because of a link, but do
      // check its own run bold state for consistency if it has runs.
      const linkRuns = findAll(node["w:hyperlink"], "w:r");
      for (const lr of linkRuns) {
        const lrText = collectText([lr]);
        if (lrText.trim() && !runIsBold(lr)) allNonEmptyRunsBold = false;
      }
    }
  }

  const isHeader =
    sawRun &&
    allNonEmptyRunsBold &&
    text.trim().endsWith(":") &&
    !bullet;

  return { text: text.trim(), bold: isHeader, bullet, links };
}

function normaliseHeaderKey(headerText) {
  return headerText.trim().replace(/:$/, "").trim().toLowerCase();
}

function parseDocx(filePath) {
  const zip = new AdmZip(filePath);
  const rels = loadRelationships(zip);
  const docEntry = zip.getEntry("word/document.xml");
  const xml = zip.readAsText(docEntry);
  const parsed = parser.parse(xml);

  const documentNode = findFirst(parsed, "w:document");
  const bodyNode = findFirst(documentNode["w:document"], "w:body");
  const bodyChildren = bodyNode["w:body"];

  const paragraphs = [];
  for (const node of bodyChildren) {
    if (Object.prototype.hasOwnProperty.call(node, "w:p")) {
      const para = parseParagraph(node, rels);
      if (para.text) paragraphs.push(para);
    }
  }

  // Title is conventionally the very first non-empty paragraph.
  const title = paragraphs.length ? paragraphs[0].text : undefined;

  const fields = {};
  const extraFields = {};
  let currentKey = null;
  let currentIsExtra = false;

  for (let i = 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.bold) {
      const normalised = normaliseHeaderKey(p.text);
      const mapped = FIELD_MAP[normalised];
      if (mapped) {
        currentKey = mapped;
        currentIsExtra = false;
        if (!fields[currentKey]) fields[currentKey] = [];
      } else {
        currentKey = p.text.replace(/:$/, "").trim();
        currentIsExtra = true;
        if (!extraFields[currentKey]) extraFields[currentKey] = [];
      }
      continue;
    }
    if (!currentKey) continue; // stray text before the first header
    const block = { text: p.text, bullet: p.bullet, links: p.links };
    if (currentIsExtra) {
      extraFields[currentKey].push(block);
    } else {
      fields[currentKey].push(block);
    }
  }

  return { title, fields, extraFields };
}

// Collapses a field's array of blocks down to a plain string when there is
// exactly one non-bullet block, otherwise keeps the block array so bullet
// lists and multi-paragraph fields aren't flattened into a single string.
function simplifyField(blocks) {
  if (!blocks || blocks.length === 0) return undefined;
  if (blocks.length === 1 && !blocks[0].bullet) {
    const b = blocks[0];
    return b.links.length ? { text: b.text, links: b.links } : b.text;
  }
  return blocks;
}

function deriveGroupId(fileName) {
  return fileName
    .replace(/\.docx$/i, "")
    .replace(/^WCP26\s*-\s*/i, "")
    .replace(/\s*-\s*Groups Index Doc$/i, "")
    .trim();
}

// Human-friendly column headings for the flattened table view, in display
// order. Anything in `extraFields` gets its own column, appended after
// these using its original (verbatim) header text.
const TABLE_COLUMNS = [
  ["groupName", "Group Name"],
  ["groupIntro", "Group Intro"],
  ["keyGroupActivities", "Key Group Activities"],
  ["additionalInfo", "Additional Info"],
  ["relevantDocsAndArticles", "Relevant Docs and Articles"],
  ["relevantLinks", "Relevant Links"],
];

// Turns a simplified field value (string | {text,links} | block[]) into a
// value the generic `<data-table>` component knows how to render: a plain
// string, or an array of strings where a `[text](url)` entry renders as a
// link. This only reshapes the same transcribed content, it doesn't alter it.
function toTableValue(value) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) {
    // { text, links }
    if (value.links.length === 1) return `[${value.text}](${value.links[0]})`;
    return value.links.length ? [value.text, ...value.links] : value.text;
  }
  const items = [];
  for (const block of value) {
    if (block.links.length === 1) {
      items.push(`[${block.text}](${block.links[0]})`);
    } else {
      if (block.text) items.push(block.text);
      items.push(...block.links);
    }
  }
  return items;
}

function toTableRow(group) {
  const row = { id: group.id };
  for (const [key, heading] of TABLE_COLUMNS) {
    const value = toTableValue(group[key]);
    if (value !== undefined) row[heading] = value;
  }
  if (group.extraFields) {
    for (const [heading, value] of Object.entries(group.extraFields)) {
      row[heading] = toTableValue(value);
    }
  }
  return row;
}

function main() {
  const files = listDocxFiles(SOURCE_DIR);
  const groups = [];

  for (const file of files) {
    const filePath = join(SOURCE_DIR, file);
    try {
      const { title, fields, extraFields } = parseDocx(filePath);

      // Drop internal working-doc links (e.g. "Notetaking Google Doc")
      // from the public output; they're not meant for external readers.
      if (fields.relevantDocsAndArticles) {
        fields.relevantDocsAndArticles = fields.relevantDocsAndArticles.filter(
          (block) => !NOTETAKING_DOC.test(block.text)
        );
      }

      const group = {
        id: deriveGroupId(file),
        title,
      };

      for (const key of new Set(Object.values(FIELD_MAP))) {
        if (EXCLUDED_KEYS.has(key)) continue;
        const simplified = simplifyField(fields[key]);
        if (simplified !== undefined) group[key] = simplified;
      }

      if (Object.keys(extraFields).length) {
        group.extraFields = {};
        for (const [key, blocks] of Object.entries(extraFields)) {
          const simplified = simplifyField(blocks);
          if (simplified !== undefined) group.extraFields[key] = simplified;
        }
      }

      groups.push(group);
      console.log(`Parsed: ${file}`);
    } catch (err) {
      console.error(`Failed to parse ${file}:`, err.message);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceDir: "wcpwriteups",
    groupCount: groups.length,
    groups,
  };

  mkdirSync(join(process.cwd(), "public"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nWrote ${groups.length} groups to ${OUTPUT_PATH}`);

  const tableRows = groups.map(toTableRow);
  writeFileSync(TABLE_OUTPUT_PATH, JSON.stringify(tableRows, null, 2), "utf-8");
  console.log(`Wrote ${tableRows.length} rows to ${TABLE_OUTPUT_PATH}`);
}

main();
