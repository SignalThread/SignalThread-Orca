"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AudioLines,
  CalendarDays,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  LayoutGrid,
  Megaphone,
  Sparkles,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ContextualHelpAction } from "../../../_components/contextual-help-action";
import { LogoutButton } from "../../../_components/logout-button";
import { NotificationsBell } from "../../../_components/notifications-bell";
import { SwitchAccountButton } from "../../../_components/switch-account-button";
import { EventModuleSwitcher } from "./event-module-switcher";
import { EventTerminologyProvider } from "@/components/event-terminology-context";
import { SidebarNavItem, isPathActive } from "./shell-nav-primitives";
import shellStyles from "./event-workspace-shell.module.css";
import { isVoiceDemoEvent } from "@/lib/event-voice-demo";
import type { OrcaTerminology } from "@/lib/orca-terminology-contract";

type EventWorkspaceShellProps = {
  currentEvent: EventShellEvent;
  children: ReactNode;
};

type EventShellEvent = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  timezone?: string;
  status: string;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
  terms?: OrcaTerminology;
};

type NavItem = {
  label: string;
  ariaLabel?: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  active: (pathname: string) => boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type EventDirectoryChildItem = {
  label: string;
  href?: string;
  badge?: string;
  disabled?: boolean;
  active?: (pathname: string) => boolean;
};

type WorkspaceTopNavItem = {
  label: string;
  href: string;
  active: (pathname: string) => boolean;
};

const EVENT_SIDEBAR_STORAGE_KEY = "eventWorkspaceSidebarCollapsed";
const EVENT_SIDEBAR_STORAGE_EVENT = "planner:event-workspace-sidebar-collapsed-change";
const NARROW_EVENT_SIDEBAR_MEDIA_QUERY = "(max-width: 720px)";

function getServerSidebarCollapsedSnapshot(): boolean {
  return false;
}

function getClientSidebarCollapsedSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(EVENT_SIDEBAR_STORAGE_KEY) === "true";
}

function subscribeSidebarCollapsed(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(EVENT_SIDEBAR_STORAGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(EVENT_SIDEBAR_STORAGE_EVENT, handleChange);
  };
}

function getServerNarrowSidebarSnapshot(): boolean {
  return false;
}

function getClientNarrowSidebarSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(NARROW_EVENT_SIDEBAR_MEDIA_QUERY).matches;
}

