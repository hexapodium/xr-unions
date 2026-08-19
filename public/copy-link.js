// A readonly input + button that copies the absolute URL of a JSON file,
// so it can be pasted into a Squarespace code block that fetches it
// cross-origin (the file is served with permissive CORS by GitHub Pages).
class CopyLink extends HTMLElement {
  connectedCallback() {
    const href = this.getAttribute("href");
    const absolute = new URL(href, document.baseURI).href;

    const label = document.createElement("span");
    label.textContent = "Direct link (for fetching from another site)";

    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = absolute;
    input.addEventListener("focus", () => input.select());

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copy";
    button.addEventListener("click", () => this.copy(absolute, input, button));

    const row = document.createElement("span");
    row.className = "copy-row";
    row.append(input, button);

    const wrapper = document.createElement("label");
    wrapper.className = "copy-link";
    wrapper.append(label, row);

    this.replaceChildren(wrapper);
  }

  async copy(text, input, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => (button.textContent = original), 1500);
  }
}

customElements.define("copy-link", CopyLink);
