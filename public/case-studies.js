// <case-study-browser> — searchable, filterable table over the JSON produced by
// scripts/dump-case-studies.js. Self-contained custom element (Shadow DOM), so it
// is safe to drop into a Squarespace Code Block.
//
// Usage:
//   <script type="module" src="https://hexapodium.github.io/xr-unions/case-studies.js"></script>
//   <case-study-browser
//     src="https://hexapodium.github.io/xr-unions/data/case-studies.json"
//     columns="Name,Date of case study,Tags,Quotes from articles"
//     tag-field="Tags"
//     sort="Name"
//   ></case-study-browser>
//
// Attributes (all optional, all observed — change them at runtime and it updates):
//   src        URL of the JSON dump.
//   columns    Comma-separated field names to show, in order.
//   tag-field  Multi-select field used for the tag cloud (default "Tags").
//   sort       Field to sort by initially; prefix with "-" for descending.
//   no-picker  Hide the on-page column picker.
//
// Runtime: the "Columns" panel lets visitors show/hide and reorder columns;
// the choice is kept in localStorage. JS API: el.columns = [...], el.columns.

const DEFAULT_SRC = "https://hexapodium.github.io/xr-unions/data/case-studies.json";
const HIDDEN_BY_DEFAULT = new Set(["multipleRecordLinks"]);
const MAX_TAGS = 6; // tags shown per row before collapsing into a "+(n)" button

const STYLE = `
:host { display:block; font:15px/1.45 system-ui,sans-serif; color:#222; }
* { box-sizing:border-box; }
.bar { display:flex; flex-wrap:wrap; gap:.75rem; align-items:center; margin-bottom:.75rem; }
input[type=search] { flex:1 1 16rem; padding:.55rem .75rem; border:1px solid #999; border-radius:6px; font:inherit; }
button { font:inherit; cursor:pointer; border:1px solid #999; background:#fff; border-radius:6px; padding:.3rem .7rem; }
button:hover { background:#f0f0f0; }
.count { color:#555; }
details.cols { margin-bottom:.75rem; border:1px solid #ccc; border-radius:6px; padding:.4rem .75rem; }
details.cols summary { cursor:pointer; font-weight:600; }
.collist { list-style:none; margin:.5rem 0 0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(15rem,1fr)); gap:.25rem .75rem; }
.collist li { display:flex; align-items:center; gap:.35rem; }
.collist label { flex:1; }
.collist button { padding:0 .4rem; line-height:1.4; }
.cloud { display:flex; flex-wrap:wrap; gap:.3rem .4rem; align-items:baseline; margin-bottom:1rem; }
.cloudgroups { display:flex; flex-wrap:wrap; gap:.3rem; margin-bottom:.5rem; }
.tag { font:inherit; font-size:.85rem; line-height:1.4; border:1px solid #bbb; border-radius:999px; padding:.1rem .6rem; background:#f6f6f6; cursor:pointer; white-space:nowrap; }
.tag small { color:#666; margin-left:.25rem; }
.tag.on { background:#1d6b3a; border-color:#1d6b3a; color:#fff; }
.tag.on small { color:#cfe8d8; }
.groupbtn.on { background:#222; color:#fff; }
.wrap { overflow-x:auto; border:1px solid #ddd; border-radius:6px; }
table { border-collapse:collapse; width:100%; }
th, td { text-align:left; vertical-align:top; padding:.5rem .6rem; border-bottom:1px solid #eee; min-width:7rem; }
th { position:sticky; top:0; background:#fafafa; cursor:pointer; user-select:none; white-space:nowrap; }
tr:hover td { background:#fcfcf4; }
td .clamp { max-height:6.5em; overflow:hidden; white-space:pre-wrap; cursor:zoom-in; }
td .clamp.open { max-height:none; cursor:zoom-out; }
td .chips { display:flex; flex-wrap:wrap; gap:.2rem; }
mark { background:#ffe58a; }
.empty, .status { padding:1rem; color:#555; }
`;

const trim = (s) => String(s).trim();

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

