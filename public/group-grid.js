// A 4-across icon grid for browsing the cached "groups" (WCP26 write-up)
// records, in place of the generic <data-table> row layout. Each tile is
// either an icon image (looked up in the `icons` map below, keyed by the
// record's `id`) or a placeholder letter-on-circle built from the group's
// name. Clicking a tile expands a full-width summary panel directly under
// its row, showing only the handful of headers editors actually want
// readers to see; every other Airtable column is dropped from the
// rendered view.
const MARKDOWN_LINK = /^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/;
const URL_LIKE = /^https?:\/\//i;

// Manually maintained: map a record's `id` (the short group code used in
// groups-table.json, e.g. "FoE", "TUCAN") to an icon file cached under
// public/icons/. Groups with no entry here fall back to a placeholder
// circle showing the group's first initial. Add entries as icons are
// sourced/cropped into public/icons/.
const ICONS = {
  // "FoE": "icons/foe.svg",
};

// Ordered list of sections to render in the expanded summary, each a
// [heading, sourceColumn] pair. Anything not listed here is never shown.
const SUMMARY_SECTIONS = [
  ["Group intro", "Group Intro"],
  ["Key group activities", "Key Group Activities"],
  ["Additional info", "Additional Info"],
  ["Relevant docs", "Relevant Docs and Articles"],
  ["Relevant links", "Relevant Links"],
];

class GroupGrid extends HTMLElement {
  async connectedCallback() {
    const src = this.getAttribute("src");
    const label = this.getAttribute("label") || src;
    this.nameColumn = this.getAttribute("name-column") || "Group Name";
    this.icons = this.parseIcons();
    this.innerHTML = `<p class="status">Loading ${label}…</p>`;
    setUpHostFrameAutosize();

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      this.records = await response.json();
      this.render(label);
    } catch (error) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = `Could not load ${label}: ${error.message}`;
      this.replaceChildren(message);
    }
  }

  // Reads an optional `icons` attribute — a JSON object mapping a record's
  // `id` to an icon path — letting a snippet override/extend the
  // manually-maintained ICONS map above without editing this file.
  parseIcons() {
    const raw = this.getAttribute("icons");
    const merged = { ...ICONS };
    if (!raw) return merged;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") Object.assign(merged, parsed);
    } catch {
      console.warn(`<group-grid>: could not parse icons attribute: ${raw}`);
    }
    return merged;
  }

  render(label) {
    this.innerHTML = `
      <div class="group-grid"></div>
      <label class="filter">
        <span>Filter ${label}</span>
        <input type="search" placeholder="Search all fields">
      </label>
      <p class="empty" hidden>No matching groups.</p>
      <p class="count"></p>
    `;

    const input = this.querySelector("input");
    input.addEventListener("input", () => this.renderTiles(input.value));
    this.renderTiles("");
  }

  renderTiles(query) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = this.records.filter((record) => {
      const searchable = Object.values(record).flat(Infinity).join(" ").toLocaleLowerCase();
      return words.every((word) => searchable.includes(word));
    });

    const grid = this.querySelector(".group-grid");
    grid.replaceChildren(...rows.flatMap((record) => this.tileGroup(record)));
    this.querySelector(".empty").hidden = rows.length > 0;
    this.querySelector(".count").textContent =
      `Showing ${rows.length} of ${this.records.length} groups.`;
  }

  // Returns [tile, detail] — the tile is always a grid item; the detail
  // panel sits right after it in document order but stays `hidden` (so it
  // doesn't occupy grid space) until the tile is activated, at which point
  // it spans the full grid width on its own row.
  tileGroup(record) {
    const name = String(record[this.nameColumn] ?? "");
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "group-tile";

    const icon = this.icons[record.id];
    if (icon) {
      const img = document.createElement("img");
      img.src = icon;
      img.alt = "";
      img.className = "group-icon";
      tile.append(img);
    } else {
      const circle = document.createElement("span");
      circle.className = "group-icon group-icon--placeholder";
      circle.textContent = name.trim().charAt(0).toUpperCase() || "?";
      tile.append(circle);
    }

    const caption = document.createElement("span");
    caption.className = "group-name";
    caption.textContent = name;
    tile.append(caption);

    const detail = this.detailPanel(record, name);
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

  detailPanel(record, name) {
    const panel = document.createElement("div");
    panel.className = "group-detail";

    const header = document.createElement("h3");
    header.textContent = name;
    panel.append(header);

    for (const [heading, column] of SUMMARY_SECTIONS) {
      const value = record[column];
      if (value === undefined || value === null || value === "") continue;
      const section = document.createElement("section");
      const h4 = document.createElement("h4");
      h4.textContent = heading;
      section.append(h4);
      section.append(this.field(value));
      panel.append(section);
    }

    return panel;
  }

  field(value) {
    if (Array.isArray(value)) {
      const ul = document.createElement("ul");
      for (const item of value) ul.append(this.listItem(item));
      return ul;
    }
    const p = document.createElement("p");
    const text = String(value);
    if (URL_LIKE.test(text)) {
      p.append(this.link(text, text));
    } else {
      p.textContent = text;
    }
    return p;
  }

  listItem(item) {
    const li = document.createElement("li");
    const text = String(item);
    const match = text.match(MARKDOWN_LINK);
    if (match) {
      li.append(this.link(match[1], match[2]));
    } else if (URL_LIKE.test(text)) {
      li.append(this.link(text, text));
    } else {
      li.textContent = text;
    }
    return li;
  }

  link(text, href) {
    const a = document.createElement("a");
    a.textContent = text;
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer";
    return a;
  }
}

customElements.define("group-grid", GroupGrid);

// Squarespace Code Blocks that contain a <script> render their content
// inside a same-origin iframe, which Squarespace sizes once from the
// content's height at initial load — before this element's async fetch
// has populated any tiles. Left alone, that means the block is stuck at
// whatever (tiny) height it happened to be when "Loading groups…" was the
// only content, and everything rendered after is clipped.
//
// Since the iframe is same-origin, `window.frameElement` is reachable from
// inside it, so we can keep the iframe's own height in sync with the
// document's actual content height ourselves, using a ResizeObserver to
// catch every later change (records loading in, search filtering the
// grid, a tile expanding/collapsing, fonts/icons loading, etc). This is a
// no-op (and harmless) when the element isn't inside an iframe, e.g. on
// public/index.html directly.
let hostFrameAutosizeInstalled = false;
function setUpHostFrameAutosize() {
  if (hostFrameAutosizeInstalled) return;
  hostFrameAutosizeInstalled = true;

  const resize = () => {
    try {
      const frame = window.frameElement;
      if (!frame) return;
      const height = document.documentElement.scrollHeight;
      if (height > 0) frame.style.height = `${height}px`;
    } catch {
      // Cross-origin or otherwise inaccessible — nothing we can do.
    }
  };

  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(document.documentElement);
  }
  window.addEventListener("load", resize);
  setTimeout(resize, 0);
}

