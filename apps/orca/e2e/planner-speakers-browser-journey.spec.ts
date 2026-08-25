import { expect, test } from "@playwright/test";
import { SpeakerStatus, UserRole } from "@prisma/client";
import { getSpeaker } from "../src/server/services/speakers";
import {
  createPlannerSpeakersBrowserFixture,
  openEventWorkspace,
  openEventsList,
  openSpeakers,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

test("Planner P0 Speakers journey: edit a seeded speaker profile and verify persistence", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerSpeakersBrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);

    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openSpeakers(page);

    const speakerRow = page.getByRole("link", { name: `Open ${fixture.speakerName} speaker detail` });
    await expect(speakerRow).toBeVisible();
    await expect(speakerRow).toContainText(fixture.initialTitle);
    await expect(speakerRow).toContainText(fixture.initialCompany);
    await expect(speakerRow).toContainText(fixture.speakerEmail);
    await expect(speakerRow).toContainText("Invited");

    await speakerRow.click();
    await expect(page.getByRole("heading", { name: fixture.speakerName })).toBeVisible();
    await expect(page.getByText(`${fixture.initialTitle} · ${fixture.initialCompany}`)).toBeVisible();

    await page.getByRole("button", { name: "Edit Profile" }).click();
    await expect(page.getByRole("heading", { name: "Core profile" })).toBeVisible();

    await page.getByLabel("Status").selectOption(SpeakerStatus.CONFIRMED);
    await page.getByLabel("Title").fill(fixture.updatedTitle);
    await page.getByLabel("Company").fill(fixture.updatedCompany);
    await page.getByRole("button", { name: "Save Profile" }).click();

    await expect(page.getByText("Speaker updated.")).toBeVisible();
    await expect(page.getByText(`${fixture.updatedTitle} · ${fixture.updatedCompany}`)).toBeVisible();
    await expect(page.getByText("Confirmed").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: fixture.speakerName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Core profile" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue(fixture.updatedTitle);
    await expect(page.getByLabel("Company")).toHaveValue(fixture.updatedCompany);
    await expect(page.getByLabel("Status")).toHaveValue(SpeakerStatus.CONFIRMED);
    await expect(page.getByText(`${fixture.updatedTitle} · ${fixture.updatedCompany}`)).toBeVisible();

    const persistedSpeaker = await fixture.harness.db.speaker.findFirst({
      where: {
        id: fixture.speakerId,
        eventId: fixture.eventId,
      },
      select: {
        id: true,
        eventId: true,
        name: true,
        email: true,
        title: true,
        company: true,
        status: true,
      },
    });
    expect(persistedSpeaker).toEqual({
      id: fixture.speakerId,
      eventId: fixture.eventId,
      name: fixture.speakerName,
      email: fixture.speakerEmail,
      title: fixture.updatedTitle,
      company: fixture.updatedCompany,
      status: SpeakerStatus.CONFIRMED,
    });

    const serviceSpeaker = await getSpeaker(fixture.eventId, fixture.speakerId, {
      id: fixture.editorUserId,
      orgId: fixture.orgId,
      role: UserRole.OWNER,
    });
    expect(serviceSpeaker).toMatchObject({
      id: fixture.speakerId,
      eventId: fixture.eventId,
      title: fixture.updatedTitle,
      company: fixture.updatedCompany,
      status: SpeakerStatus.CONFIRMED,
    });
  } finally {
    await fixture.harness.cleanup();
  }
});
