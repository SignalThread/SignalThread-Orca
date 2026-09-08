import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";
import type { AppRole } from "@/types/app";

const APP_ROLES = [
  "platform_admin",
  "organizer_admin",
  "exhibitor_admin",
  "exhibitor_viewer",
  "viewer"
] as const;

export function normalizeSessionRole(role: string | null | undefined): AppRole | null {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "event_organizer" || value === "organizer") return "organizer_admin";
  return (APP_ROLES as readonly string[]).includes(value) ? (value as AppRole) : null;
}

export function getRoleHomePath(role: AppRole | null): string {
  if (role === "platform_admin") return "/admin";
  if (role === "organizer_admin") return "/app/organizer";
  if (role === "exhibitor_admin" || role === "exhibitor_viewer") {
    return EXHIBITOR_WEB_ENTRY_RESOLVER_PATH;
  }
  return "/app";
}
