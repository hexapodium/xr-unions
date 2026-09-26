// A 4-across icon grid for browsing the WCP26 group write-ups. Content is
// supplied inline in the embedding page's `groups` attribute; no data is fetched.
//
//   <group-grid label="groups" groups="
//     ## Union networks
//     ### GMB GND
//     icon: https://example.com/gmb.svg
//     GMB's [Green New Deal](https://example.com) campaign...
//     - First activity
//     - Second activity
//     +++ Relevant docs
//     - [Some report](https://example.com/report.pdf)
//     +++ Links
//     - [Website](https://example.com)
//   "></group-grid>
//
// Markdown format (parsed by this file, no external dependencies):
//   ##  heading      starts a new *section* of the grid (groups are shown
//                    under their section heading, in the order written)
//   ### heading      starts a new *group* (one tile in the grid)
//   icon: URL        optional, first line under a ### heading — the tile's
//                    icon image (otherwise a letter-on-circle placeholder)
//   +++ heading      starts a *collapsible* block (rendered as a closed-by-
//                    default <details> dropdown) — use for "Relevant docs"
//                    and "Links" so they don't overwhelm the page
//   - item           bullet list item
//   [text](url)      inline link (works anywhere, like a Google Doc)
//   **bold** / *italic* / `code`
//   anything else    a paragraph; blank lines separate paragraphs
//
// Clicking a tile expands a full-width panel directly under its row showing
// that group's rendered Markdown; clicking again collapses it.
//
// Squarespace Code Blocks that contain a <script> render their content
// inside a same-origin iframe, which Squarespace sizes once from the
// content's height at initial load. Left alone, that means the block is
// stuck at whatever (tiny) height it happened to be when first rendered,
// and everything after is clipped.
//
// Since the iframe is same-origin, `window.frameElement` is reachable from
// inside it, so we can keep the iframe's own height in sync with the
// document's actual content height ourselves, using a ResizeObserver to
// catch every later change (search filtering the grid, a tile or dropdown
// expanding/collapsing, fonts/icons loading, etc). This is a no-op (and
// harmless) when the element isn't inside an iframe, e.g. on
// public/index.html directly.
//
// Resizing the iframe itself isn't enough on its own, though: Squarespace
// also wraps that iframe in one or more container/spacer elements sized
// (and sometimes `overflow: hidden`-clipped) to match the iframe's
// *original* tiny height. If those wrappers don't grow too, the taller
// iframe just overflows past them instead of the page reflowing to fit it.
// So alongside the iframe itself, walk up its ancestor chain in the *outer*
// document and clear any inline height/max-height/overflow constraints
// blocking it from growing in flow.
//
// Declared (and hoisted) above the class so it's safe to call from
// `connectedCallback`, which can fire synchronously during
// `customElements.define` below if a <group-grid> element is already
// present in the DOM by the time this module finishes evaluating.
let hostFrameAutosizeInstalled = false;
let hostFrameResizeObserver = null;

// Detects whether this page is currently being viewed inside the
// Squarespace *editor* (as opposed to the live, published site). The
// editor renders the page inside its own UI and manages block heights
// itself; running the iframe-resizing hack there fights the editor's
// layout engine and breaks the editing canvas, so we skip it in that
// context. On the live site (no editor chrome) the autosize still runs.
//
// Detection uses the well-established community signals:
//  - the editor UI lives under the `/config` path, so when the page is
//    framed by the editor, `window.top.location.pathname` starts with
//    `/config` (same-origin, so readable);
//  - Squarespace adds an `sqs-edit-mode` class to the <body> of the page
//    being edited (a few ms after load, so we also re-check on a delay).
function isSquarespaceEditor() {
  try {
    if (window.self !== window.top) {
      const topPath = window.top.location.pathname || "";
      if (topPath.startsWith("/config")) return true;
    }
  } catch {
    // Cross-origin parent — can't inspect; fall through to other checks.
  }
  return document.body && document.body.classList.contains("sqs-edit-mode");
}

