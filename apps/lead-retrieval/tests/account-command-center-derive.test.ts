import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRecommendedNextSteps,
  computeAccountKpis,
  deriveAccountFollowUpStatus,
  deriveLifecycleEventCards,
  filterLifecycleEventCards,
  deriveAccountSetupItems as deriveAccountSetupItemsAt,
  deriveLeadThemes,
  deriveRecentActivity,
  selectWhatMattersNow,
  summarizeSeats,
  summarizeTeamReadiness,
  type AccountEventRow,
  type ThemeLeadRow
} from "@/lib/events/account-command-center-core";
import { getEventCalendarDay } from "@/lib/events/event-calendar";
import { groupEventsForPortfolio as groupEventsForPortfolioAt } from "@/lib/events/event-portfolio";

function ev(partial: Partial<AccountEventRow> & { id: string }): AccountEventRow {
  return {
    name: `Event ${partial.id}`,
    start_date: "2026-08-01",
    end_date: "2026-08-03",
    status: "UPCOMING",
    container_kind: "event",
    city: "Chicago",
    state: "IL",
    created_at: "2026-06-01T10:00:00.000Z",
    ...partial
  };
}

const TODAY = "2026-07-21";
const deriveAccountSetupItems = (
  input: Omit<Parameters<typeof deriveAccountSetupItemsAt>[0], "todayYmd">
) => deriveAccountSetupItemsAt({ ...input, todayYmd: TODAY });
const groupEventsForPortfolio = (events: readonly AccountEventRow[]) =>
  groupEventsForPortfolioAt(events, TODAY);

/* ============================== Setup items ============================== */

