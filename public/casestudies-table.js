class CaseStudiesTable extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = '<p class="status">Loading case studies...</p>';

    try {
      const response = await fetch(this.getAttribute("src"));
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      this.caseStudies = await response.json();
      this.render();
    } catch (error) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = `Could not load case studies: ${error.message}`;
      this.replaceChildren(message);
    }
  }

  render() {
    this.innerHTML = `
      <label class="filter">
        <span>Filter case studies</span>
        <input type="search" placeholder="Search titles, tags, or summaries">
      </label>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Case study</th>
            <th>Group / org</th>
            <th>Summary</th>
            <th>Tags</th>
            <th>Sources</th>
            <th>Full story</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="empty" hidden>No matching case studies.</p>
    `;

    const input = this.querySelector("input");
    input.addEventListener("input", () => this.renderRows(input.value));
    this.renderRows("");
  }

  renderRows(query) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const caseStudies = this.caseStudies.filter((item) => {
      const searchable = Object.values(item).flat().join(" ").toLocaleLowerCase();
      return words.every((word) => searchable.includes(word));
    });
    this.querySelector("tbody").replaceChildren(
      ...caseStudies.map((item) => this.row(item)),
    );
    this.querySelector(".empty").hidden = caseStudies.length > 0;
  }

  row(item) {
    const row = document.createElement("tr");
    row.dataset.caseStudyId = item.id ?? "";
    row.append(
      this.cell(item.title, "name"),
      this.cell(item.org, "org"),
      this.cell(item.summary, "intro"),
      this.tagCell(item.tags),
      this.listCell(item.links),
      this.moreCell(item.story),
    );
    return row;
  }

  cell(value, className) {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = value;
    return cell;
  }

  tagCell(tags) {
    const cell = document.createElement("td");
    if (!tags?.length) return cell;
    for (const tag of tags) {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = tag;
      cell.append(badge, " ");
    }
    return cell;
  }

  listCell(items) {
    const cell = document.createElement("td");
    if (!items?.length) return cell;
    const list = document.createElement("ul");

    for (const item of items) {
      const entry = document.createElement("li");
      const match = item.match(/^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/);
      if (match) {
        const link = document.createElement("a");
        [link.textContent, link.href] = match.slice(1);
        link.target = "_blank";
        link.rel = "noreferrer";
        entry.append(link);
      } else {
        entry.textContent = item;
      }
      list.append(entry);
    }
    cell.append(list);
    return cell;
  }

  moreCell(value) {
    const cell = document.createElement("td");
    if (!value) return cell;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.innerHTML = '<span class="more">More</span><span class="less">Less</span>';
    details.append(summary, document.createTextNode(value));
    cell.append(details);
    return cell;
  }
}

customElements.define("casestudies-table", CaseStudiesTable);
