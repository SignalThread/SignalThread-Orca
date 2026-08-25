import { expect, test } from "@playwright/test";
import { BudgetActivityType, BudgetStatus, BudgetSubmissionStatus } from "@prisma/client";
import { getBudgetSnapshot } from "../src/server/services/budget";
import {
  createPlannerBudgetBrowserFixture,
  openBudget,
  openEventWorkspace,
  openEventsList,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

test("Planner P0 Budget journey: submit a seeded line item for approval and verify persistence", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerBudgetBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    const dashboardResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/events/${fixture.eventId}/budget/dashboard`) && response.request().method() === "GET",
    );
    await openBudget(page);
    expect((await dashboardResponse).status()).toBe(200);

    await expect(page.getByText(formatMoney(fixture.forecastCents)).first()).toBeVisible();
    await expect(page.getByText("1 line item")).toBeVisible();

    await page.getByRole("link", { name: "Full Budget Grid" }).click();
    await expect(page.getByRole("heading", { name: "Full Budget Grid" })).toBeVisible();

    const row = page.getByTestId(`budget-line-item-row-${fixture.lineItemId}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(fixture.categoryName);
    await expect(row.getByTestId(`budget-line-item-forecast-${fixture.lineItemId}`)).toHaveValue(
      formatMoney(fixture.forecastCents),
    );
    await expect(row.getByTestId(`budget-line-item-actual-${fixture.lineItemId}`)).toHaveValue(
      formatMoney(fixture.actualCents),
    );
    await expect(row.getByTestId(`budget-line-item-vendor-${fixture.lineItemId}`)).toHaveValue(fixture.vendorName);
    await expect(row.getByRole("button", { name: "Needs submission" })).toBeVisible();

    await row.getByRole("button", { name: "Needs submission" }).click();
    await expect(page.getByRole("heading", { name: "Submit for approval" })).toBeVisible();
    await expect(page.getByText(fixture.lineItemName)).toBeVisible();
    await expect(page.getByText(formatMoney(fixture.forecastCents)).last()).toBeVisible();

    await page.getByLabel(fixture.reviewerName).check();
    await page.getByLabel("Message (optional)").fill(fixture.submissionMessage);
    const submitButton = page.getByRole("button", { name: "Submit for approval" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(page.getByRole("heading", { name: "Submit for approval" })).toHaveCount(0);
    const submittedRow = page.getByTestId(`budget-line-item-row-${fixture.lineItemId}`);
    await expect(submittedRow.getByRole("button", { name: "Submitted" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Full Budget Grid" })).toBeVisible();
    const reloadedRow = page.getByTestId(`budget-line-item-row-${fixture.lineItemId}`);
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow.getByTestId(`budget-line-item-vendor-${fixture.lineItemId}`)).toHaveValue(
      fixture.vendorName,
    );
    await expect(reloadedRow.getByTestId(`budget-line-item-forecast-${fixture.lineItemId}`)).toHaveValue(
      formatMoney(fixture.forecastCents),
    );
    await expect(reloadedRow.getByRole("button", { name: "Submitted" })).toBeVisible();

    const persistedBudget = await fixture.harness.db.budget.findUnique({
      where: { id: fixture.budgetId },
      select: {
        currentVersionId: true,
        eventId: true,
        id: true,
        status: true,
        submittedByUserId: true,
      },
    });
    expect(persistedBudget).toEqual({
      currentVersionId: fixture.budgetVersionId,
      eventId: fixture.eventId,
      id: fixture.budgetId,
      status: BudgetStatus.SUBMITTED,
      submittedByUserId: fixture.editorUserId,
    });

    const persistedLineItem = await fixture.harness.db.budgetLineItem.findFirst({
      where: {
        id: fixture.lineItemId,
        budgetId: fixture.budgetId,
      },
      select: {
        actualCents: true,
        budgetId: true,
        category: true,
        forecastCents: true,
        id: true,
        lineItem: true,
        vendor: true,
      },
    });
    expect(persistedLineItem).toEqual({
      actualCents: fixture.actualCents,
      budgetId: fixture.budgetId,
      category: fixture.categoryName,
      forecastCents: fixture.forecastCents,
      id: fixture.lineItemId,
      lineItem: fixture.lineItemName,
      vendor: fixture.vendorName,
    });

    const submission = await fixture.harness.db.budgetSubmission.findFirst({
      where: {
        budgetId: fixture.budgetId,
        status: BudgetSubmissionStatus.SUBMITTED,
      },
      include: {
        lineItems: true,
        recipients: true,
      },
      orderBy: { submittedAt: "desc" },
    });
    expect(submission).toMatchObject({
      budgetId: fixture.budgetId,
      budgetVersionId: fixture.budgetVersionId,
      message: fixture.submissionMessage,
      status: BudgetSubmissionStatus.SUBMITTED,
      submittedByUserId: fixture.editorUserId,
    });
    expect(submission?.lineItems).toMatchObject([{ budgetLineItemId: fixture.lineItemId }]);
    expect(submission?.recipients).toMatchObject([{ userId: fixture.reviewerUserId }]);

    const activity = await fixture.harness.db.budgetActivity.findFirst({
      where: {
        budgetId: fixture.budgetId,
        type: BudgetActivityType.SUBMITTED,
      },
      select: {
        actorUserId: true,
        budgetId: true,
        note: true,
        type: true,
      },
    });
    expect(activity).toMatchObject({
      actorUserId: fixture.editorUserId,
      budgetId: fixture.budgetId,
      note: expect.stringContaining(submission?.id ?? ""),
      type: BudgetActivityType.SUBMITTED,
    });

    const snapshot = await getBudgetSnapshot(fixture.eventId, {
      currentUserId: fixture.editorUserId,
      includeActivity: true,
      includeBudgetFiles: false,
      includeSubmissionDetails: true,
      includeSubmissions: true,
    });
    expect(snapshot.budget.eventId).toBe(fixture.eventId);
    expect(snapshot.budget.status).toBe(BudgetStatus.SUBMITTED);
    expect(snapshot.lineItems.some((item) => item.id === fixture.lineItemId)).toBe(true);
    expect(snapshot.submissions.some((entry) => entry.id === submission?.id)).toBe(true);
    expect(snapshot.activity.some((entry) => entry.type === BudgetActivityType.SUBMITTED)).toBe(true);
  } finally {
    await fixture.harness.cleanup();
  }
});
