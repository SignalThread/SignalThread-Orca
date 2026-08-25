import { expect, test } from "@playwright/test";
import { DocumentApprovalStatus, DocumentStatus } from "@prisma/client";
import { getDocumentDetails } from "../src/server/services/documents";
import {
  createPlannerDocsBrowserFixture,
  openDocsHub,
  openEventWorkspace,
  openEventsList,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 Docs Hub journey: submit seeded document for review and verify persistence", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerDocsBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openDocsHub(page);

    const documentCard = page.getByRole("button").filter({ hasText: fixture.documentTitle }).first();
    await expect(documentCard).toBeVisible();
    await expect(documentCard).toContainText(fixture.categoryName);
    await expect(documentCard).toContainText("Draft");
    await expect(documentCard).toContainText("v1");
    await documentCard.click();

    const drawer = page.locator("aside").filter({ hasText: "Document Details" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(fixture.documentTitle).first()).toBeVisible();
    await expect(drawer.getByText(fixture.documentFilename)).toBeVisible();
    await expect(drawer.getByText("Draft").first()).toBeVisible();
    await expect(drawer.getByText("Uploaded v1")).toBeVisible();

    await drawer.getByLabel(fixture.reviewerName).check();
    await drawer.getByPlaceholder("Optional note for review activity").fill(fixture.reviewNote);
    const submitButton = drawer.getByRole("button", { name: "Submit for Review" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(drawer.getByText("In Review").first()).toBeVisible();
    await expect(drawer.getByText(fixture.reviewerName).first()).toBeVisible();
    await expect(drawer.getByText("Submitted for Review")).toBeVisible();
    await expect(drawer.getByText(fixture.reviewNote)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Docs Hub" })).toBeVisible();
    const reloadedDrawer = page.locator("aside").filter({ hasText: "Document Details" });
    await expect(reloadedDrawer.getByText(fixture.documentTitle).first()).toBeVisible();
    await expect(reloadedDrawer.getByText("In Review").first()).toBeVisible();
    await expect(reloadedDrawer.getByText(fixture.reviewerName).first()).toBeVisible();
    await expect(reloadedDrawer.getByText("Submitted for Review")).toBeVisible();

    const persisted = await fixture.harness.db.document.findUnique({
      where: { id: fixture.documentId },
      select: {
        eventId: true,
        id: true,
        orgId: true,
        status: true,
        title: true,
        versions: {
          select: {
            id: true,
            documentId: true,
            originalFilename: true,
          },
        },
      },
    });
    expect(persisted).toEqual({
      eventId: fixture.eventId,
      id: fixture.documentId,
      orgId: fixture.orgId,
      status: DocumentStatus.IN_REVIEW,
      title: fixture.documentTitle,
      versions: [
        {
          id: fixture.documentVersionId,
          documentId: fixture.documentId,
          originalFilename: fixture.documentFilename,
        },
      ],
    });

    const approval = await fixture.harness.db.documentApproval.findFirst({
      where: {
        documentId: fixture.documentId,
        status: DocumentApprovalStatus.IN_REVIEW,
      },
      orderBy: { actedAt: "desc" },
      select: {
        actedByUserId: true,
        documentId: true,
        id: true,
        note: true,
        recipients: {
          select: {
            userId: true,
          },
        },
        status: true,
      },
    });
    expect(approval).toMatchObject({
      actedByUserId: expect.any(String),
      documentId: fixture.documentId,
      note: expect.stringContaining(fixture.reviewNote),
      recipients: [{ userId: fixture.reviewerUserId }],
      status: DocumentApprovalStatus.IN_REVIEW,
    });

    const details = await getDocumentDetails(fixture.eventId, fixture.documentId);
    expect(details.eventId).toBe(fixture.eventId);
    expect(details.status).toBe(DocumentStatus.IN_REVIEW);
    expect(details.activity.some((entry) => entry.type === "REVIEW_SUBMITTED")).toBe(true);
  } finally {
    await fixture.harness.cleanup();
  }
});
