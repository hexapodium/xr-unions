#!/usr/bin/env node
// Builds a *self-contained* Squarespace Code Block snippet.
//
// The normal snippet (squarespace/group-grid-snippet.html) loads the custom
// element over the network:
//
//   <script type="module" src="https://hexapodium.github.io/xr-unions/group-grid.js">
//
// which means the grid silently renders nothing whenever GitHub Pages is
// down, unpublished, or the repo moves. This build inlines group-grid.js
// directly into the snippet so the block has no repo dependency at all:
// paste it once and it keeps working regardless of what happens to the repo.
//
// Group icons are deliberately *not* inlined — they're large binaries, and
// group-grid.js now falls back to a letter-on-circle placeholder whenever an
// icon fails to load, so a dead icon URL degrades gracefully instead of
// breaking the tile.
//
// Usage:
//   node scripts/build-inline-snippet.js
//   node scripts/build-inline-snippet.js --check   # verify it's up to date
//
// Content source: a root `groups.md` wins if present (it's the hand-edited
// working copy produced by the docx parser), otherwise the Markdown already
// embedded in squarespace/group-grid-snippet.html is reused.
//
// Reads:  public/group-grid.js, groups.md (optional),
//         squarespace/group-grid-snippet.html
// Writes: squarespace/group-grid-inline.html

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENT = path.join(root, "public", "group-grid.js");
const SOURCE_SNIPPET = path.join(root, "squarespace", "group-grid-snippet.html");
const GROUPS_MARKDOWN = path.join(root, "groups.md");
const OUTPUT_SNIPPET = path.join(root, "squarespace", "group-grid-inline.html");

// Pulls the `groups="..."` attribute (the authored Markdown) out of a
// snippet. The attribute value is HTML-escaped in that file and stays
// escaped here — it's copied verbatim into the same kind of attribute.
//
// The *last* match is used rather than the first: the generated snippet
// inlines group-grid.js, whose header comment documents the format with a
// miniature `<group-grid groups="...">` example. That example would
// otherwise win, so anything re-reading a built snippet (the `--check`
// mode, the tests) would see two example groups instead of the real ones.
function lastMatch(html, pattern) {
  let found = null;
  for (const match of html.matchAll(pattern)) found = match;
  return found;
}

export function extractGroupsAttribute(html) {
  const match = lastMatch(html, /<group-grid\b[^>]*\bgroups="([\s\S]*?)"\s*>/g);
  if (!match) throw new Error("No <group-grid groups=\"...\"> found in the snippet.");
  return match[1];
}

export function extractLabelAttribute(html) {
  return lastMatch(html, /<group-grid\b[^>]*\blabel="([^"]*)"/g)?.[1] ?? "groups";
}

// ---------------------------------------------------------------------------
// Raw Markdown (groups.md) -> attribute value
// ---------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

export function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ENTITIES[name]);
}

// groups.md is *raw* Markdown, so it contains characters that are not legal
// (or not safe) inside a double-quoted HTML attribute — notably literal `"`
// and `&`. Escaping them means the authored text no longer has to avoid
// double quotes, and the browser hands the original characters back to
// `getAttribute("groups")` unchanged.
export function escapeForAttribute(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The generated groups.md opens with an HTML comment banner explaining where
// it came from; that's editorial, not content, so drop it. Built via RegExp
// so the comment delimiters don't appear literally in this file either.
const LEADING_HTML_COMMENT = new RegExp(`^\\s*<!${"--"}[\\s\\S]*?${"--"}>\\s*`);

export function stripLeadingHtmlComment(markdown) {
  return markdown.replace(LEADING_HTML_COMMENT, "");
}

// Maps `### Group name` -> icon URL for every group that declares one.
export function iconsFromMarkdown(markdown) {
  const icons = new Map();
  let current = null;
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      current = heading[1].trim();
      continue;
    }
    const icon = line.match(/^icon:\s*(\S+)\s*$/i);
    if (icon && current && !icons.has(current)) icons.set(current, icon[1]);
  }
  return icons;
}

