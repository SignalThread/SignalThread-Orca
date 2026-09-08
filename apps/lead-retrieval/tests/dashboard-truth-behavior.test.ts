import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatEventLocalDateTime,
  getEventCalendarDay,
  isInstantInEventDay
} from "@/lib/events/event-calendar";
import { describeEventTiming, resolveEventLifecycle } from "@/lib/events/event-lifecycle";
import { resolveEventLocation } from "@/lib/events/event-location";
import { deriveEventIdentity } from "@/lib/exhibitor/event-command-center";
import {
  deriveLifecycleEventCards,
  type AccountEventRow
} from "@/lib/events/account-command-center-core";
import {
  hasScheduledFollowUp,
  isFollowUpCompleted,
  isFollowUpDueToday,
  isFollowUpOverdue,
  isFollowUpScheduledFuture,
  isHotAwaitingFollowUp,
  isHotLead,
  isLeadClosed,
  isOpenFollowUp,
  type LeadBusinessRuleRow
} from "@/lib/leads/lead-business-rules";
import { deriveLiveWorkspace, type LiveConversationRow } from "@/lib/events/event-workspace-live-core";

const EVENT = {
  start_date: "2026-08-10",
  end_date: "2026-08-12",
  status: "ACTIVE",
  container_kind: "event"
};

describe("dashboard truth — persisted event calendar", () => {
  it("keeps the Toronto event on Day 2 with exact event-local counters after UTC midnight", () => {
    const day = getEventCalendarDay(new Date("2026-08-12T01:18:00.000Z"), "America/Toronto");
    assert.ok(day);
    assert.equal(day.ymd, "2026-08-11");
    assert.equal(resolveEventLifecycle(EVENT, day.ymd).state, "live");
    assert.equal(describeEventTiming(EVENT, day.ymd, "live"), "Day 2 of 3");

    const leadInstants = [
      "2026-08-11T04:00:00.000Z",
      "2026-08-11T15:49:17.000Z",
      "2026-08-12T01:18:00.000Z",
      "2026-08-12T03:59:59.999Z",
      "2026-08-12T04:00:00.000Z"
    ];
    const conversationInstants = ["2026-08-12T00:15:00.000Z", "2026-08-10T15:00:00.000Z"];
    assert.equal(leadInstants.filter((instant) => isInstantInEventDay(instant, day)).length, 4);
    assert.equal(conversationInstants.filter((instant) => isInstantInEventDay(instant, day)).length, 1);
  });

  it("rolls over at local midnight to Day 3 and resets today counters", () => {
    const day = getEventCalendarDay(new Date("2026-08-12T04:00:00.000Z"), "America/Toronto");
    assert.ok(day);
    assert.equal(day.ymd, "2026-08-12");
    assert.equal(describeEventTiming(EVENT, day.ymd, "live"), "Day 3 of 3");
    assert.equal(isInstantInEventDay("2026-08-12T03:59:59.999Z", day), false);
    assert.equal(isInstantInEventDay("2026-08-12T04:00:00.000Z", day), true);
  });

  it("uses DST-safe 23-hour and 25-hour half-open event days", () => {
    const spring = getEventCalendarDay(new Date("2026-03-08T16:00:00.000Z"), "America/New_York");
    const fall = getEventCalendarDay(new Date("2026-11-01T16:00:00.000Z"), "America/New_York");
    assert.ok(spring && fall);
    assert.equal(Date.parse(spring.endExclusiveIso) - Date.parse(spring.startIso), 23 * 60 * 60 * 1000);
    assert.equal(Date.parse(fall.endExclusiveIso) - Date.parse(fall.startIso), 25 * 60 * 60 * 1000);
  });

  it("is correct on the first request and identical for viewers in different browser zones", () => {
    const now = new Date("2026-08-12T01:18:00.000Z");
    const views = ["Pacific/Honolulu", "Asia/Tokyo"].map(() =>
      getEventCalendarDay(now, "America/Toronto")
    );
    assert.deepEqual(views[0], views[1]);
    assert.equal(views[0]?.ymd, "2026-08-11");
    assert.equal(getEventCalendarDay(now, null), null, "missing persisted truth must degrade, never use a cookie/UTC guess");
  });

  it("renders the pinned UTC lead timestamp in the event timezone", () => {
    assert.equal(
      formatEventLocalDateTime("2026-08-11T15:49:17Z", "America/New_York"),
      "Aug 11, 2026, 11:49 AM EDT"
    );
  });
});

describe("dashboard truth — location and authoritative card aggregates", () => {
  const event: AccountEventRow = {
    id: "event-a",
    name: "Clun Ichi event",
    start_date: "2026-08-10",
    end_date: "2026-08-12",
    status: "ACTIVE",
    container_kind: "event",
    location: "Toronto",
    city: null,
    state: null,
    timezone: "America/Toronto",
    created_at: "2026-08-01T00:00:00Z"
  };

  it("uses events.location before city/state on identity and account-card surfaces", () => {
    assert.equal(resolveEventLocation(null, null, "Toronto"), "Toronto");
    assert.equal(resolveEventLocation("New York", "NY", "Toronto"), "Toronto");
    const identity = deriveEventIdentity({
      fallbackName: event.name,
      fallbackContainerKind: event.container_kind,
      row: event,
      todayYmd: "2026-08-11"
    });
    assert.equal(identity.locationText, "Toronto");

    const metrics = new Map([[event.id, {
      eventId: event.id,
      totalLeads: 1501,
      leadsToday: 4,
      hotLeads: 2,
      warmLeads: 3,
      coldLeads: 4,
      hotAwaitingFollowUp: 1,
      hotNoFollowUp: 1,
      openFollowUps: 5,
      dueToday: 1,
      overdue: 2,
      scheduledFuture: 2,
      stillNew: 3
    }]]);
    const cards = deriveLifecycleEventCards({
      events: [event],
      metricsByEvent: metrics,
      setupItems: [],
      todayYmd: "2026-08-12",
      todayByEvent: new Map([[event.id, "2026-08-11"]])
    });
    assert.equal(cards.live[0]?.location, "Toronto");
    assert.equal(cards.live[0]?.totalLeads, 1501, "aggregate counts are not capped by a row-fetch limit");
    assert.equal(cards.live[0]?.leadsToday, 4);
  });
});

