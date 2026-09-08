import {
  resolveEventMapping,
  resolveOrganizationContext,
  resolveUserMapping,
  type LeadRetrievalEventMapping,
  type LeadRetrievalUserMapping,
  type MappingDeps,
  type MappingFailureReason,
  type OrganizationContext
} from "@/lib/platform/identity-mapping";
import { buildLeadRetrievalLandingPath, decideLeadRetrievalEventAccess } from "@/lib/platform/lr-authorization";
import { isCanonicalPlatformId } from "@/lib/platform/platform-ids";
import type { ClaimFailureReason, ClaimResult } from "@/lib/platform/platform-claim-client";
import type { EventAccessResolution } from "@/lib/access/event-access-mode";
import type { LaunchableLeadRetrievalRole } from "@/lib/platform/lr-authorization";

/**
 * Platform → Lead Retrieval entry: from a one-time handoff to an LR event workspace.
 *
 *   1. claim the handoff from Platform        → canonical user / organization / event
 *   2. map the user     (users.platform_user_id, unique)
 *   3. map the event    (events.platform_event_id, unique; must be a real event container)
 *   4. resolve the organization context  (companies.platform_organization_id, non-unique,
 *                                          narrowed by the mapped event and user)
 *   5. Lead Retrieval's own authorization for the mapped user and event
 *   6. only then report which LR user to open a session for and where to land
 *
 * Steps 2–4 are resolution, not authorization; step 5 is the same canonical
 * resolver every LR surface uses. There is no fallback anywhere in the chain:
 * not email, not name, not slug, not "first row". Session establishment is
 * deliberately not here: it is the last step of the route handler, after this
 * function has said yes, so no session is ever opened for a user who is refused.
 *
 * Pure: every external read is an injected dependency (`EntryDeps`).
 */

export type EntryDenial =
  | "INVALID_REQUEST"
  | ClaimFailureReason
  | MappingFailureReason
  | "LR_ROLE_NOT_LAUNCHABLE"
  | "LR_ACCESS_DENIED";

export type EntryResult =
  | {
      ok: true;
      lrUserId: string;
      role: LaunchableLeadRetrievalRole;
      resolution: EventAccessResolution;
      companyContextId: string;
      eventId: string;
      redirectPath: string;
    }
  | { ok: false; status: number; reason: EntryDenial; hint: string; platformReason?: string };

const HINTS: Record<EntryDenial, string> = {
  INVALID_REQUEST: "A Platform handoff and a canonical event id are required.",
  PLATFORM_NOT_CONFIGURED: "Platform launch is not configured for this Lead Retrieval deployment.",
  HANDOFF_INVALID: "This Platform handoff is invalid, has expired, or was already used. Open Lead Retrieval from Platform again.",
  HANDOFF_EXPIRED: "This Platform handoff has expired. Open Lead Retrieval from Platform again.",
  PLATFORM_DENIED: "Platform did not authorize this launch.",
  PLATFORM_UNAVAILABLE: "Platform could not confirm this launch. Try again from Platform.",
  INVALID_PLATFORM_ID: "Platform returned an unusable identifier for this launch.",
  USER_MAPPING_NOT_FOUND: "Your Platform account is not linked to a Lead Retrieval user yet.",
  EVENT_MAPPING_NOT_FOUND: "This event is not linked to a Lead Retrieval event yet.",
  EVENT_NOT_LAUNCHABLE_CONTAINER: "The linked Lead Retrieval record is not an event workspace.",
  ORGANIZATION_MAPPING_NOT_FOUND: "This organization is not linked to a Lead Retrieval company yet.",
  EVENT_ORGANIZATION_MISMATCH: "The linked Lead Retrieval event does not belong to a company linked to this organization.",
  AMBIGUOUS_ORGANIZATION_MAPPING:
    "This organization is linked to more than one Lead Retrieval company for this event; an administrator must disambiguate it.",
  LR_ROLE_NOT_LAUNCHABLE: "The linked Lead Retrieval user has no event workspace to open.",
  LR_ACCESS_DENIED: "The linked Lead Retrieval user does not have access to this event."
};

const STATUS: Record<EntryDenial, number> = {
  INVALID_REQUEST: 400,
  PLATFORM_NOT_CONFIGURED: 503,
  HANDOFF_INVALID: 401,
  HANDOFF_EXPIRED: 401,
  PLATFORM_DENIED: 403,
  PLATFORM_UNAVAILABLE: 502,
  INVALID_PLATFORM_ID: 502,
  USER_MAPPING_NOT_FOUND: 403,
  EVENT_MAPPING_NOT_FOUND: 403,
  EVENT_NOT_LAUNCHABLE_CONTAINER: 403,
  ORGANIZATION_MAPPING_NOT_FOUND: 403,
  EVENT_ORGANIZATION_MISMATCH: 403,
  AMBIGUOUS_ORGANIZATION_MAPPING: 403,
  LR_ROLE_NOT_LAUNCHABLE: 403,
  LR_ACCESS_DENIED: 403
};

function deny(reason: EntryDenial, platformReason?: string): EntryResult {
  return {
    ok: false,
    status: STATUS[reason],
    reason,
    hint: HINTS[reason],
    ...(platformReason ? { platformReason } : {})
  };
}

export type EntryDeps = {
  claim: (input: { handoff: string; eventId: string }) => Promise<ClaimResult>;
  mapping: MappingDeps;
  /** `resolveAccessibleEventIdsForUser` for the mapped LR user id. */
  resolveAccess: (lrUserId: string) => Promise<{ resolution: EventAccessResolution; eventIds: string[] }>;
};

export async function resolvePlatformEntry(
  input: { handoff: string | null; eventId: string | null },
  deps: EntryDeps
): Promise<EntryResult> {
  const handoff = input.handoff?.trim() ?? "";
  if (!handoff || handoff.length > 512 || !/^[A-Za-z0-9._~-]+$/.test(handoff)) return deny("INVALID_REQUEST");
  if (!isCanonicalPlatformId(input.eventId)) return deny("INVALID_REQUEST");

  // 1. Platform verifies the token and re-derives the canonical context.
  const claim = await deps.claim({ handoff, eventId: input.eventId.trim().toLowerCase() });
  if (!claim.ok) return deny(claim.reason, claim.platformReason);
  const { platformUserId, platformOrganizationId, platformEventId } = claim.context;

  // 2–3. Mapping, by canonical id only. The event id used is the one Platform
  //      authorized and returned, never the one in the browser's URL.
  const user = await resolveUserMapping(platformUserId, deps.mapping);
  if (!user.ok) return deny(user.reason);
  const event = await resolveEventMapping(platformEventId, deps.mapping);
  if (!event.ok) return deny(event.reason);

  // 4. One company context, narrowed by the mapped event and user.
  const organization = await resolveOrganizationContext(
    { platformOrganizationId, event: event.value, user: user.value },
    deps.mapping
  );
  if (!organization.ok) return deny(organization.reason);

  // 5. Lead Retrieval's own authorization. Mapping granted nothing; this does.
  const access = await deps.resolveAccess(user.value.id);
  const decision = decideLeadRetrievalEventAccess({
    role: user.value.role,
    access,
    eventId: event.value.id
  });
  if (!decision.ok) return deny(decision.reason);

  return {
    ok: true,
    lrUserId: user.value.id,
    role: decision.role,
    resolution: decision.resolution,
    companyContextId: organization.value.companyId,
    eventId: event.value.id,
    redirectPath: buildLeadRetrievalLandingPath(decision.role, event.value.id)
  };
}

export type { LeadRetrievalEventMapping, LeadRetrievalUserMapping, OrganizationContext };
