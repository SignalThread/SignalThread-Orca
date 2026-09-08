import type { NextResponse } from "next/server";
import type { EventAccessResolution } from "@/lib/access/event-access-mode";
import { normalizeSessionRole } from "@/lib/auth/session-role";
import {
  EXHIBITOR_APP_ACTIVE_EVENT_COOKIE,
  EXHIBITOR_APP_ACTIVE_EVENT_COOKIE_MAX_AGE_SEC
} from "@/lib/exhibitor/exhibitor-app-active-event-constants";
import type { AppRole } from "@/types/app";

/**
 * Lead Retrieval's own authorization for a Platform launch, applied AFTER the
 * canonical ids have been mapped. Mapping proved which LR rows the launch names;
 * this proves the mapped LR user may open the mapped LR event, using the same
 * canonical resolver every LR surface already relies on
 * (`resolveAccessibleEventIdsForUser`: platform_all / organizer_scope / company
 * license + event_access_mode + event_users rules). No new permission model.
 *
 * Pure: the resolver's result is passed in, so every branch is asserted in tests.
 */

/** The LR roles that have an event workspace to land in. Anything else is refused. */
export const LAUNCHABLE_LEAD_RETRIEVAL_ROLES = [
  "platform_admin",
  "organizer_admin",
  "exhibitor_admin",
  "exhibitor_viewer"
] as const satisfies readonly AppRole[];

export type LaunchableLeadRetrievalRole = (typeof LAUNCHABLE_LEAD_RETRIEVAL_ROLES)[number];

export type LeadRetrievalAccessInput = {
  /** `users.role` of the mapped LR user, as stored. */
  role: string | null;
  /** Output of `resolveAccessibleEventIdsForUser` for the mapped LR user. */
  access: { resolution: EventAccessResolution; eventIds: readonly string[] };
  /** The mapped LR event id. */
  eventId: string;
};

export type LeadRetrievalAccessDecision =
  | { ok: true; role: LaunchableLeadRetrievalRole; resolution: EventAccessResolution }
  | { ok: false; reason: "LR_ROLE_NOT_LAUNCHABLE" | "LR_ACCESS_DENIED" };

export function decideLeadRetrievalEventAccess(input: LeadRetrievalAccessInput): LeadRetrievalAccessDecision {
  const role = normalizeSessionRole(input.role);
  if (!role || !(LAUNCHABLE_LEAD_RETRIEVAL_ROLES as readonly string[]).includes(role)) {
    return { ok: false, reason: "LR_ROLE_NOT_LAUNCHABLE" };
  }
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) return { ok: false, reason: "LR_ACCESS_DENIED" };

  // Platform admins are LR's platform-wide role; every existing admin surface
  // admits them without an event list (resolution "platform_all"), and the admin
  // event workspace they land in checks the role itself.
  if (role === "platform_admin") {
    return { ok: true, role, resolution: input.access.resolution };
  }

  // Organizers and exhibitor roles must hold the event in their canonical
  // accessible set -- the same set that gates every other LR read and write.
  if (!input.access.eventIds.includes(eventId)) {
    return { ok: false, reason: "LR_ACCESS_DENIED" };
  }
  return { ok: true, role: role as LaunchableLeadRetrievalRole, resolution: input.access.resolution };
}

/**
 * The existing LR workspace for the mapped event, per role. No picker, no new page:
 *   platform_admin   → the admin event workspace
 *   organizer_admin  → the organizer landing, scoped by the URL's eventId (validated there)
 *   exhibitor roles  → the exhibitor event dashboard, scoped by the URL's eventId (validated there)
 */
export function buildLeadRetrievalLandingPath(role: LaunchableLeadRetrievalRole, eventId: string): string {
  const id = encodeURIComponent(String(eventId).trim());
  if (role === "platform_admin") return `/admin/events/${id}`;
  if (role === "organizer_admin") return `/app/organizer?eventId=${id}`;
  return `/exhibitor/dashboard?eventId=${id}`;
}

/**
 * Persist the launched event as the exhibitor app's active event, using the same
 * cookie the in-app event switcher writes (client-writable, Path=/, SameSite=Lax,
 * one year) so later navigation stays inside the launched event. Every reader
 * validates the value against the user's accessible set; it grants nothing.
 */
export function applyLandingCookies(
  response: NextResponse,
  role: LaunchableLeadRetrievalRole,
  eventId: string,
  options: { secure?: boolean } = {}
): void {
  if (role !== "exhibitor_admin" && role !== "exhibitor_viewer") return;
  response.cookies.set({
    name: EXHIBITOR_APP_ACTIVE_EVENT_COOKIE,
    value: String(eventId).trim(),
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: options.secure ?? false,
    maxAge: EXHIBITOR_APP_ACTIVE_EVENT_COOKIE_MAX_AGE_SEC
  });
}
