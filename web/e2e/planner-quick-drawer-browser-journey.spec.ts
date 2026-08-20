import { expect, test } from "@playwright/test";
import {
  createPlannerQuickDrawerBrowserFixture,
  openEventWorkspace,
  openEventsList,
  openRunOfShow,
  openSessionSpeakersQuickPanel,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 quick drawer journey: assign a session speaker and verify persistence", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerQuickDrawerBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openRunOfShow(page);

    let speakersPanel = await openSessionSpeakersQuickPanel(page, fixture.sessionId, fixture.sessionTitle);
    await expect(speakersPanel.getByText("No speakers assigned")).toBeVisible();
    await speakersPanel.getByRole("button", { name: `Add ${fixture.speakerName}` }).click();
    await expect(speakersPanel.getByText(fixture.speakerName).first()).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Session updated")).toBeVisible();

    await page.getByRole("button", { name: "Close session details" }).click();
    await expect(page.getByRole("region", { name: "Speakers quick panel" })).toHaveCount(0);

    speakersPanel = await openSessionSpeakersQuickPanel(page, fixture.sessionId, fixture.sessionTitle);
    await expect(speakersPanel.getByText(fixture.speakerName).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Run of Show" })).toBeVisible();
    speakersPanel = await openSessionSpeakersQuickPanel(page, fixture.sessionId, fixture.sessionTitle);
    await expect(speakersPanel.getByText(fixture.speakerName).first()).toBeVisible();

    const assignment = await fixture.harness.db.sessionSpeakerAssignment.findFirst({
      where: {
        sessionId: fixture.sessionId,
        speakerId: fixture.speakerId,
      },
      select: { sessionId: true, speakerId: true },
    });
    expect(assignment).toEqual({
      sessionId: fixture.sessionId,
      speakerId: fixture.speakerId,
    });
  } finally {
    await fixture.harness.cleanup();
  }
});
