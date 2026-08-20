import { expect, test } from "@playwright/test";
import {
  createPlannerSpeakerPortalBrowserFixture,
} from "./helpers/planner-e2e";

// Remaining Prompt 4: browser coverage for the token-scoped speaker portal.
// The portal is a public, token-scoped route (no planner session auth). A valid
// token loads the intended speaker's portal; invalid and revoked tokens are
// rejected. Token minting uses the canonical generateSpeakerPortalToken service;
// the browser exercises the real public portal route with no auth cookies set.
//
// Portal profile submission is not browser-covered here (multi-tab portal form
// flow); it remains covered at the service/lifecycle-journey layer and is a
// documented remaining gap.

test("Speaker portal browser journey: valid token loads the speaker; invalid and revoked tokens are rejected", async ({
  page,
}) => {
  const fixture = await createPlannerSpeakerPortalBrowserFixture();

  try {
    // Valid token loads the intended speaker's portal (no planner auth required).
    await page.goto(`/speaker-portal/${fixture.validToken}`);
    await expect(page.getByText("Link unavailable")).toHaveCount(0);
    await expect(page.getByText(fixture.speakerName).first()).toBeVisible();
    await expect(page.getByText("Readiness").first()).toBeVisible();

    // Reload keeps the token-scoped portal available.
    await page.reload();
    await expect(page.getByText(fixture.speakerName).first()).toBeVisible();
    await expect(page.getByText("Link unavailable")).toHaveCount(0);

    // Invalid token is rejected.
    await page.goto("/speaker-portal/not-a-real-portal-token-000");
    await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
    await expect(page.getByText(fixture.speakerName)).toHaveCount(0);

    // Revoked token is rejected.
    await page.goto(`/speaker-portal/${fixture.revokedToken}`);
    await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
    await expect(page.getByText(fixture.speakerName)).toHaveCount(0);
  } finally {
    await fixture.harness.cleanup();
  }
});