// Plain-text version of a cell value, for searching and sorting.
function textOf(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (typeof value === "object") return value.value != null ? textOf(value.value) : value.name ?? "";
  return String(value);
}

// Squarespace renders Code Blocks with scripts inside a same-origin iframe
// sized once at load. Keep the iframe (and its clamping ancestors) as tall as
// the content so expanding the tag browser doesn't get cut off.
// Skipped inside the Squarespace editor, which manages block heights itself.
let frameAutosizeInstalled = false;
function isSquarespaceEditor() {
  try {
    if (window.self !== window.top && (window.top.location.pathname || "").startsWith("/config")) return true;
  } catch {}
  return !!document.body?.classList.contains("sqs-edit-mode");
}
function setUpFrameAutosize() {
  if (frameAutosizeInstalled) return;
  frameAutosizeInstalled = true;
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
      let node = frame.parentElement;
      while (node && node !== frame.ownerDocument.body) {
        if (node.style.height) node.style.height = "auto";
        if (node.style.maxHeight) node.style.maxHeight = "none";
        if (getComputedStyle(node).overflow !== "visible") node.style.overflow = "visible";
        node = node.parentElement;
      }
    } catch {}
  };
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(document.documentElement);
  window.addEventListener("load", resize);
  setTimeout(resize, 0);
}

class CaseStudyBrowser extends HTMLElement {
  static observedAttributes = ["src", "columns", "tag-field", "sort", "no-picker"];

