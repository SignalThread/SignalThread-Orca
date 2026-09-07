import type { ContextualHelpMapping, ContextualHelpResolution } from "./types";

export const CONTEXTUAL_HELP_MAPPINGS: readonly ContextualHelpMapping[] = [
  { pattern: "/events/:eventId/budget", query: { view: "grid" }, articleSlug: "manage-the-full-budget-grid", returnLabel: "Full Budget Grid" },
  { pattern: "/events/:eventId/matrix/sessions/:sessionId/room-set", articleSlug: "manage-room-sets-and-seating", returnLabel: "Room Set & Seating" },
  { pattern: "/events/:eventId/matrix/sessions/:sessionId", articleSlug: "use-the-session-workspace", returnLabel: "Session Workspace" },
  { pattern: "/events/:eventId/speakers/:speakerId/preview", articleSlug: "manage-speakers", returnLabel: "Speaker Preview" },
  { pattern: "/events/:eventId/speakers/:speakerId", articleSlug: "manage-speakers", returnLabel: "Speaker" },
  { pattern: "/events/:eventId/budget", articleSlug: "use-the-budget-dashboard", returnLabel: "Budget" },
  { pattern: "/events/:eventId/matrix-2", articleSlug: "use-the-run-of-show", returnLabel: "Run of Show" },
  { pattern: "/events/:eventId/matrix", articleSlug: "use-the-run-of-show", returnLabel: "Run of Show" },
  { pattern: "/events/:eventId/timeline", articleSlug: "use-the-roadmap", returnLabel: "Roadmap" },
  { pattern: "/events/:eventId/speakers", articleSlug: "manage-speakers", returnLabel: "Speakers" },
  { pattern: "/events/:eventId/attendees", articleSlug: "manage-attendees", returnLabel: "Attendees" },
  { pattern: "/events/:eventId/registration/agenda", articleSlug: "manage-registration-agenda", returnLabel: "Registration Agenda" },
  { pattern: "/events/:eventId/directory", articleSlug: "use-the-directory", returnLabel: "Directory" },
  { pattern: "/events/:eventId/docs", articleSlug: "use-the-docs-hub", returnLabel: "Docs Hub" },
  { pattern: "/events/:eventId/marketing", articleSlug: "use-marketing", returnLabel: "Marketing" },
  { pattern: "/events/:eventId/fnb-catalog", articleSlug: "use-the-fnb-catalog", returnLabel: "F&B Catalog" },
  { pattern: "/events/:eventId/edit", articleSlug: "configure-event-settings", returnLabel: "Event Settings" },
  { pattern: "/events/:eventId/settings", articleSlug: "configure-event-settings", returnLabel: "Event Settings" },
  { pattern: "/events/new", articleSlug: "create-your-first-event", returnLabel: "Event Builder" },
  { pattern: "/events/:eventId", articleSlug: "use-the-event-command-center", returnLabel: "Event Command Center" },
  { pattern: "/dashboard/action-center", articleSlug: "use-the-action-center", returnLabel: "Action Center" },
  { pattern: "/dashboard", articleSlug: "use-the-account-command-center", returnLabel: "Account Command Center" },
  { pattern: "/events", articleSlug: "use-the-account-command-center", returnLabel: "Events" },
  { pattern: "/reports", articleSlug: "understand-portfolio-reports-and-activity", returnLabel: "Portfolio Reports" },
  { pattern: "/settings", articleSlug: "use-workspace-settings", returnLabel: "Account Settings" },
] as const;

type SearchParamsReader = { get(name: string): string | null; toString?: () => string };

const EXCLUDED_CONTEXTUAL_PREFIXES = ["/help", "/platform", "/admin", "/auth", "/login", "/speaker-intake", "/speaker-portal"];
const SAFE_RETURN_PREFIXES = ["/dashboard", "/events", "/reports", "/settings", "/budgets", "/docs", "/timeline", "/matrix", "/seating"];

function splitRoute(rawPathname: string, suppliedSearchParams?: SearchParamsReader) {
  const parsed = new URL(rawPathname, "https://orca.invalid");
  const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : parsed.pathname;
  return { pathname, searchParams: suppliedSearchParams ?? parsed.searchParams };
}

