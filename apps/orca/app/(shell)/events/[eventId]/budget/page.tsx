import { FullBudgetGrid } from "@/app/(shell)/budgets/_components/full-budget-grid";
import { EventModuleSurface } from "../_components/event-module-header";
import { BudgetDashboard } from "./_components/budget-dashboard";
import { BudgetPageHeader } from "./_components/budget-page-header";

type EventBudgetPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ view?: string | string[] }>;
};

type EventBudgetSearchParams = {
  view?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function EventBudgetPage({ params, searchParams }: EventBudgetPageProps) {
  const { eventId } = await params;
  const resolvedSearchParams: EventBudgetSearchParams = searchParams ? await searchParams : {};
  const activeView = firstSearchParam(resolvedSearchParams.view) === "grid" ? "grid" : "dashboard";

  if (activeView === "grid") {
    return (
      <EventModuleSurface className="space-y-5">
        <BudgetPageHeader
          eventId={eventId}
          activeView="grid"
          title="Full Budget Grid"
          subtitle="Line-by-line budget management for this event."
        />
        <FullBudgetGrid eventIdOverride={eventId} hideEventSelector />
      </EventModuleSurface>
    );
  }

  return <BudgetDashboard eventId={eventId} />;
}
