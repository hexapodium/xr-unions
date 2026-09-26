# Group-grid rebuild

- [x] Preserve the current state on `expandos`; develop the grid on `group-grid`.
- [x] Keep only the grid script, icons, and preview index in the published `public/` directory.
- [x] Put the grid styles in the injected script; keep editable Markdown and the Squarespace embed outside `public/`.
- [x] Retain only the document-to-Markdown utilities and their required dependencies.
- [x] Stop Airtable caching and scheduled publishing; deploy the reduced `public/` directory when merged into `main`.
- [x] Check the grid preview, conversion utility code, and published file inventory without re-parsing the existing write-ups.

`expandos` retains the Airtable tables, snapshots, and other Squarespace experiments for later work.
