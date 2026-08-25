"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EVENT_MODULE_PRIMARY_CLASS, eventModuleClasses } from "./event-module-header";

type EventModuleSwitcherProps = {
  eventId: string;
  runOfShowLabel: string;
};

type EventModuleItem = {
  key: "roadmap" | "budget" | "runOfShow";
  label: string;
  href: string;
  active: (pathname: string) => boolean;
};

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildEventModuleItems(eventId: string, runOfShowLabel: string): EventModuleItem[] {
  return [
    {
      key: "roadmap",
      label: "Roadmap",
      href: `/events/${eventId}/timeline`,
      active: (pathname) => isPathActive(pathname, `/events/${eventId}/timeline`),
    },
    {
      key: "budget",
      label: "Budget",
      href: `/events/${eventId}/budget`,
      active: (pathname) => isPathActive(pathname, `/events/${eventId}/budget`),
    },
    {
      key: "runOfShow",
      label: runOfShowLabel,
      href: `/events/${eventId}/matrix`,
      active: (pathname) =>
        isPathActive(pathname, `/events/${eventId}/matrix`) ||
        isPathActive(pathname, `/events/${eventId}/matrix-2`),
    },
  ];
}

export function EventModuleSwitcher({ eventId, runOfShowLabel }: EventModuleSwitcherProps) {
  const pathname = usePathname();
  const items = buildEventModuleItems(eventId, runOfShowLabel);

  return (
    <nav aria-label="Event workspace sections" className={eventModuleClasses.switcher}>
      {items.map((item) => {
        const active = item.active(pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex h-9 items-center rounded-lg border px-4 text-[13px] font-semibold transition",
              active
                ? `border-[#28439A] ${EVENT_MODULE_PRIMARY_CLASS}`
                : "border-slate-200 bg-white text-slate-700 hover:border-[#28439A]/25 hover:bg-slate-50 hover:text-[#28439A]",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
