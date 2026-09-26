import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../public/group-grid.js", import.meta.url), "utf8");
const start = source.indexOf("function parseGroups(");
const closing = /\r?\n\}\r?\n/g;
closing.lastIndex = start;
const end = closing.exec(source);
assert.ok(start >= 0 && end);
const parseGroups = new Function(`${source.slice(start, end.index + end[0].length)}; return parseGroups;`)();

test("embedded Markdown renders sections, icons, lists, and dropdowns", () => {
  const snippet = readFileSync(new URL("../squarespace/group-grid-snippet.html", import.meta.url), "utf8");
  const markdown = snippet.match(/<group-grid[^>]*\bgroups="([\s\S]*?)"/)?.[1];
  assert.ok(markdown, "Squarespace snippet needs inline Markdown");
  const sections = parseGroups(markdown);
  const groups = sections.flatMap((section) => section.groups);
  assert.equal(sections.length, 4);
  assert.equal(groups.length, 29);
  assert.ok(groups.every((group) => group.blocks.length));
  assert.ok(groups.some((group) => group.icon?.endsWith("/icons/PCS.jpg")));
  assert.ok(groups.some((group) => group.blocks.some((block) => block.type === "details")));
  assert.ok(groups.some((group) => group.blocks.some((block) => block.type === "list")));
});

test("only grid assets and preview are published", () => {
  const files = readdirSync(new URL("../public/", import.meta.url)).sort();
  assert.deepEqual(files, ["group-grid.js", "icons", "index.html"]);
});