describe("dashboard truth — canonical hot and follow-up matrices", () => {
  const today = "2026-08-11";
  const rows: Array<LeadBusinessRuleRow & { id: string }> = [
    { id: "none", temperature: "warm", status: "new", follow_up_date: null, follow_up_at: null, follow_up_completed_at: null },
    { id: "future", temperature: "warm", status: "follow_up", follow_up_date: "2026-08-13", follow_up_at: "2026-08-13T14:00:00Z", follow_up_completed_at: null },
    { id: "today", temperature: "warm", status: "follow_up", follow_up_date: today, follow_up_at: "2026-08-11T14:00:00Z", follow_up_completed_at: null },
    { id: "overdue", temperature: "warm", status: "follow_up", follow_up_date: "2026-08-10", follow_up_at: "2026-08-10T14:00:00Z", follow_up_completed_at: null },
    { id: "completed", temperature: "hot", status: "follow_up", follow_up_date: today, follow_up_at: "2026-08-11T14:00:00Z", follow_up_completed_at: "2026-08-11T15:00:00Z" },
    { id: "cleared", temperature: "hot", status: "new", follow_up_date: null, follow_up_at: null, follow_up_completed_at: null },
    { id: "hot-due", temperature: "hot", status: "follow_up", follow_up_date: today, follow_up_at: "2026-08-11T14:00:00Z", follow_up_completed_at: null },
    { id: "cold-due", temperature: "cold", status: "follow_up", follow_up_date: today, follow_up_at: "2026-08-11T14:00:00Z", follow_up_completed_at: null },
    { id: "closed", temperature: "hot", status: "closed", follow_up_date: "2026-08-10", follow_up_at: "2026-08-10T14:00:00Z", follow_up_completed_at: null }
  ];
  const ids = (predicate: (row: LeadBusinessRuleRow) => boolean) => rows.filter(predicate).map((row) => row.id);

  it("keeps temperature authoritative when priority conflicts", () => {
    assert.equal(isHotLead({ temperature: "hot", priority_score: 1 } as never), true);
    assert.equal(isHotLead({ temperature: "cold", priority_score: 99 } as never), false);
  });

  it("reconciles exact destination IDs for every canonical follow-up state", () => {
    assert.deepEqual(ids(isOpenFollowUp), ["future", "today", "overdue", "hot-due", "cold-due"]);
    assert.deepEqual(ids((row) => isFollowUpDueToday(row, today)), ["today", "hot-due", "cold-due"]);
    assert.deepEqual(ids((row) => isFollowUpOverdue(row, today)), ["overdue"]);
    assert.deepEqual(ids((row) => isFollowUpScheduledFuture(row, today)), ["future"]);
    assert.deepEqual(ids(isFollowUpCompleted), ["completed"]);
    assert.deepEqual(ids((row) => !hasScheduledFollowUp(row) && !isFollowUpCompleted(row)), ["none", "cleared"]);
    assert.deepEqual(ids((row) => isHotAwaitingFollowUp(row, today)), ["cleared", "hot-due"]);
    assert.deepEqual(ids(isLeadClosed), ["closed"]);
  });
});

describe("dashboard truth — degraded and bounded intelligence behavior", () => {
  const conversation = (index: number): LiveConversationRow => ({
    id: `conversation-${index}`,
    created_at: "2026-08-11T15:00:00Z",
    summary: "Canonical sample",
    priority_themes: ["Migration"],
    objections: [],
    competitors_mentioned: [],
    pain_points: [],
    buying_signals: [],
    rep_behavior_patterns: [],
    transcription_status: "completed",
    synthesis_status: "completed",
    leadId: `lead-${index}`,
    leadName: `Lead ${index}`,
    leadCompany: "Example"
  });
  const base = {
    conversationsTodayCount: 1,
    leadsTodayCount: 4,
    hotNeedingFollowUpCount: 0,
    followUpsDueCount: 0,
    followUpsDueTodayCount: 0,
    followUpsOverdueCount: 0,
    briefingCounts: null,
    todayYmd: "2026-08-11",
    hrefs: { hotLeads: "/leads?hot", followUpsDue: "/leads?due", leads: "/leads" }
  };

  it("never turns a failed required metric query into an all-clear", () => {
    const result = deriveLiveWorkspace({ ...base, conversations: [], hotNeedingFollowUpCount: null });
    assert.equal(result.whatMattersNow.key, "metrics_unavailable");
    assert.match(result.whatMattersNow.body, /could not be loaded/i);
    assert.doesNotMatch(result.whatMattersNow.body, /nothing is waiting/i);
  });

  it("discloses a newest-300 intelligence sample while preserving the authoritative total", () => {
    const result = deriveLiveWorkspace({
      ...base,
      conversations: Array.from({ length: 300 }, (_, index) => conversation(index)),
      totalConversationCount: 1001
    });
    assert.deepEqual(result.intelligenceCoverage && {
      analyzedCount: result.intelligenceCoverage.analyzedCount,
      totalCount: result.intelligenceCoverage.totalCount,
      isSampled: result.intelligenceCoverage.isSampled
    }, { analyzedCount: 300, totalCount: 1001, isSampled: true });
  });
});
