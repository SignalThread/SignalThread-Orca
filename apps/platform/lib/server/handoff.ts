import "server-only";

import { getPlatformAdminClient } from "./admin-client";
import { buildProductHandoffUrl, getProductAppUrl } from "./product-registry";

/**
 * Mint a one-time Platform Core auth handoff for a product app.
 *
 * Mechanism: `auth.admin.generateLink({ type: "magiclink" })` returns a
 * `hashed_token` that is exchanged exactly once via `verifyOtp` using only the
 * **anon** key. Properties that matter, all verified against the live project:
 *
 *   - single-use  -- a second exchange of the same token is rejected
 *   - short-lived -- GoTrue OTP expiry applies; the claim path (own-authority
 *                    products) additionally enforces a tighter freshness bound
 *   - Auth-native -- no custom JWT signing, no home-grown crypto
 *   - scoped to one user, resolved server-side from the verified session
 *   - carries no password and no service-role credential to the product
 *
 * Who exchanges it depends on the product's auth authority (see
 * `product-registry.ts`): Orca exchanges it itself because it authenticates
 * against Platform Core; Pulse hands it back to Platform's claim endpoint
 * because it must never hold a Platform Core session.
 *
 * The generated `action_link` is deliberately discarded. Only the `hashed_token`
 * travels, and this app builds the destination URL itself, so Supabase's redirect
 * allowlist is never consulted and no production auth configuration is required.
 *
 * The service-role key stays here. Product apps hold anon keys only.
 */

export { getProductAppUrl, buildProductReturnPath } from "./product-registry";

export type HandoffMint =
  | { status: "MINTED"; url: string }
  | { status: "FAILED"; reason: string };

export async function mintProductHandoff(input: {
  email: string;
  productKey: string;
  /** The *validated* canonical event id. Never taken from the request. */
  eventId: string;
  /**
   * The product's own browser-bound launch correlator, relayed back unchanged.
   * Correlation only: it reaches this function *after* authorization has already
   * completed, and nothing here or upstream reads it as authority.
   */
  launchState?: string | null;
}): Promise<HandoffMint> {
  const appUrl = getProductAppUrl(input.productKey);
  if (!appUrl) {
    return { status: "FAILED", reason: "PRODUCT_APP_NOT_CONFIGURED" };
  }

  const supabase = getPlatformAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
  });

  // The Supabase error can echo the address; it is never surfaced or logged.
  if (error || !data?.properties?.hashed_token) {
    return { status: "FAILED", reason: "HANDOFF_MINT_FAILED" };
  }

  const url = buildProductHandoffUrl({
    productKey: input.productKey,
    appUrl,
    hashedToken: data.properties.hashed_token,
    eventId: input.eventId,
    launchState: input.launchState ?? null,
  });
  if (!url) {
    return { status: "FAILED", reason: "INVALID_RETURN_PATH" };
  }

  return { status: "MINTED", url };
}
