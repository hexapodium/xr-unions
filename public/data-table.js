// Generic, filterable table for browsing a cached Airtable JSON dump.
// Works with any array of flat-ish records (raw Airtable field dumps),
// inferring columns from the union of keys seen across all records.
const RECORD_ID = /^rec[A-Za-z0-9]{10,}$/;
const MARKDOWN_LINK = /^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/;
const URL_LIKE = /^https?:\/\//i;
// Cells (including bullet-list columns, counted by total words across all
// items) longer than this many words collapse behind a "More"/"Less"
// toggle. Override per column via the `word-limits` attribute, e.g.
// word-limits='{"Group Intro": 30, "Key Group Activities": 60}'.
const DEFAULT_WORD_LIMIT = 45;

class DataTable extends HTMLElement {
  async connectedCallback() {
    const src = this.getAttribute("src");
    const label = this.getAttribute("label") || src;
    this.nameColumn = this.getAttribute("name-column") || null;
    this.wordLimits = this.parseWordLimits();
    this.innerHTML = `<p class="status">Loading ${label}…</p>`;

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      this.records = await response.json();
      this.columns = this.collectColumns(this.records);
      if (this.nameColumn && !this.columns.includes(this.nameColumn)) this.nameColumn = null;
      this.render(label);
    } catch (error) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = `Could not load ${label}: ${error.message}`;
      this.replaceChildren(message);
    }
  }

  parseWordLimits() {
    const raw = this.getAttribute("word-limits");
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      console.warn(`<data-table>: could not parse word-limits attribute: ${raw}`);
      return {};
    }
  }

  wordLimitFor(column) {
    const limit = this.wordLimits[column];
    return typeof limit === "number" && limit > 0 ? limit : DEFAULT_WORD_LIMIT;
  }

  wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  words(text) {
    return text.trim().split(/\s+/).filter(Boolean);
  }

  collectColumns(records) {
    const seen = new Set();
    const order = [];
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (key === "id" || seen.has(key)) continue;
        seen.add(key);
        order.push(key);
      }
    }
    // Drop columns that only ever contain internal Airtable record IDs;
    // they aren't meaningful to a reader and just add clutter.
    return order.filter((key) => !this.isRecordIdOnlyColumn(records, key));
  }

  isRecordIdOnlyColumn(records, key) {
    let sawValue = false;
    for (const record of records) {
      const value = record[key];
      const values = Array.isArray(value)
        ? value
        : value === undefined || value === null || value === ""
          ? []
          : [value];
      for (const item of values) {
        sawValue = true;
        if (typeof item !== "string" || !RECORD_ID.test(item)) return false;
      }
    }
    return sawValue;
  }

  render(label) {
    const restColumns = this.nameColumn
      ? this.columns.filter((column) => column !== this.nameColumn)
      : this.columns;
    this.restColumns = restColumns;

    this.innerHTML = `
      <label class="filter">
        <span>Filter ${label}</span>
        <input type="search" placeholder="Search all fields">
      </label>
      <div class="table-scroll">
        <table${this.nameColumn ? ' class="has-name-header"' : ""}>
          <thead><tr>${restColumns.map((column) => `<th>${this.escape(column)}</th>`).join("")}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="empty" hidden>No matching rows.</p>
      <p class="count"></p>
    `;

    const input = this.querySelector("input");
    input.addEventListener("input", () => this.renderRows(input.value));
    this.renderRows("");
  }

  renderRows(query) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = this.records.filter((record) => {
      const searchable = Object.values(record).flat(Infinity).join(" ").toLocaleLowerCase();
      return words.every((word) => searchable.includes(word));
    });

    this.querySelector("tbody").replaceChildren(...rows.flatMap((record) => this.rowGroup(record)));
    this.querySelector(".empty").hidden = rows.length > 0;
    this.querySelector(".count").textContent =
      `Showing ${rows.length} of ${this.records.length} rows.`;
  }

  rowGroup(record) {
    if (!this.nameColumn) return [this.row(record, this.columns)];

    const nameRow = document.createElement("tr");
    nameRow.className = "name-row";
    const th = document.createElement("th");
    th.scope = "colgroup";
    th.colSpan = Math.max(this.restColumns.length, 1);
    th.textContent = record[this.nameColumn] ?? "";
    nameRow.append(th);

    return [nameRow, this.row(record, this.restColumns)];
  }

  row(record, columns) {
    const tr = document.createElement("tr");
    tr.append(...columns.map((column) => this.cell(record[column], column)));
    return tr;
  }

  cell(value, column) {
    const td = document.createElement("td");
    if (value === undefined || value === null || value === "") return td;

    if (typeof value === "boolean") {
      td.className = "bool";
      td.textContent = value ? "✓" : "";
      return td;
    }

    const limit = this.wordLimitFor(column);

    if (Array.isArray(value)) {
      if (!value.length) return td;
      const full = document.createElement("ul");
      for (const item of value) full.append(this.listItem(item));
      const words = value.map((item) => String(item)).join(" ");
      if (this.wordCount(words) <= limit) {
        td.append(full);
        return td;
      }
      td.append(this.collapsible(this.listPreview(value, limit), full));
      return td;
    }

    const text = String(value);
    if (URL_LIKE.test(text)) {
      td.append(this.link(text, text));
      return td;
    }
    if (this.wordCount(text) > limit) {
      const preview = document.createTextNode(`${this.words(text).slice(0, limit).join(" ")}…`);
      td.append(this.collapsible(preview, document.createTextNode(text)));
      return td;
    }
    td.textContent = text;
    return td;
  }

  // Builds a preview <ul> containing as many whole items as fit within the
  // word budget (always at least one item), so a truncated list column
  // still shows real content up-front instead of just "More".
  listPreview(items, limit) {
    const ul = document.createElement("ul");
    let used = 0;
    for (const item of items) {
      const words = this.wordCount(String(item));
      if (ul.childElementCount > 0 && used + words > limit) break;
      ul.append(this.listItem(item));
      used += words;
      if (used >= limit) break;
    }
    if (ul.childElementCount < items.length) {
      const li = document.createElement("li");
      li.className = "ellipsis";
      li.textContent = "…";
      ul.append(li);
    }
    return ul;
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

  // Renders `previewNode` immediately, with a "More" button that swaps it
  // out for `fullNode` (and back again via "Less"), rather than hiding
  // everything behind a closed <details> — the preview words are visible
  // even when not expanded.
  collapsible(previewNode, fullNode) {
    const wrapper = document.createElement("span");
    wrapper.className = "truncated";

    const preview = document.createElement("span");
    preview.className = "preview";
    preview.append(previewNode);

    const full = document.createElement("span");
    full.className = "full";
    full.hidden = true;
    full.append(fullNode);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle";
    toggle.textContent = "More";
    toggle.addEventListener("click", () => {
      const expanding = full.hidden;
      full.hidden = !expanding;
      preview.hidden = expanding;
      toggle.textContent = expanding ? "Less" : "More";
    });

    wrapper.append(preview, full, toggle);
    return wrapper;
  }

  escape(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }
}

customElements.define("data-table", DataTable);
