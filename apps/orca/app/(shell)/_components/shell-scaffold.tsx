"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { FEATURES } from "@/config/features";
import { LogoutButton } from "./logout-button";
import { NotificationsBell } from "./notifications-bell";
import { PlannerCopilot } from "./planner-copilot";
import { SidebarNav } from "./sidebar-nav";
import { ContextualHelpAction } from "./contextual-help-action";
import { AccountAccessProvider, SwitchAccountButton } from "./switch-account-button";

const SIDEBAR_STORAGE_KEY = "sidebarCollapsed";
const SIDEBAR_STORAGE_EVENT = "planner:sidebar-collapsed-change";
const NARROW_SIDEBAR_MEDIA_QUERY = "(max-width: 720px)";

type ShellScaffoldProps = {
  children: ReactNode;
  organization?: {
    name: string;
    slug: string;
  } | null;
  user: {
    name: string | null;
    email: string;
  };
  canSwitchAccount: boolean;
  platformContext?: {
    accountName: string;
    accountSlug: string;
  } | null;
};

function getServerSidebarCollapsedSnapshot(): boolean {
  return false;
}

function getClientSidebarCollapsedSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function subscribeSidebarCollapsed(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(SIDEBAR_STORAGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, handleChange);
  };
}

function getServerNarrowSidebarSnapshot(): boolean {
  return false;
}

function getClientNarrowSidebarSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(NARROW_SIDEBAR_MEDIA_QUERY).matches;
}

function subscribeNarrowSidebar(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const media = window.matchMedia(NARROW_SIDEBAR_MEDIA_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function setSidebarCollapsed(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
  window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT));
}

function PlatformViewingBanner({
  accountName,
  accountSlug,
}: {
  accountName: string;
  accountSlug: string;
}) {
  const router = useRouter();

  async function exitPlatformContext() {
    const response = await fetch("/api/platform/context", {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) return;
    router.push("/platform");
    router.refresh();
  }

  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-950">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Platform Admin viewing: {accountName}</p>
          <p className="truncate text-xs text-amber-800">{accountSlug}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exitPlatformContext}
            className="rounded-md border border-amber-400 bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-white"
          >
            Exit account
          </button>
          <a
            href="/platform"
            className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50"
          >
            Platform Admin
          </a>
        </div>
      </div>
    </div>
  );
}

function organizationInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function displayName(name: string | null, email: string): string {
  const normalizedName = name?.trim();
  if (normalizedName) return normalizedName;

  const localPart = email.split("@")[0]?.trim() ?? "";
  const derivedName = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

  return derivedName || "Signed-in user";
}