describe("deriveAccountSetupItems", () => {
  it("flags live and upcoming events missing dates or location, with severity by lifecycle", () => {
    const items = deriveAccountSetupItems({
      events: [
        ev({ id: "live-bad", status: "ACTIVE", start_date: null, end_date: null }),
        ev({ id: "up-bad", status: "UPCOMING", city: null, state: null }),
        ev({ id: "ok", status: "UPCOMING" }),
        ev({ id: "done-bad", status: "COMPLETED", start_date: null, end_date: null, city: null, state: null })
      ],
      pendingInviteCount: 0,
      licenses: [{ id: "l1", seats_total: 5, seats_used: 2 }]
    });
    const keys = items.map((i) => i.key);
    assert.ok(keys.includes("event-details:live-bad"));
    assert.ok(keys.includes("event-details:up-bad"));
    assert.ok(!keys.includes("event-details:ok"));
    assert.ok(!keys.includes("event-details:done-bad"), "completed events are not setup items");
    assert.equal(items.find((i) => i.key === "event-details:live-bad")?.severity, "blocker");
    assert.equal(items.find((i) => i.key === "event-details:up-bad")?.severity, "attention");
    assert.equal(items.find((i) => i.key === "event-details:up-bad")?.href, "/app/events/up-bad/settings");
    assert.equal(items.find((i) => i.key === "event-details:up-bad")?.actionLabel, "Complete details");
  });

  it("skips continuous-capture events (no dates or location expected)", () => {
    const items = deriveAccountSetupItems({
      events: [ev({ id: "cc", status: "ACTIVE", container_kind: "continuous_capture", start_date: null, end_date: null, city: null, state: null })],
      pendingInviteCount: 0,
      licenses: [{ id: "l1", seats_total: 5, seats_used: 0 }]
    });
    assert.deepEqual(items, []);
  });

  it("derives pending-invitation and seat/license items from real account state", () => {
    const items = deriveAccountSetupItems({
      events: [ev({ id: "ok" })],
      pendingInviteCount: 3,
      licenses: [{ id: "l1", seats_total: 4, seats_used: 4 }]
    });
    const invites = items.find((i) => i.key === "pending-invites");
    assert.equal(invites?.label, "3 invitations awaiting acceptance");
    assert.equal(invites?.actionLabel, "Manage team");
    assert.equal(invites?.href, "/app/settings");
    const seats = items.find((i) => i.key === "seats-exhausted");
    assert.equal(seats?.severity, "blocker");
    assert.equal(seats?.actionLabel, "Manage licenses");
    assert.match(seats!.detail, /4 of 4 seats/);
  });

  it("flags a missing active license as a blocker", () => {
    const items = deriveAccountSetupItems({
      events: [ev({ id: "ok" })],
      pendingInviteCount: 0,
      licenses: []
    });
    assert.equal(items[0]?.key, "no-active-license");
    assert.equal(items[0]?.severity, "blocker");
  });

  it("omits items whose source failed instead of guessing (null invites/licenses)", () => {
    const items = deriveAccountSetupItems({
      events: [ev({ id: "ok" })],
      pendingInviteCount: null,
      licenses: null
    });
    assert.equal(items.some((i) => i.key === "pending-invites"), false);
    assert.equal(items.some((i) => i.key === "no-active-license"), false);
    assert.equal(items.some((i) => i.key === "seats-exhausted"), false);
  });

  it("orders blockers before attention items, then stable by key", () => {
    const items = deriveAccountSetupItems({
      events: [
        ev({ id: "b-up", status: "UPCOMING", start_date: null, end_date: null }),
        ev({ id: "a-live", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22", city: null, state: null })
      ],
      pendingInviteCount: 1,
      licenses: []
    });
    assert.deepEqual(
      items.map((i) => i.key),
      ["event-details:a-live", "no-active-license", "event-details:b-up", "pending-invites"]
    );
  });
});

/* ================================ KPIs ================================ */

describe("computeAccountKpis", () => {
  it("computes events, open setup items, seats used/total, and active licenses", () => {
    const events = [ev({ id: "a" }), ev({ id: "b" })];
    const licenses = [
      { id: "l1", seats_total: 5, seats_used: 3 },
      { id: "l2", seats_total: 2, seats_used: 1 }
    ];
    const setupItems = deriveAccountSetupItems({ events, pendingInviteCount: 1, licenses });
    const kpis = computeAccountKpis({ events, setupItems, licenses });
    assert.equal(kpis.events, 2);
    assert.equal(kpis.setupItemsOpen, setupItems.length);
    assert.deepEqual(kpis.seats, { used: 4, total: 7 });
    assert.equal(kpis.activeLicenses, 2);
  });

  it("keeps seats and licenses null (not zero) when the licenses query failed", () => {
    const events = [ev({ id: "a" })];
    const kpis = computeAccountKpis({ events, setupItems: [], licenses: null });
    assert.equal(kpis.seats, null);
    assert.equal(kpis.activeLicenses, null);
  });

  it("summarizeSeats clamps negative and null values", () => {
    assert.deepEqual(
      summarizeSeats([{ id: "l", seats_total: null, seats_used: -2 }]),
      { used: 0, total: 0 }
    );
  });
});

describe("deriveAccountFollowUpStatus", () => {
  it("keeps independent canonical counts, including overlapping states", () => {
    const status = deriveAccountFollowUpStatus({ outstanding: 5, hotAwaitingFollowUp: 3, dueToday: 2, overdue: 4 });
    assert.equal(status.outstanding, 5);
    assert.equal(status.hotAwaitingFollowUp, 3);
    assert.equal(status.dueToday, 2);
    assert.equal(status.overdue, 4);
    assert.equal(status.hrefs.hotAwaitingFollowUp, "/exhibitor/leads?accountScope=1&followUp=awaiting&temperature=hot");
    assert.equal(status.hrefs.dueToday, "/exhibitor/leads?accountScope=1&followUp=today");
    assert.equal(status.hrefs.overdue, "/exhibitor/leads?accountScope=1&followUp=overdue");
    assert.equal(status.hrefs.allFollowUps, "/exhibitor/leads?accountScope=1&followUp=due");
  });

  it("keeps partial query failures unavailable and has no-work zero state", () => {
    const partial = deriveAccountFollowUpStatus({ outstanding: null, hotAwaitingFollowUp: 0, dueToday: null, overdue: 0 });
    assert.equal(partial.outstanding, null);
    assert.equal(partial.dueToday, null);
    const empty = deriveAccountFollowUpStatus({ outstanding: 0, hotAwaitingFollowUp: 0, dueToday: 0, overdue: 0 });
    assert.deepEqual([empty.outstanding, empty.hotAwaitingFollowUp, empty.dueToday, empty.overdue], [0, 0, 0, 0]);
  });
});

describe("deriveLifecycleEventCards", () => {
  const noSetup: any[] = [];
  const metric = (eventId: string, partial: any = {}) => ({
    eventId,
    totalLeads: 0,
    leadsToday: 0,
    hotLeads: 0,
    warmLeads: 0,
    coldLeads: 0,
    hotAwaitingFollowUp: 0,
    hotNoFollowUp: 0,
    openFollowUps: 0,
    dueToday: 0,
    overdue: 0,
    scheduledFuture: 0,
    stillNew: 0,
    ...partial
  });
  const days = (...ids: string[]) => new Map(ids.map((id) => [id, TODAY] as const));

  it("keeps canonical phases but prioritizes live cards by unattended hot leads then leads today", () => {
    const cards = deriveLifecycleEventCards({
      events: [
        ev({ id: "low", name: "Low", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22" }),
        ev({ id: "hot", name: "Hot", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22" }),
        ev({ id: "today", name: "Today", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22" })
      ],
      metricsByEvent: new Map([
        ["low", metric("low")],
        ["hot", metric("hot", { hotAwaitingFollowUp: 1, totalLeads: 1 })],
        ["today", metric("today", { leadsToday: 2, totalLeads: 2 })]
      ]),
      setupItems: noSetup,
      todayYmd: TODAY,
      todayByEvent: days("low", "hot", "today")
    });
    assert.deepEqual(cards.live.map((card) => card.event.id), ["hot", "today", "low"]);
  });

  it("carries phase-specific values and keeps unavailable pipeline honest", () => {
    const cards = deriveLifecycleEventCards({
      events: [
        ev({ id: "up", status: "UPCOMING", start_date: "2026-07-23" }),
        ev({ id: "wrapped", status: "COMPLETED", end_date: "2026-07-20" })
      ],
      metricsByEvent: new Map([["up", metric("up")], ["wrapped", metric("wrapped", { openFollowUps: 1, totalLeads: 1 })]]),
      setupItems: [{ key: "event-details:up", label: "Complete details", detail: "Location missing", actionLabel: "Complete details", severity: "attention", eventId: "up", href: "/app/events/up/settings" }],
      todayYmd: TODAY,
      todayByEvent: days("up", "wrapped"),
      readinessByEvent: new Map([["up", 71]])
    });
    assert.equal(cards.upcoming[0]?.readinessPercent, 71);
    assert.equal(cards.upcoming[0]?.nextAction?.href, "/app/events/up/settings");
    assert.equal(cards.completed[0]?.openFollowUps, 1);
    assert.equal(cards.completed[0]?.pipelineValue, null);
  });

  it("uses the same timezone-aware day window as the live workspace for each event", () => {
    const today = getEventCalendarDay(new Date("2026-08-12T01:18:00.000Z"), "America/New_York");
    assert.ok(today);
    const cards = deriveLifecycleEventCards({
      events: [
        ev({ id: "event-a", status: "ACTIVE", start_date: "2026-08-10", end_date: "2026-08-12" }),
        ev({ id: "event-b", status: "ACTIVE", start_date: "2026-08-10", end_date: "2026-08-12" })
      ],
      metricsByEvent: new Map([["event-a", metric("event-a", { leadsToday: 1 })], ["event-b", metric("event-b", { leadsToday: 0 })]]),
      setupItems: noSetup,
      todayYmd: today.ymd,
      todayByEvent: new Map([["event-a", today.ymd], ["event-b", today.ymd]])
    });
    assert.equal(cards.live.find((card) => card.event.id === "event-a")?.leadsToday, 1);
    assert.equal(cards.live.find((card) => card.event.id === "event-b")?.leadsToday, 0);
  });

  it("filters the All Events view by lifecycle and name, location, or playbook", () => {
    const source = deriveLifecycleEventCards({
      events: [
        ev({ id: "live", name: "Expo North", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22", city: "Boston", briefing_strategy: { productFocus: "Analytics" } }),
        ev({ id: "up", name: "DevCon", status: "UPCOMING", start_date: "2026-07-23", city: "Austin" }),
        ev({ id: "done", name: "Past Event", status: "COMPLETED", end_date: "2026-07-20" })
      ],
      metricsByEvent: new Map([["live", metric("live")], ["up", metric("up")], ["done", metric("done")]]), setupItems: noSetup, todayYmd: TODAY,
      todayByEvent: days("live", "up", "done")
    });
    assert.deepEqual(filterLifecycleEventCards(source, { lifecycle: "live", search: "" }).live.map((card) => card.event.id), ["live"]);
    assert.deepEqual(filterLifecycleEventCards(source, { lifecycle: "all", search: "boston" }).live.map((card) => card.event.id), ["live"]);
    assert.deepEqual(filterLifecycleEventCards(source, { lifecycle: "all", search: "analytics" }).live.map((card) => card.event.id), ["live"]);
    assert.deepEqual(filterLifecycleEventCards(source, { lifecycle: "wrapped", search: "" }).completed.map((card) => card.event.id), ["done"]);
  });
});

/* ============================ What matters now ============================ */

describe("selectWhatMattersNow", () => {
  const build = (events: AccountEventRow[], opts?: { invites?: number | null; licenses?: any }) => {
    const setupItems = deriveAccountSetupItems({
      events,
      pendingInviteCount: opts?.invites ?? 0,
      licenses: opts?.licenses ?? [{ id: "l1", seats_total: 5, seats_used: 1 }]
    });
    return selectWhatMattersNow({
      groups: groupEventsForPortfolio(events),
      setupItems,
      todayYmd: TODAY,
      createEventHref: "/app/events/new"
    });
  };

  it("a real blocker becomes the headline, with timing as supporting context", () => {
    const focus = build([
      ev({ id: "up-1", name: "Company scoped event 1", status: "UPCOMING", start_date: "2026-11-16", city: null, state: null })
    ]);
    assert.equal(focus?.kind, "upcoming");
    assert.equal(focus?.title, "Complete details for Company scoped event 1");
    assert.equal(focus?.sub, "Opens in 118 days · Location is not set.");
    assert.equal(focus?.openHref, "/app/events/up-1");
    assert.equal(focus?.secondary?.href, "/app/events/up-1/settings");
    assert.equal(focus?.secondary?.label, "Complete details");
  });

  it("live event with its own blocker: blocker headline, 'Live now' as context", () => {
    const focus = build([
      ev({ id: "live-1", name: "Tech Summit", status: "ACTIVE", start_date: null, end_date: null }),
      ev({ id: "up-1", status: "UPCOMING" })
    ]);
    assert.equal(focus?.kind, "live");
    assert.equal(focus?.eventId, "live-1");
    assert.equal(focus?.title, "Complete details for Tech Summit");
    assert.match(focus!.sub, /^Live now · /);
    assert.ok((focus?.secondary?.label.length ?? 99) <= 20, "secondary label stays compact");
  });

  it("with no blocker, event timing is the headline", () => {
    const focus = build([
      ev({ id: "far", status: "UPCOMING", start_date: "2026-09-01" }),
      ev({ id: "near", name: "DevCon", status: "UPCOMING", start_date: "2026-07-23" })
    ]);
    assert.equal(focus?.kind, "upcoming");
    assert.equal(focus?.eventId, "near");
    assert.equal(focus?.title, "DevCon opens in 2 days");
    assert.equal(focus?.secondary, null);

    const liveClean = build([
      ev({ id: "live-ok", name: "Expo", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22" })
    ]);
    assert.equal(liveClean?.title, "Expo is live now");
  });

  it("handles tomorrow wording and surfaces missing dates as the canonical setup blocker", () => {
    assert.match(build([ev({ id: "t", status: "UPCOMING", start_date: "2026-07-22" })])!.title, /opens tomorrow/);
    assert.match(
      build([ev({ id: "t", status: "UPCOMING", start_date: null, end_date: null })])!.title,
      /Complete details for Event t/
    );
  });

  it("account-level blocker: its label is the headline, event named in the support line", () => {
    const focus = build([ev({ id: "clean", name: "DevCon", status: "UPCOMING", start_date: "2026-07-23" })], {
      licenses: []
    });
    assert.equal(focus?.title, "No active license on this account");
    assert.match(focus!.sub, /^DevCon: opens in 2 days · /);
    assert.equal(focus?.secondary?.href, "/app/settings");
  });

  it("wrapped portfolio: most recent completed event plus create action", () => {
    const focus = build([
      ev({ id: "old", status: "COMPLETED", end_date: "2026-01-10" }),
      ev({ id: "recent", name: "Growth Expo", status: "COMPLETED", end_date: "2026-06-10" })
    ]);
    assert.equal(focus?.kind, "wrapped");
    assert.equal(focus?.eventId, "recent");
    assert.equal(focus?.secondary?.href, "/app/events/new");
  });

  it("returns null only for an empty portfolio", () => {
    assert.equal(build([]), null);
  });
});

/* ========================== Recommended next steps ========================== */

describe("buildRecommendedNextSteps", () => {
  it("is exactly the top setup items, capped, preserving order and hrefs", () => {
    const events = [
      ev({ id: "a", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22" }),
      ev({ id: "b", status: "UPCOMING", city: null, state: null })
    ];
    const items = deriveAccountSetupItems({ events, pendingInviteCount: 2, licenses: [] });
    const steps = buildRecommendedNextSteps(items, 3);
    assert.equal(steps.length, 3);
    assert.deepEqual(steps, items.slice(0, 3));
    for (const s of steps) {
      assert.match(s.href, /^\/app\/(events\/[^/]+\/(settings|setup)|settings)$/, "working destinations only");
    }
  });

  it("empty when nothing needs attention", () => {
    assert.deepEqual(buildRecommendedNextSteps([]), []);
  });
});

/* ============================== Team readiness ============================== */

describe("summarizeTeamReadiness", () => {
  it("distinguishes active users, outstanding invitations, and free seats", () => {
    const team = summarizeTeamReadiness({
      users: [
        { id: "u1", full_name: "Jordan Lee", email: "j@x.com", created_at: "2026-01-01T00:00:00Z" },
        { id: "u2", full_name: null, email: "sam@x.com", created_at: "2026-02-01T00:00:00Z" }
      ],
      pendingInvites: [{ email: "new@x.com", created_at: "2026-07-01T00:00:00Z" }],
      licenses: [{ id: "l1", seats_total: 5, seats_used: 3 }]
    });
    assert.equal(team?.activeCount, 2);
    assert.equal(team?.pendingCount, 1);
    assert.equal(team?.seatsAvailable, 2);
    assert.equal(team?.members[1]?.name, "sam@x.com", "email fallback for missing name");
    assert.deepEqual(team?.pending, [{ email: "new@x.com" }]);
  });

  it("license failure keeps seats null while user counts stay real", () => {
    const team = summarizeTeamReadiness({
      users: [{ id: "u1", full_name: "A", email: "a@x.com", created_at: null }],
      pendingInvites: [],
      licenses: null
    });
    assert.equal(team?.activeCount, 1);
    assert.equal(team?.seats, null);
    assert.equal(team?.seatsAvailable, null);
  });

  it("returns null (unavailable) when both user and invite sources failed", () => {
    assert.equal(summarizeTeamReadiness({ users: null, pendingInvites: null, licenses: [] }), null);
  });
});

/* ============================== Recent activity ============================== */

describe("deriveRecentActivity", () => {
  it("merges real timestamps into human-readable entries, newest first, capped and stable", () => {
    const activity = deriveRecentActivity({
      events: [ev({ id: "e1", name: "Tech Summit", created_at: "2026-07-01T09:00:00.000Z" })],
      invites: [{ email: "new@x.com", created_at: "2026-07-20T12:00:00.000Z" }],
      users: [{ id: "u1", full_name: "Jordan", email: null, created_at: "2026-07-10T08:00:00.000Z" }],
      leads: [{ id: "ld1", event_id: "e1", created_at: "2026-07-21T07:30:00.000Z" }],
      limit: 3
    });
    assert.deepEqual(
      activity?.map((a) => a.kind),
      ["lead_captured", "invite_sent", "user_joined"]
    );
    assert.equal(activity?.[0]?.label, "New lead captured at Tech Summit");
    assert.equal(activity?.[1]?.label, "Invitation sent to new@x.com");
    assert.equal(activity?.[2]?.label, "Jordan joined the team");
    assert.equal(activity?.length, 3, "capped at the limit");
  });

  it("labels contain no raw ids or ISO timestamps", () => {
    const activity = deriveRecentActivity({
      events: [ev({ id: "8f3a-uuid-like", name: "Tech Summit", created_at: "2026-07-01T09:00:00.000Z" })],
      invites: [],
      users: [],
      leads: [{ id: "ld-77", event_id: "8f3a-uuid-like", created_at: "2026-07-02T09:00:00.000Z" }]
    });
    for (const entry of activity ?? []) {
      assert.doesNotMatch(entry.label, /uuid|ld-77|T\d{2}:\d{2}|Z\b/, `raw value leaked: ${entry.label}`);
    }
  });

  it("collapses duplicate invitations to the same email, keeping the latest send", () => {
    const activity = deriveRecentActivity({
      events: [],
      invites: [
        { email: "Priya@x.com", created_at: "2026-07-01T10:00:00.000Z" },
        { email: "priya@x.com", created_at: "2026-07-15T10:00:00.000Z" }
      ],
      users: [],
      leads: []
    });
    assert.equal(activity?.length, 1);
    assert.equal(activity?.[0]?.label, "Invitation sent to priya@x.com");
    assert.equal(activity?.[0]?.at, "2026-07-15T10:00:00.000Z");
  });

  it("leads without a matching event fall back to a generic capture label", () => {
    const activity = deriveRecentActivity({
      events: [],
      invites: [],
      users: [],
      leads: [{ id: "ld1", event_id: "missing", created_at: "2026-07-21T07:30:00.000Z" }]
    });
    assert.equal(activity?.[0]?.label, "New lead captured");
  });

  it("aggregates same-event same-day captures into one honest row with a count", () => {
    const activity = deriveRecentActivity({
      events: [ev({ id: "e1", name: "Tech Summit", created_at: null })],
      invites: [],
      users: [],
      leads: [
        { id: "a", event_id: "e1", created_at: "2026-07-21T07:00:00.000Z" },
        { id: "b", event_id: "e1", created_at: "2026-07-21T09:30:00.000Z" },
        { id: "c", event_id: "e1", created_at: "2026-07-21T12:15:00.000Z" },
        { id: "d", event_id: "e1", created_at: "2026-07-21T15:45:00.000Z" }
      ]
    });
    assert.equal(activity?.length, 1, "one row per event/day, not one per capture");
    assert.equal(activity?.[0]?.label, "4 new leads captured at Tech Summit");
    assert.equal(activity?.[0]?.at, "2026-07-21T15:45:00.000Z", "group orders by its latest capture");
  });

  it("never combines captures across different events or different calendar days", () => {
    const activity = deriveRecentActivity({
      events: [
        ev({ id: "e1", name: "Tech Summit", created_at: null }),
        ev({ id: "e2", name: "DevCon", created_at: null })
      ],
      invites: [],
      users: [],
      leads: [
        { id: "a", event_id: "e1", created_at: "2026-07-21T07:00:00.000Z" },
        { id: "b", event_id: "e1", created_at: "2026-07-21T09:00:00.000Z" },
        { id: "c", event_id: "e2", created_at: "2026-07-21T10:00:00.000Z" },
        { id: "d", event_id: "e1", created_at: "2026-07-20T22:00:00.000Z" }
      ]
    });
    assert.deepEqual(
      activity?.map((a) => a.label),
      [
        "New lead captured at DevCon",
        "2 new leads captured at Tech Summit",
        "New lead captured at Tech Summit"
      ],
      "separate rows per event and per day, singular/plural wording per count"
    );
  });

  it("skips failed sources but keeps the rest (no fabricated entries)", () => {
    const activity = deriveRecentActivity({
      events: null,
      invites: null,
      users: [{ id: "u1", full_name: "Jordan", email: null, created_at: "2026-07-10T08:00:00.000Z" }],
      leads: null
    });
    assert.equal(activity?.length, 1);
    assert.equal(activity?.[0]?.kind, "user_joined");
  });

  it("title-cases the joining member's name consistently", () => {
    const activity = deriveRecentActivity({
      events: null,
      invites: null,
      users: [
        { id: "u1", full_name: "ali kamyab", email: "ali@x.com", created_at: "2026-07-10T08:00:00.000Z" },
        { id: "u2", full_name: "MARY-JANE O'NEIL", email: "mj@x.com", created_at: "2026-07-09T08:00:00.000Z" }
      ],
      leads: null
    });
    assert.equal(activity?.[0]?.label, "Ali Kamyab joined the team");
    assert.equal(activity?.[1]?.label, "Mary-Jane O'Neil joined the team");
  });

  it("never uses a raw email as the actor; falls back to neutral copy", () => {
    const activity = deriveRecentActivity({
      events: null,
      invites: null,
      users: [
        { id: "u1", full_name: null, email: "nameless@example.com", created_at: "2026-07-10T08:00:00.000Z" },
        { id: "u2", full_name: "   ", email: "blank@example.com", created_at: "2026-07-09T08:00:00.000Z" }
      ],
      leads: null
    });
    for (const entry of activity ?? []) {
      assert.equal(entry.label, "A team member joined the team");
      assert.doesNotMatch(entry.label, /@/, "no email address in the actor label");
    }
  });

  it("returns null (unavailable) when every source failed", () => {
    assert.equal(deriveRecentActivity({ events: null, invites: null, users: null, leads: null }), null);
  });

  it("entries without timestamps are dropped, empty result stays an empty array", () => {
    const activity = deriveRecentActivity({
      events: [ev({ id: "e1", created_at: null })],
      invites: [],
      users: [],
      leads: []
    });
    assert.deepEqual(activity, []);
  });
});

/* ============================== Portfolio themes ============================== */

describe("deriveLeadThemes", () => {
  const lead = (over: Partial<ThemeLeadRow>): ThemeLeadRow => ({
    event_id: "e1",
    company_text: null,
    job_title: null,
    enriched_job_title: null,
    industry: null,
    enriched_industry: null,
    seniority: null,
    enriched_seniority: null,
    intent_signals: null,
    ...over
  });

  it("ranks stored intent signals, industries, seniority, roles, and companies deterministically", () => {
    const leads = [
      lead({ intent_signals: ["Pricing question"], enriched_industry: "computer_software", enriched_job_title: "VP of Marketing", company_text: "Acme" }),
      lead({ intent_signals: ["Pricing question"], enriched_industry: "computer_software", enriched_job_title: "Marketing Manager", company_text: "Acme" }),
      lead({ intent_signals: ["Pricing question"], industry: "Healthcare", job_title: "Director of Events", company_text: "Globex" }),
      lead({ enriched_industry: "computer_software", enriched_job_title: "Software Engineer" }),
      lead({ industry: "Healthcare", job_title: "Sales Director" })
    ];
    const result = deriveLeadThemes(leads);
    assert.equal(result?.sampleSize, 5, "context reports the real bounded sample");
    const themes = result?.themes ?? null;
    assert.ok(themes && themes.length >= 4 && themes.length <= 6);
    // Top theme: intent signal (count 3), ahead of the count-3 industry by category priority.
    assert.deepEqual(
      themes![0],
      { key: "Signal:pricing question", label: "Pricing Question", category: "Signal", count: 3, barPct: 100 }
    );
    assert.equal(themes![1].label, "Computer Software");
    assert.equal(themes![1].category, "Industry");
    // Bars are proportional to the top theme.
    assert.ok(themes!.every((t) => t.barPct >= 4 && t.barPct <= 100));
    // Diversity: never more than 2 per category.
    const perCategory = new Map<string, number>();
    for (const t of themes!) perCategory.set(t.category, (perCategory.get(t.category) ?? 0) + 1);
    assert.ok([...perCategory.values()].every((n) => n <= 2));
  });

  it("derives seniority and role patterns from job titles when no stored seniority exists", () => {
    const leads = [
      lead({ job_title: "Director of Field Marketing" }),
      lead({ job_title: "Marketing Director" }),
      lead({ job_title: "Senior Marketing Manager" }),
      lead({ job_title: "VP Sales" }),
      lead({ job_title: "vp of sales" })
    ];
    const themes = deriveLeadThemes(leads)!.themes;
    assert.ok(themes.some((t) => t.category === "Role" && t.label === "Marketing" && t.count === 3));
    assert.ok(themes.some((t) => t.category === "Seniority" && t.label === "Director" && t.count === 2));
    assert.ok(themes.some((t) => t.category === "Seniority" && t.label === "VP" && t.count === 2));
  });

  it("excludes blank, junk, and letterless values", () => {
    const leads = [
      lead({ industry: "  ", company_text: "n/a", intent_signals: ["--", "123", ""] }),
      lead({ industry: "unknown", company_text: "-" }),
      lead({ industry: "None", company_text: "test" }),
      lead({ industry: "TBD" }),
      lead({ industry: "Other" })
    ];
    assert.deepEqual(deriveLeadThemes(leads), { themes: [], sampleSize: 5 });
  });

  it("requires at least 2 leads per theme and 5 leads overall", () => {
    const single = [lead({ industry: "Healthcare" })];
    assert.deepEqual(deriveLeadThemes(single), { themes: [], sampleSize: 1 }, "under the minimum lead count");
    const five = [
      lead({ industry: "Healthcare" }),
      lead({ industry: "Retail" }),
      lead({ industry: "Finance" }),
      lead({ industry: "Media" }),
      lead({ industry: "Energy" })
    ];
    assert.deepEqual(deriveLeadThemes(five), { themes: [], sampleSize: 5 }, "no value reaches the 2-lead minimum");
  });

  it("normalizes display labels without exposing raw internal values", () => {
    const leads = [
      lead({ enriched_industry: "computer_software" }),
      lead({ enriched_industry: "COMPUTER_SOFTWARE" }),
      lead({ enriched_industry: "computer software" }),
      lead({ enriched_industry: "Healthcare" }),
      lead({ enriched_industry: "Healthcare" })
    ];
    const themes = deriveLeadThemes(leads)!.themes;
    const labels = themes.map((t) => t.label);
    assert.ok(labels.includes("Computer Software"));
    assert.ok(!labels.some((l) => l.includes("_")), "no raw snake_case leaks");
  });

  it("keeps minor connector words lowercase mid-phrase and preserves acronyms/proper nouns", () => {
    const leads = [
      lead({ job_title: "Head of Field Marketing" }),
      lead({ job_title: "head of partnerships" }),
      lead({ enriched_industry: "media and entertainment" }),
      lead({ enriched_industry: "media and entertainment" }),
      lead({ enriched_industry: "SaaS" }),
      lead({ enriched_industry: "SaaS" })
    ];
    const labels = deriveLeadThemes(leads)!.themes.map((t) => t.label);
    assert.ok(labels.includes("Head of Function"), "seniority phrase reads naturally");
    assert.ok(labels.includes("Media and Entertainment"), "interior 'and' stays lowercase");
    assert.ok(labels.includes("SaaS"), "mixed-case acronym/proper noun preserved");
    assert.ok(!labels.some((l) => /\bOf\b|\bAnd\b/.test(l)), "no title-cased connector words");
  });

  it("stable tiebreaks: equal counts order by category priority then label", () => {
    const leads = [
      lead({ enriched_industry: "Retail", company_text: "Acme" }),
      lead({ enriched_industry: "Retail", company_text: "Acme" }),
      lead({ enriched_industry: "Media", company_text: "Zeta" }),
      lead({ enriched_industry: "Media", company_text: "Zeta" }),
      lead({})
    ];
    const themes = deriveLeadThemes(leads)!.themes;
    assert.deepEqual(
      themes.map((t) => `${t.category}:${t.label}`),
      ["Industry:Media", "Industry:Retail", "Company:Acme", "Company:Zeta"]
    );
  });

  it("null input (query failed) stays null; themes carry no trend or commentary fields", () => {
    assert.equal(deriveLeadThemes(null), null);
    const leads = [
      lead({ industry: "Retail" }),
      lead({ industry: "Retail" }),
      lead({ industry: "Media" }),
      lead({ industry: "Media" }),
      lead({})
    ];
    const theme = deriveLeadThemes(leads)!.themes[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(theme).sort(), ["barPct", "category", "count", "key", "label"]);
  });
});
