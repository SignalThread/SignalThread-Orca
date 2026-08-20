import { config as loadEnv } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { createSpeakerIntakeToken } from "../src/server/services/speaker-intake";
import { getPrisma } from "../src/server/db/prisma";
import { generateSpeakerPortalToken } from "../src/server/services/speaker-portal-tokens";

loadEnv({ path: "../.env.local" });
loadEnv({ path: ".env.local" });
loadEnv();

const prisma = getPrisma();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.HELP_SCREENSHOT_BASE_URL?.trim() || "http://127.0.0.1:3100";
const eventId = "ae4325f3-6a76-469e-ab50-78d0dcd4a4aa";
const docsRoot = path.resolve(scriptDir, "../../docs/help");
const outputDir = path.resolve(scriptDir, "../public/help/screenshots");
const screenshotPathPrefix = "/help/screenshots";
const plannerEmail = "help-center@planneros.com";
const timezoneId = "America/New_York";

type CaptureContext = {
  awardsDinnerSessionId: string;
  openingSessionId: string;
  jenniferSpeakerId: string;
  portalToken: string;
  intakeToken: string;
};

type CaptureDefinition = {
  id: string;
  alt: string;
  file: string;
  width: number;
  height: number;
  run: (page: Page, ctx: CaptureContext) => Promise<void>;
};

type Omission = {
  id: string;
  reason: string;
};

const omissions: Omission[] = [
  { id: "HC-04", reason: "Event Builder event-details state is not seeded into a stable, deterministic planner-facing screenshot flow yet." },
  { id: "HC-05", reason: "Event Builder starting-point cards are available, but the guided setup flow is still better documented in prose until the capture path is stabilized." },
  { id: "HC-06", reason: "Spreadsheet mapping requires a curated import fixture and produces fragile modal state in local development." },
  { id: "HC-07", reason: "Spreadsheet review totals depend on the same unstabilized import fixture pipeline as HC-06." },
  { id: "HC-20", reason: "The Budget Approvals drawer is planner-facing, but the exact reviewer-decision state remained inconsistent enough in local capture to avoid a misleading screenshot." },
  { id: "HC-21", reason: "Budget import mapping and invalid-row preview still need a purpose-built import fixture to produce a durable screenshot." },
  { id: "HC-22", reason: "The Tools menu is available, but the filtered-export state was deferred until the import/export capture flow is stabilized end to end." },
  { id: "HC-36", reason: "Directory import preview needs a seeded upload artifact and row-mapping state that is not yet deterministic enough for documentation." },
  { id: "HC-44", reason: "The New Campaign form is planner-facing, but the create/edit modal state still needs tighter automation before it belongs in the reusable library." },
  { id: "HC-45", reason: "Email-editor preview state depends on multi-step send composition and recipient preview setup that was deferred for accuracy." },
  { id: "HC-48", reason: "Platform Administration is intentionally excluded from customer-facing documentation." },
  { id: "HC-50", reason: "Room Set & Seating is documented as coming soon; no screenshot was added until the disabled entry can be captured cleanly without implying release readiness." },
];

