// Temporary round-trip check: parse public/groups.md with the real
// parseGroups from public/group-grid.js and report what comes out.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/group-grid.js", import.meta.url), "utf8");
const grab = (name) => {
  const s = src.indexOf(`function ${name}`);
  // Match the closing brace at the start of a line (CRLF-aware).
  const rest = src.slice(s);
  const m = rest.match(/\r?\n\}\r?\n/);
  return rest.slice(0, m.index + m[0].length);
};
const parseGroups = new Function(`${grab("parseGroups")}; return parseGroups;`)();
const blockText = new Function(`${grab("blockText")}; return blockText;`)();

let md = readFileSync(new URL("../public/groups.md", import.meta.url), "utf8");
md = md.replace(/^<!--[\s\S]*?-->\s*/, "");

const sections = parseGroups(md);
const groups = sections.flatMap((s) => s.groups);
console.log("sections:", sections.length);
for (const s of sections) console.log(`  ${s.name || "(untitled)"}: ${s.groups.length} groups`);
console.log("total groups:", groups.length);

let noBlocks = 0, dropdowns = 0;
for (const g of groups) {
  if (!g.blocks.length) { noBlocks++; console.log("  EMPTY:", g.name); }
  dropdowns += g.blocks.filter((b) => b.type === "details").length;
}
console.log("groups with no content blocks:", noBlocks);
console.log("total +++ dropdowns:", dropdowns);
