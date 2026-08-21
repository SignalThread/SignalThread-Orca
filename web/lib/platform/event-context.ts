/**
 * Platform Core → Orca event handoff.
 *
 * Platform Core launches Orca for a specific event:
 *
 *   Platform  →  /platform-entry?event_id=<canonical uuid>  →  Orca opens that event
 *
 * Because `Event.id` **is** the canonical Platform `event_id` (Phase 3 adopted it directly,
 * with no mapping table), the incoming identifier is a direct primary-key lookup.
 *
 * ## The incoming event id is untrusted
 *
 * It arrives in a URL, so it is attacker-controlled. It is never treated as evidence of
 * access — only as a lookup key. Every one of these must hold before entry is granted:
 *
 *   1. it parses as a uuid;
 *   2. the event exists in Orca;
 *   3. the event's organization is one the *verified Platform session* authorizes,
 *      intersected with the organizations Orca itself grants the user;
 *   4. Orca's own `EventMember` / `EventMemberRole` rules admit the user to that event.
 *
 * Step 3 is what stops a tampered `event_id` pointing at another tenant's event: swapping in
 * a foreign uuid resolves to an event whose organization is absent from the authorized set,
 * and the handoff is refused. Step 4 is what keeps Orca product RBAC in Orca — Platform
 * decides *whether you may enter Orca*, Orca decides *what you may do inside it*.
 *
 * Nothing here reads Platform Core's database. Authorization comes from the verified session
 * (claims) plus Orca's own tables.
 */

import { EventAccessError, assertEventAccessForUser, type EventAccessUser } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PlatformEventHandoffDecision =
  | {
      status: "ALLOWED";
      eventId: string;
      organizationId: string;
      /** True when the active-organization context must be switched to the event's org. */
      requiresOrganizationSwitch: boolean;
      canEdit: boolean;
    }
  | {
      status: "DENIED";
      reason: string;
      hint: string;
      httpStatus: 400 | 403 | 404;
    };

export type PlatformEventHandoffInput = {
  /** Untrusted: comes straight off the query string. */
  requestedEventId: string | null;
  /** Organizations this session is authorized for, after Platform-claim restriction. */
  authorizedOrganizationIds: readonly string[];
  /** The resolved Orca user, used for Orca's own event RBAC. */
  user: EventAccessUser;
};

/**
 * Decide whether a Platform-launched event may be entered.
 *
 * `user.orgId` is deliberately overridden with the event's organization before Orca's event
 * access check runs: the handoff is what *establishes* organization context, so requiring
 * the cookie to already match would force the duplicate organization selection this phase
 * exists to remove. The substitution is safe because the event's organization has just been
 * verified against the authorized set on the line above.
 */
export async function resolvePlatformEventHandoff(
  input: PlatformEventHandoffInput,
): Promise<PlatformEventHandoffDecision> {
  const requestedEventId = input.requestedEventId?.trim() ?? "";

  if (!requestedEventId || !UUID_REGEX.test(requestedEventId)) {
    return {
      status: "DENIED",
      reason: "INVALID_EVENT_ID",
      hint: "The launch link did not carry a valid event id.",
      httpStatus: 400,
    };
  }

  const event = await getPrisma().event.findUnique({
    where: { id: requestedEventId },
    select: { id: true, orgId: true },
  });

  if (!event) {
    return {
      status: "DENIED",
      reason: "EVENT_NOT_FOUND",
      hint: "That event does not exist in Orca.",
      httpStatus: 404,
    };
  }

  const authorized = new Set(input.authorizedOrganizationIds);
  if (!authorized.has(event.orgId)) {
    // Either a tampered id pointing at another tenant, or genuine loss of access.
    // The response is deliberately identical in both cases.
    return {
      status: "DENIED",
      reason: "EVENT_OUTSIDE_AUTHORIZED_ORGANIZATION",
      hint: "That event belongs to an organization this account is not authorized for.",
      httpStatus: 403,
    };
  }

  try {
    const decision = await assertEventAccessForUser(
      event.id,
      { id: input.user.id, orgId: event.orgId, role: input.user.role },
      "read",
    );
    return {
      status: "ALLOWED",
      eventId: event.id,
      organizationId: event.orgId,
      requiresOrganizationSwitch: input.user.orgId !== event.orgId,
      canEdit: decision.canEdit,
    };
  } catch (error) {
    if (error instanceof EventAccessError) {
      const httpStatus = error.status === 404 ? 404 : error.status === 400 ? 400 : 403;
      return { status: "DENIED", reason: error.reason, hint: error.message, httpStatus };
    }
    throw error;
  }
}
