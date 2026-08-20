import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/badge";

export type EventRisk = "critical" | "warning" | "stable";

export type EventRowEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  location?: string | null;
  nextMilestoneDate?: string | null;
  risk?: EventRisk;
  budgetUtilization?: number;
  pendingApprovals?: number;
  deadlines?: number;
  forecastCents?: number;
  actualCents?: number;
};

type EventRowProps = {
  event: EventRowEvent;
};

function formatDate(dateValue: string | null | undefined): string {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateRange(startDate: string, endDate: string | null): string {
  const start = formatDate(startDate);
  if (!endDate) return start;
  const end = formatDate(endDate);
  return start === end ? start : `${start} - ${end}`;
}

function computeBudgetUtilization(event: EventRowEvent): number {
  if (typeof event.budgetUtilization === "number") {
    return Math.max(0, Math.round(event.budgetUtilization));
  }

  const forecastCents = event.forecastCents ?? 0;
  if (forecastCents <= 0) return 0;
  return Math.max(0, Math.round(((event.actualCents ?? 0) / forecastCents) * 100));
}

function computeRisk(event: EventRowEvent, budgetUtilization: number): EventRisk {
  if (event.risk) return event.risk;
  if (budgetUtilization > 100) return "critical";
  if ((event.deadlines ?? 0) > 0 || budgetUtilization >= 90) return "warning";
  return "stable";
}

function riskVariant(risk: EventRisk): BadgeVariant {
  if (risk === "critical") return "danger";
  if (risk === "warning") return "warning";
  return "success";
}

function riskLabel(risk: EventRisk): string {
  if (risk === "critical") return "Critical";
  if (risk === "warning") return "Warning";
  return "Stable";
}

export function EventRow({ event }: EventRowProps) {
  const budgetUtilization = computeBudgetUtilization(event);
  const risk = computeRisk(event, budgetUtilization);
  const pendingApprovals = event.pendingApprovals ?? 0;
  const nextMilestoneDate = event.nextMilestoneDate ?? event.startDate;
  const location = event.location?.trim() || "Location TBD";

  return (
    <Link
      href={`/events/${event.id}`}
      className="grid cursor-pointer grid-cols-1 gap-3 border-b border-slate-100 p-4 transition last:border-b-0 hover:bg-gray-50 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-slate-950">{event.name}</span>
        <span className="mt-1 text-sm text-gray-500">
          {location} - {formatDateRange(event.startDate, event.endDate)}
        </span>
        <span className="mt-1 text-xs text-gray-400">Next Milestone: {formatDate(nextMilestoneDate)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-3 text-sm text-slate-600 lg:justify-end">
        <Badge variant={riskVariant(risk)}>{riskLabel(risk)}</Badge>
        <span>{budgetUtilization}% used</span>
        <span>{pendingApprovals} approvals</span>
        <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
      </span>
    </Link>
  );
}
