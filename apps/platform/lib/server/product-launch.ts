import "server-only";

import { getPlatformAdminClient } from "./admin-client";
import { decideProductLaunch, type LaunchAuthorization } from "./launch-decision";
import { getOrganizationAccessForUser } from "./registry";

export type { LaunchAuthorization, LaunchDenial } from "./launch-decision";

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
 * the user's *derived* access rather than anything in the request. The decision
 * itself lives in `launch-decision.ts`, where it is tested without I/O.
 *
 * Product-agnostic on purpose: Registration, Housing, Pulse and Lead Retrieval
 * reuse this unchanged by passing their own product key. It is also what the
 * claim endpoint re-runs when an own-authority product hands a token back, so
 * the context a product receives is always derived from live registry state.
 */
export async function authorizeProductLaunch(input: {
  userId: string;
  productKey: string;
  eventId: string;
}): Promise<LaunchAuthorization> {
  const supabase = getPlatformAdminClient();

  // Resolve the event first: its organization is the only organization that can
  // authorize this launch. A caller-supplied organization_id is never consulted.
  const { data: event, error } = await supabase
    .from("events")
    .select("id, organization_id, status")
    .eq("id", input.eventId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read event: ${error.message}`);

  // Derived access: ACTIVE membership of an ACTIVE organization, with that
  // organization's ACTIVE entitlements attached.
  const access = event ? await getOrganizationAccessForUser(input.userId) : [];

  return decideProductLaunch({ productKey: input.productKey, event, access });
}
