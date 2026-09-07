import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { buildPlannerFixture } from "../lib/test-harness/planner-fixtures";
import { usePlannerOrgContext } from "./helpers/planner-e2e";

test("Planner first-event journey: Start Blank validates, retries, persists, and does not duplicate", async ({ baseURL, context, page }) => {
  const runLabel = `event-create-${Date.now().toString(36)}`;
  const browserUserEmail = process.env.PW_E2E_DEV_USER_EMAIL ?? `event-create-${process.pid}@planner.test`;
  const fixture = await buildPlannerFixture({ runLabel }, async (harness) => {
    const organization = await harness.createOrganization({ name: `Fixture Org First event ${runLabel}` });
    // The local server resolves its development identity from this email. Keep
    // that identity durable across failed browser setup runs, while every
    // organization and event under test remains fixture-owned and cleaned up.
    const owner = await harness.db.user.upsert({
      where: { email: browserUserEmail },
      create: {
        orgId: organization.id,
        role: UserRole.OWNER,
        email: browserUserEmail,
        name: "First Event Planner",
      },
      update: { role: UserRole.OWNER },
      select: { id: true, email: true, orgId: true, role: true },
    });
    await harness.createMembership({ orgId: organization.id, userId: owner.id });
    return { harness, organization, owner };
  });

  const eventName = `First event ${runLabel}`;
  try {
    await usePlannerOrgContext(context, baseURL, fixture.organization.id);
    await page.goto("/events/new?method=blank");

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Event name is required.", { exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "Event name", exact: true }).fill(eventName);
    await page.getByRole("button", { name: "Event start", exact: true }).click();
    await page.getByRole("dialog", { name: "Event start", exact: true }).getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: "Event end", exact: true }).click();
    await page.getByRole("dialog", { name: "Event end", exact: true }).getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page.getByRole("radio", { name: /^Start Blank/ })).toBeChecked();
    await page.getByRole("button", { name: "Review & create", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review workspace import", exact: true })).toBeVisible();

    let failNextCreate = true;
    await page.route("**/api/events/import/create", async (route) => {
      if (!failNextCreate) return route.continue();
      failNextCreate = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Event creation is temporarily unavailable. Please retry." }),
      });
    });
    await page.getByRole("button", { name: "Create event workspace", exact: true }).click();
    await expect(page.getByText("Event creation is temporarily unavailable. Please retry.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry create event workspace", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Retry create event workspace", exact: true }).dblclick();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?created=1$/);
    await expect(page.getByRole("heading", { name: eventName, exact: true })).toBeVisible();
    const firstEventGuidance = page.getByTestId("event-first-time-guidance");
    await expect(firstEventGuidance).toContainText("Event created — start building your plan.");
    await expect(firstEventGuidance).toContainText("Review Roadmap and critical-path signals");
    await firstEventGuidance.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(firstEventGuidance).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: eventName, exact: true })).toBeVisible();
    await expect(firstEventGuidance).toHaveCount(0);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/events\/new/);

    expect(await fixture.harness.db.event.count({ where: { orgId: fixture.organization.id, name: eventName } })).toBe(1);
    const created = await fixture.harness.db.event.findFirstOrThrow({
      where: { orgId: fixture.organization.id, name: eventName },
      select: { orgId: true, eventMembers: { select: { userId: true } } },
    });
    expect(created.orgId).toBe(fixture.organization.id);
    expect(created.eventMembers).toEqual([{ userId: fixture.owner.id }]);

    const importedEventName = `Agenda import ${runLabel}`;
    await page.goto("/events/new?method=pasteAgenda");
    await page.getByRole("textbox", { name: "Event name", exact: true }).fill(importedEventName);
    await page.getByRole("button", { name: "Event start", exact: true }).click();
    await page.getByRole("dialog", { name: "Event start", exact: true }).getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: "Event end", exact: true }).click();
    await page.getByRole("dialog", { name: "Event end", exact: true }).getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("textbox", { name: "Paste agenda", exact: true }).fill([
      "9:00 AM Opening remarks - Grand Ballroom",
      "10:00 AM Breakout: Partner Strategy - Room 204",
    ].join("\n"));
    await page.getByRole("button", { name: "Preview event shell", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review workspace import", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create event workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+\?created=1$/);
    const importedEventId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.goto(`/events/${importedEventId}/matrix`);
    await expect(page.getByRole("heading", { name: "Run of Show", exact: true })).toBeVisible();
    await expect(page.getByText("Opening remarks", { exact: true })).toBeVisible();
    await expect(page.getByText("Breakout: Partner Strategy", { exact: true })).toBeVisible();
    expect(await fixture.harness.db.matrixRow.count({ where: { eventId: importedEventId } })).toBe(2);
  } finally {
    await fixture.harness.cleanup();
  }
});