export function ShellScaffold({
  children,
  organization = null,
  user,
  canSwitchAccount,
  platformContext = null,
}: ShellScaffoldProps) {
  const pathname = usePathname();
  const storedCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getClientSidebarCollapsedSnapshot,
    getServerSidebarCollapsedSnapshot,
  );
  const isNarrowSidebar = useSyncExternalStore(
    subscribeNarrowSidebar,
    getClientNarrowSidebarSnapshot,
    getServerNarrowSidebarSnapshot,
  );
  const isCollapsed = storedCollapsed || isNarrowSidebar;
  const isMatrixWorkspaceRoute = pathname.includes("/matrix-2") || /\/events\/[^/]+\/matrix(?:\/|$)/.test(pathname);
  const isEventWorkspaceRoute = /\/events\/[^/]+(?:\/|$)/.test(pathname);
  const isHelpRoute = pathname.startsWith("/help");
  // The Account Command Center lays itself out with its own `account-dashboard` container
  // queries. The AI Concierge that used to occupy the right column is gone, so the shared
  // 1100px reading column would leave a dead gutter instead of content.
  const isAccountCommandCenterRoute = /^\/dashboard(?:\/|$)/.test(pathname);
  const usesFullContentWidth =
    isMatrixWorkspaceRoute || isEventWorkspaceRoute || isHelpRoute || isAccountCommandCenterRoute;
  const organizationName = organization?.name?.trim() || "Organization";
  const organizationSlug = organization?.slug?.trim() || "Account";
  const initials = organizationInitials(organizationName) || "OR";
  const userName = displayName(user.name, user.email);
  const userInitials = organizationInitials(userName) || "U";

  if (isEventWorkspaceRoute) {
    return (
      <AccountAccessProvider canSwitchAccount={canSwitchAccount}>
        <div className="min-h-screen bg-[#f8f8fb] text-[14px] text-slate-700">
          {platformContext ? (
            <PlatformViewingBanner
              accountName={platformContext.accountName}
              accountSlug={platformContext.accountSlug}
            />
          ) : null}
          <main className="min-h-screen">{children}</main>
          {FEATURES.COPILOT_ENABLED ? <PlannerCopilot /> : null}
        </div>
      </AccountAccessProvider>
    );
  }

  return (
    <AccountAccessProvider canSwitchAccount={canSwitchAccount}>
      <div className="min-h-screen bg-[#f8f8fb] text-[14px] text-slate-700">
      <aside
        className={[
          "fixed inset-y-0 left-0 flex flex-col border-r border-slate-200 bg-[#f8f8fb] transition-[width] duration-200",
          isHelpRoute ? "max-[720px]:hidden" : "",
          isCollapsed ? "w-20" : "w-[280px]",
        ].join(" ")}
      >
        <div
          className={[
            "relative border-b border-slate-200 bg-white/70 transition-all duration-200",
            isCollapsed ? "flex flex-col items-center gap-3 px-2 py-4" : "px-4 py-4",
          ].join(" ")}
        >
          <div className={isCollapsed ? "flex justify-center" : "flex min-h-14 items-center gap-3 pr-9"}>
            <div
              className={[
                "relative",
                isCollapsed ? "h-10 w-14" : "h-14 w-[210px]",
              ].join(" ")}
            >
              <Image
                src="/brand/orcaos-logo.png"
                alt="OrcaOS"
                fill
                priority
                sizes={isCollapsed ? "56px" : "210px"}
                className="object-contain"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!storedCollapsed)}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white/80 text-slate-500 shadow-sm shadow-slate-200/60 transition hover:bg-white hover:text-slate-900",
              isCollapsed ? "" : "absolute right-4 top-1/2 -translate-y-1/2",
            ].join(" ")}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <SidebarNav collapsed={isCollapsed} />
          <div className={isCollapsed ? "mt-auto border-t border-slate-200 px-2 py-4" : "mt-auto border-t border-slate-200 p-3"}>
            {isCollapsed ? (
              <div className="mx-auto flex flex-col items-center gap-2" data-testid="sidebar-identity-card">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 text-[12px] font-bold text-white"
                  aria-label={`Current organization: ${organizationName}`}
                  title={organizationName}
                >
                  {initials}
                </span>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white"
                  aria-label={`Signed in as ${userName}`}
                  title={userName}
                >
                  {userInitials}
                </span>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-100/80 px-3 py-3" data-testid="sidebar-identity-card">
                <div className="flex items-center gap-3" data-testid="sidebar-organization-identity">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 text-[12px] font-bold text-white">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold leading-5 text-slate-900">{organizationName}</p>
                    <p className="truncate text-[11px] leading-4 text-slate-500">{organizationSlug}</p>
                  </div>
                </div>
                <div className="my-2 border-t border-slate-200/80" />
                <div className="flex items-center gap-3" data-testid="sidebar-user-identity">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium leading-5 text-slate-800">{userName}</p>
                    <p className="truncate text-[11px] leading-4 text-slate-500">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div
        className={[
          "flex min-h-screen flex-col transition-[margin-left] duration-200",
          isHelpRoute ? "max-[720px]:ml-0" : "",
          isCollapsed ? "ml-20" : "ml-[280px]",
        ].join(" ")}
      >
        {platformContext ? (
          <PlatformViewingBanner
            accountName={platformContext.accountName}
            accountSlug={platformContext.accountSlug}
          />
        ) : null}
        <header className="flex h-16 items-center justify-end border-b border-slate-200 bg-[#f8f8fb] px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <ContextualHelpAction />
            <NotificationsBell />
            <SwitchAccountButton />
            <LogoutButton />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className={usesFullContentWidth ? "w-full" : "w-full max-w-[1100px]"}>{children}</div>
        </main>
      </div>
      {FEATURES.COPILOT_ENABLED ? <PlannerCopilot /> : null}
      </div>
    </AccountAccessProvider>
  );
}
