import test from "node:test";
import assert from "node:assert/strict";
import {
  isAirtablePermissionError,
  normalizeRecord,
  normalizeCaseStudy,
  normalizeSource,
  normalizeArticle,
  normalizeMaCaseStudy,
} from "../scripts/cache-airtable.js";

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
    "Name": "Strike ballot success",
    "Group / org": "Example Union",
    "Notes": "How one branch won a ballot.",
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

test("normalizes source fields", () => {
  const values = {
    Publication: "Union Weekly",
    "Publication type": "Magazine/ Newsletter",
    "Org Type": "Union (Official)",
    "Access Notes": "Available via member login.",
    "Priority (Source)": "1 - High Priority (Active)",
    Label: "UW",
  };
  const result = normalizeSource({ id: "recSrc1", get: (name) => values[name] });

  assert.equal(result.id, "recSrc1");
  assert.equal(result.publication, "Union Weekly");
  assert.equal(result.publicationType, "Magazine/ Newsletter");
  assert.equal(result.orgType, "Union (Official)");
  assert.equal(result.accessNotes, "Available via member login.");
  assert.equal(result.priority, "1 - High Priority (Active)");
  assert.equal(result.label, "UW");
});

test("normalizes article fields", () => {
  const values = {
    Article: "Union Weekly | Spring 2026",
    "Edition / Title": "Spring 2026",
    "Article Link": "https://example.com/article",
    "Article Doc Link": "https://example.com/doc",
    "Article Read": true,
    "Priority (Article)": "2 - High Priority (Not Yet Active)",
  };
  const result = normalizeArticle({ id: "recArt1", get: (name) => values[name] });

  assert.equal(result.id, "recArt1");
  assert.equal(result.title, "Union Weekly | Spring 2026");
  assert.equal(result.edition, "Spring 2026");
  assert.equal(result.link, "https://example.com/article");
  assert.equal(result.docLink, "https://example.com/doc");
  assert.equal(result.read, true);
  assert.equal(result.priority, "2 - High Priority (Not Yet Active)");
});

test("normalizes Movement Assessment case study fields", () => {
  const values = {
    Name: "Strike ballot success",
    "Date of case study": "2026-03-01",
    "Quotes from articles": "\"A great win.\"",
    Tags: ["Collaboration", "Demand: Climate Action"],
    Notes: "Some notes.",
    "Details for further research": "Follow up with branch secretary.",
    "Start Date": "2026-02-01",
    "End Date": "2026-03-01",
  };
  const result = normalizeMaCaseStudy({ id: "recCS1", get: (name) => values[name] });

  assert.equal(result.id, "recCS1");
  assert.equal(result.title, "Strike ballot success");
  assert.deepEqual(result.tags, ["Collaboration", "Demand: Climate Action"]);
  assert.equal(result.notes, "Some notes.");
  assert.equal(result.startDate, "2026-02-01");
  assert.equal(result.endDate, "2026-03-01");
});

test("detects Airtable authorization errors", () => {
  assert.equal(
    isAirtablePermissionError(
      new Error("You are not authorized to perform this operation"),
    ),
    true,
  );
  assert.equal(
    isAirtablePermissionError("You are not authorized to perform this operation"),
    true,
  );
  assert.equal(isAirtablePermissionError(null), false);
  assert.equal(isAirtablePermissionError(new Error("Network timeout")), false);
  assert.equal(
    isAirtablePermissionError({ message: "UNAUTHORIZED" }),
    true,
  );
  assert.equal(isAirtablePermissionError({ status: 401 }), true);
  assert.equal(isAirtablePermissionError({ statusCode: 403 }), true);
});
