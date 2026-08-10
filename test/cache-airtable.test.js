import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecord } from "../scripts/cache-airtable.js";

test("normalizes fields and caps activities at four", () => {
  const values = {
    "Group / org name": "Example Union",
    "Relevant docs & articles": "[Site](https://example.com)\n[Guide](https://example.com/guide)",
    "Group intro": "A short introduction.",
    "Key activities": "- Research\n- Organising\n- Events\n- Advocacy\n- Ignored",
    "Additional info": "Established in 2026.",
  };
  const result = normalizeRecord({ id: "rec1", get: (name) => values[name] });

  assert.equal(result.name, "Example Union");
  assert.equal(result.documents.length, 2);
  assert.deepEqual(result.activities, ["Research", "Organising", "Events", "Advocacy"]);
});
