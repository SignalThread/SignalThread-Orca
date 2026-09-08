/**
 * Invite redeem `event_users.permissions` shape (no `import "server-only"` so tests can
 * import this module; mirrors {@link normalizeEventUserPermissions} in event-user-access).
 */

import type { Json } from "@/types/database";

export type RedeemEventUserPermissions = {
  admin: boolean;
  app: boolean;
};

const DEFAULT: RedeemEventUserPermissions = { admin: false, app: false };

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

function fromLegacyArray(value: unknown[]): RedeemEventUserPermissions {
  const lowered = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase());
  return {
    admin: lowered.includes("admin"),
    app: lowered.includes("app")
  };
}

export function normalizeEventUserPermissionsForRedeem(value: unknown): RedeemEventUserPermissions {
  if (Array.isArray(value)) {
    return fromLegacyArray(value);
  }
  if (!value || typeof value !== "object") {
    return { ...DEFAULT };
  }
  const record = value as Record<string, unknown>;
  return {
    admin: toBoolean(record.admin),
    app: toBoolean(record.app)
  };
}

/**
 * On invite redeem, apply invite `permissions` but never demote an existing `admin`
 * grant (parallel to `mergeInviteRedeemUserRole` on public.users).
 */
export function mergeEventUserPermissionsForInviteRedeem(
  existing: unknown,
  invite: unknown
): RedeemEventUserPermissions {
  const e = normalizeEventUserPermissionsForRedeem(existing);
  const i = normalizeEventUserPermissionsForRedeem(invite);
  return {
    admin: e.admin || i.admin,
    app: e.admin || e.app || i.admin || i.app
  };
}

export function toEventUserPermissionsJsonForRedeem(value: unknown): Json {
  return normalizeEventUserPermissionsForRedeem(value) as Json;
}
