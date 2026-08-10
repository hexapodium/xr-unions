class GroupsTable extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = '<p class="status">Loading groups...</p>';

    try {
      const response = await fetch(this.getAttribute("src"));
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      this.groups = await response.json();
      this.render();
    } catch (error) {
      const message = document.createElement("p");
      message.className = "error";
      message.textContent = `Could not load groups: ${error.message}`;
      this.replaceChildren(message);
    }
  }

  render() {
    this.innerHTML = `
      <label class="filter">
        <span>Filter groups</span>
        <input type="search" placeholder="Search names, activities, or articles">
      </label>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Group / organisation</th>
            <th>Relevant documents &amp; articles</th>
            <th>Group introduction</th>
            <th>Key activities</th>
            <th>Additional information</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="empty" hidden>No matching groups.</p>
    `;

    const input = this.querySelector("input");
    input.addEventListener("input", () => this.renderRows(input.value));
    this.renderRows("");
  }

  renderRows(query) {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const groups = this.groups.filter((group) => {
      const searchable = Object.values(group).flat().join(" ").toLocaleLowerCase();
      return words.every((word) => searchable.includes(word));
    });
    this.querySelector("tbody").replaceChildren(
      ...groups.map((group) => this.row(group)),
    );
    this.querySelector(".empty").hidden = groups.length > 0;
  }

  row(group) {
    const row = document.createElement("tr");
    row.append(
      this.cell(group.name, "name"),
      this.listCell(group.documents, true),
      this.cell(group.intro, "intro"),
      this.listCell(group.activities),
      this.moreCell(group.additionalInfo),
    );
    return row;
  }

  cell(value, className) {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = value;
    return cell;
  }

  listCell(items, links = false) {
    const cell = document.createElement("td");
    if (!items?.length) return cell;
    const list = document.createElement("ul");

    for (const item of items) {
      const entry = document.createElement("li");
      const match = links && item.match(/^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/);
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

customElements.define("groups-table", GroupsTable);