function subscribeNarrowSidebar(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const media = window.matchMedia(NARROW_EVENT_SIDEBAR_MEDIA_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function setSidebarCollapsed(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EVENT_SIDEBAR_STORAGE_KEY, String(value));
  window.dispatchEvent(new Event(EVENT_SIDEBAR_STORAGE_EVENT));
}

function formatEventDate(value: string | null): string {
  if (!value) return "Date not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date not set";
  // Event start/end fields are calendar dates, so formatting in UTC prevents a
  // date selected for the event from shifting when the viewer is elsewhere.
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatEventDateRange(event: Pick<EventShellEvent, "startDate" | "endDate" | "timezone">): string {
  const start = formatEventDate(event.startDate);
  if (!event.endDate) return start;
  const end = formatEventDate(event.endDate);
  return start === end ? start : `${start} - ${end}`;
}

function formatEventLocation(event: Pick<EventShellEvent, "venueName" | "city" | "state">): string | null {
  const location = [event.city, event.state].filter(Boolean).join(", ");
  if (event.venueName && location) return `${event.venueName}, ${location}`;
  return event.venueName ?? (location || null);
}

function formatEventMetadata(event: EventShellEvent): string {
  const metadata = [event.startDate ? formatEventDateRange(event) : null, formatEventLocation(event)].filter(Boolean);
  return metadata.length > 0 ? metadata.join(" · ") : "Details pending";
}

function getEventInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || "EV";
}

function buildEventSwitchHref(pathname: string, currentEventId: string, nextEventId: string): string {
  const match = pathname.match(/^\/events\/([^/]+)(?:\/(.*))?$/);
  if (!match || match[1] !== currentEventId) return `/events/${nextEventId}`;

  const remainder = match[2] ?? "";
  if (!remainder) return `/events/${nextEventId}`;

  const [module] = remainder.split("/");
  if (module === "edit") return `/events/${nextEventId}/settings`;

  const safeModules = new Set([
    "activity",
    "ai-workspace",
    "budget",
    "docs",
    "fnb-catalog",
    "matrix",
    "matrix-2",
    "reports",
    "seating",
    "settings",
    "speakers",
    "staffing",
    "timeline",
  ]);

  if (safeModules.has(module)) return `/events/${nextEventId}/${module}`;
  return `/events/${nextEventId}`;
}

export function EventWorkspaceShell({ currentEvent, children }: EventWorkspaceShellProps) {
  const eventId = currentEvent.id;
  const terms = currentEvent.terms ?? { agenda: "Agenda", runOfShow: "Run of Show", matrix: "Matrix", showFlow: "Show Flow" };
  const pathname = usePathname();
  const router = useRouter();
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const selectorSearchInputRef = useRef<HTMLInputElement | null>(null);
  const eventsRequestVersionRef = useRef(0);
  const collapsedHubRef = useRef<HTMLDivElement | null>(null);
  const collapsedHubPopoverRef = useRef<HTMLDivElement | null>(null);
  const collapsedHubCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [eventSelectorSearch, setEventSelectorSearch] = useState("");
  const [collapsedHubOpen, setCollapsedHubOpen] = useState(false);
  const [events, setEvents] = useState<EventShellEvent[]>([currentEvent]);
  const [eventsStatus, setEventsStatus] = useState<"loading" | "loaded" | "error">("loading");
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

  const loadEvents = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = ++eventsRequestVersionRef.current;
    setEventsStatus("loading");
    try {
      const response = await fetch("/api/events", { credentials: "include", signal });
      if (!response.ok) throw new Error(`Failed to load events: ${response.status}`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Invalid event list response");
      const nextEvents = payload.map((entry) => {
        if (!entry || typeof entry !== "object") throw new Error("Invalid event list response");
        const event = entry as Record<string, unknown>;
        if (typeof event.id !== "string" || !event.id || typeof event.name !== "string" || !event.name.trim() || typeof event.status !== "string") {
          throw new Error("Invalid event list response");
        }
        return {
          id: event.id,
          name: event.name,
          status: event.status,
          startDate: typeof event.startDate === "string" ? event.startDate : null,
          endDate: typeof event.endDate === "string" ? event.endDate : null,
          timezone: typeof event.timezone === "string" ? event.timezone : undefined,
          venueName: typeof event.venueName === "string" ? event.venueName : null,
          city: typeof event.city === "string" ? event.city : null,
          state: typeof event.state === "string" ? event.state : null,
        } satisfies EventShellEvent;
      });
      if (signal?.aborted || eventsRequestVersionRef.current !== requestVersion) return;
      setEvents(nextEvents.length > 0 ? nextEvents : [currentEvent]);
      setEventsStatus("loaded");
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (eventsRequestVersionRef.current !== requestVersion) return;
      console.error("Failed to load event selector options", error);
      setEvents([currentEvent]);
      setEventsStatus("error");
    }
  }, [currentEvent]);

  useEffect(() => {
    const controller = new AbortController();
    setEvents([currentEvent]);
    void loadEvents(controller.signal);

    return () => {
      eventsRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [currentEvent, loadEvents]);

  useEffect(() => {
    if (!selectorOpen && !collapsedHubOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (selectorRef.current?.contains(event.target as Node)) return;
      if (collapsedHubRef.current?.contains(event.target as Node)) return;
      if (collapsedHubPopoverRef.current?.contains(event.target as Node)) return;
      if (selectorOpen) setSelectorOpen(false);
      if (collapsedHubOpen) setCollapsedHubOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectorOpen(false);
        setCollapsedHubOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [collapsedHubOpen, selectorOpen]);

  useEffect(() => {
    if (!selectorOpen && !collapsedHubOpen) {
      const frame = window.requestAnimationFrame(() => setEventSelectorSearch(""));
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => selectorSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [collapsedHubOpen, selectorOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
    if (isCollapsed) {
      setSelectorOpen(false);
    } else {
      setCollapsedHubOpen(false);
    }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isCollapsed]);

  useEffect(() => {
    return () => {
      if (collapsedHubCloseTimeoutRef.current) clearTimeout(collapsedHubCloseTimeoutRef.current);
    };
  }, []);

  const orderedEvents = useMemo(() => {
    const byId = new Map<string, EventShellEvent>();
    for (const event of [currentEvent, ...events]) byId.set(event.id, event);
    return Array.from(byId.values()).sort((a, b) => {
      if (a.id === currentEvent.id) return -1;
      if (b.id === currentEvent.id) return 1;
      return new Date(b.startDate ?? 0).getTime() - new Date(a.startDate ?? 0).getTime();
    });
  }, [currentEvent, events]);

  const filteredEvents = useMemo(() => {
    const query = eventSelectorSearch.trim().toLowerCase();
    if (!query) return orderedEvents;
    return orderedEvents.filter((event) =>
      [event.name, event.status, formatEventMetadata(event)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [eventSelectorSearch, orderedEvents]);

  const planningItems: NavItem[] = [
    {
      label: "Roadmap",
      ariaLabel: "Roadmap master task list and critical path",
      href: `/events/${eventId}/timeline`,
      icon: CalendarDays,
      active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/timeline`),
    },
    {
      label: "Budget",
      ariaLabel: "Budget forecast versus actual",
      href: `/events/${eventId}/budget`,
      icon: DollarSign,
      active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/budget`),
    },
    {
      label: terms.runOfShow,
      ariaLabel: `${terms.runOfShow} room by time operations board`,
      href: `/events/${eventId}/matrix`,
      icon: LayoutGrid,
      active: (currentPathname) =>
        isPathActive(currentPathname, `/events/${eventId}/matrix`) ||
        isPathActive(currentPathname, `/events/${eventId}/matrix-2`),
    },
    // Menus is intentionally not a standalone destination. Menu catalog and source-menu
    // management live in the event-level F&B Planner under Run of Show; `/fnb-catalog`
    // redirects there.
  ];

  const eventDirectoryChildren: EventDirectoryChildItem[] = [
    {
      label: "Speakers",
      href: `/events/${eventId}/speakers`,
      active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/speakers`),
    },
    {
      label: "Attendees",
      href: `/events/${eventId}/attendees`,
      active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/attendees`),
    },
    {
      label: "Staffing",
      badge: "Coming soon",
      disabled: true,
    },
    {
      label: "Exhibitors",
      badge: "Coming soon",
      disabled: true,
    },
  ];
  const isEventDirectoryActive =
    isPathActive(pathname, `/events/${eventId}/directory`) ||
    eventDirectoryChildren.some((item) => item.active?.(pathname));
  const [eventDirectoryOpen, setEventDirectoryOpen] = useState<boolean | null>(null);
  const isEventDirectoryOpen = eventDirectoryOpen ?? isEventDirectoryActive;

  const isPlanningActive = planningItems.some((item) => item.active(pathname)) || isEventDirectoryActive;
  const isRoomSetWorkspaceRoute = /\/events\/[^/]+\/matrix\/sessions\/[^/]+\/room-set(?:\/|$)/.test(pathname);
  const isRunOfShowWorkspaceRoute =
    isPathActive(pathname, `/events/${eventId}/matrix`) ||
    isPathActive(pathname, `/events/${eventId}/matrix-2`);

  const workspaceTopNavItems: WorkspaceTopNavItem[] = [
    {
      label: "Roadmap",
      href: `/events/${eventId}/timeline`,
      active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/timeline`),
    },
    {
      label: "Budget",
      href: `/events/${eventId}/budget`,
      active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/budget`),
    },
    {
      label: terms.runOfShow,
      href: `/events/${eventId}/matrix`,
      active: (currentPathname) =>
        isPathActive(currentPathname, `/events/${eventId}/matrix`) ||
        isPathActive(currentPathname, `/events/${eventId}/matrix-2`),
    },
  ];
  const shouldShowWorkspaceTopNav =
    !isRoomSetWorkspaceRoute &&
    workspaceTopNavItems.some((item) => item.active(pathname));

  const commandCenterItem: NavItem = {
    label: "Command Center",
    ariaLabel: "Event Command Center",
    href: `/events/${eventId}`,
    icon: LayoutGrid,
    active: (currentPathname) => currentPathname === `/events/${eventId}`,
  };

  const navSections: NavSection[] = [
    {
      label: "Planning",
      items: planningItems,
    },
    {
      label: "Operations",
      items: [
        {
          label: "AI Workspace",
          ariaLabel: "AI Workspace: event attention overview",
          href: `/events/${eventId}/ai-workspace`,
          icon: Sparkles,
          active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/ai-workspace`),
        },
        {
          label: "Marketing",
          ariaLabel: "Marketing email campaigns and audience sends",
          href: `/events/${eventId}/marketing`,
          icon: Megaphone,
          active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/marketing`),
        },
        ...(isVoiceDemoEvent(eventId)
          ? [{
              label: "Voice",
              ariaLabel: "Voice attendee feedback demo",
              href: `/events/${eventId}/voice`,
              icon: AudioLines,
              active: (currentPathname: string) => isPathActive(currentPathname, `/events/${eventId}/voice`),
            }]
          : []),
        {
          label: "Documents",
          ariaLabel: "Documents hub and approvals",
          href: `/events/${eventId}/docs`,
          icon: FileText,
          active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/docs`),
        },
        {
          label: "Activity",
          ariaLabel: "Activity audit trail",
          href: `/events/${eventId}/activity`,
          icon: Activity,
          active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/activity`),
        },
        {
          label: "Settings",
          href: `/events/${eventId}/settings`,
          icon: Settings,
          active: (currentPathname) =>
            isPathActive(currentPathname, `/events/${eventId}/settings`) ||
            isPathActive(currentPathname, `/events/${eventId}/edit`),
        },
        // Financial Reports is intentionally hidden from navigation for now.
        // The route remains available for direct links while the product surface is paused.
      ],
    },
    {
      label: "Onsite",
      items: [
        {
          label: "Security & Compliance",
          ariaLabel: "Security and Compliance operational readiness",
          href: `/events/${eventId}/security-compliance`,
          icon: ShieldCheck,
          active: (currentPathname) => isPathActive(currentPathname, `/events/${eventId}/security-compliance`),
        },
      ],
    },
    {
      label: "Support",
      items: [
        {
          label: "Help Center",
          ariaLabel: "Orca Help Center",
          href: "/help",
          icon: CircleHelp,
          active: (currentPathname) => isPathActive(currentPathname, "/help"),
        },
      ],
    },
  ];

  const renderNavItem = (item: NavItem) => (
    <li key={item.label}>
      <SidebarNavItem
        href={item.href}
        icon={item.icon}
        label={item.label}
        ariaLabel={item.ariaLabel ?? item.label}
        badge={item.badge}
        active={item.active(pathname)}
        collapsed={isCollapsed}
      />
    </li>
  );

  const cancelCollapsedHubClose = () => {
    if (!collapsedHubCloseTimeoutRef.current) return;
    clearTimeout(collapsedHubCloseTimeoutRef.current);
    collapsedHubCloseTimeoutRef.current = null;
  };

  const scheduleCollapsedHubClose = () => {
    cancelCollapsedHubClose();
    collapsedHubCloseTimeoutRef.current = setTimeout(() => {
      setCollapsedHubOpen(false);
      collapsedHubCloseTimeoutRef.current = null;
    }, 240);
  };

  const eventAvatar = (event: EventShellEvent, className: string) => (
    <span className={className} aria-hidden="true">
      {getEventInitials(event.name)}
    </span>
  );

  const renderEventDirectoryItem = () => (
    <li key="Event Directory">
      <div
        className={[
          "flex h-10 w-full items-center rounded-xl border transition-colors",
          isEventDirectoryActive
            ? "border-[#0B1638] bg-[#0B1638] text-white shadow-sm"
            : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        ].join(" ")}
      >
        <Link
          href={`/events/${eventId}/directory`}
          title={isCollapsed ? "Event Directory" : undefined}
          aria-label="Event Directory"
          className={[
            "flex h-full min-w-0 flex-1 items-center",
            isCollapsed ? "justify-center px-0" : "gap-2.5 px-3.5 pr-2",
          ].join(" ")}
        >
          <Users className="h-4 w-4 shrink-0" />
          {!isCollapsed ? (
            <span className="min-w-0 flex-1 truncate text-left text-[14px] leading-[18px] font-semibold">
              Event Directory
            </span>
          ) : null}
        </Link>
        {!isCollapsed ? (
          <button
            type="button"
            aria-label={isEventDirectoryOpen ? "Collapse Event Directory" : "Expand Event Directory"}
            aria-expanded={isEventDirectoryOpen}
            aria-controls="event-directory-nav"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEventDirectoryOpen((open) => !(open ?? isEventDirectoryActive));
            }}
            className={[
              "mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              isEventDirectoryActive ? "text-white/85 hover:bg-white/10" : "text-slate-500 hover:bg-slate-200/80",
            ].join(" ")}
          >
            <ChevronDown
              className={[
                "h-4 w-4 shrink-0 transition-transform",
                isEventDirectoryOpen ? "rotate-180" : "",
              ].join(" ")}
            />
          </button>
        ) : null}
      </div>
      {!isCollapsed && isEventDirectoryOpen ? (
        <ul id="event-directory-nav" className="mt-1 space-y-1 border-l border-slate-200/80 pl-3" role="list">
          {eventDirectoryChildren.map((item) => {
            const active = item.active?.(pathname) ?? false;
            const childClassName = [
              "flex min-h-8 w-full items-center rounded-lg border px-3 py-1.5 text-left transition-colors",
              active
                ? "border-[#0B1638]/15 bg-slate-100 text-[#0B1638]"
                : item.disabled
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ");
            const content = (
              <>
                <span className="min-w-0 flex-1 truncate text-[13px] leading-4 font-semibold">{item.label}</span>
                {item.badge ? (
                  <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-slate-400 uppercase">
                    {item.badge}
                  </span>
                ) : null}
              </>
            );

            return (
              <li key={item.label}>
                {item.href && !item.disabled ? (
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={childClassName}>
                    {content}
                  </Link>
                ) : (
                  <div aria-disabled="true" className={childClassName}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );

  const eventWorkspaceContentClassName =
    shouldShowWorkspaceTopNav || isPlanningActive || isRoomSetWorkspaceRoute
      ? "min-h-0 flex-1 overflow-hidden"
      : "p-6";
  const workspaceChildClassName =
    isRunOfShowWorkspaceRoute
      ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3"
      : "min-h-0 flex-1 overflow-y-auto p-6";

  const renderWorkspaceTopNav = () => (
    <div className="flex min-h-[76px] shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-[#f8f8fb] px-6 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        <h1 className="truncate text-[20px] font-semibold text-slate-900" title={currentEvent.name}>
          {currentEvent.name}
        </h1>
        <EventModuleSwitcher eventId={eventId} runOfShowLabel={terms.runOfShow} />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <ContextualHelpAction />
        <NotificationsBell />
        <SwitchAccountButton />
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <EventTerminologyProvider terms={terms}>
    <div className="h-dvh overflow-hidden bg-[#f8f8fb]">
      <aside
        className={[
          "fixed inset-y-0 left-0 flex flex-col overflow-hidden border-r border-slate-200 bg-[#f8f8fb] transition-[width] duration-200",
          isCollapsed ? shellStyles.sidebarCollapsed : shellStyles.sidebarExpanded,
        ].join(" ")}
      >
        <div
          className={[
            "relative border-b border-slate-200 bg-white/70 transition-all duration-200",
            isCollapsed ? "flex flex-col items-center gap-3 px-2 py-4" : "px-4 py-4",
          ].join(" ")}
        >
          <Link
            href="/dashboard"
            className={isCollapsed ? "flex justify-center" : "flex min-h-14 items-center gap-3 pr-9"}
            aria-label="OrcaOS dashboard"
          >
            <span className={["relative block", isCollapsed ? "h-10 w-14" : "h-14 w-[210px]"].join(" ")}>
              <Image
                src="/brand/orcaos-logo.png"
                alt="OrcaOS"
                fill
                priority
                sizes={isCollapsed ? "56px" : "210px"}
                className="object-contain"
              />
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!storedCollapsed)}
            className={[
              "flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white/80 text-slate-500 shadow-sm shadow-slate-200/60 transition hover:bg-white hover:text-slate-900",
              isCollapsed ? "" : "absolute right-4 top-1/2 -translate-y-1/2",
            ].join(" ")}
            aria-label={isCollapsed ? "Expand event sidebar" : "Collapse event sidebar"}
            title={isCollapsed ? "Expand event sidebar" : "Collapse event sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {!isCollapsed ? (
            <div className="relative border-b border-slate-200 px-4 py-3" ref={selectorRef}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm shadow-slate-200/60 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0B1638]/15"
                onClick={() => setSelectorOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={selectorOpen}
                aria-label="Open current event context"
              >
                {eventAvatar(
                  currentEvent,
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1638] text-[13px] font-semibold tracking-wide text-white shadow-sm shadow-slate-300/70",
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold leading-5 text-slate-900" title={currentEvent.name}>
                    {currentEvent.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] leading-4 text-slate-500" title={formatEventMetadata(currentEvent)}>
                    {formatEventMetadata(currentEvent)}
                  </span>
                </span>
                <ChevronDown
                  className={[
                    "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                    selectorOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>
              <Link
                href="/events"
                className="mt-2 flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B1638]/15"
                aria-label="Go to all events"
              >
                All events
              </Link>

              {selectorOpen ? (
                <div
                  className="absolute left-4 right-4 top-[112px] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-300/45"
                  role="listbox"
                  aria-label="Select event"
                >
                  <div className="border-b border-slate-100 p-2">
                    <label className="relative block">
                      <span className="sr-only">Search events</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={selectorSearchInputRef}
                        type="search"
                        value={eventSelectorSearch}
                        onChange={(event) => setEventSelectorSearch(event.target.value)}
                        placeholder="Search events"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[12px] font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#28439A]/40 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                      />
                    </label>
                  </div>
                  <div className="max-h-72 overflow-auto py-1">
                    {filteredEvents.map((event) => {
                      const active = event.id === currentEvent.id;
                      return (
                        <button
                          key={event.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={[
                            "flex w-full items-center gap-2.5 px-3 py-2 text-left transition",
                            active ? "bg-slate-100 text-slate-950" : "text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                          onClick={() => {
                            setSelectorOpen(false);
                            if (active) return;
                            router.push(buildEventSwitchHref(pathname, currentEvent.id, event.id));
                          }}
                        >
                          {eventAvatar(
                            event,
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-semibold tracking-wide text-slate-700",
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-semibold" title={event.name}>
                              {event.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-slate-500" title={formatEventMetadata(event)}>
                              {formatEventMetadata(event)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {filteredEvents.length === 0 ? (
                      <p className="px-3 py-6 text-center text-[12px] leading-5 text-slate-500">
                        No events match your search.
                      </p>
                    ) : null}
                  </div>
                  {eventsStatus === "loading" ? (
                    <p className="border-t border-slate-200 px-3 py-2 text-[10px] leading-4 text-slate-500" role="status">
                      Loading event list…
                    </p>
                  ) : eventsStatus === "error" ? (
                    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-[10px] leading-4 text-slate-500" role="alert">
                      <span>Event list unavailable. Showing current event only.</span>
                      <button type="button" onClick={() => void loadEvents()} className="shrink-0 font-semibold text-[#28439A] underline underline-offset-2">
                        Retry
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

            </div>
          ) : (
            <div className="border-b border-slate-200 px-2 py-3">
              <div ref={collapsedHubRef} className="flex justify-center">
                <button
                  type="button"
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-xl border text-slate-600 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#0B1638]/15",
                    collapsedHubOpen
                      ? "border-[#0B1638] bg-[#0B1638] text-white shadow-slate-300/70"
                      : "border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                  aria-label="Current event"
                  aria-haspopup="dialog"
                  aria-expanded={collapsedHubOpen}
                  aria-controls="current-event-popover"
                  title="Current event"
                  onClick={() => setCollapsedHubOpen((open) => !open)}
                  onMouseEnter={() => {
                    cancelCollapsedHubClose();
                    setCollapsedHubOpen(true);
                  }}
                  onMouseLeave={scheduleCollapsedHubClose}
                >
                  <CalendarDays className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          <nav className={isCollapsed ? "space-y-5 px-2 py-4" : "space-y-5 px-3 py-4"} aria-label="Event navigation">
            <ul className="space-y-1.5" role="list">
              {renderNavItem(commandCenterItem)}
            </ul>
            {navSections.map((section) => (
              <section
                key={section.label}
                aria-label={`${section.label} navigation section`}
                aria-labelledby={`event-nav-${section.label.toLowerCase()}`}
              >
                {!isCollapsed ? (
                  <h2
                    id={`event-nav-${section.label.toLowerCase()}`}
                    aria-label={`${section.label} section`}
                    className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"
                  >
                    {section.label}
                  </h2>
                ) : null}
                <ul className="space-y-1.5" role="list">
                  {section.label === "Operations" ? (
                    <>
                      {renderEventDirectoryItem()}
                      {section.items.map((item) => renderNavItem(item))}
                    </>
                  ) : (
                    section.items.map((item) => renderNavItem(item))
                  )}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      </aside>

      {isCollapsed && collapsedHubOpen ? (
        <div
          ref={collapsedHubPopoverRef}
          id="current-event-popover"
          role="dialog"
          aria-labelledby="current-event-popover-title"
          className="fixed left-[88px] top-[104px] z-[70] w-[300px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-300/45 max-[720px]:left-[calc(20.5128vw+8px)] max-[420px]:w-[260px]"
          onMouseEnter={cancelCollapsedHubClose}
          onMouseLeave={scheduleCollapsedHubClose}
        >
          <p id="current-event-popover-title" className="px-1 text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
            Current event
          </p>
          <div className="mt-2 flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-3">
            {eventAvatar(
              currentEvent,
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1638] text-[13px] font-semibold tracking-wide text-white",
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-5 text-slate-950" title={currentEvent.name}>
                {currentEvent.name}
              </p>
              <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-slate-500" title={formatEventMetadata(currentEvent)}>
                {formatEventMetadata(currentEvent)}
              </p>
            </div>
          </div>
          <label className="relative mt-3 block">
            <span className="sr-only">Search events</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={selectorSearchInputRef}
              type="search"
              value={eventSelectorSearch}
              onChange={(event) => setEventSelectorSearch(event.target.value)}
              placeholder="Search events"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[12px] font-medium text-slate-800 outline-none focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10"
            />
          </label>
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 py-1" role="listbox" aria-label="Select event">
            {filteredEvents.map((event) => {
              const active = event.id === currentEvent.id;
              return (
                <button
                  key={`mobile-${event.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px]",
                    active ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => {
                    setCollapsedHubOpen(false);
                    if (!active) router.push(buildEventSwitchHref(pathname, currentEvent.id, event.id));
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{event.name}</span>
                </button>
              );
            })}
            {filteredEvents.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-slate-500">No events match your search.</p>
            ) : null}
          </div>
          {eventsStatus === "loading" ? (
            <p className="mt-2 text-[11px] text-slate-500" role="status">Loading event list…</p>
          ) : eventsStatus === "error" ? (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-rose-700" role="alert">
              <span>Event list unavailable.</span>
              <button type="button" onClick={() => void loadEvents()} className="font-semibold underline underline-offset-2">Retry</button>
            </div>
          ) : null}
          <Link
            href="/events"
            className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[#0B1638] px-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#172449] focus:outline-none focus:ring-2 focus:ring-[#0B1638]/20"
            onClick={() => setCollapsedHubOpen(false)}
          >
            Go to all events
          </Link>
        </div>
      ) : null}

      <section
        className={[
          "flex h-dvh min-h-0 min-w-0 flex-col overflow-x-hidden transition-[margin-left,width] duration-200",
          isCollapsed ? shellStyles.contentCollapsed : shellStyles.contentExpanded,
        ].join(" ")}
      >
        {!isRoomSetWorkspaceRoute && !shouldShowWorkspaceTopNav ? (
          <header className="flex h-16 shrink-0 items-center justify-end border-b border-slate-200 bg-[#f8f8fb] px-7">
            <div className="flex items-center gap-3">
              <ContextualHelpAction />
              <NotificationsBell />
              <SwitchAccountButton />
              <LogoutButton />
            </div>
          </header>
        ) : null}
        <div className={eventWorkspaceContentClassName}>
          {shouldShowWorkspaceTopNav ? (
            <div className="flex h-full min-h-0 flex-col">
              {renderWorkspaceTopNav()}
              <div className={workspaceChildClassName}>{children}</div>
            </div>
          ) : (
            children
          )}
        </div>
      </section>
    </div>
    </EventTerminologyProvider>
  );
}
