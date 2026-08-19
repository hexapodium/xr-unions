// Generic, filterable table for browsing a cached Airtable JSON dump.
// Works with any array of flat-ish records (raw Airtable field dumps),
// inferring columns from the union of keys seen across all records.
const RECORD_ID = /^rec[A-Za-z0-9]{10,}$/;
const MARKDOWN_LINK = /^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/;
const URL_LIKE = /^https?:\/\//i;
const LONG_TEXT = 160;

class DataTable extends HTMLElement {
  async connectedCallback() {
    const src = this.getAttribute("src");
    const label = this.getAttribute("label") || src;
    this.innerHTML = `<p class="status">Loading ${label}…</p>`;

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      this.records = await response.json();
      this.columns = this.collectColumns(this.records);
      this.render(label);
    } catch (error) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = `Could not load ${label}: ${error.message}`;
      this.replaceChildren(message);
    }
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
    this.innerHTML = `
      <label class="filter">
        <span>Filter ${label}</span>
        <input type="search" placeholder="Search all fields">
      </label>
      <div class="table-scroll">
        <table>
          <thead><tr>${this.columns.map((column) => `<th>${this.escape(column)}</th>`).join("")}</tr></thead>
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

    this.querySelector("tbody").replaceChildren(...rows.map((record) => this.row(record)));
    this.querySelector(".empty").hidden = rows.length > 0;
    this.querySelector(".count").textContent =
      `Showing ${rows.length} of ${this.records.length} rows.`;
  }

  row(record) {
    const tr = document.createElement("tr");
    tr.append(...this.columns.map((column) => this.cell(record[column])));
    return tr;
  }

  cell(value) {
    const td = document.createElement("td");
    if (value === undefined || value === null || value === "") return td;

    if (typeof value === "boolean") {
      td.className = "bool";
      td.textContent = value ? "✓" : "";
      return td;
    }

    if (Array.isArray(value)) {
      if (!value.length) return td;
      const ul = document.createElement("ul");
      for (const item of value) ul.append(this.listItem(item));
      td.append(ul);
      return td;
    }

    const text = String(value);
    if (URL_LIKE.test(text)) {
      td.append(this.link(text, text));
      return td;
    }
    if (text.length > LONG_TEXT) {
      td.append(this.moreDetails(text));
      return td;
    }
    td.textContent = text;
    return td;
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

  moreDetails(text) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.innerHTML = '<span class="more">More</span><span class="less">Less</span>';
    details.append(summary, document.createTextNode(text));
    return details;
  }

  escape(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }
}

customElements.define("data-table", DataTable);
