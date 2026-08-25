import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Regression coverage for Event Builder Additional Docs Pass 1 (Prompt 2):
// an optional Additional Docs sidecar saves contracts/PDFs into the existing
// Docs Hub after event creation, without disturbing the spreadsheet flow.

const builderSource = readFileSync("app/(shell)/events/_components/new-event-builder.tsx", "utf8");
const docsComponentSource = readFileSync("app/(shell)/events/_components/event-builder-additional-docs.tsx", "utf8");
const uploadClientSource = readFileSync("lib/documents-upload-client.ts", "utf8");

test("Additional Docs component and upload-client helper exist", () => {
  assert.ok(existsSync("app/(shell)/events/_components/event-builder-additional-docs.tsx"));
  assert.ok(existsSync("lib/documents-upload-client.ts"));
});

test("builder renders an optional Additional Docs section on the source step", () => {
  assert.ok(builderSource.includes("EventBuilderAdditionalDocs"));
  assert.ok(docsComponentSource.includes("Additional documents"));
  assert.ok(docsComponentSource.includes("will be saved to Docs Hub and will not be used to generate workspace data"));
  // It is gated behind a chosen starting point and lives on the source step.
  assert.ok(builderSource.includes("onSelectFiles={handleAdditionalDocsSelected}"));
  assert.ok(builderSource.includes("onRemove={removeAdditionalDoc}"));
  assert.ok(builderSource.includes("onCategoryChange={updateAdditionalDocCategory}"));
});

test("builder does NOT rename the spreadsheet flow to Source Materials", () => {
  assert.ok(!builderSource.includes("Source Materials"));
  assert.ok(!docsComponentSource.includes("Source Materials"));
});

test("selected Additional Docs are summarized on the preview step", () => {
  assert.ok(builderSource.includes("AdditionalDocsPreviewSummary"));
  assert.ok(docsComponentSource.includes("Docs Hub after the event is created"));
  assert.ok(docsComponentSource.includes("will not create or update Budget, Roadmap, or Run of Show data"));
  assert.ok(docsComponentSource.includes("Docs Hub →"));
});

test("docs upload runs after event creation through the canonical Docs Hub helper", () => {
  // The event is created first via the existing import-create path...
  assert.ok(builderSource.includes('fetch("/api/events/import/create"'));
  // ...then Additional Docs upload through the shared helper using eventId.
  assert.ok(builderSource.includes("uploadAdditionalDocs({"));
  const createIndex = builderSource.indexOf('fetch("/api/events/import/create"');
  const uploadIndex = builderSource.indexOf("uploadAdditionalDocs({");
  assert.ok(createIndex !== -1 && uploadIndex !== -1);
  assert.ok(createIndex < uploadIndex, "docs upload must happen after the event create call");
});

test("upload helper reuses the existing draft -> presign -> PUT -> finalize Docs Hub sequence", () => {
  assert.ok(uploadClientSource.includes("/documents`"));
  assert.ok(uploadClientSource.includes("/documents/presign`"));
  assert.ok(uploadClientSource.includes("/finalize-upload`"));
  assert.ok(uploadClientSource.includes("uploadTarget.uploadUrl"));
  // No second document repository: it only talks to the event documents API.
  assert.ok(uploadClientSource.includes("/api/events/${eventId}/documents"));
});

test("failed doc upload keeps the event, reuses its draft, and offers an in-place retry", () => {
  // The event is not rolled back; partial failures remain actionable.
  assert.ok(builderSource.includes("console.error(\"Additional Docs upload failed after event creation:\", uploadError)"));
  assert.ok(builderSource.includes("AdditionalDocsPostCreatePanel"));
  assert.ok(builderSource.includes("retryFailedAdditionalDocs"));
  assert.ok(builderSource.includes("documentId: additionalDocResults.find"));
  assert.ok(uploadClientSource.includes("documentId: doc.documentId"));
  assert.ok(docsComponentSource.includes("existing drafts will be reused"));
  assert.ok(docsComponentSource.includes("Retry failed uploads"));
  assert.ok(docsComponentSource.includes("Open Docs Hub to review"));
  assert.ok(builderSource.includes("?created=1"));
  // The post-create panel renders without rolling back: no event delete call.
  assert.ok(!builderSource.includes("DELETE"));
});

test("successful uploads disclose Draft status and the submit-for-review next step", () => {
  assert.ok(docsComponentSource.includes("saved as drafts in Docs Hub"));
  assert.ok(docsComponentSource.includes("Submit for review in Docs Hub"));
  assert.ok(docsComponentSource.includes("Open Docs Hub to review"));
});

test("client-side validation guards file type and size before upload", () => {
  assert.ok(builderSource.includes("validateAdditionalDocFile"));
  assert.ok(uploadClientSource.includes("Unsupported file type"));
  assert.ok(uploadClientSource.includes("50MB"));
  // Only docs that passed client validation are uploaded.
  assert.ok(builderSource.includes("additionalDocs.filter((doc) => doc.included && !doc.error)"));
});

test("Additional Docs can be excluded and retain the selected Docs Hub category", () => {
  assert.ok(docsComponentSource.includes("included: boolean"));
  assert.ok(docsComponentSource.includes("onIncludeChange"));
  assert.ok(docsComponentSource.includes("checked={doc.included}"));
  assert.ok(docsComponentSource.includes("categorySlug"));
  assert.ok(docsComponentSource.includes("includedDocs = docs.filter((doc) => doc.included && !doc.error)"));
});

test("Additional Docs do not introduce AI or schema changes in this pass", () => {
  for (const token of ["extraction", "Extraction", "DocumentExtractedFact", "ImportReviewItem", "prisma"]) {
    assert.ok(!docsComponentSource.includes(token), `docs component should not reference ${token}`);
    assert.ok(!uploadClientSource.includes(token), `upload client should not reference ${token}`);
  }
});

test("spreadsheet create path remains intact and untouched", () => {
  assert.ok(
    builderSource.includes(
      "buildWorkbookSourcesCreatePlan(parsedWorkbookSources, basics, workbookSelections, workbookColumnMappings)",
    ),
  );
  assert.ok(builderSource.includes('type BuilderStep = "basics" | "source" | "mapping" | "preview"'));
  // No AI is wired into spreadsheet mapping.
  assert.ok(!builderSource.includes("uploadAdditionalDocs(parsedWorkbookSources"));
});
