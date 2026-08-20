import assert from "node:assert/strict";
import test from "node:test";
import {
  portfolioCriticalItemContext,
  selectPortfolioCriticalItems,
  summarizePortfolioBudget,
  summarizePortfolioHealth,
  type PortfolioCriticalItemCandidate,
} from "./account-event-portfolio";

const today = new Date("2026-07-13T12:00:00.000Z");

function candidate(
  id: string,
  eventId: string,
  daysFromToday: number,
  priority: PortfolioCriticalItemCandidate["priority"],
  title = id,
): PortfolioCriticalItemCandidate {
  const dueAt = new Date(today);
  dueAt.setUTCDate(dueAt.getUTCDate() + daysFromToday);
  return { id, eventId, title, dueAt, priority };
}

test("portfolio critical items follow the documented operational priority", () => {
  const selected = selectPortfolioCriticalItems(
    [
      candidate("upcoming-standard", "event-1", 1, "standard"),
      candidate("upcoming-critical", "event-1", 5, "critical"),
      candidate("overdue-high", "event-1", -3, "high"),
      candidate("overdue-critical", "event-1", -2, "critical"),
    ],
    today,
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, "overdue-critical");
});

test("portfolio critical items use nearest date and stable title fallback", () => {
  const selected = selectPortfolioCriticalItems(
    [
      candidate("later", "event-1", 5, "high", "Later"),
      candidate("zulu", "event-1", 2, "high", "Zulu"),
      candidate("alpha", "event-1", 2, "high", "Alpha"),
      candidate("other", "event-2", 3, "standard"),
    ],
    today,
  );

  assert.deepEqual(
    selected.map((item) => item.id),
    ["alpha", "other"],
  );
});

test("portfolio critical items exclude upcoming work outside ten days", () => {
  const selected = selectPortfolioCriticalItems(
    [
      candidate("outside", "event-1", 11, "critical"),
      candidate("overdue", "event-2", -30, "standard"),
    ],
    today,
  );

  assert.deepEqual(
    selected.map((item) => item.id),
    ["overdue"],
  );
});

test("portfolio critical item context distinguishes due and overdue dates", () => {
  const formatDate = (value: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      value,
    );

  assert.equal(
    portfolioCriticalItemContext(candidate("a", "e", -3, "high").dueAt, today, formatDate),
    "3 days overdue",
  );
  assert.equal(
    portfolioCriticalItemContext(candidate("b", "e", 1, "high").dueAt, today, formatDate),
    "Due tomorrow",
  );
  assert.equal(
    portfolioCriticalItemContext(candidate("c", "e", 5, "high").dueAt, today, formatDate),
    "Due Jul 18",
  );
});

test("portfolio budget summary reports under, over, on-plan, and no-budget states", () => {
  const formatAmount = (cents: number) => `$${Math.abs(cents) / 100}`;

  assert.deepEqual(
    summarizePortfolioBudget(
      { hasBudget: true, forecastCents: 50_000, actualCents: 35_000 },
      formatAmount,
    ),
    { label: "$150 under", tone: "stable" },
  );
  assert.deepEqual(
    summarizePortfolioBudget(
      { hasBudget: true, forecastCents: 35_000, actualCents: 50_000 },
      formatAmount,
    ),
    { label: "$150 over", tone: "critical" },
  );
  assert.deepEqual(
    summarizePortfolioBudget(
      { hasBudget: true, forecastCents: 50_000, actualCents: 50_000 },
      formatAmount,
    ),
    { label: "On plan", tone: "stable" },
  );
  assert.deepEqual(
    summarizePortfolioBudget(
      { hasBudget: true, forecastCents: 0, actualCents: 0 },
      formatAmount,
    ),
    { label: "No budget", tone: "neutral" },
  );
});

test("portfolio health summary maps existing signals to three clear states", () => {
  const clear = {
    riskyDeadlineCount: 0,
    overdueTimelineCount: 0,
    atRiskTimelineCount: 0,
    pendingBudgetCount: 0,
    overBudgetCount: 0,
    metricSignalCount: 0,
  };

  assert.deepEqual(summarizePortfolioHealth(clear), {
    count: 0,
    label: "On Track",
    tone: "stable",
  });
  assert.deepEqual(
    summarizePortfolioHealth({ ...clear, pendingBudgetCount: 2 }),
    { count: 2, label: "Needs Review", tone: "warning" },
  );
  assert.deepEqual(
    summarizePortfolioHealth({ ...clear, overdueTimelineCount: 1 }),
    { count: 1, label: "Critical", tone: "critical" },
  );
});
