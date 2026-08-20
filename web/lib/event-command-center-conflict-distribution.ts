export type ConflictDistributionInput = {
  critical: number;
  warning: number;
  neutral: number;
};

export type ConflictDistributionModel = ConflictDistributionInput & {
  total: number;
  conflictLabel: "Conflict" | "Conflicts";
  summary: string;
  criticalEnd: string;
  warningEnd: string;
  neutralEnd: string;
};

function segmentPercent(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

export function getConflictDistributionModel({
  critical,
  warning,
  neutral,
}: ConflictDistributionInput): ConflictDistributionModel {
  const total = critical + warning + neutral;
  const criticalPercent = segmentPercent(critical, total);
  const warningPercent = segmentPercent(warning, total);
  const conflictLabel = total === 1 ? "Conflict" : "Conflicts";

  return {
    critical,
    warning,
    neutral,
    total,
    conflictLabel,
    summary: `${total} open ${conflictLabel.toLowerCase()}: ${critical} critical, ${warning} warning, ${neutral} neutral.`,
    criticalEnd: `${criticalPercent}%`,
    warningEnd: `${criticalPercent + warningPercent}%`,
    neutralEnd: "100%",
  };
}
