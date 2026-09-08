import "server-only";

import { createHash, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAppAccessGrant } from "@/lib/server/event-user-access";
import { normalizeEventAccessMode, type EventAccessMode } from "@/lib/access/event-access-mode";
import type { Json } from "@/types/database";

type InvitePermissions = {
  admin: boolean;
  app: boolean;
};

function normalizePermissions(value: InvitePermissions): InvitePermissions {
  return {
    admin: Boolean(value?.admin),
    app: Boolean(value?.app)
  };
}

function generateSixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isCodeHashCollision(error: { code?: string; message?: string; details?: string; hint?: string } | null) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return code === "23505" || message.includes("code_hash");
}

export async function createInviteCode(input: {
  eventId: string;
  exhibitorCompanyId: string;
  email: string;
  permissions: { admin: boolean; app: boolean };
  excludeUserId?: string;
  /**
   * Admin-chosen scope stored on the invite so redemption can persist it onto
   * `public.users.event_access_mode`. Defaults to `assigned_events_only`.
   */
  eventAccessMode?: EventAccessMode;
}) {
  const eventId = String(input.eventId ?? "").trim();
  const exhibitorCompanyId = String(input.exhibitorCompanyId ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const permissions = normalizePermissions(input.permissions);
  const eventAccessMode: EventAccessMode = normalizeEventAccessMode(
    input.eventAccessMode ?? "assigned_events_only"
  );

  if (!eventId || !exhibitorCompanyId || !email) {
    throw new Error("eventId, exhibitorCompanyId, and email are required.");
  }

  const grant = await evaluateAppAccessGrant({
    eventId,
    exhibitorCompanyId,
    requestedAppAccess: permissions.app,
    excludeUserId: String(input.excludeUserId ?? "").trim() || undefined
  });
  if (!grant.ok) {
    throw new Error(grant.error);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createAdminClient();

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSixDigitCode();
    const codeHash = sha256(code);

    const { data, error } = await (supabase as any)
      .from("invite_codes")
      .insert({
        event_id: eventId,
        exhibitor_company_id: exhibitorCompanyId,
        email,
        code_hash: codeHash,
        permissions: permissions as Json,
        event_access_mode: eventAccessMode,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        used_at: null,
        used_by_user_id: null
      })
      .select(
        "id, event_id, exhibitor_company_id, email, permissions, event_access_mode, created_at, expires_at, used_at"
      )
      .single();

    if (!error) {
      return {
        code,
        invite: data
      };
    }

    if (!isCodeHashCollision(error)) {
      const message = error.message ?? "Failed to create invite code.";
      const codeText = error.code ? ` code=${error.code}` : "";
      const detailsText = error.details ? ` details=${error.details}` : "";
      const hintText = error.hint ? ` hint=${error.hint}` : "";
      throw new Error(`${message}${codeText}${detailsText}${hintText}`);
    }
  }

  throw new Error("Failed to create invite code (collision).");
}
