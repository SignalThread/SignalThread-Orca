"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  getAdminDashboardModeLabel,
  getAdminDashboardModeTargetHref,
  resolveAdminDashboardModeForPath,
  type AdminDashboardMode
} from "@/lib/admin/admin-dashboard-nav";

export function AdminDashboardModeSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const currentMode = resolveAdminDashboardModeForPath(pathname);

  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-slate-700">
      <span className="hidden font-medium text-slate-500 sm:inline">Dashboard mode</span>
      <select
        aria-label="Dashboard mode"
        className="bg-transparent font-semibold text-slate-900 outline-none"
        value={currentMode}
        onChange={(event) => {
          const nextMode = event.target.value as AdminDashboardMode;
          router.push(getAdminDashboardModeTargetHref(nextMode));
        }}
      >
        <option value="event_scoped">{getAdminDashboardModeLabel("event_scoped")}</option>
        <option value="company_scoped">{getAdminDashboardModeLabel("company_scoped")}</option>
      </select>
    </label>
  );
}
