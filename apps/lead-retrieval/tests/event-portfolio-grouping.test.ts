import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_PORTFOLIO_GROUP_LABEL,
  EVENT_PORTFOLIO_GROUP_ORDER,
  eventPortfolioLifecycleForEvent,
  exhibitorOpenEventHref,
  groupEventsForPortfolio as groupEventsForPortfolioAt,
  type EventPortfolioEventLike
} from "@/lib/events/event-portfolio";
import { resolveEventLifecycle } from "@/lib/events/event-lifecycle";

function ev(partial: Partial<EventPortfolioEventLike> & { id: string }): EventPortfolioEventLike {
  return {
    name: `Event ${partial.id}`,
    start_date: null,
    end_date: null,
    status: "UPCOMING",
    container_kind: "event",
    ...partial
  };
}

const TODAY = "2026-07-21";
const groupEventsForPortfolio = (events: readonly EventPortfolioEventLike[]) =>
  groupEventsForPortfolioAt(events, TODAY);

describe("event portfolio — canonical lifecycle", () => {
  it("uses the same inclusive date resolver as the Event Workspace", () => {
    const spanningToday = ev({
      id: "spanning-today",
      status: "UPCOMING",
      start_date: "2026-07-20",
      end_date: "2026-07-22"
    });
    assert.equal(eventPortfolioLifecycleForEvent(spanningToday, TODAY), "live");
    assert.equal(
      eventPortfolioLifecycleForEvent(spanningToday, TODAY),
      resolveEventLifecycle(spanningToday, TODAY).state,
      "account portfolio and Event Workspace resolve the same lifecycle"
    );
    assert.deepEqual(groupEventsForPortfolio([spanningToday]).live.map((event) => event.id), ["spanning-today"]);
  });

  it("keeps UTC start/end boundaries and terminal completion behavior canonical", () => {
    assert.equal(eventPortfolioLifecycleForEvent(ev({ id: "start", start_date: TODAY, end_date: "2026-07-23" }), TODAY), "live");
    assert.equal(eventPortfolioLifecycleForEvent(ev({ id: "end", start_date: "2026-07-19", end_date: TODAY }), TODAY), "live");
    assert.equal(eventPortfolioLifecycleForEvent(ev({ id: "future", start_date: "2026-07-22", end_date: "2026-07-23" }), TODAY), "upcoming");
    assert.equal(eventPortfolioLifecycleForEvent(ev({ id: "past", start_date: "2026-07-19", end_date: "2026-07-20" }), TODAY), "completed");
    assert.equal(eventPortfolioLifecycleForEvent(ev({ id: "closed", status: "COMPLETED", start_date: TODAY, end_date: "2026-07-23" }), TODAY), "completed");
  });
});

describe("event portfolio — grouping", () => {
  it("keeps upcoming and completed events in their canonical groups", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "a", status: "ACTIVE", start_date: "2026-07-20", end_date: "2026-07-22" }),
      ev({ id: "u", status: "UPCOMING", start_date: "2026-07-23", end_date: "2026-07-24" }),
      ev({ id: "c", status: "UPCOMING", start_date: "2026-07-19", end_date: "2026-07-20" })
    ]);
    assert.deepEqual(groups.live.map((e) => e.id), ["a"]);
    assert.deepEqual(groups.upcoming.map((e) => e.id), ["u"]);
    assert.deepEqual(groups.completed.map((e) => e.id), ["c"]);
  });

  it("renders lifecycle groups in the required order Live → Upcoming → Completed", () => {
    assert.deepEqual(EVENT_PORTFOLIO_GROUP_ORDER.slice(0, 3), ["live", "upcoming", "completed"]);
    assert.equal(EVENT_PORTFOLIO_GROUP_LABEL.live, "Live");
    assert.equal(EVENT_PORTFOLIO_GROUP_LABEL.upcoming, "Upcoming");
    assert.equal(EVENT_PORTFOLIO_GROUP_LABEL.completed, "Completed");
  });

  it("a lifecycle group with no events is an empty array, not missing", () => {
    const groups = groupEventsForPortfolio([ev({ id: "u", status: "UPCOMING" })]);
    assert.deepEqual(groups.live, []);
    assert.deepEqual(groups.completed, []);
  });

  it("does not mutate the source array or reorder it in place", () => {
    const source = [
      ev({ id: "b", status: "UPCOMING", start_date: "2026-09-01" }),
      ev({ id: "a", status: "UPCOMING", start_date: "2026-08-01" })
    ];
    const snapshot = source.map((e) => ({ ...e }));
    groupEventsForPortfolio(source);
    assert.deepEqual(source, snapshot);
    assert.deepEqual(source.map((e) => e.id), ["b", "a"]);
  });
});

