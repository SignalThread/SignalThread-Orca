import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { finalizeDocumentUpload } from "@/src/server/services/documents";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// Regression for the document finalize objectKey scope gap: finalizeDocumentUpload
// persisted a client-supplied objectKey without checking it belongs to this
// event/document, so a caller with write access to event A could finalize a
// version pointing at another event's stored object. The key is now re-scoped.
test("Document finalize rejects an out-of-scope objectKey but accepts an in-scope one", async (t) => {
  const harness = createHarnessOrSkip(t, "doc-finalize-scope");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const category = await harness.createDocumentCategory({ eventId: roles.event.id });
    const document = await harness.createDocument({
      orgId: roles.organization.id,
      eventId: roles.event.id,
      categoryId: category.id,
    });

    const otherEventId = randomUUID();
    const crossEventKey = `events/${otherEventId}/documents/${document.id}/contract.pdf`;

    await assert.rejects(
      () =>
        finalizeDocumentUpload(
          roles.event.id,
          document.id,
          {
            objectKey: crossEventKey,
            mimeType: "application/pdf",
            fileSizeBytes: 1024,
            originalFilename: "contract.pdf",
          },
          roles.owner.user.id,
        ),
      (error) => error instanceof Error && /outside this document's storage scope/.test(error.message),
    );

    // Traversal attempt is also rejected.
    await assert.rejects(
      () =>
        finalizeDocumentUpload(
          roles.event.id,
          document.id,
          {
            objectKey: `events/${roles.event.id}/documents/${document.id}/../../../etc/passwd`,
            mimeType: "application/pdf",
            fileSizeBytes: 1024,
            originalFilename: "x.pdf",
          },
          roles.owner.user.id,
        ),
      (error) => error instanceof Error && /outside this document's storage scope/.test(error.message),
    );

    // The correct, server-issued key prefix is accepted.
    const inScopeKey = `events/${roles.event.id}/documents/${document.id}/contract.pdf`;
    const version = await finalizeDocumentUpload(
      roles.event.id,
      document.id,
      {
        objectKey: inScopeKey,
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        originalFilename: "contract.pdf",
      },
      roles.owner.user.id,
    );
    assert.ok(version, "in-scope finalize should succeed");
    // Track the version created directly in the DB so harness cleanup can remove it.
    harness.ids.documentVersionIds.push(version.id);
  } finally {
    await harness.cleanup();
  }
});