function setUpHostFrameAutosize() {
  if (hostFrameAutosizeInstalled) return;
  hostFrameAutosizeInstalled = true;

  // Don't fight the Squarespace editor's own layout engine — it manages
  // block heights itself and our resizing breaks the editing canvas.
  if (isSquarespaceEditor()) return;
  // `sqs-edit-mode` is added a few ms after load, so re-check shortly
  // after and bail out then if we've landed in the editor after all.
  setTimeout(() => {
    if (isSquarespaceEditor()) teardownHostFrameAutosize();
  }, 500);

  const unclampAncestors = (frame) => {
    let node = frame.parentElement;
    const stopAt = frame.ownerDocument.body;
    while (node && node !== stopAt) {
      const inline = node.style;
      if (inline.height) inline.height = "auto";
      if (inline.maxHeight) inline.maxHeight = "none";
      if (getComputedStyle(node).overflow !== "visible") {
        inline.overflow = "visible";
      }
      node = node.parentElement;
    }
  };

  const resize = () => {
    if (isSquarespaceEditor()) return;
    try {
      const frame = window.frameElement;
      if (!frame) return;
      const height = document.documentElement.scrollHeight;
      if (height <= 0) return;
      frame.style.height = `${height}px`;
      frame.style.maxHeight = "none";
      frame.style.overflow = "visible";
      unclampAncestors(frame);
    } catch {
      // Cross-origin or otherwise inaccessible — nothing we can do.
    }
  };

  if ("ResizeObserver" in window) {
    hostFrameResizeObserver = new ResizeObserver(resize);
    hostFrameResizeObserver.observe(document.documentElement);
  }
  window.addEventListener("load", resize);
  setTimeout(resize, 0);
}

function teardownHostFrameAutosize() {
  if (hostFrameResizeObserver) {
    hostFrameResizeObserver.disconnect();
    hostFrameResizeObserver = null;
  }
}

// ---------------------------------------------------------------------------
// Minimal Markdown parsing (block + inline), dependency-free.
// ---------------------------------------------------------------------------

