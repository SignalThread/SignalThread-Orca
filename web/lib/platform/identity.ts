import type { UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

/**
 * Canonical Platform Core user identity for Orca.
 *
 * Before Phase 1, Orca joined the authenticated Supabase identity to its own `User` row by
 * **email**: a mutable, user-controlled value that silently collapsed two identities with
 * the same address and orphaned an account whenever its email changed.
 *
 * Phase 1 makes `User.platformUserId` the identity join key and demotes email to an
 * explicit, switchable transitional bridge used only to *link* pre-existing rows:
 *
 *   1. Look up by `platformUserId` — the canonical path.
 *   2. If unlinked and the bridge is enabled, look up by email and claim the row by
 *      writing `platformUserId` (idempotent, race-safe, never overwrites a different id).
 *   3. If the email row already belongs to a different Platform identity, refuse. Email is
 *      no longer strong enough to prove identity, so identities are never merged silently.
 *
 * The bridge is a migration affordance, not the model. Once every row is linked (see
 * `web/scripts/backfill-platform-user-ids.ts`), set
 * `PLATFORM_IDENTITY_EMAIL_BRIDGE=false` and email stops being an identity entirely.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PlatformIdentityAppUser = Readonly<{
  id: string;
  email: string;
  orgId: string;
  role: UserRole;
  platformUserId: string | null;
}>;

export type PlatformIdentityLinkMode =
  /** Row was already keyed by the canonical Platform Core id. */
  | "CANONICAL"
  /** Row was found by the transitional email bridge and has now been linked. */
  | "EMAIL_BRIDGE_LINKED"
  /** Row was found by the transitional email bridge but could not be linked. */
  | "EMAIL_BRIDGE_UNLINKED"
  /** No row matched. */
  | "UNRESOLVED";

export type PlatformIdentityResolution =
  | {
      status: "RESOLVED";
      appUser: PlatformIdentityAppUser;
      linkMode: Exclude<PlatformIdentityLinkMode, "UNRESOLVED">;
    }
  | {
      status: "NOT_FOUND";
      linkMode: "UNRESOLVED";
    }
  | {
      status: "CONFLICT";
      reason: string;
      hint: string;
    };

export function normalizePlatformEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidPlatformUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

/**
 * Whether the transitional email→platform-id bridge is active.
 *
 * Phase 2 retires the bridge: it is **off by default in production**, because email is not
 * proof of identity and Platform Core now owns identity. Turning it back on there is an
 * explicit, temporary migration act (`PLATFORM_IDENTITY_EMAIL_BRIDGE=true`) used only while
 * `backfill-platform-user-ids` is being rolled out.
 *
 * Outside production it stays on by default so local development and the Playwright suite,
 * whose fixtures create users without a Platform id, keep working.
 *
 * Even while enabled the bridge never lets a different Platform user inherit another user's
 * Orca identity: a row already linked to a different id is refused, not re-pointed.
 */
export function isEmailIdentityBridgeEnabled(): boolean {
  const raw = process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return process.env.NODE_ENV !== "production";
}

const APP_USER_SELECT = {
  id: true,
  email: true,
  orgId: true,
  role: true,
  platformUserId: true,
} as const;

/**
 * Link an existing Orca user to a canonical Platform Core id.
 *
 * Idempotent and non-destructive: the update is conditional on the row still being
 * unlinked, so a concurrent request that wins the race leaves the row untouched rather
 * than reassigning an identity.
 */
async function claimPlatformUserId(input: {
  appUserId: string;
  platformUserId: string;
}): Promise<PlatformIdentityAppUser | null> {
  try {
    const result = await getPrisma().user.updateMany({
      where: { id: input.appUserId, platformUserId: null },
      data: { platformUserId: input.platformUserId },
    });

    if (result.count === 0) return null;
  } catch {
    // Unique-index violation: another row claimed this Platform identity first.
    return null;
  }

  return getPrisma().user.findUnique({
    where: { id: input.appUserId },
    select: APP_USER_SELECT,
  });
}

/**
 * Resolve the Orca user for an authenticated Platform Core identity.
 *
 * Resolution never grants access on its own — organization membership, active-org scope,
 * and event roles are enforced separately and are unchanged by this function.
 */
export async function resolveAppUserByPlatformIdentity(input: {
  platformUserId: string;
  email: string | null;
}): Promise<PlatformIdentityResolution> {
  const platformUserId = input.platformUserId.trim();

  if (!isValidPlatformUserId(platformUserId)) {
    return {
      status: "CONFLICT",
      reason: "PLATFORM_USER_ID_INVALID",
      hint: "The authenticated identity did not carry a valid Platform Core user id.",
    };
  }

  const canonical = await getPrisma().user.findUnique({
    where: { platformUserId },
    select: APP_USER_SELECT,
  });

  if (canonical) {
    return { status: "RESOLVED", appUser: canonical, linkMode: "CANONICAL" };
  }

  if (!isEmailIdentityBridgeEnabled()) {
    return { status: "NOT_FOUND", linkMode: "UNRESOLVED" };
  }

  const email = input.email ? normalizePlatformEmail(input.email) : "";
  if (!email) {
    return { status: "NOT_FOUND", linkMode: "UNRESOLVED" };
  }

  const byEmail = await getPrisma().user.findUnique({
    where: { email },
    select: APP_USER_SELECT,
  });

  if (!byEmail) {
    return { status: "NOT_FOUND", linkMode: "UNRESOLVED" };
  }

  // The address matches, but the row already belongs to a different canonical identity.
  // Email is not proof of identity, so do not merge or re-point.
  if (byEmail.platformUserId && byEmail.platformUserId !== platformUserId) {
    return {
      status: "CONFLICT",
      reason: "PLATFORM_IDENTITY_CONFLICT",
      hint: "This email is already linked to a different Platform Core account. Contact an administrator.",
    };
  }

  const linked = await claimPlatformUserId({ appUserId: byEmail.id, platformUserId });
  if (linked?.platformUserId === platformUserId) {
    return { status: "RESOLVED", appUser: linked, linkMode: "EMAIL_BRIDGE_LINKED" };
  }

  // The claim did not land. Ask the canonical index who owns this Platform identity now;
  // a concurrent request may have linked either this row or a different one.
  const canonicalAfterClaim = await getPrisma().user.findUnique({
    where: { platformUserId },
    select: APP_USER_SELECT,
  });

  if (canonicalAfterClaim) {
    return { status: "RESOLVED", appUser: canonicalAfterClaim, linkMode: "CANONICAL" };
  }

  // Nobody owns the canonical id, so this row was linked to something else meanwhile.
  const reread = await getPrisma().user.findUnique({
    where: { id: byEmail.id },
    select: APP_USER_SELECT,
  });

  if (reread?.platformUserId && reread.platformUserId !== platformUserId) {
    return {
      status: "CONFLICT",
      reason: "PLATFORM_IDENTITY_CONFLICT",
      hint: "This email is already linked to a different Platform Core account. Contact an administrator.",
    };
  }

  // Linking did not persist for a reason we cannot attribute. Serve the request through
  // the transitional bridge, but report the row as still unlinked.
  return {
    status: "RESOLVED",
    appUser: reread ?? byEmail,
    linkMode: "EMAIL_BRIDGE_UNLINKED",
  };
}
