import { expect, test } from "@playwright/test";
import { DocumentStatus } from "@prisma/client";
import { getDocumentDetails } from "../src/server/services/documents";
import {
  createPlannerDocsReviewBrowserFixture,
  openDocsHub,
  openEventWorkspace,
  openEventsList,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

// Remaining Prompt 3 (Docs half): expand Docs Hub browser coverage beyond
// submit-for-review to a review decision action. Approve is driven through the
// real Docs Hub drawer UI, which calls the canonical approve route (this control
// renders in non-production/e2e mode), then verified by reload and DB/service
// reread.
//
// Reject, Reopen, and Pull back are intentionally not browser-covered here. The
// reject control opens a native window.prompt and then refreshes the drawer, and
// chaining multiple review decisions across documents in one drawer session proved
// unstable (drawer re-render/selection timing). Those transitions remain covered
// at the service/lifecycle-journey layer; a stable browser path for them is a
// documented remaining gap.

test("Planner P0 Docs review journey: approve an in-review document through the real UI", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerDocsReviewBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openDocsHub(page);

    const card = page.getByRole("button").filter({ hasText: fixture.approveDocTitle }).first();
    await expect(card).toBeVisible();
    await card.click();

    const drawer = page.locator("aside").filter({ hasText: "Document Details" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(fixture.approveDocTitle).first()).toBeVisible();
    await expect(drawer.getByText("In Review").first()).toBeVisible();

    // Approve — IN_REVIEW -> APPROVED via the canonical approve route.
    const approvalResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith(`/api/events/${fixture.eventId}/documents/${fixture.approveDocId}/approve`) &&
      response.request().method() === "POST"
    ));
    await drawer.getByRole("button", { name: "Simulate Approve" }).click();
    const approvalResponse = await approvalResponsePromise;
    expect(approvalResponse.status(), await approvalResponse.text()).toBe(200);
    await expect(drawer.getByText("Approved").first()).toBeVisible();

    // Reload and confirm the approved decision persisted in the UI (list card).
    await page.reload();
    await expect(page.getByRole("heading", { name: "Docs Hub" })).toBeVisible();
    const reloadedCard = page.getByRole("button").filter({ hasText: fixture.approveDocTitle }).first();
    await expect(reloadedCard).toBeVisible();
    await expect(reloadedCard).toContainText("Approved");

    // DB reread proves the approval persisted.
    const approveDoc = await fixture.harness.db.document.findUnique({
      where: { id: fixture.approveDocId },
      select: { eventId: true, status: true, title: true },
    });
    expect(approveDoc).toEqual({
      eventId: fixture.eventId,
      status: DocumentStatus.APPROVED,
      title: fixture.approveDocTitle,
    });

    // Canonical service reread confirms the approved document activity.
    const details = await getDocumentDetails(fixture.eventId, fixture.approveDocId);
    expect(details.status).toBe(DocumentStatus.APPROVED);
    expect(details.activity.some((entry) => entry.type === "REVIEW_APPROVED")).toBe(true);
  } finally {
    await fixture.harness.cleanup();
  }
});
