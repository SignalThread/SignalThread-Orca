import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildEventQuickActions,
  deriveEventIdentity,
  eventLifecycleBadgeLabel,
  type EventIdentityRow
} from "@/lib/exhibitor/event-command-center";

function row(partial: Partial<EventIdentityRow>): EventIdentityRow {
  return {
    id: "evt-1",
    name: "Tech Summit 2026",
    status: "ACTIVE",
    start_date: "2026-07-18",
    end_date: "2026-07-21",
    city: "San Francisco",
    state: "CA",
    container_kind: "event",
    ...partial
  };
}

/** A day inside the default row's date range. */
const DURING = "2026-07-19";

/* ============================== Event identity ============================== */

describe("deriveEventIdentity — canonical identity fields", () => {
  it("renders name, lifecycle, dates, and location from a well-formed row", () => {
    const identity = deriveEventIdentity({
      fallbackName: "Fallback",
      fallbackContainerKind: "event",
      row: row({}),
      todayYmd: DURING
    });
    assert.equal(identity.name, "Tech Summit 2026");
    assert.equal(identity.detailsAvailable, true);
    assert.equal(identity.lifecycle, "live");
    assert.equal(identity.lifecycleLabel, "Live");
    assert.equal(identity.dateText, "Jul 18, 2026 – Jul 21, 2026");
    assert.equal(identity.locationText, "San Francisco, CA");
    assert.equal(identity.isContinuousCapture, false);
  });

  it("lifecycle is date-derived: the same stored status maps by the calendar day", () => {
    const lifecycleOn = (todayYmd: string) =>
      deriveEventIdentity({ fallbackName: "", fallbackContainerKind: null, row: row({}), todayYmd });
    assert.equal(lifecycleOn("2026-07-17").lifecycleLabel, "Upcoming");
    assert.equal(lifecycleOn("2026-07-18").lifecycleLabel, "Live");
    assert.equal(lifecycleOn("2026-07-21").lifecycleLabel, "Live");
    assert.equal(lifecycleOn("2026-07-22").lifecycleLabel, "Completed");
  });

  it("explicit COMPLETED status is honored even inside the date range", () => {
    const identity = deriveEventIdentity({
      fallbackName: "",
      fallbackContainerKind: null,
      row: row({ status: "COMPLETED" }),
      todayYmd: DURING
    });
    assert.equal(identity.lifecycleLabel, "Completed");
  });

  it("without dates the stored status decides; unknown status resolves to Upcoming", () => {
    const lifecycleOf = (status: string | null) =>
      deriveEventIdentity({
        fallbackName: "",
        fallbackContainerKind: null,
        row: row({ status, start_date: null, end_date: null }),
        todayYmd: DURING
      });
    assert.equal(lifecycleOf("ACTIVE").lifecycleLabel, "Live");
    assert.equal(lifecycleOf("UPCOMING").lifecycleLabel, "Upcoming");
    assert.equal(lifecycleOf("COMPLETED").lifecycleLabel, "Completed");
    assert.equal(lifecycleOf("DRAFT_LEGACY").lifecycleLabel, "Upcoming");
    assert.equal(lifecycleOf(null).lifecycleLabel, "Upcoming");
    assert.equal(eventLifecycleBadgeLabel("unknown"), "Unknown status");
  });

  it("handles missing dates and missing location via the canonical formatters", () => {
    const identity = deriveEventIdentity({
      fallbackName: "",
      fallbackContainerKind: null,
      row: row({ start_date: null, end_date: null, city: null, state: null }),
      todayYmd: DURING
    });
    assert.equal(identity.dateText, "Dates TBD");
    assert.equal(identity.locationText, null);
  });

  it("continuous-capture events suppress the date range, set the indicator, and read as Live", () => {
    const identity = deriveEventIdentity({
      fallbackName: "",
      fallbackContainerKind: null,
      row: row({ container_kind: "continuous_capture" }),
      todayYmd: DURING
    });
    assert.equal(identity.isContinuousCapture, true);
    assert.equal(identity.dateText, null);
    assert.equal(identity.lifecycleLabel, "Live");
  });

  it("degrades honestly when the details row is unavailable: fallback name only, no invented fields", () => {
    const identity = deriveEventIdentity({
      fallbackName: "DevCon East 2026",
      fallbackContainerKind: "continuous_capture",
      row: null,
      todayYmd: DURING
    });
    assert.equal(identity.name, "DevCon East 2026");
    assert.equal(identity.detailsAvailable, false);
    assert.equal(identity.lifecycle, null);
    assert.equal(identity.lifecycleLabel, null);
    assert.equal(identity.dateText, null);
    assert.equal(identity.locationText, null);
    assert.equal(identity.isContinuousCapture, true, "container kind falls back to the summary");
  });

  it("falls back to a safe generic name when both sources are blank", () => {
    const identity = deriveEventIdentity({
      fallbackName: "  ",
      fallbackContainerKind: null,
      row: null,
      todayYmd: DURING
    });
    assert.equal(identity.name, "Event");
  });
});

/* ============================== Quick actions ============================== */

