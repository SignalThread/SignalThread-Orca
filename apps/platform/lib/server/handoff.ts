import "server-only";

import { getPlatformAdminClient } from "./admin-client";
import { getProductAppUrl } from "./product-registry";

/**
 * Mint a one-time Platform Core auth handoff for a product app.
 *
 * Mechanism: `auth.admin.generateLink({ type: "magiclink" })` returns a
 * `hashed_token` that the product exchanges via `verifyOtp` using only its
 * **anon** key. Properties that matter, all verified against the live project:
 *
 *   - single-use  -- a second exchange of the same token is rejected
 *   - short-lived -- GoTrue OTP expiry applies
 *   - Auth-native -- no custom JWT signing, no home-grown crypto
 *   - scoped to one user, by email, resolved server-side
 *   - carries no password and no service-role credential to the product
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
  returnPath: string;
}): Promise<HandoffMint> {
  const appUrl = getProductAppUrl(input.productKey);
  if (!appUrl) {
    return { status: "FAILED", reason: "PRODUCT_APP_NOT_CONFIGURED" };
  }

  // Only a same-origin relative path may be handed to the product, so a crafted
  // return target can never redirect a freshly authenticated user off-origin.
  if (!input.returnPath.startsWith("/") || input.returnPath.startsWith("//")) {
    return { status: "FAILED", reason: "INVALID_RETURN_PATH" };
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

  const url = new URL(`${appUrl}/auth/callback`);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", input.returnPath);

  return { status: "MINTED", url: url.toString() };
}
