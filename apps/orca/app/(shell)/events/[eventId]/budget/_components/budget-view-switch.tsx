"use client";

import Link from "next/link";
import { LayoutDashboard, Table2 } from "lucide-react";
import { EVENT_MODULE_PRIMARY_CLASS, eventModuleClasses } from "../../_components/event-module-header";

type BudgetViewSwitchProps = {
  eventId: string;
  activeView: "dashboard" | "grid";
};

export function BudgetViewSwitch({ eventId, activeView }: BudgetViewSwitchProps) {
  const dashboardHref = `/events/${encodeURIComponent(eventId)}/budget`;
  const gridHref = `/events/${encodeURIComponent(eventId)}/budget?view=grid`;

  return (
    <div className={`${eventModuleClasses.viewToggle} shadow-sm`}>
      <Link
        href={dashboardHref}
        aria-current={activeView === "dashboard" ? "page" : undefined}
        className={[
          "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition",
          activeView === "dashboard"
            ? EVENT_MODULE_PRIMARY_CLASS
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        ].join(" ")}
      >
        <LayoutDashboard className="h-4 w-4" />
        Command Center
      </Link>
      <Link
        href={gridHref}
        aria-current={activeView === "grid" ? "page" : undefined}
        className={[
          "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition",
          activeView === "grid"
            ? EVENT_MODULE_PRIMARY_CLASS
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        ].join(" ")}
      >
        <Table2 className="h-4 w-4" />
        Full Budget Grid
      </Link>
    </div>
  );
}