describe("buildEventQuickActions — permission-verified destinations only", () => {
  it("viewers (no manage permission) get no management actions", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: false,
      allowsAppEventsManagementSurfaces: false,
      eventLevelTenantUi: false
    });
    assert.deepEqual(actions, []);
  });

  it("does not emit a Leads card — Leads Intelligence is not duplicated as a card", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: true,
      allowsAppEventsManagementSurfaces: true,
      eventLevelTenantUi: false
    });
    assert.equal(actions.some((a) => (a.key as string) === "leads"), false);
    assert.equal(actions.some((a) => a.href.startsWith("/exhibitor/leads")), false);
  });

  it("portfolio admins get campaigns, users, and per-event settings", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: true,
      allowsAppEventsManagementSurfaces: true,
      eventLevelTenantUi: false
    });
    assert.deepEqual(actions.map((a) => a.key), ["campaigns", "users", "settings"]);
    assert.equal(actions.find((a) => a.key === "campaigns")?.href, "/exhibitor/campaigns");
    assert.equal(actions.find((a) => a.key === "users")?.href, "/exhibitor/users");
    assert.equal(actions.find((a) => a.key === "settings")?.href, "/app/events/evt-9/settings");
  });

  it("labels scope honestly: campaigns and users are company-scoped, settings is event-scoped", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: true,
      allowsAppEventsManagementSurfaces: true,
      eventLevelTenantUi: false
    });
    assert.equal(actions.find((a) => a.key === "campaigns")?.scope, "company");
    assert.equal(actions.find((a) => a.key === "users")?.scope, "company");
    assert.equal(actions.find((a) => a.key === "settings")?.scope, "event");
    // Company-scoped copy must not claim event scope.
    assert.doesNotMatch(actions.find((a) => a.key === "campaigns")!.description, /this event/i);
    assert.doesNotMatch(actions.find((a) => a.key === "users")!.description, /this event/i);
  });

  it("event-level tenant admins get the consolidated /exhibitor/settings target", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: true,
      allowsAppEventsManagementSurfaces: false,
      eventLevelTenantUi: true
    });
    assert.equal(actions.find((a) => a.key === "settings")?.href, "/exhibitor/settings");
  });

  it("admins without a management surface get no settings action rather than a broken link", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: true,
      allowsAppEventsManagementSurfaces: false,
      eventLevelTenantUi: false
    });
    assert.equal(actions.some((a) => a.key === "settings"), false);
  });

  it("every href is an existing production destination (no prototype routes)", () => {
    const actions = buildEventQuickActions({
      eventId: "evt-9",
      canManage: true,
      allowsAppEventsManagementSurfaces: true,
      eventLevelTenantUi: false
    });
    for (const a of actions) {
      assert.match(
        a.href,
        /^\/(exhibitor\/(campaigns|users|settings)|app\/events\/[^/]+\/settings)/,
        `unexpected destination: ${a.href}`
      );
    }
  });
});

/* ============================== Page source contract ============================== */

const pageSrc = readFileSync(
  path.join(process.cwd(), "app/(app)/exhibitor/dashboard/page.tsx"),
  "utf8"
);
const shellSrc = readFileSync(
  path.join(process.cwd(), "app/(app)/exhibitor/dashboard/event-workspace-shell.tsx"),
  "utf8"
);

describe("event workspace page — source contract", () => {
  it("event metadata comes from the shared loader for the resolved active event id", () => {
    assert.match(pageSrc, /resolveExhibitorAppActiveEventId\(/);
    assert.match(pageSrc, /loadEventWorkspaceEventRow\(eventId\)/);
  });

  it("identity and settings destinations come from the pure helpers, not page-local logic", () => {
    assert.match(pageSrc, /deriveEventIdentity\(\{/);
    assert.match(pageSrc, /buildEventQuickActions\(\{/);
    assert.doesNotMatch(pageSrc, /formatEventDateRange|formatEventLocation|eventPortfolioLifecycleForStatus/);
  });

  it("event-details failure degrades the header without blocking the workspace", () => {
    assert.match(shellSrc, /Event details are unavailable right now/);
  });

  it("viewer create-event gating and access invariants remain untouched", () => {
    assert.match(pageSrc, /requireExhibitorScope\(\)/);
    assert.match(
      pageSrc,
      /createEventHref\s*=[\s\S]*?canManage\s*&&[\s\S]*?access\.role\s*===\s*"exhibitor_admin"[\s\S]*?exhibitorAdminMayUseAppEventManagementRoutes/
    );
    assert.match(pageSrc, /redirect\(`\/exhibitor\/dashboard\?eventId=\$\{encodeURIComponent\(resolvedEventId\)\}`\)/);
  });

  it("no deeper-dashboard controls appear (Phase 1 boundary)", () => {
    const combined = pageSrc + "\n" + shellSrc;
    assert.doesNotMatch(combined, /Real-?Time Intelligence|Executive Intelligence|View Coaching|Coaching Dashboard|Product & Market/i);
    assert.doesNotMatch(combined, /toast/i);
  });

  it("the shared shell renders the header through PageHeader with the event identity", () => {
    assert.match(shellSrc, /data-testid="event-workspace-header"/);
    assert.match(shellSrc, /PageHeader/);
    assert.match(shellSrc, /variant="panel"/, "compact header, not an oversized hero");
  });
});
