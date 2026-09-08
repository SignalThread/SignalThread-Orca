import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";

export const ROLE_NOT_CONFIGURED_PATH = "/login?error=role";

export function roleHomePath(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "platform_admin") return "/admin";
  if (
    normalized === "event_organizer" ||
    normalized === "organizer_admin" ||
    normalized === "organizer"
  ) {
    return "/app/organizer";
  }
  if (normalized === "exhibitor_admin" || normalized === "exhibitor_viewer") {
    return EXHIBITOR_WEB_ENTRY_RESOLVER_PATH;
  }
  return ROLE_NOT_CONFIGURED_PATH;
}

/**
 * `true` when the given role maps to a dashboard (platform / organizer /
 * exhibitor). Used by the login + recovery flows to decide whether to
 * redirect into the app or render an app-only state.
 */
export function isDashboardRole(role: string | null | undefined): boolean {
  return roleHomePath(role) !== ROLE_NOT_CONFIGURED_PATH;
}

/**
 * Return a new absolute-or-relative URL string with the `error` query
 * parameter removed. Used to strip the `?error=role` flash signal from
 * `/login` after it has been consumed, so a reload does not re-show the
 * stale banner. Pure (no DOM) and therefore unit-testable in Node.
 */
export function stripErrorParamFromUrl(href: string): string {
  try {
    const url = new URL(href, "http://local.invalid");
    if (!url.searchParams.has("error")) {
      return href;
    }
    url.searchParams.delete("error");
    const query = url.searchParams.toString();
    const pathAndQuery = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
    if (/^https?:\/\//i.test(href)) {
      return `${url.origin}${pathAndQuery}`;
    }
    return pathAndQuery;
  } catch {
    return href;
  }
}
