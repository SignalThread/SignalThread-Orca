import { test, expect, type Page } from "@playwright/test";
import { EXHIBITOR_ZONE_RE } from "./helpers/exhibitor-navigation";

const BASE = "http://localhost:3000";

async function expectLeadsIntelligenceVisible(page: Page) {
  await expect(page.getByRole("heading", { name: /leads intelligence/i })).toBeVisible({
    timeout: 15_000
  });
}

/** Routing may canonicalize paths; assert list UX, not query string. */
async function expectExhibitorLeadsList(page: Page) {
  await expectLeadsIntelligenceVisible(page);
  await expect(page).toHaveURL(EXHIBITOR_ZONE_RE);
}

function temperatureFilter(page: Page) {
  return page.getByRole("region", { name: /lead filters/i }).getByRole("combobox", { name: "Temperature" });
}

test.describe("/app/exhibitor/leads entry reaches Leads Intelligence", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test("app path loads list; Hot filter activates from UI", async ({ page }) => {
    await page.goto(`${BASE}/app/exhibitor/leads`);
    await expectExhibitorLeadsList(page);
    await expect(temperatureFilter(page)).toHaveValue("", { timeout: 15_000 });
    await temperatureFilter(page).selectOption("hot");
    await expect(temperatureFilter(page)).toHaveValue("hot", { timeout: 15_000 });
  });
});

test.describe("event workspace at /exhibitor/dashboard", () => {
  test.use({ storageState: "e2e/storage/exhibitor_admin.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/exhibitor/dashboard`);
    // The shared Event Workspace shell: h1 is the event name + lifecycle badge.
    await expect(page.getByTestId("event-workspace-header")).toBeVisible({ timeout: 15_000 });
  });

  test("exactly one lifecycle state body renders — no generic dashboard", async ({ page }) => {
    const bodies = page.locator(
      '[data-testid="workspace-upcoming-body"], [data-testid="workspace-live-body"], [data-testid="workspace-completed-body"]'
    );
    await expect(bodies).toHaveCount(1, { timeout: 15_000 });
    // The replaced generic dashboard never appears.
    await expect(page.getByText("Leads Over Time")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-kpi-all")).toHaveCount(0);
    // No deeper intelligence-dashboard navigation exists in Phase 1.
    await expect(page.getByText(/Real-Time Intelligence|Executive Intelligence|View Coaching Dashboard/)).toHaveCount(0);
  });

  test("every state shows a What Matters Now section", async ({ page }) => {
    await expect(page.getByTestId("workspace-what-matters-now")).toBeVisible({ timeout: 15_000 });
  });

  test("live state drill-down: hot KPI opens Leads Intelligence with the Hot filter", async ({ page }) => {
    const liveBody = page.getByTestId("workspace-live-body");
    if ((await liveBody.count()) === 0) {
      test.skip(true, "seeded event is not live — drill-down covered by node contract tests");
    }
    const hotKpi = page.getByTestId("workspace-live-kpi-hot_needing_follow_up");
    await expect(hotKpi).toBeVisible({ timeout: 15_000 });
    // KPI is a link only when the count query succeeded.
    if ((await hotKpi.evaluate((el) => el.tagName)) === "A") {
      await hotKpi.click();
      await expectExhibitorLeadsList(page);
      await expect(temperatureFilter(page)).toHaveValue("hot", { timeout: 15_000 });
    }
  });

  test("completed state shows follow-up readiness and real next actions", async ({ page }) => {
    const completedBody = page.getByTestId("workspace-completed-body");
    if ((await completedBody.count()) === 0) {
      test.skip(true, "seeded event is not completed — covered by node contract tests");
    }
    await expect(page.getByTestId("workspace-follow-up-readiness")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("workspace-take-it-further")).toBeVisible({ timeout: 15_000 });
  });

  test("upcoming state shows the readiness checklist", async ({ page }) => {
    const upcomingBody = page.getByTestId("workspace-upcoming-body");
    if ((await upcomingBody.count()) === 0) {
      test.skip(true, "seeded event is not upcoming — covered by node contract tests");
    }
    await expect(page.getByTestId("workspace-readiness-checklist")).toBeVisible({ timeout: 15_000 });
  });
});
