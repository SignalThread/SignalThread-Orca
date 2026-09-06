/**
 * The launch authorization decision, as a pure function.
 *
 * `product-launch.ts` reads the event and the user's derived access from the
 * registry and hands both here. Keeping the decision free of I/O (and free of
 * `server-only`) is what lets every denial be asserted directly in tests, with
 * no database and no mocking of the rule under test.
 *
 * Nothing client-supplied reaches this function except the event id that was
 * used to *look up* the event. The organization is taken from the event row,
 * the membership from the user's derived access, and the entitlement from that
 * organization's derived product list. A caller-supplied organization id has no
 * way in.
 */

import type { OrganizationAccess } from "./organization-access";

export type LaunchDenial =
  | "NOT_AUTHENTICATED"
  | "EVENT_NOT_FOUND"
  | "ORG_NOT_MEMBER"
  | "PRODUCT_NOT_ENTITLED"
  | "EVENT_NOT_LAUNCHABLE";

export type LaunchAuthorization =
  | { status: "AUTHORIZED"; organizationId: string; eventId: string; productKey: string }
  | { status: "DENIED"; reason: LaunchDenial; hint: string };

export const DENIAL_HINTS: Record<LaunchDenial, string> = {
  NOT_AUTHENTICATED: "Sign in to SignalThread before opening a product.",
  EVENT_NOT_FOUND: "That event does not exist.",
  ORG_NOT_MEMBER: "This account is not a member of the organization that owns that event.",
  PRODUCT_NOT_ENTITLED: "That organization is not entitled to this product.",
  EVENT_NOT_LAUNCHABLE: "That event is archived and cannot be opened.",
};

export function denyLaunch(reason: LaunchDenial): LaunchAuthorization {
  return { status: "DENIED", reason, hint: DENIAL_HINTS[reason] };
}

export type RegistryEvent = {
  id: string;
  organization_id: string;
  status: string;
};

export function decideProductLaunch(input: {
  productKey: string;
  /** The event row for the requested id, or null when no such event exists. */
  event: RegistryEvent | null;
  /** The user's derived access: ACTIVE memberships of ACTIVE orgs, ACTIVE entitlements only. */
  access: readonly OrganizationAccess[];
}): LaunchAuthorization {
  const productKey = input.productKey.trim().toLowerCase();

  if (!input.event) return denyLaunch("EVENT_NOT_FOUND");
  if (input.event.status === "ARCHIVED") return denyLaunch("EVENT_NOT_LAUNCHABLE");

  // The event's organization is the only organization that can authorize this
  // launch. It is matched against *derived* access, never against the request.
  const owning = input.access.find((entry) => entry.organizationId === input.event!.organization_id);

  if (!owning) return denyLaunch("ORG_NOT_MEMBER");
  if (!owning.products.includes(productKey)) return denyLaunch("PRODUCT_NOT_ENTITLED");

  return {
    status: "AUTHORIZED",
    organizationId: owning.organizationId,
    eventId: String(input.event.id),
    productKey,
  };
}