// groups.md is produced from the source documents and carries no `icon:`
// lines, but the hand-edited snippet does. Re-attach those icons by group
// name so regenerating from groups.md never silently drops them. Groups
// that already declare an icon are left alone.
export function applyIcons(markdown, icons) {
  const out = [];
  for (const rawLine of markdown.split("\n")) {
    out.push(rawLine);
    const heading = rawLine.trim().match(/^###\s+(.+)$/);
    if (!heading) continue;
    const icon = icons.get(heading[1].trim());
    if (icon) out.push(`icon: ${icon}`);
  }
  return out.join("\n");
}

// Chooses the content for the snippet: a root groups.md if present (raw
// Markdown, escaped here), otherwise the Markdown already embedded in the
// hand-edited snippet (already escaped, reused verbatim).
export function resolveGroupsAttribute({ groupsMarkdown, sourceSnippet }) {
  if (groupsMarkdown === null) {
    return { groups: extractGroupsAttribute(sourceSnippet), origin: "group-grid-snippet.html" };
  }
  const icons = iconsFromMarkdown(decodeEntities(extractGroupsAttribute(sourceSnippet)));
  const markdown = applyIcons(stripLeadingHtmlComment(groupsMarkdown), icons).trim();
  return { groups: `\n${escapeForAttribute(markdown)}\n`, origin: "groups.md", icons: icons.size };
}

// group-grid.js is written as an ES module, but it has no imports/exports
// that matter at runtime (it only defines a custom element and appends a
// <style>). Stripping the `export` keywords lets it run as a *classic*
// inline <script>, which is important because Squarespace Code Blocks can
// only inline script text — there's no module URL to point at.
export function toClassicScript(source) {
  return source.replace(/^export\s+(?=(async\s+)?(function|class|const|let|var)\b)/gm, "");
}

// Inside <script>, the HTML parser ends the element at the first literal
// "</script" (case-insensitive) regardless of JS syntax, so any such
// sequence in the code must be broken up. Likewise "<!--" can start a
// legacy comment and swallow code. Neither appears in group-grid.js today,
// but guard anyway so future edits can't silently truncate the snippet.
export function escapeForScriptElement(js) {
  return js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

export function buildSnippet({ component, label, groups }) {
  return `<!-- Self-contained group grid for a Squarespace Code Block.
     GENERATED by scripts/build-inline-snippet.js — do not hand-edit.
     Edit public/group-grid.js or squarespace/group-grid-snippet.html,
     then re-run: npm run build:inline

     This snippet has no external dependencies: the component is inlined
     below, so it keeps working even if the repo or GitHub Pages goes away.
     Group icons are still remote URLs; any that fail to load fall back to
     a letter placeholder automatically. -->
<script>
${escapeForScriptElement(toClassicScript(component)).trimEnd()}
</script>
<group-grid label="${label}" groups="${groups}"></group-grid>
`;
}

async function main() {
  const [component, sourceSnippet, groupsMarkdown] = await Promise.all([
    readFile(COMPONENT, "utf8"),
    readFile(SOURCE_SNIPPET, "utf8"),
    readFile(GROUPS_MARKDOWN, "utf8").catch(() => null),
  ]);

  const { groups, origin, icons } = resolveGroupsAttribute({ groupsMarkdown, sourceSnippet });

  const snippet = buildSnippet({
    component,
    label: extractLabelAttribute(sourceSnippet),
    groups,
  });

  const relative = path.relative(root, OUTPUT_SNIPPET);

  if (process.argv.includes("--check")) {
    const existing = await readFile(OUTPUT_SNIPPET, "utf8").catch(() => null);
    if (existing !== snippet) {
      console.error(`${relative} is out of date. Run: npm run build:inline`);
      process.exitCode = 1;
      return;
    }
    console.log(`${relative} is up to date.`);
    return;
  }

  await writeFile(OUTPUT_SNIPPET, snippet);
  const kb = (Buffer.byteLength(snippet) / 1024).toFixed(1);
  const groupCount = (groups.match(/^### /gm) ?? []).length;
  console.log(
    `Wrote ${relative} (${kb} kB, ${groupCount} groups from ${origin}` +
      `${icons === undefined ? "" : `, ${icons} icons carried over`}` +
      `, no external script dependency).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