describe("event portfolio — upcoming ordering", () => {
  it("sorts by nearest start date first", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "far", status: "UPCOMING", start_date: "2026-12-01" }),
      ev({ id: "near", status: "UPCOMING", start_date: "2026-08-01" }),
      ev({ id: "mid", status: "UPCOMING", start_date: "2026-10-01" })
    ]);
    assert.deepEqual(groups.upcoming.map((e) => e.id), ["near", "mid", "far"]);
  });

  it("places null start dates after dated events", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "undated", status: "UPCOMING", start_date: null }),
      ev({ id: "dated", status: "UPCOMING", start_date: "2026-08-01" })
    ]);
    assert.deepEqual(groups.upcoming.map((e) => e.id), ["dated", "undated"]);
  });

  it("ties break deterministically by name, then id", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "2", name: "Beta", status: "UPCOMING", start_date: "2026-08-01" }),
      ev({ id: "1", name: "Alpha", status: "UPCOMING", start_date: "2026-08-01" }),
      ev({ id: "b", name: "Alpha", status: "UPCOMING", start_date: null }),
      ev({ id: "a", name: "Alpha", status: "UPCOMING", start_date: null })
    ]);
    assert.deepEqual(groups.upcoming.map((e) => e.id), ["1", "2", "a", "b"]);
  });
});

describe("event portfolio — live ordering", () => {
  it("orders by the nearest relevant date (end date, else start date)", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "later", status: "ACTIVE", start_date: "2026-07-18", end_date: "2026-07-25" }),
      ev({ id: "soon", status: "ACTIVE", start_date: "2026-07-01", end_date: "2026-07-21" }),
      ev({ id: "startOnly", status: "ACTIVE", start_date: "2026-07-20", end_date: null })
    ]);
    assert.deepEqual(groups.live.map((e) => e.id), ["startOnly", "soon", "later"]);
  });

  it("places fully undated live events last with a deterministic tiebreak", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "n2", name: "Zeta", status: "ACTIVE" }),
      ev({ id: "n1", name: "Alpha", status: "ACTIVE" }),
      ev({ id: "dated", status: "ACTIVE", end_date: "2026-07-30" })
    ]);
    assert.deepEqual(groups.live.map((e) => e.id), ["dated", "n1", "n2"]);
  });
});

describe("event portfolio — completed ordering", () => {
  it("sorts most recently completed first, using end date when available", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "old", status: "COMPLETED", start_date: "2026-01-01", end_date: "2026-01-03" }),
      ev({ id: "recent", status: "COMPLETED", start_date: "2026-06-01", end_date: "2026-06-03" })
    ]);
    assert.deepEqual(groups.completed.map((e) => e.id), ["recent", "old"]);
  });

  it("falls back to start date when end date is null, and puts fully undated last", () => {
    const groups = groupEventsForPortfolio([
      ev({ id: "undated", status: "COMPLETED" }),
      ev({ id: "startOnly", status: "COMPLETED", start_date: "2026-05-01", end_date: null }),
      ev({ id: "ended", status: "COMPLETED", start_date: "2026-02-01", end_date: "2026-03-01" })
    ]);
    assert.deepEqual(groups.completed.map((e) => e.id), ["startOnly", "ended", "undated"]);
  });
});

describe("event portfolio — open-event href", () => {
  it("builds the existing /app/events/{id} destination with the exact event id", () => {
    assert.equal(exhibitorOpenEventHref("evt-123"), "/app/events/evt-123");
  });

  it("URL-encodes the event id", () => {
    assert.equal(exhibitorOpenEventHref("a b/c"), "/app/events/a%20b%2Fc");
  });

  it("falls back to the events index for a blank id rather than a broken link", () => {
    assert.equal(exhibitorOpenEventHref(""), "/app/events");
    assert.equal(exhibitorOpenEventHref("   "), "/app/events");
  });
});