  #data = null;
  #columns = [];
  #query = "";
  #tags = new Set();
  #group = "";
  #sort = { field: null, dir: 1 };
  #rows = [];
  #loadedSrc = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    setUpFrameAutosize();
    this.#load();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === "src") this.#load();
    else {
      if (name === "columns") this.#columns = this.#initialColumns();
      if (name === "sort") this.#sort = this.#initialSort();
      this.#render();
    }
  }

  get columns() {
    return [...this.#columns];
  }
  set columns(list) {
    this.#columns = list.filter((c) => this.#fieldNames().includes(c));
    this.#saveColumns();
    this.#render();
  }

  get #tagField() {
    return this.getAttribute("tag-field") || "Tags";
  }
  #fieldNames() {
    return this.#data ? this.#data.fields.map((f) => f.name) : [];
  }
  #field(name) {
    return this.#data.fields.find((f) => f.name === name);
  }
  get #storageKey() {
    return `case-study-browser:columns:${this.getAttribute("src") || DEFAULT_SRC}`;
  }

  async #load() {
    const src = this.getAttribute("src") || DEFAULT_SRC;
    if (src === this.#loadedSrc) return;
    this.#loadedSrc = src;
    this.shadowRoot.replaceChildren(h("style", {}, STYLE), h("div", { class: "status" }, "Loading…"));
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      this.#data = await res.json();
    } catch (err) {
      this.shadowRoot.replaceChildren(
        h("style", {}, STYLE),
        h("div", { class: "status" }, `Could not load case studies (${err.message}).`),
      );
      return;
    }
    this.#rows = this.#data.records.map((r) => ({
      record: r,
      hay: Object.values(r.fields).map(textOf).join("\n").toLowerCase(),
    }));
    this.#columns = this.#initialColumns();
    this.#sort = this.#initialSort();
    this.#render();
  }

  #initialColumns() {
    const names = this.#fieldNames();
    const attr = this.getAttribute("columns");
    if (attr) return attr.split(",").map(trim).filter((c) => names.includes(c));
    try {
      const saved = JSON.parse(localStorage.getItem(this.#storageKey) || "null");
      if (Array.isArray(saved)) return saved.filter((c) => names.includes(c));
    } catch {}
    return this.#data.fields.filter((f) => !HIDDEN_BY_DEFAULT.has(f.type)).slice(0, 5).map((f) => f.name);
  }

  #initialSort() {
    const s = trim(this.getAttribute("sort") || "");
    if (!s) return { field: null, dir: 1 };
    return s.startsWith("-") ? { field: s.slice(1), dir: -1 } : { field: s, dir: 1 };
  }

  #saveColumns() {
    try {
      localStorage.setItem(this.#storageKey, JSON.stringify(this.#columns));
    } catch {}
  }

  #tagsOf(record) {
    const v = record.fields[this.#tagField];
    return Array.isArray(v) ? v.map(trim) : [];
  }

  #filtered(ignoreTags = false) {
    const terms = this.#query.toLowerCase().split(/\s+/).filter(Boolean);
    let rows = this.#rows.filter(({ record, hay }) => {
      if (!terms.every((t) => hay.includes(t))) return false;
      if (ignoreTags || !this.#tags.size) return true;
      const own = new Set(this.#tagsOf(record));
      return [...this.#tags].every((t) => own.has(t));
    });
    const { field, dir } = this.#sort;
    if (field && !ignoreTags) {
      const numeric = ["number", "autoNumber"].includes(this.#field(field)?.type);
      rows = [...rows].sort((a, b) => {
        const av = a.record.fields[field];
        const bv = b.record.fields[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return dir * (numeric ? av - bv : textOf(av).localeCompare(textOf(bv), undefined, { numeric: true }));
      });
    }
    return rows;
  }

  #render() {
    if (!this.#data) return;
    const root = this.shadowRoot;
    // Keep the search box (and focus) alive across re-renders.
    const hadFocus = root.activeElement?.matches?.("input[type=search]");
    const rows = this.#filtered();
    root.replaceChildren(
      ...[
        h("style", {}, STYLE),
        this.#renderBar(rows.length),
        this.hasAttribute("no-picker") ? null : this.#renderPicker(),
        this.#renderCloud(),
        this.#renderTable(rows),
      ].filter(Boolean),
    );
    if (hadFocus) {
      const input = root.querySelector("input[type=search]");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  #renderBar(count) {
    return h(
      "div",
      { class: "bar" },
      h("input", {
        type: "search",
        placeholder: "Search case studies…",
        value: this.#query,
        "aria-label": "Search case studies",
        oninput: (e) => {
          this.#query = e.target.value;
          this.#render();
        },
      }),
      h("span", { class: "count" }, `${count} of ${this.#rows.length}`),
      this.#tags.size || this.#query
        ? h(
            "button",
            {
              onclick: () => {
                this.#tags.clear();
                this.#query = "";
                this.#render();
              },
            },
            "Clear filters",
          )
        : null,
    );
  }

  #renderPicker() {
    const names = this.#fieldNames();
    const hidden = names.filter((n) => !this.#columns.includes(n));
    const move = (name, delta) => {
      const i = this.#columns.indexOf(name);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= this.#columns.length) return;
      [this.#columns[i], this.#columns[j]] = [this.#columns[j], this.#columns[i]];
      this.#saveColumns();
      this.#render();
    };
    const toggle = (name, on) => {
      this.#columns = on ? [...this.#columns, name] : this.#columns.filter((c) => c !== name);
      this.#saveColumns();
      this.#render();
    };
    const item = (name, on) =>
      h(
        "li",
        {},
        h("label", {}, h("input", { type: "checkbox", checked: on, onchange: (e) => toggle(name, e.target.checked) }), " ", name),
        on ? h("button", { title: "Move left", "aria-label": `Move ${name} left`, onclick: () => move(name, -1) }, "←") : null,
        on ? h("button", { title: "Move right", "aria-label": `Move ${name} right`, onclick: () => move(name, 1) }, "→") : null,
      );
    const details = h(
      "details",
      { class: "cols" },
      h("summary", {}, `Columns (${this.#columns.length} shown)`),
      h("ul", { class: "collist" }, this.#columns.map((n) => item(n, true)), hidden.map((n) => item(n, false))),
    );
    if (this.#pickerOpen) details.open = true;
    details.addEventListener("toggle", () => (this.#pickerOpen = details.open));
    return details;
  }
  #pickerOpen = false;

  #renderCloud() {
    // Counts reflect the current search + other selected tags.
    const counts = new Map();
    for (const { record } of this.#filtered()) for (const t of this.#tagsOf(record)) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of this.#tags) if (!counts.has(t)) counts.set(t, 0);

    const prefixOf = (t) => (t.includes(":") ? t.split(":")[0].trim() : "Other");
    const groups = [...new Set([...counts.keys()].map(prefixOf))].sort();
    if (this.#group && !groups.includes(this.#group)) this.#group = "";

    const entries = [...counts].filter(([t]) => !this.#group || prefixOf(t) === this.#group).sort((a, b) => a[0].localeCompare(b[0]));

    return h(
      "div",
      {},
      groups.length > 1
        ? h(
            "div",
            { class: "cloudgroups" },
            h("button", { class: `groupbtn${this.#group ? "" : " on"}`, onclick: () => ((this.#group = ""), this.#render()) }, "All tags"),
            groups.map((g) =>
              h("button", { class: `groupbtn${this.#group === g ? " on" : ""}`, onclick: () => ((this.#group = g), this.#render()) }, g),
            ),
          )
        : null,
      h(
        "div",
        { class: "cloud", role: "group", "aria-label": "Filter by tag" },
        entries.map(([t, n]) => {
          const on = this.#tags.has(t);
          const tag = h(
            "button",
            {
              class: `tag${on ? " on" : ""}`,
              "aria-pressed": String(on),
              onclick: () => {
                on ? this.#tags.delete(t) : this.#tags.add(t);
                this.#render();
              },
            },
            t,
            h("small", {}, String(n)),
          );
          return tag;
        }),
      ),
    );
  }

  #renderTable(rows) {
    if (!this.#columns.length) return h("div", { class: "empty" }, "No columns selected.");
    if (!rows.length) return h("div", { class: "empty" }, "No case studies match.");
    const sortMark = (n) => (this.#sort.field === n ? (this.#sort.dir > 0 ? " ▲" : " ▼") : "");
    return h(
      "div",
      { class: "wrap" },
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            this.#columns.map((n) =>
              h(
                "th",
                {
                  onclick: () => {
                    this.#sort = this.#sort.field === n ? { field: n, dir: -this.#sort.dir } : { field: n, dir: 1 };
                    this.#render();
                  },
                },
                n + sortMark(n),
              ),
            ),
          ),
        ),
        h(
          "tbody",
          {},
          rows.map(({ record }) => h("tr", {}, this.#columns.map((n) => h("td", {}, this.#cell(n, record.fields[n]))))),
        ),
      ),
    );
  }

  #cell(name, value) {
    const type = this.#field(name)?.type;
    if (value == null || value === "") return "";
    if (type === "checkbox") return value ? "✓" : "";
    if (type === "multipleRecordLinks") return `${value.length} linked`;
    if (name === this.#tagField && Array.isArray(value)) {
      const chips = h("div", { class: "chips" });
      const tagButton = (t) => {
        const tag = trim(t);
        const on = this.#tags.has(tag);
        return h(
          "button",
          {
            class: `tag${on ? " on" : ""}`,
            "aria-pressed": String(on),
            onclick: () => {
              on ? this.#tags.delete(tag) : this.#tags.add(tag);
              this.#render();
            },
          },
          tag,
        );
      };
      const draw = (expanded) => {
        const shown = expanded || value.length <= MAX_TAGS ? value : value.slice(0, MAX_TAGS);
        const hiddenCount = value.length - shown.length;
        chips.replaceChildren(
          ...shown.map(tagButton),
          ...(hiddenCount > 0
            ? [h("button", { class: "tag more", title: `Show ${hiddenCount} more`, onclick: () => draw(true) }, `+${hiddenCount}`)]
            : []),
        );
      };
      draw(false);
      return chips;
    }
    if (Array.isArray(value)) return value.map(textOf).join(", ");
    const text = textOf(value);
    if (text.length > 160) {
      const box = h("div", { class: "clamp", title: "Click to expand" }, text);
      box.addEventListener("click", () => box.classList.toggle("open"));
      return box;
    }
    return text;
  }
}

if (!customElements.get("case-study-browser")) customElements.define("case-study-browser", CaseStudyBrowser);
