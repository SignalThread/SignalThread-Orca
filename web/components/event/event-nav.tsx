"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEventTerminology } from "@/components/event-terminology-context";

type EventNavProps = {
  eventId: string;
};

const TABS: Array<{ key: string; label: string; suffix: string; ariaLabel?: string }> = [
  { key: "overview", label: "Command Center", suffix: "", ariaLabel: "Event Command Center" },
  { key: "timeline", label: "Roadmap", suffix: "/timeline", ariaLabel: "Roadmap master task list and critical path" },
  { key: "budget", label: "Budget", suffix: "/budget", ariaLabel: "Budget forecast versus actual" },
  { key: "matrix", label: "Run of Show", suffix: "/matrix", ariaLabel: "Run of Show room by time operations board" },
  // Menus is intentionally absent: menu catalog and source-menu management belong to the
  // event-level F&B Planner at /matrix/fnb.
  { key: "directory", label: "Directory", suffix: "/directory", ariaLabel: "Event Directory: canonical people and contacts" },
  { key: "attendees", label: "Attendees", suffix: "/attendees", ariaLabel: "Attendees: event participation, registration, and source state" },
  { key: "speakers", label: "Speakers", suffix: "/speakers", ariaLabel: "Speakers directory and readiness" },
  { key: "staffing", label: "Staffing", suffix: "/staffing", ariaLabel: "Staffing assignments coming soon" },
  { key: "docs", label: "Docs", suffix: "/docs", ariaLabel: "Docs document hub and approvals" },
  // Financial Reports is intentionally hidden from navigation for now.
  // The route remains available for direct links while the product surface is paused.
  { key: "activity", label: "Activity", suffix: "/activity", ariaLabel: "Activity audit trail" },
  { key: "settings", label: "Settings", suffix: "/settings" },
];

function tabHref(eventId: string, suffix: string): string {
  return suffix ? `/events/${eventId}${suffix}` : `/events/${eventId}`;
}

function tabIsActive(pathname: string, href: string, isOverview: boolean): boolean {
  if (isOverview) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function EventNav({ eventId }: EventNavProps) {
  const pathname = usePathname();
  const terms = useEventTerminology();

  return (
    <nav className="border-b border-slate-200" aria-label="Event navigation">
      <div className="mb-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-[13px] font-semibold text-slate-500 transition hover:text-slate-900"
          aria-label="Back to Command Center"
        >
          ← Command Center
        </Link>
      </div>
      <ul className="flex flex-wrap items-center gap-7" role="list">
        {TABS.map((tab) => {
          const href = tabHref(eventId, tab.suffix);
          const active = tabIsActive(pathname, href, tab.key === "overview");
          const label = tab.key === "matrix" ? terms.runOfShow : tab.label;
          const ariaLabel = tab.key === "matrix"
            ? `${terms.runOfShow} room by time operations board`
            : tab.ariaLabel ?? label;

          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-label={ariaLabel}
                aria-current={active ? "page" : undefined}
                className={[
                  "-mb-px border-b-2 px-0 pb-2 text-[14px] font-semibold transition",
                  active
                    ? "border-[#28439A] text-slate-900"
                    : "border-transparent text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {label}
                {tab.key === "staffing" ? (
                  <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    Soon
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
