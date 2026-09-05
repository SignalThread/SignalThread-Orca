import "server-only";

import { getPlatformAdminClient } from "./admin-client";
import { getOrganizationAccessForUser } from "./registry";

/**
 * Authorization for launching a product at a specific event.
 *
 * This runs **before** any handoff is minted. A handoff is a bearer credential for
 * a real session, so issuing one to an unauthorized user would turn the launcher
 * into an entitlement bypass -- the checks have to gate token issuance, not merely
 * decorate the UI.
 *
 * Nothing client-supplied is trusted. The caller passes only an event id; the
 * organization, the membership, and the entitlement are all resolved server-side
 * from the canonical registry, and the event's organization is compared against
 * the user's *derived* access rather than anything in the request.
 *
 * Product-agnostic on purpose: Registration, Housing, Pulse and Lead Retrieval
 * reuse this unchanged by passing their own product key.
 */

export type LaunchDenial =
  | "NOT_AUTHENTICATED"
  | "EVENT_NOT_FOUND"
  | "ORG_NOT_MEMBER"
  | "PRODUCT_NOT_ENTITLED"
  | "EVENT_NOT_LAUNCHABLE";

export type LaunchAuthorization =
  | { status: "AUTHORIZED"; organizationId: string; eventId: string; productKey: string }
  | { status: "DENIED"; reason: LaunchDenial; hint: string };

const DENIAL_HINTS: Record<LaunchDenial, string> = {
  NOT_AUTHENTICATED: "Sign in to SignalThread before opening a product.",
  EVENT_NOT_FOUND: "That event does not exist.",
  ORG_NOT_MEMBER: "This account is not a member of the organization that owns that event.",
  PRODUCT_NOT_ENTITLED: "That organization is not entitled to this product.",
  EVENT_NOT_LAUNCHABLE: "That event is archived and cannot be opened.",
};

function deny(reason: LaunchDenial): LaunchAuthorization {
  return { status: "DENIED", reason, hint: DENIAL_HINTS[reason] };
}

export async function authorizeProductLaunch(input: {
  userId: string;
  productKey: string;
  eventId: string;
}): Promise<LaunchAuthorization> {
  const productKey = input.productKey.trim().toLowerCase();
  const supabase = getPlatformAdminClient();

  // Resolve the event first: its organization is the only organization that can
  // authorize this launch. A caller-supplied organization_id is never consulted.
  const { data: event, error } = await supabase
    .from("events")
    .select("id, organization_id, status")
    .eq("id", input.eventId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read event: ${error.message}`);
  if (!event) return deny("EVENT_NOT_FOUND");
  if (event.status === "ARCHIVED") return deny("EVENT_NOT_LAUNCHABLE");

  // Derived access: ACTIVE membership of an ACTIVE organization, with that
  // organization's ACTIVE entitlements attached.
  const access = await getOrganizationAccessForUser(input.userId);
  const owning = access.find((entry) => entry.organizationId === event.organization_id);

  if (!owning) return deny("ORG_NOT_MEMBER");
  if (!owning.products.includes(productKey)) return deny("PRODUCT_NOT_ENTITLED");

  return {
    status: "AUTHORIZED",
    organizationId: owning.organizationId,
    eventId: String(event.id),
    productKey,
  };
}