// Parses the `groups` attribute into an ordered list of sections:
//   [{ name: "Union networks", groups: [{ name, icon, blocks }] }]
// where `blocks` is the group body as block-level Markdown nodes:
//   { type: "paragraph", text } | { type: "list", items: [text] } |
//   { type: "details", heading, blocks: [...] }
// Inline formatting ([text](url), **bold**, *italic*, `code`) is kept as
// raw text in the nodes and rendered by `inlineNodes` below.
function parseGroups(markdown) {
  const sections = [];
  let section = null;
  let group = null;
  let details = null;
  let list = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const target = details ? details.blocks : group ? group.blocks : null;
    if (target) target.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const target = details ? details.blocks : group ? group.blocks : null;
    if (target) target.push(list);
    list = null;
  };
  const flushDetails = () => {
    flushList();
    flushParagraph();
    if (details && group) group.blocks.push(details);
    details = null;
  };
  const flushGroup = () => {
    flushDetails();
    if (group && section) section.groups.push(group);
    group = null;
  };
  const flushSection = () => {
    flushGroup();
    if (section) sections.push(section);
    section = null;
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const detailsStart = line.match(/^\+\+\+\s*(.*)$/);
    const icon = line.match(/^icon:\s*(\S+)\s*$/i);
    const bullet = line.match(/^[-*]\s+(.+)$/);

    if (h3) {
      flushGroup();
      if (!section) {
        // Groups written before any ## heading land in an untitled section.
        section = { name: "", groups: [] };
      }
      group = { name: h3[1].trim(), icon: null, blocks: [] };
    } else if (h2) {
      flushSection();
      section = { name: h2[1].trim(), groups: [] };
    } else if (detailsStart) {
      flushDetails();
      if (group) details = { type: "details", heading: detailsStart[1].trim(), blocks: [] };
    } else if (icon && group && !details && !group.blocks.length && !paragraph.length && !list) {
      group.icon = icon[1];
    } else if (bullet) {
      flushParagraph();
      if (!list) list = { type: "list", items: [] };
      list.items.push(bullet[1]);
    } else if (line === "") {
      flushList();
      flushParagraph();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushSection();
  return sections;
}

// Renders inline Markdown (`[text](url)`, bare URLs, **bold**, *italic*,
// `code`) in a string to an array of DOM nodes. Links open in a new tab.
function inlineNodes(text) {
  const nodes = [];
  // Order matters: links first, then code/bold/italic.
  const pattern =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    const [, linkText, linkHref, bareUrl, code, bold, italic] = match;
    if (linkHref) {
      nodes.push(makeLink(linkText, linkHref));
    } else if (bareUrl) {
      // Strip trailing punctuation that's almost certainly not part of the URL.
      const cleaned = bareUrl.replace(/[.,;:!?]+$/, "");
      nodes.push(makeLink(cleaned, cleaned));
      if (cleaned.length < bareUrl.length) {
        nodes.push(document.createTextNode(bareUrl.slice(cleaned.length)));
      }
    } else if (code) {
      const el = document.createElement("code");
      el.textContent = code;
      nodes.push(el);
    } else if (bold) {
      const el = document.createElement("strong");
      el.append(...inlineNodes(bold));
      nodes.push(el);
    } else if (italic) {
      const el = document.createElement("em");
      el.append(...inlineNodes(italic));
      nodes.push(el);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

function makeLink(text, href) {
  const a = document.createElement("a");
  a.textContent = text;
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer";
  return a;
}

// ---------------------------------------------------------------------------
// <group-grid>
// ---------------------------------------------------------------------------

class GroupGrid extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute("label") || "groups";
    const markdown = this.getAttribute("groups") || "";
    this.sections = parseGroups(markdown);
    this.totalGroups = this.sections.reduce((n, s) => n + s.groups.length, 0);
    setUpHostFrameAutosize();

    if (!this.totalGroups) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent =
        "No groups defined. Add them to the `groups` attribute of the <group-grid> tag (### per group).";
      this.replaceChildren(message);
      return;
    }
    this.render(label);
  }

  render(label) {
    this.innerHTML = `
      <label class="filter">
        <span>Filter ${label}</span>
        <input type="search" placeholder="Search all groups">
      </label>
      <div class="group-sections"></div>
      <p class="empty" hidden>No matching groups.</p>
      <p class="count"></p>
    `;

    const input = this.querySelector("input");
    input.addEventListener("input", () => this.renderTiles(input.value));
    this.renderTiles("");
  }

  renderTiles(query) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const container = this.querySelector(".group-sections");
    container.replaceChildren();
    let shown = 0;

    for (const section of this.sections) {
      const matches = section.groups.filter((group) => {
        const searchable = [
          section.name,
          group.name,
          ...group.blocks.map(blockText),
        ].join(" ").toLocaleLowerCase();
        return words.every((word) => searchable.includes(word));
      });
      if (!matches.length) continue;
      shown += matches.length;

      const wrapper = document.createElement("section");
      wrapper.className = "group-section";
      if (section.name) {
        const h2 = document.createElement("h2");
        h2.className = "group-section-heading";
        h2.textContent = section.name;
        wrapper.append(h2);
      }
      const grid = document.createElement("div");
      grid.className = "group-grid";
      for (const group of matches) grid.append(...this.tileGroup(group));
      wrapper.append(grid);
      container.append(wrapper);
    }

    this.querySelector(".empty").hidden = shown > 0;
    this.querySelector(".count").textContent =
      `Showing ${shown} of ${this.totalGroups} groups.`;
  }

  // Returns [tile, detail] — the tile is always a grid item; the detail
  // panel sits right after it in document order but stays `hidden` (so it
  // doesn't occupy grid space) until the tile is activated, at which point
  // it spans the full grid width on its own row.
  tileGroup(group) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "group-tile";

    if (group.icon) {
      const img = document.createElement("img");
      img.src = group.icon;
      img.alt = "";
      img.className = "group-icon";
      tile.append(img);
    } else {
      const circle = document.createElement("span");
      circle.className = "group-icon group-icon--placeholder";
      circle.textContent = group.name.trim().charAt(0).toUpperCase() || "?";
      tile.append(circle);
    }

    const caption = document.createElement("span");
    caption.className = "group-name";
    caption.textContent = group.name;
    tile.append(caption);

    const detail = this.detailPanel(group);
    detail.hidden = true;

    tile.setAttribute("aria-expanded", "false");
    tile.addEventListener("click", () => {
      const expanding = detail.hidden;
      detail.hidden = !expanding;
      tile.classList.toggle("is-open", expanding);
      tile.setAttribute("aria-expanded", String(expanding));
    });

    return [tile, detail];
  }

  detailPanel(group) {
    const panel = document.createElement("div");
    panel.className = "group-detail";

    const header = document.createElement("h3");
    header.textContent = group.name;
    panel.append(header);

    for (const block of group.blocks) panel.append(this.blockElement(block));
    return panel;
  }

  blockElement(block) {
    if (block.type === "list") {
      const ul = document.createElement("ul");
      for (const item of block.items) {
        const li = document.createElement("li");
        li.append(...inlineNodes(item));
        ul.append(li);
      }
      return ul;
    }
    if (block.type === "details") {
      // Collapsible dropdown, closed by default — used for "Relevant docs"
      // and "Links" so that info is available but not overwhelming.
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = block.heading || "More";
      details.append(summary);
      for (const child of block.blocks) details.append(this.blockElement(child));
      return details;
    }
    const p = document.createElement("p");
    p.append(...inlineNodes(block.text));
    return p;
  }
}

