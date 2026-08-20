import { expect, test } from "@playwright/test";
import {
  createPlannerP0BrowserFixture,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  overviewSessionRowById,
  overviewSessionRow,
  switchRunOfShowToList,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 browser journey: open event, edit Run of Show, verify assignments after reload", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerP0BrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);
    await switchRunOfShowToList(page);

    const originalRow = overviewSessionRowById(page, fixture.sessionId);
    await expect(originalRow).toBeVisible();
    await expect(originalRow).toContainText(fixture.originalSessionTitle);

    await originalRow.getByRole("button", { name: fixture.originalSessionTitle, exact: true }).click();
    await page.getByTestId(`matrix-overview-session-title-${fixture.sessionId}`).fill(fixture.updatedSessionTitle);
    await expect(page.getByTestId(`matrix-overview-session-title-${fixture.sessionId}`)).toHaveValue(fixture.updatedSessionTitle);
    await page.getByTestId(`matrix-overview-session-save-${fixture.sessionId}`).click();
    await expect(page.getByText("Session updated")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Run of Show" })).toBeVisible();
    await switchRunOfShowToList(page);

    const updatedRow = overviewSessionRow(page, fixture.updatedSessionTitle);
    await expect(updatedRow).toBeVisible();

    const persisted = await fixture.harness.db.matrixRow.findUnique({
      where: { id: fixture.sessionId },
      select: { sessionName: true },
    });
    expect(persisted?.sessionName).toBe(fixture.updatedSessionTitle);
    expect(await fixture.harness.db.sessionSpeakerAssignment.count({ where: { sessionId: fixture.sessionId, speaker: { name: fixture.speakerName } } })).toBe(1);
    expect(await fixture.harness.db.sessionFnbCatalogAssignment.count({ where: { sessionId: fixture.sessionId, catalogItem: { itemName: fixture.fnbItemName } } })).toBe(1);
  } finally {
    await fixture.harness.cleanup();
  }
});
