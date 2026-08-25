export type PortfolioCriticalItemPriority = "critical" | "high" | "standard";
export type PortfolioSummaryTone = "critical" | "warning" | "stable" | "neutral";

export type PortfolioCriticalItemCandidate = {
  id: string;
  eventId: string;
  title: string;
  dueAt: Date;
  priority: PortfolioCriticalItemPriority;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calendarDayDistance(value: Date, today: Date): number {
  const date = new Date(value);
  const comparisonDay = new Date(today);
  date.setHours(0, 0, 0, 0);
  comparisonDay.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - comparisonDay.getTime()) / MS_PER_DAY);
}

function candidateRank(
  candidate: PortfolioCriticalItemCandidate,
  today: Date,
): number {
  const overdue = calendarDayDistance(candidate.dueAt, today) < 0;
  if (overdue && candidate.priority === "critical") return 0;
  if (overdue && candidate.priority === "high") return 1;
  if (!overdue && candidate.priority === "critical") return 2;
  if (!overdue && candidate.priority === "high") return 3;
  if (overdue) return 4;
  return 5;
}

export function selectPortfolioCriticalItems(
  candidates: PortfolioCriticalItemCandidate[],
  today: Date,
  horizonDays = 10,
): PortfolioCriticalItemCandidate[] {
  const ranked = candidates
    .filter(
      (candidate) => calendarDayDistance(candidate.dueAt, today) <= horizonDays,
    )
    .sort((left, right) => {
      const rankDifference =
        candidateRank(left, today) - candidateRank(right, today);
      if (rankDifference !== 0) return rankDifference;

      const distanceDifference =
        Math.abs(calendarDayDistance(left.dueAt, today)) -
        Math.abs(calendarDayDistance(right.dueAt, today));
      if (distanceDifference !== 0) return distanceDifference;

      return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
    });

  const selectedEventIds = new Set<string>();
  return ranked.filter((candidate) => {
    if (selectedEventIds.has(candidate.eventId)) return false;
    selectedEventIds.add(candidate.eventId);
    return true;
  });
}

export function portfolioCriticalItemContext(
  dueAt: Date,
  today: Date,
  formatDate: (value: Date) => string,
): string {
  const daysUntil = calendarDayDistance(dueAt, today);
  if (daysUntil < 0) {
    const overdueDays = Math.abs(daysUntil);
    return `${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`;
  }
  if (daysUntil === 0) return "Due today";
  if (daysUntil === 1) return "Due tomorrow";
  return `Due ${formatDate(dueAt)}`;
}

export function summarizePortfolioBudget(
  input: {
    hasBudget: boolean;
    forecastCents: number;
    actualCents: number;
  },
  formatAmount: (cents: number) => string,
): { label: string; tone: PortfolioSummaryTone } {
  const hasBudgetPosition =
    input.hasBudget && (input.forecastCents > 0 || input.actualCents > 0);
  if (!hasBudgetPosition) return { label: "No budget", tone: "neutral" };

  const varianceCents = input.forecastCents - input.actualCents;
  if (varianceCents > 0) {
    return { label: `${formatAmount(varianceCents)} under`, tone: "stable" };
  }
  if (varianceCents < 0) {
    return { label: `${formatAmount(varianceCents)} over`, tone: "critical" };
  }
  return { label: "On plan", tone: "stable" };
}

export function summarizePortfolioHealth(input: {
  riskyDeadlineCount: number;
  overdueTimelineCount: number;
  atRiskTimelineCount: number;
  pendingBudgetCount: number;
  overBudgetCount: number;
  metricSignalCount: number;
}): { count: number; label: string; tone: PortfolioSummaryTone } {
  const count =
    input.riskyDeadlineCount +
    input.overdueTimelineCount +
    input.atRiskTimelineCount +
    input.pendingBudgetCount +
    input.overBudgetCount +
    input.metricSignalCount;
  const hasCriticalSignal =
    input.riskyDeadlineCount > 0 ||
    input.overdueTimelineCount > 0 ||
    input.overBudgetCount > 0;

  if (hasCriticalSignal) return { count, label: "Critical", tone: "critical" };
  if (count > 0) return { count, label: "Needs Review", tone: "warning" };
  return { count: 0, label: "On Track", tone: "stable" };
}
