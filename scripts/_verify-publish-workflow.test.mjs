import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("publishing does not attempt to enable Pages with GITHUB_TOKEN", () => {
  const workflow = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  const configurePages = workflow.split(/^[ \t]*- /m)
    .find((step) => step.startsWith("uses: actions/configure-pages@v5\n"));
  assert.ok(configurePages, "Publishing must configure an existing Pages site");
  assert.doesNotMatch(configurePages, /^\s*enablement:\s*true\s*$/m);
});
