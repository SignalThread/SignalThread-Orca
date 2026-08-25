import { expect, test } from "@playwright/test";
import {
  createPlannerP0BrowserFixture,
  usePlannerOrgContext,
} from "./helpers/planner-e2e";

const viewports = [
  { name: "wide desktop", width: 1440, columns: 6 },
  { name: "extra-wide desktop", width: 1728, columns: 6 },
  { name: "laptop", width: 1280, columns: 4 },
  { name: "narrow laptop", width: 1024, columns: 3 },
  { name: "mobile", width: 390, columns: 1 },
] as const;

test("Command Center uses the available width without horizontal overflow", async ({
  baseURL,
  context,
  page,
}) => {
  const fixture = await createPlannerP0BrowserFixture();

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();

    const shell = page.getByTestId("command-center-shell");
    const actions = page.getByTestId("command-center-actions");

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: 900 });
      await expect(shell).toBeVisible();

      const metrics = await page.evaluate(() => {
        const shellElement = document.querySelector<HTMLElement>(
          '[data-testid="command-center-shell"]',
        );
        const gridElement = document.querySelector<HTMLElement>(
          '[data-testid="command-center-kpi-grid"]',
        );
        const headerElement = document.querySelector<HTMLElement>(
          '[data-testid="command-center-header"]',
        );

        if (!shellElement || !gridElement || !headerElement) {
          throw new Error("Command Center layout hooks are missing");
        }

        const panelTitles = [
          "Portfolio Timeline",
          "Upcoming Deadlines",
          "Portfolio Financial Health",
          "Event Budget Overview",
        ];
        const panels = panelTitles.map((title) => {
          const heading = Array.from(document.querySelectorAll("h2")).find(
            (element) => element.textContent?.trim() === title,
          );
          const panel = heading?.closest("section");
          if (!panel) throw new Error(`Missing dashboard panel: ${title}`);
          const rect = panel.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        });

        const cardMetrics = Array.from(gridElement.children).map((card) => {
          const element = card as HTMLElement;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            height: rect.height,
            width: rect.width,
            backgroundColor: style.backgroundColor,
          };
        });

        return {
          gridColumns: getComputedStyle(gridElement).gridTemplateColumns
            .trim()
            .split(/\s+/).length,
          shellWidth: shellElement.getBoundingClientRect().width,
          shellLeft: shellElement.getBoundingClientRect().left,
          shellRight: shellElement.getBoundingClientRect().right,
          contentLeft: shellElement.parentElement?.getBoundingClientRect().left ?? 0,
          contentRight: shellElement.parentElement?.getBoundingClientRect().right ?? 0,
          viewportWidth: window.innerWidth,
          headerBottom: headerElement.getBoundingClientRect().bottom,
          gridTop: gridElement.getBoundingClientRect().top,
          cardMetrics,
          panels,
          hasHorizontalOverflow:
            document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      expect(metrics.gridColumns, `${viewport.name} KPI columns`).toBe(viewport.columns);
      expect(metrics.shellWidth).toBeGreaterThan(0);
      expect(metrics.shellWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.shellLeft, `${viewport.name} shell left alignment`).toBeCloseTo(
        metrics.contentLeft,
        0,
      );
      expect(metrics.shellRight, `${viewport.name} shell right alignment`).toBeCloseTo(
        metrics.contentRight,
        0,
      );
      expect(metrics.gridTop, `${viewport.name} header overlap`).toBeGreaterThanOrEqual(
        metrics.headerBottom,
      );
      expect(metrics.cardMetrics, `${viewport.name} KPI cards`).toHaveLength(6);
      for (const card of metrics.cardMetrics) {
        expect(card.height, `${viewport.name} KPI card height`).toBeGreaterThanOrEqual(88);
        expect(card.width, `${viewport.name} KPI card width`).toBeGreaterThan(0);
        expect(card.backgroundColor, `${viewport.name} KPI card background`).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
      }
      for (const panel of metrics.panels) {
        expect(panel.width, `${viewport.name} panel width`).toBeGreaterThan(0);
        expect(panel.left, `${viewport.name} panel left bound`).toBeGreaterThanOrEqual(0);
        expect(panel.right, `${viewport.name} panel right bound`).toBeLessThanOrEqual(
          viewport.width,
        );
      }
      expect(metrics.hasHorizontalOverflow, `${viewport.name} overflow`).toBe(false);
    }

    await page.setViewportSize({ width: 390, height: 900 });
    await expect(
      actions.getByRole("link", { name: "Open Event Builder to create an event" }),
    ).toBeVisible();
    const actionMetrics = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(
        '[data-testid="command-center-header"]',
      );
      const actions = document.querySelector<HTMLElement>(
        '[data-testid="command-center-actions"]',
      );
      if (!header || !actions) {
        throw new Error("Command Center header hooks are missing");
      }

      const intro = header.firstElementChild;
      const createEvent = actions.querySelector<HTMLElement>('a[href="/events/new"]');
      if (!intro || !createEvent) throw new Error("Command Center header actions are missing");

      const introRect = intro.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const createRect = createEvent.getBoundingClientRect();
      return {
        actionGap: actionsRect.top - introRect.bottom,
        actionsWidth: actionsRect.width,
        createWidth: createRect.width,
      };
    });
    expect(actionMetrics.actionGap).toBeLessThan(80);
    expect(actionMetrics.createWidth).toBeCloseTo(actionMetrics.actionsWidth, 0);
  } finally {
    await fixture.harness.cleanup();
  }
});
