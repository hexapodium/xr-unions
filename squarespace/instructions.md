# Expando inline card — Squarespace usage

This folder contains a ready-to-copy snippet and separate files so you can either paste a single block into a Squarespace Code Block or add CSS/JS via Code Injection.

Files
- `expando-snippet.html` — single copy-paste Code Block containing CSS, a sample wrapper, and JS.
- `expando.css` — copy the CSS into Site Header or a CSS block.
- `expando.js` — copy the JS into Footer (Code Injection) or a Code Block.

Basic usage

1. Single-block option (quick): paste the contents of `expando-snippet.html` into a Squarespace Code Block where your content is.

2. Split option (preferred for reuse):
   - Paste `expando.css` into Design → Custom CSS or into a Code Block.
   - Paste `expando.js` into Settings → Advanced → Code Injection → Footer (or a Code Block).
   - In your page content, add the wrapper and inline link example:

```html
<div id="expando-root" data-groups-url="/groups.json" data-casestudies-url="/casestudies.json">
  <p>
    Read more about the work of <a class="expando-link" data-group-id="example">Example XR Group</a> in our research.
  </p>
  <p>
    See how somewhere else did it in this <a class="expando-link" data-casestudy-id="example">case study</a>.
  </p>
</div>
```

Case studies also have a searchable list view, similar to the groups table:

```html
<script type="module" src="/casestudies-table.js"></script>
<casestudies-table src="/casestudies.json"></casestudies-table>
```

Customization
- To point to a different JSON file, set `data-groups-url` or `data-casestudies-url` on the `#expando-root` element, e.g. `data-groups-url="https://cdn.example.com/groups.json"`.
- For a fixed-width right column instead of a 50/50 split, change `grid-template-columns` in the CSS, e.g. `1fr 380px`.
- To preserve existing link href behavior, the script stores an existing `href` as `data-href-fallback` before removing it.

Notes
- The snippet expects your `groups.json` to be an array of group objects with fields like `id`, `name`, `intro`, `documents`, `activities`, and `additionalInfo`. The repository includes `public/groups.json` as an example.
- The `casestudies.json` file is an array of case study objects with fields like `id`, `title`, `org`, `summary`, `story`, `tags`, and `links`. Links with `data-casestudy-id="<id>"` open the matching case study inline instead of a group card.


Accessibility
- Links are keyboard-focusable. The panel contains a close button for keyboard users.