function stripOrganizationPrefix(pathname: string): string {
  return pathname.replace(/^\/(?:organizations|orgs)\/[^/]+(?=\/|$)/, "") || "/";
}

function patternMatches(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function patternMatchesPrefix(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length < 3 || patternParts.length >= pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function queryMatches(expected: Readonly<Record<string, string>> | undefined, searchParams: SearchParamsReader): boolean {
  return !expected || Object.entries(expected).every(([key, value]) => searchParams.get(key) === value);
}

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_CONTEXTUAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function appendSafeReturnPath(destination: string, currentPath: string): string {
  const safeReturn = getSafeHelpReturnTarget(currentPath);
  if (!safeReturn) return destination;
  const separator = destination.includes("?") ? "&" : "?";
  return `${destination}${separator}from=${encodeURIComponent(safeReturn)}`;
}

export function getContextualHelpMapping(
  rawPathname: string,
  suppliedSearchParams?: SearchParamsReader,
): ContextualHelpMapping | null {
  const route = splitRoute(rawPathname, suppliedSearchParams);
  if (isExcludedPath(route.pathname)) return null;
  const pathname = stripOrganizationPrefix(route.pathname);
  const exact = CONTEXTUAL_HELP_MAPPINGS.find(
    (mapping) => patternMatches(mapping.pattern, pathname) && queryMatches(mapping.query, route.searchParams),
  );
  if (exact) return exact;
  return CONTEXTUAL_HELP_MAPPINGS
    .filter((mapping) => patternMatchesPrefix(mapping.pattern, pathname) && queryMatches(mapping.query, route.searchParams))
    .sort((left, right) => right.pattern.split("/").length - left.pattern.split("/").length)[0] ?? null;
}

export function buildContextualHelpHref(mapping: ContextualHelpMapping, currentPath?: string): string {
  return appendSafeReturnPath(`/help/article/${mapping.articleSlug}`, currentPath ?? "");
}

export function resolveContextualHelp(
  rawPathname: string,
  suppliedSearchParams?: SearchParamsReader,
): ContextualHelpResolution | null {
  const route = splitRoute(rawPathname, suppliedSearchParams);
  if (isExcludedPath(route.pathname)) return null;
  const currentPath = `${route.pathname}${route.searchParams.toString?.() ? `?${route.searchParams.toString?.()}` : ""}`;
  const mapping = getContextualHelpMapping(route.pathname, route.searchParams);
  if (mapping) {
    return {
      href: buildContextualHelpHref(mapping, currentPath),
      label: `Help for ${mapping.returnLabel}`,
      ariaLabel: `Open Help for ${mapping.returnLabel}`,
      kind: "article",
    };
  }

  const normalizedPathname = stripOrganizationPrefix(route.pathname);
  if (normalizedPathname === "/events" || normalizedPathname.startsWith("/events/")) {
    return {
      href: appendSafeReturnPath("/help/category/event-planning", currentPath),
      label: "Help for Event Planning",
      ariaLabel: "Open Help for Event Planning",
      kind: "category",
    };
  }
  if (SAFE_RETURN_PREFIXES.some((prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`))) {
    return {
      href: appendSafeReturnPath("/help", currentPath),
      label: "Orca Help",
      ariaLabel: "Open Orca Help",
      kind: "landing",
    };
  }
  return null;
}

export function getSafeHelpReturnTarget(rawFrom: string | null | undefined): string | null {
  if (!rawFrom || !rawFrom.startsWith("/") || rawFrom.startsWith("//")) return null;
  const route = splitRoute(rawFrom);
  if (isExcludedPath(route.pathname)) return null;
  const normalizedPathname = stripOrganizationPrefix(route.pathname);
  const isSafeShellPath = SAFE_RETURN_PREFIXES.some(
    (prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
  );
  if (!isSafeShellPath) return null;

  const safeQuery = new URLSearchParams();
  if (/^\/events\/[^/]+\/budget$/.test(normalizedPathname) && route.searchParams.get("view") === "grid") {
    safeQuery.set("view", "grid");
  }
  const query = safeQuery.toString();
  return `${route.pathname}${query ? `?${query}` : ""}`;
}