const captureDefinitions: CaptureDefinition[] = [
  {
    id: "HC-01",
    alt: "Account Command Center showing portfolio KPIs and the Event Snapshot table for the Help Center demo organization.",
    file: "hc-01-use-the-account-command-center.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, "/dashboard", "Event Snapshot");
    },
  },
  {
    id: "HC-02",
    alt: "Action Center Risks view grouped by event with cross-event risk rows for the Help Center portfolio.",
    file: "hc-02-use-the-action-center.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, "/dashboard/action-center?view=risks", "Risk Queue");
    },
  },
  {
    id: "HC-03",
    alt: "Action Center Approvals view showing budget and document approval work across multiple events.",
    file: "hc-03-understand-approvals-in-orca.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, "/dashboard/action-center?view=approvals", "Approval Queue");
    },
  },
  {
    id: "HC-08",
    alt: "Event Command Center with the event sidebar expanded to show Event Directory navigation.",
    file: "hc-08-understand-event-workspace-navigation.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}`, "Command Center");
      const expand = page.getByRole("button", { name: /Expand Event Directory/i });
      if (await expand.isVisible().catch(() => false)) {
        await expand.click();
        await settle(page);
      }
    },
  },
  {
    id: "HC-09",
    alt: "Notifications menu opened from the dashboard with unread and read notification rows.",
    file: "hc-09-use-notifications.png",
    width: 1280,
    height: 900,
    run: async (page) => {
      await goto(page, "/dashboard", "Command Center");
      await page.getByRole("button", { name: "Notifications" }).click();
      await page.getByRole("heading", { name: "Notifications" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-10",
    alt: "Event Command Center for Annual Sales Conference 2026 showing health metrics, readiness, and financial exposure.",
    file: "hc-10-use-the-event-command-center.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}`, "Financial Exposure");
    },
  },
  {
    id: "HC-11",
    alt: "Event Command Center in dashboard editing mode with layout controls visible.",
    file: "hc-11-customize-the-event-command-center.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}`, "Command Center");
      await page.getByRole("button", { name: "Customize dashboard" }).click();
      await page.getByRole("button", { name: "Add or hide widgets" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-12",
    alt: "Roadmap Dashboard view with total, at-risk, overdue, and workstream summary cards.",
    file: "hc-12-use-the-roadmap.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/timeline`, "At risk");
    },
  },
  {
    id: "HC-13",
    alt: "Roadmap Matrix view with filters open for editable timeline rows.",
    file: "hc-13-use-the-roadmap.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/timeline`, "Roadmap");
      await page.getByRole("button", { name: "Matrix" }).click();
      await page.getByRole("button", { name: /^Filters/ }).click();
      await page.getByLabel("Filter by workstream").waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-14",
    alt: "Roadmap Workstream view showing dated items and dependency lines.",
    file: "hc-14-use-the-roadmap.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/timeline`, "Roadmap");
      await page.getByRole("button", { name: "Workstream" }).click();
      await settle(page, 1200);
    },
  },
  {
    id: "HC-15",
    alt: "Roadmap Board view with work items distributed across multiple status columns.",
    file: "hc-15-use-the-roadmap.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/timeline`, "Roadmap");
      await page.getByRole("button", { name: "Board", exact: true }).click();
      await settle(page, 1200);
    },
  },
  {
    id: "HC-16",
    alt: "Budget dashboard showing forecast, actual, variance, and the budget work queue.",
    file: "hc-16-use-the-budget-dashboard.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/budget`, "Budget Work Queue");
      await waitForBudgetDashboardLoaded(page);
    },
  },
  {
    id: "HC-17",
    alt: "Full Budget Grid with categories, vendors, approval states, and linked session data.",
    file: "hc-17-manage-the-full-budget-grid.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/budget?view=grid`, "Full Budget Grid");
      await waitForBudgetGridLoaded(page);
    },
  },
  {
    id: "HC-18",
    alt: "Full Budget Grid filters panel with active category and approval filters.",
    file: "hc-18-manage-the-full-budget-grid.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/budget?view=grid`, "Full Budget Grid");
      await waitForBudgetGridLoaded(page);
      await page.getByRole("button", { name: /^Filters/ }).click();
      await page.getByLabel("Filter by category").selectOption("AV & Production");
      await page.getByLabel("Filter by approval").selectOption("PENDING");
      await page.getByRole("button", { name: /Filters · 2/ }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-19",
    alt: "Submit for approval modal with a reviewer selected and a review message entered for a budget line item.",
    file: "hc-19-submit-and-review-budget-approvals.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/budget?view=grid`, "Full Budget Grid");
      await waitForBudgetGridLoaded(page);
      await page.getByRole("button", { name: /Needs submission/i }).first().click();
      await page.getByRole("heading", { name: "Submit for approval" }).waitFor();
      await page.getByLabel("Emily Chen").check();
      await page.getByLabel("Message (optional)").fill("Please confirm the latest scope and cost details before we lock vendor terms.");
      await settle(page);
    },
  },
  {
    id: "HC-23",
    alt: "Run of Show board in Rooms by time orientation with multiple rooms and overlapping sessions.",
    file: "hc-23-use-the-run-of-show.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/matrix`, "Run of Show");
      await settle(page, 1200);
    },
  },
  {
    id: "HC-24",
    alt: "Run of Show board in Time by room orientation.",
    file: "hc-24-choose-board-or-list-view.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/matrix`, "Run of Show");
      const toggle = page.getByRole("button", { name: /Time by room/i });
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
      }
      await settle(page, 1200);
    },
  },
  {
    id: "HC-25",
    alt: "Run of Show list view with filters open for Missing speakers and Missing F&B.",
    file: "hc-25-choose-board-or-list-view.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/matrix`, "Run of Show");
      await page.getByRole("button", { name: "List" }).click();
      await page.getByRole("columnheader", { name: "Drag to reorder Session column" }).waitFor();
      await page.getByRole("button", { name: /^Filters/ }).click();
      await page.locator("#matrix-list-filter-speakers").selectOption("MISSING");
      await page.locator("#matrix-list-filter-fnb").selectOption("MISSING");
      await settle(page);
    },
  },
  {
    id: "HC-26",
    alt: "Add session dialog with title, date, time, room, and session type fields visible.",
    file: "hc-26-create-and-edit-sessions.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/matrix`, "Run of Show");
      await page.getByRole("button", { name: "Add session" }).click();
      await page.getByRole("heading", { name: "Add session" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-27",
    alt: "Run of Show session quick drawer with the Speakers panel open for an assigned session.",
    file: "hc-27-assign-speakers-to-sessions.png",
    width: 1440,
    height: 1000,
    run: async (page, ctx) => {
      await goto(page, `/events/${eventId}/matrix`, "Run of Show");
      await page.locator(`[data-matrix2-session-card-id="${ctx.openingSessionId}"]`).click();
      await page.getByRole("group", { name: /Quick actions for Opening General Session/i }).getByRole("button", { name: "Speakers" }).click();
      await page.getByRole("region", { name: "Speakers quick panel" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-28",
    alt: "Session workspace for Awards Dinner with section navigation and readiness cards.",
    file: "hc-28-use-the-session-workspace.png",
    width: 1440,
    height: 1000,
    run: async (page, ctx) => {
      await goto(page, `/events/${eventId}/matrix/sessions/${ctx.awardsDinnerSessionId}`, "Conflicts");
    },
  },
  {
    id: "HC-29",
    alt: "Session workspace F&B Planner showing assigned catalog items, estimate, and variance to budget.",
    file: "hc-29-assign-fnb-to-sessions.png",
    width: 1440,
    height: 1000,
    run: async (page, ctx) => {
      await goto(page, `/events/${eventId}/matrix/sessions/${ctx.awardsDinnerSessionId}`, "Conflicts");
      const button = page.getByRole("button", { name: /F&B/i }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
      }
      await page.getByRole("heading", { name: "F&B Planner" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-30",
    alt: "Docs Hub with multiple document states across categories.",
    file: "hc-30-use-the-docs-hub.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/docs`, "Upload Document");
    },
  },
  {
    id: "HC-31",
    alt: "Upload Document modal showing category, linked record, visibility, and review options.",
    file: "hc-31-use-the-docs-hub.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/docs`, "Upload Document");
      await page.getByRole("button", { name: "Upload Document" }).click();
      await page.getByRole("heading", { name: "Upload Document" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-32",
    alt: "Document Details drawer for an in-review document with recipients and Pull back visible.",
    file: "hc-32-use-the-docs-hub.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/docs`, "Upload Document");
      await page.getByRole("button").filter({ hasText: "Budget Workbook" }).first().click();
      await page.getByText("Document Details").waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-33",
    alt: "Event settings overview showing Run of Show and workspace cards.",
    file: "hc-33-configure-event-settings.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/settings`, "Event settings");
    },
  },
  {
    id: "HC-34",
    alt: "AV Requirements settings detail showing reusable sections and items.",
    file: "hc-34-configure-event-settings.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/settings`, "Event settings");
      await page.getByText("AV Requirements").first().click();
      await page.getByRole("heading", { name: "AV Requirements" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-35",
    alt: "Event Directory with mixed roles and the selection toolbar visible.",
    file: "hc-35-use-the-directory.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/directory`, "Total people");
      await page.getByLabel("Select Taylor Nguyen").check();
      await page.getByRole("button", { name: "Email selected" }).waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-37",
    alt: "Attendees view with registered, pending or waitlisted, and sync conflict states represented.",
    file: "hc-37-manage-attendees.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/attendees`, "Sync conflicts");
    },
  },
  {
    id: "HC-38",
    alt: "Speaker Directory with readiness tiles and the Missing deck filter selected.",
    file: "hc-38-track-speaker-readiness.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/speakers`, "Speaker Readiness");
      await page.getByRole("button", { name: /Missing deck/i }).click();
      await settle(page);
    },
  },
  {
    id: "HC-39",
    alt: "Speaker detail Overview for Jennifer Adams with readiness, portal link, and pending submission cards.",
    file: "hc-39-manage-speakers.png",
    width: 1440,
    height: 1000,
    run: async (page, ctx) => {
      await goto(page, `/events/${eventId}/speakers/${ctx.jenniferSpeakerId}`, "Speaker Portal");
    },
  },
  {
    id: "HC-40",
    alt: "Speaker Intake page with profile fields, headshot controls, and the submit action.",
    file: "hc-40-use-speaker-intake.png",
    width: 1280,
    height: 900,
    run: async (page, ctx) => {
      await goto(page, `/speaker-intake/${ctx.intakeToken}`, "Update your speaker profile");
    },
  },
  {
    id: "HC-41",
    alt: "Speaker Portal overview showing readiness, presentations, and required documents.",
    file: "hc-41-use-the-speaker-portal.png",
    width: 1280,
    height: 900,
    run: async (page, ctx) => {
      await goto(page, `/speaker-portal/${ctx.portalToken}`, "Readiness");
      await page.getByRole("button", { name: "Presentations", exact: true }).waitFor();
    },
  },
  {
    id: "HC-42",
    alt: "Speaker Documents section showing a signature-required request and a submitted file awaiting review.",
    file: "hc-42-request-and-review-speaker-documents.png",
    width: 1440,
    height: 1000,
    run: async (page, ctx) => {
      await goto(page, `/events/${eventId}/speakers/${ctx.jenniferSpeakerId}`, "Speaker Portal");
      await page.getByRole("button", { name: "Documents" }).click();
      await page.getByText("Signature required").waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-43",
    alt: "Marketing Overview showing campaign, planned send, and performance panels.",
    file: "hc-43-use-marketing.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/marketing`, "Performance");
    },
  },
  {
    id: "HC-46",
    alt: "Marketing Compliance tab with an event suppression and the Resubscribe action visible.",
    file: "hc-46-review-marketing-approvals-and-compliance.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/marketing`, "Performance");
      await page.getByRole("button", { name: "Compliance" }).click();
      await page.getByText("Resubscribe").waitFor();
      await settle(page);
    },
  },
  {
    id: "HC-47",
    alt: "F&B Catalog preview showing approved catalog items and the prototype notice.",
    file: "hc-47-use-the-fnb-catalog.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, `/events/${eventId}/fnb-catalog`, "Approved Catalog Items");
    },
  },
  {
    id: "HC-49",
    alt: "Portfolio Reports preview page showing the current placeholder state.",
    file: "hc-49-understand-portfolio-reports-and-activity.png",
    width: 1440,
    height: 1000,
    run: async (page) => {
      await goto(page, "/reports", "Portfolio Reports");
    },
  },
];

async function settle(page: Page, timeout = 900) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(timeout);
}

async function waitForBudgetDashboardLoaded(page: Page) {
  await page.getByText("Loading budget blocks...").waitFor({ state: "hidden", timeout: 120_000 });
  await page.getByText("Loading budget for event...").waitFor({ state: "hidden", timeout: 120_000 });
  await settle(page, 1200);
}

async function waitForBudgetGridLoaded(page: Page) {
  await page.getByText("Loading budget line items...").waitFor({ state: "hidden", timeout: 120_000 });
  await page.getByText("Loading budget for event...").waitFor({ state: "hidden", timeout: 120_000 });
  await settle(page, 1200);
}

async function goto(page: Page, route: string, waitForText: string) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText(waitForText, { exact: false }).first().waitFor({ timeout: 120_000 });
  await settle(page, 1200);
}

async function saveCapture(page: Page, definition: CaptureDefinition) {
  await page.setViewportSize({ width: definition.width, height: definition.height });
  await page.screenshot({
    path: path.join(outputDir, definition.file),
    fullPage: false,
  });
}

function selectedCaptureIds(): Set<string> {
  const raw = process.env.HELP_SCREENSHOT_IDS?.trim();
  if (!raw) return new Set(captureDefinitions.map((capture) => capture.id));
  return new Set(raw.split(",").map((value) => value.trim()).filter(Boolean));
}

async function loadCaptureContext(): Promise<CaptureContext> {
  const planner = await prisma.user.findUniqueOrThrow({
    where: { email: plannerEmail },
    select: { id: true, orgId: true, role: true },
  });
  const awardsDinner = await prisma.matrixRow.findFirstOrThrow({
    where: { eventId, sessionName: "Awards Dinner" },
    select: { id: true },
  });
  const openingSession = await prisma.matrixRow.findFirstOrThrow({
    where: { eventId, sessionName: "Opening General Session" },
    select: { id: true },
  });
  const jennifer = await prisma.speaker.findFirstOrThrow({
    where: { eventId, name: "Jennifer Adams" },
    select: { id: true },
  });

  const portalGrant = await generateSpeakerPortalToken(
    eventId,
    jennifer.id,
    { id: planner.id, orgId: planner.orgId, role: planner.role },
    { origin: baseUrl },
  );
  const intakeGrant = createSpeakerIntakeToken({ eventId, speakerId: jennifer.id });

  return {
    awardsDinnerSessionId: awardsDinner.id,
    openingSessionId: openingSession.id,
    jenniferSpeakerId: jennifer.id,
    portalToken: portalGrant.token,
    intakeToken: intakeGrant.token,
  };
}

async function integrateDocs(captured: CaptureDefinition[]) {
  const files = await walkMarkdownFiles(docsRoot);
  for (const filePath of files) {
    let text = await fs.readFile(filePath, "utf8");
    for (const capture of captured) {
      const pattern = new RegExp(
        `<!-- SCREENSHOT NEEDED\\n[\\s\\S]*?Purpose: ${capture.id}[^\\n]*\\n[\\s\\S]*?-->`,
        "g",
      );
      text = text.replace(pattern, `![${capture.alt}](${screenshotPathPrefix}/${capture.file})`);
    }
    await fs.writeFile(filePath, text);
  }
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function listCapturedIds(): Promise<string[]> {
  const results: string[] = [];
  for (const definition of captureDefinitions) {
    try {
      await fs.access(path.join(outputDir, definition.file));
      results.push(definition.id);
    } catch {
      // Skip uncaptured definitions.
    }
  }
  return results;
}

async function updateScreenshotPlan() {
  const planPath = path.join(docsRoot, "SCREENSHOT_PLAN.md");
  const plan = await fs.readFile(planPath, "utf8");
  const header = "\n## Capture Status\n";
  const capturedIds = await listCapturedIds();
  const captureLines = capturedIds.map((id) => `- \`${id}\` captured and integrated into the Help Center library.`);
  const omissionLines = omissions.map((entry) => `- \`${entry.id}\`: ${entry.reason}`);
  const section = `${header}\n### Captured\n\n${captureLines.join("\n")}\n\n### Remaining Omissions\n\n${omissionLines.join("\n")}\n`;
  const next = plan.includes(header)
    ? plan.replace(new RegExp(`${header}[\\s\\S]*$`), section)
    : `${plan.trimEnd()}\n${section}`;
  await fs.writeFile(planPath, next);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const captureIds = selectedCaptureIds();
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    timezoneId,
  });
  const page = await context.newPage();
  const ctx = await loadCaptureContext();

  const completed: CaptureDefinition[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  try {
    for (const definition of captureDefinitions) {
      if (!captureIds.has(definition.id)) continue;
      console.log(`[help-screenshots] Capturing ${definition.id}`);
      try {
        await definition.run(page, ctx);
        await saveCapture(page, definition);
        completed.push(definition);
      } catch (error) {
        failed.push({
          id: definition.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`[help-screenshots] Failed ${definition.id}: ${failed.at(-1)?.error}`);
      }
    }
  } finally {
    await browser.close();
  }

  await integrateDocs(completed);
  await updateScreenshotPlan();

  console.log(
    JSON.stringify(
      {
        captured: completed.map((definition) => definition.id),
        failed,
        omitted: omissions.map((entry) => entry.id),
        outputDir,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
