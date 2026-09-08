import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Documents & Links owns URL-addressable Resources and Email Templates tabs", () => {
  const page = read("app/(app)/exhibitor/documents/page.tsx");
  const workspace = read("components/exhibitor/documents-links-workspace.tsx");

  assert.match(page, /requestedTab === "email-templates"/);
  assert.match(page, /: "resources"/);
  assert.match(workspace, /href: "\/exhibitor\/documents"/);
  assert.match(workspace, /href: "\/exhibitor\/documents\?tab=email-templates"/);
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /<ExhibitorDocumentsHub embedded/);
  assert.match(workspace, /<ExhibitorEmailTemplatesClient embedded/);
});

test("only the active Documents & Links tab renders its canonical experience", () => {
  const workspace = read("components/exhibitor/documents-links-workspace.tsx");
  const documents = read("components/exhibitor/documents-hub-client.tsx");
  const templates = read("components/exhibitor/email-templates-client.tsx");

  assert.match(workspace, /activeTab === "resources" \? \(/);
  assert.match(workspace, /<ExhibitorDocumentsHub embedded/);
  assert.match(workspace, /<ExhibitorEmailTemplatesClient embedded/);
  assert.match(documents, /embedded \? <div className="mb-5 flex justify-end">/);
  assert.match(documents, /Add Document or Link/);
  assert.match(templates, /Create and manage the email templates your team uses when sending resources to leads\./);
  assert.match(templates, /New Template/);
  assert.match(templates, /Search email templates by name or subject/);
  assert.match(templates, /handleSaveTemplate|handleDuplicateTemplate|handleDeleteTemplate/);
});

test("legacy Email Templates routes preserve access checks and redirect to the Email Templates tab", () => {
  const legacy = read("app/(app)/exhibitor/email-templates/page.tsx");
  const appLegacy = read("app/app/exhibitor/email-templates/page.tsx");

  assert.match(legacy, /requireRole\("exhibitor_admin"\)/);
  assert.match(legacy, /redirect\("\/exhibitor\/documents\?tab=email-templates"\)/);
  assert.match(appLegacy, /redirect\("\/exhibitor\/documents\?tab=email-templates"\)/);
});
