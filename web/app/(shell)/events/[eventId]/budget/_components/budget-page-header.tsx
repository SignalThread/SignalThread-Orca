import { type ReactNode } from "react";
import { EventModuleHeader } from "../../_components/event-module-header";
import { BudgetViewSwitch } from "./budget-view-switch";

type BudgetPageHeaderProps = {
  eventId: string;
  activeView: "dashboard" | "grid";
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function BudgetPageHeader({
  eventId,
  activeView,
  title,
  subtitle,
  actions,
}: BudgetPageHeaderProps) {
  return (
    <EventModuleHeader
      title={title}
      badge={activeView === "dashboard" ? "Command Center" : undefined}
      subtitle={subtitle}
      actions={
        <>
          <BudgetViewSwitch eventId={eventId} activeView={activeView} />
          {actions}
        </>
      }
    />
  );
}
