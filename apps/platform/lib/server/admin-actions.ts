"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { getPlatformAdminClient } from "./admin-client";
import { requirePlatformAdmin } from "./guards";
import { syncClaimsForOrganization, syncSignalThreadClaims } from "./claims";

/**
 * Platform admin mutations.
 *
 * Every one of these runs server-side behind `requirePlatformAdmin`, and every
 * one that changes authorization re-derives the affected users' claims. RLS is
 * untouched: these use the service role precisely because the registry has no
 * write policies, which is what keeps ordinary users from mutating it.
 */

export type ActionResult =
  | { ok: true; message: string; refreshRequired?: boolean }
  | { ok: false; error: string };

function fail(error: unknown): ActionResult {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "NOT_AUTHENTICATED") return { ok: false, error: "You are not signed in." };
  if (message === "NOT_PLATFORM_ADMIN") return { ok: false, error: "Platform admin authority is required." };
  return { ok: false, error: message };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function findUserIdByEmail(email: string): Promise<string> {
  const supabase = getPlatformAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);
  const match = data.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
  if (!match) throw new Error(`No Platform Core user with email ${email}.`);
  return match.id;
}

export async function createOrganization(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    if (!slug || !name) return { ok: false, error: "Slug and name are required." };

    const { error } = await getPlatformAdminClient().from("organizations").insert({ slug, name });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true, message: `Organization ${name} created.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setOrganizationMembership(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const organizationId = String(formData.get("organizationId") ?? "");
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "MEMBER");
    if (!organizationId || !email) return { ok: false, error: "Organization and email are required." };

    const userId = await findUserIdByEmail(email);
    const { error } = await getPlatformAdminClient()
      .from("organization_memberships")
      .upsert(
        { organization_id: organizationId, user_id: userId, role, status: "ACTIVE" },
        { onConflict: "organization_id,user_id" },
      );
    if (error) throw new Error(error.message);

    // Membership is an authorization fact, so the claim must be re-derived now.
    await syncSignalThreadClaims(userId, nowIso());
    revalidatePath("/admin");
    return {
      ok: true,
      message: `${email} is now ${role} in that organization.`,
      refreshRequired: true,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function removeOrganizationMembership(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const organizationId = String(formData.get("organizationId") ?? "");
    const userId = String(formData.get("userId") ?? "");
    const { error } = await getPlatformAdminClient()
      .from("organization_memberships")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    await syncSignalThreadClaims(userId, nowIso());
    revalidatePath("/admin");
    return { ok: true, message: "Membership removed.", refreshRequired: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const organizationId = String(formData.get("organizationId") ?? "");
    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    if (!organizationId || !slug || !name) return { ok: false, error: "Organization, slug and name are required." };

    const { error } = await getPlatformAdminClient()
      .from("events")
      .insert({ organization_id: organizationId, slug, name, status: "ACTIVE" });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    // Events are not in the JWT, so no claim re-derivation and no refresh needed.
    return { ok: true, message: `Event ${name} created.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setEventMembership(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const eventId = String(formData.get("eventId") ?? "");
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "VIEWER");
    if (!eventId || !email) return { ok: false, error: "Event and email are required." };

    const userId = await findUserIdByEmail(email);
    const { error } = await getPlatformAdminClient()
      .from("event_memberships")
      .upsert({ event_id: eventId, user_id: userId, role }, { onConflict: "event_id,user_id" });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    // Event access is not carried in the JWT, so no session refresh is required.
    return { ok: true, message: `${email} added to that event as ${role}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setProductEntitlement(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const organizationId = String(formData.get("organizationId") ?? "");
    const productKey = String(formData.get("productKey") ?? "");
    const enabled = String(formData.get("enabled") ?? "") === "true";
    if (!organizationId || !productKey) return { ok: false, error: "Organization and product are required." };

    const supabase = getPlatformAdminClient();
    if (enabled) {
      const { error } = await supabase
        .from("organization_product_entitlements")
        .upsert(
          { organization_id: organizationId, product_key: productKey, status: "ACTIVE" },
          { onConflict: "organization_id,product_key" },
        );
      if (error) throw new Error(error.message);
    } else {
      // Suspend rather than delete, so the grant history survives a revocation.
      const { error } = await supabase
        .from("organization_product_entitlements")
        .update({ status: "SUSPENDED" })
        .eq("organization_id", organizationId)
        .eq("product_key", productKey);
      if (error) throw new Error(error.message);
    }

    // Entitlement is org-wide, so every member's claim changes, not just the actor's.
    const results = await syncClaimsForOrganization(organizationId, nowIso());
    revalidatePath("/admin");
    revalidatePath("/home");
    return {
      ok: true,
      message: `${productKey} ${enabled ? "enabled" : "disabled"}. ${results.length} member claim(s) re-derived.`,
      refreshRequired: true,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Re-derive claims for everyone. Idempotent; reports how many actually changed. */
export async function reconcileAllClaims(): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const supabase = getPlatformAdminClient();
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);

    const syncedAt = nowIso();
    let changed = 0;
    for (const user of data.users) {
      const result = await syncSignalThreadClaims(user.id, syncedAt);
      if (result.changed) changed += 1;
    }
    revalidatePath("/admin");
    return {
      ok: true,
      message: `${data.users.length} user(s) reconciled, ${changed} changed.`,
      refreshRequired: changed > 0,
    };
  } catch (error) {
    return fail(error);
  }
}
