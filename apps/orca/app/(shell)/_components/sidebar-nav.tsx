"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
};

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Account",
    items: [
      {
        href: "/dashboard",
        label: "Command Center",
        ariaLabel: "Account Command Center",
        icon: LayoutGrid,
      },
      {
        href: "/settings",
        label: "Settings",
        ariaLabel: "Workspace and organization settings",
        icon: Settings,
        exact: true,
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarNavProps = {
  collapsed?: boolean;
};

export function SidebarNav({ collapsed = false }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={collapsed ? "space-y-5 px-2 py-6" : "space-y-5 px-3 py-6"}
      aria-label="Portfolio navigation"
    >
      {NAV_SECTIONS.map((section) => (
        <section
          key={section.label}
          aria-label={`${section.label} navigation section`}
          aria-labelledby={`portfolio-nav-${section.label.toLowerCase()}`}
        >
          {!collapsed ? (
            <h2
              id={`portfolio-nav-${section.label.toLowerCase()}`}
              aria-label={`${section.label} section`}
              className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"
            >
              {section.label}
            </h2>
          ) : null}
          <ul className="space-y-2" role="list">
            {section.items.map(({ href, label, ariaLabel, icon: Icon, badge, exact }) => {
              const active = exact ? pathname === href : isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={collapsed ? ariaLabel ?? label : undefined}
                    aria-label={ariaLabel ?? label}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex h-11 w-full min-w-0 items-center rounded-xl border transition-colors",
                      collapsed ? "justify-center px-0" : "gap-3 px-3.5",
                      active
                        ? "border-[#0B1638] bg-[#0B1638] text-white shadow-sm"
                        : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      badge && !active ? "opacity-85" : "",
                    ].join(" ")}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" />
                    {!collapsed ? (
                      <>
                        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14px] leading-[18px] font-semibold">
                          {label}
                        </span>
                        {badge ? (
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              active ? "bg-white/15 text-white/80" : "bg-slate-100 text-slate-400",
                            ].join(" ")}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
