import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requirePlatformAuthConfig } from "@/lib/supabase/config";
import { getPlatformAdminClient } from "./admin-client";
import {
  claimHandoff,
  resolveHandoffMaxAgeSeconds,
  type ClaimRequest,
  type ClaimResult,
  type VerifiedHandoff,
} from "./handoff-claim-core";
import { authorizeProductLaunch } from "./product-launch";
import { getProductAuthAuthority } from "./product-registry";

/**
 * Real dependencies for the claim path. See `handoff-claim-core.ts` for the rules.
 *
 * The token is exchanged with a **throwaway, in-memory** anon client: no cookie
 * jar, no persistence, so the Platform Core session it produces never reaches a
 * response. It exists only long enough to read the verified user, and is then
 * revoked with the admin API.
 */

async function verifyHandoff(hashedToken: string): Promise<VerifiedHandoff | null> {
  const { url, anonKey } = requirePlatformAuthConfig();
  const throwaway = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await throwaway.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken });
  if (error || !data.user) return null;

  // GoTrue stamps `recovery_sent_at` when the magiclink is generated; it is the
  // issue time of this exact token. Read defensively: the field is not part of
  // the typed User surface.
  const raw = (data.user as unknown as { recovery_sent_at?: unknown }).recovery_sent_at;
  const issuedAt = typeof raw === "string" ? new Date(raw) : null;

  return {
    userId: data.user.id,
    issuedAt,
    accessToken: data.session?.access_token ?? null,
  };
}

async function revokeSession(accessToken: string): Promise<void> {
  const admin = getPlatformAdminClient();
  await admin.auth.admin.signOut(accessToken, "local");
}

export async function claimProductHandoff(request: ClaimRequest): Promise<ClaimResult> {
  // Only products that own their auth authority claim through Platform. A
  // platform-core product exchanges the token itself; letting it claim here
  // would be a second consumption path with no reason to exist.
  if (getProductAuthAuthority(request.productKey) !== "own") {
    return { status: "DENIED", reason: "INVALID_REQUEST", httpStatus: 400 };
  }

  return claimHandoff(request, {
    verifyHandoff,
    revokeSession,
    authorize: authorizeProductLaunch,
    maxAgeSeconds: resolveHandoffMaxAgeSeconds(process.env.HANDOFF_MAX_AGE_SECONDS),
  });
}
