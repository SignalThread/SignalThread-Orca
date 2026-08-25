"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, UsersRound } from "lucide-react";
import { SidebarRailItem } from "@signalthread/ui";
import { activePlatformNavigationSection, type PlatformNavigationSection } from "@/lib/platform-navigation";

const NAV_ITEMS = [
  { href: "/platform/accounts", label: "Accounts", icon: UsersRound, section: "accounts" },
  { href: "/platform/users", label: "Users", icon: Users, section: "users" },
] as const;

export function PlatformSidebarNav() {
  const pathname = usePathname();
  const activeSection = activePlatformNavigationSection(pathname);

  return (
    <nav className="space-y-5" aria-label="Platform Admin navigation">
      <section aria-labelledby="platform-nav-account">
        <h2 id="platform-nav-account" className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
          Platform
        </h2>
        <ul className="space-y-2" role="list">
          {NAV_ITEMS.map(({ href, label, icon: Icon, section }) => {
            const isActive = activeSection === (section as PlatformNavigationSection);
            return (
            <li key={href}>
              <Link href={href} aria-current={isActive ? "page" : undefined}>
                <SidebarRailItem active={isActive} icon={<Icon className="h-[17px] w-[17px]" />}>
                  {label}
                </SidebarRailItem>
              </Link>
            </li>
            );
          })}
        </ul>
      </section>
    </nav>
  );
}
