/**
 * Claiming a handoff on behalf of a product that owns its own auth authority.
 *
 * Pure orchestration with injected dependencies, so every rule below is asserted
 * in tests without GoTrue or the registry. `handoff-claim.ts` wires the real
 * dependencies and is `server-only`.
 *
 * Order is the security property:
 *
 *   1. verify the one-time token with Platform Core Auth  -> proves *who*
 *   2. enforce the freshness bound                        -> proves *when*
 *   3. re-run launch authorization for (user, product, event)
 *                                                          -> proves *what*
 *   4. only then return the canonical context
 *
 * The token proves identity and nothing else. Organization and event are never
 * read from the token, the request body or the product: they are re-derived from
 * live registry state by the same `authorizeProductLaunch` that gated minting.
 * A token can therefore never enter an event or organization the user could not
 * launch afresh, and knowing canonical ids without a valid token yields nothing.
 */

import { isSafeCanonicalId } from "./canonical-id";
import type { LaunchAuthorization } from "./launch-decision";

/** Default freshness bound for a handoff, in seconds. Overridable via HANDOFF_MAX_AGE_SECONDS. */
export const DEFAULT_HANDOFF_MAX_AGE_SECONDS = 300;

export type VerifiedHandoff = {
  /** The canonical Platform user the token was minted for. */
  userId: string;
  /** When GoTrue recorded the token as issued (`recovery_sent_at`), or null when absent. */
  issuedAt: Date | null;
  /** Opaque handle the caller can use to revoke the verification session. */
  accessToken: string | null;
};

export type ClaimDeps = {
  /** Exchange the one-time token with Platform Core Auth. Null on any failure. */
  verifyHandoff: (hashedToken: string) => Promise<VerifiedHandoff | null>;
  /** Best-effort revocation of the throwaway verification session. */
  revokeSession: (accessToken: string) => Promise<void>;
  authorize: (input: { userId: string; productKey: string; eventId: string }) => Promise<LaunchAuthorization>;
  now?: () => Date;
  maxAgeSeconds?: number;
};

export type ClaimDenial =
  | "INVALID_REQUEST"
  | "HANDOFF_INVALID"
  | "HANDOFF_EXPIRED"
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_LAUNCHABLE"
  | "ORG_NOT_MEMBER"
  | "PRODUCT_NOT_ENTITLED"
  | "NOT_AUTHENTICATED";

export type ClaimResult =
  | {
      status: "CLAIMED";
      platformUserId: string;
      organizationId: string;
      eventId: string;
      productKey: string;
    }
  | { status: "DENIED"; reason: ClaimDenial; httpStatus: number };

const DENIAL_STATUS: Record<ClaimDenial, number> = {
  INVALID_REQUEST: 400,
  HANDOFF_INVALID: 401,
  HANDOFF_EXPIRED: 401,
  NOT_AUTHENTICATED: 401,
  EVENT_NOT_FOUND: 404,
  EVENT_NOT_LAUNCHABLE: 403,
  ORG_NOT_MEMBER: 403,
  PRODUCT_NOT_ENTITLED: 403,
};

function deny(reason: ClaimDenial): ClaimResult {
  return { status: "DENIED", reason, httpStatus: DENIAL_STATUS[reason] };
}

export type ClaimRequest = { productKey: string; handoff: string; eventId: string };

/** Parse an untrusted JSON body into a claim request, or null. */
export function parseClaimRequest(productKey: string, body: unknown): ClaimRequest | null {
  const key = productKey.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(key)) return null;
  if (typeof body !== "object" || body === null) return null;
  const { handoff, event_id: eventId } = body as Record<string, unknown>;
  if (typeof handoff !== "string" || handoff.length < 16 || handoff.length > 512) return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(handoff)) return null;
  if (!isSafeCanonicalId(eventId)) return null;
  return { productKey: key, handoff, eventId: eventId.trim().toLowerCase() };
}

export function resolveHandoffMaxAgeSeconds(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 3600) return parsed;
  return DEFAULT_HANDOFF_MAX_AGE_SECONDS;
}

/**
 * True when the token was issued within the bound. A missing issue timestamp
 * fails closed: the bound cannot be proven, so the claim is refused.
 */
export function isHandoffFresh(issuedAt: Date | null, now: Date, maxAgeSeconds: number): boolean {
  if (!issuedAt || Number.isNaN(issuedAt.getTime())) return false;
  const ageMs = now.getTime() - issuedAt.getTime();
  // A small negative age tolerates clock skew between GoTrue and this process.
  return ageMs >= -30_000 && ageMs <= maxAgeSeconds * 1000;
}

export async function claimHandoff(request: ClaimRequest, deps: ClaimDeps): Promise<ClaimResult> {
  const now = deps.now ?? (() => new Date());
  const maxAge = deps.maxAgeSeconds ?? DEFAULT_HANDOFF_MAX_AGE_SECONDS;

  // 1. Identity: the one-time token is exchanged exactly once with Platform Core
  //    Auth. Malformed, expired and replayed tokens are indistinguishable here on
  //    purpose -- GoTrue returns one error for all three, and telling them apart
  //    would be an oracle.
  const verified = await deps.verifyHandoff(request.handoff);
  if (!verified) return deny("HANDOFF_INVALID");

  // The verification session is a real Platform Core session; it must not
  // outlive this request. Revocation is best-effort and never blocks a denial.
  if (verified.accessToken) {
    try {
      await deps.revokeSession(verified.accessToken);
    } catch {
      // Revocation failing is not a reason to grant or deny anything.
    }
  }

  // 2. Freshness, tighter than GoTrue's own OTP expiry.
  if (!isHandoffFresh(verified.issuedAt, now(), maxAge)) return deny("HANDOFF_EXPIRED");

  // 3. Authorization, re-derived from live registry state for this product and
  //    the requested event. The organization comes from the event, never input.
  const decision = await deps.authorize({
    userId: verified.userId,
    productKey: request.productKey,
    eventId: request.eventId,
  });
  if (decision.status === "DENIED") return deny(decision.reason);

  // 4. Canonical context, and only now.
  return {
    status: "CLAIMED",
    platformUserId: verified.userId,
    organizationId: decision.organizationId,
    eventId: decision.eventId,
    productKey: decision.productKey,
  };
}