// Plain-text version of a block, for search matching.
function blockText(block) {
  if (block.type === "list") return block.items.join(" ");
  if (block.type === "details") {
    return `${block.heading} ${block.blocks.map(blockText).join(" ")}`;
  }
  return block.text;
}

const style = document.createElement("style");
style.textContent = `
group-grid {
  display: block;
  container-type: inline-size;
  color: #202122;
  font: 16px/1.55 system-ui, sans-serif;
}
group-grid *, group-grid *::before, group-grid *::after { box-sizing: border-box; }
group-grid .filter {
  display: grid;
  gap: .35rem;
  max-width: 32rem;
  margin: 0 0 1rem;
  font-weight: 600;
}
group-grid input {
  padding: .65rem .75rem;
  border: 1px solid #c3c8ce;
  border-radius: 6px;
  font: inherit;
  background: white;
}
group-grid input:focus { outline: 2px solid #36c; outline-offset: 1px; }
group-grid .count { margin-top: .5rem; color: #54595d; font-size: .85rem; }
group-grid .empty { color: #54595d; }
group-grid .error { color: #b32424; }
group-grid a { color: #36c; }
group-grid .group-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}
group-grid .group-tile {
  display: grid;
  justify-items: center;
  gap: .5rem;
  padding: 1rem .5rem;
  border: 1px solid #d5d9de;
  border-radius: 10px;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
group-grid .group-tile:hover { background: #eef4ff; }
group-grid .group-tile:focus-visible { outline: 2px solid #36c; outline-offset: 2px; }
group-grid .group-tile.is-open { border-color: #36c; background: #eef4ff; }
group-grid .group-icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 20%;
  object-fit: contain;
}
group-grid .group-icon--placeholder {
  display: grid;
  place-items: center;
  background: #36c;
  color: white;
  font: 700 1.4rem Georgia, serif;
}
group-grid .group-name {
  font-size: .85rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.3;
}
group-grid .group-detail {
  grid-column: 1 / -1;
  background: white;
  border: 1px solid #d5d9de;
  border-top: 3px solid #36c;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
}
group-grid .group-detail h3 {
  margin: 0 0 .75rem;
  font: 1.3rem Georgia, serif;
  color: #202122;
}
group-grid .group-detail p { margin: 0; font-size: .95rem; }
group-grid .group-detail p + p { margin-top: .5rem; }
group-grid .group-detail ul { margin: 0; padding-left: 1.2rem; }
group-grid .group-section { margin-top: 2rem; }
group-grid .group-section:first-child { margin-top: 0; }
group-grid .group-section-heading {
  margin: 0 0 1rem;
  border-bottom: 1px solid #a2a9b1;
  font: 1.4rem Georgia, serif;
}
group-grid .group-detail details {
  margin-top: .75rem;
  border: 1px solid #e2e5e9;
  border-radius: 6px;
  background: #f8f9fb;
  padding: .5rem .75rem;
}
group-grid .group-detail details[open] { padding-bottom: .75rem; }
group-grid .group-detail summary {
  cursor: pointer;
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: #54595d;
}
group-grid .group-detail details > *:not(summary) { margin-top: .5rem; }
@container (max-width: 720px) {
  group-grid .group-grid { grid-template-columns: repeat(3, 1fr); }
}
@container (max-width: 520px) {
  group-grid .group-grid { grid-template-columns: repeat(2, 1fr); }
}
@container (max-width: 320px) {
  group-grid .group-grid { grid-template-columns: 1fr; }
}
`;
document.head.append(style);
customElements.define("group-grid", GroupGrid);
