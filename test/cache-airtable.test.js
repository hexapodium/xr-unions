import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecord, normalizeCaseStudy } from "../scripts/cache-airtable.js";

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

test("normalizes case study fields", () => {
  const values = {
    "Case study title": "Strike ballot success",
    "Group / org": "Example Union",
    "Summary": "How one branch won a ballot.",
    "Full story": "A longer narrative about the campaign.",
    "Tags": "strike\nballot\norganising",
    "Source links": "[Report](https://example.com/report)",
  };
  const result = normalizeCaseStudy({ id: "rec2", get: (name) => values[name] });

  assert.equal(result.title, "Strike ballot success");
  assert.equal(result.org, "Example Union");
  assert.deepEqual(result.tags, ["strike", "ballot", "organising"]);
  assert.equal(result.links.length, 1);
});
