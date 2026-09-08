/**
 * Post-delete checks for “delete company team user” (single-company model). Importable from tests; no server-only.
 */

function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export async function verifyCompanyTeamUserFullyDeleted(input: {
  supabase: any;
  userId: string;
  exhibitorCompanyId: string;
  userEmail: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = String(input.userId ?? "").trim();
  const exhibitorCompanyId = String(input.exhibitorCompanyId ?? "").trim();
  const email = normalizeEmail(input.userEmail);

  if (!userId || !exhibitorCompanyId) {
    return { ok: false, error: "Missing user or company id." };
  }

  const supabase = input.supabase;

  const { data: userRow, error: userErr } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();

  if (userErr) {
    return { ok: false, error: userErr.message ?? "Failed verifying users row removal." };
  }
  if (userRow) {
    return { ok: false, error: "User profile still exists after delete." };
  }

  const { count: evCount, error: evErr } = await supabase
    .from("event_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (evErr) {
    return { ok: false, error: evErr.message ?? "Failed verifying event_users cleanup." };
  }
  if (Number(evCount ?? 0) > 0) {
    return { ok: false, error: "Event memberships still exist for this user." };
  }

  if (email) {
    const { count: invCount, error: invErr } = await supabase
      .from("invite_codes")
      .select("id", { count: "exact", head: true })
      .eq("exhibitor_company_id", exhibitorCompanyId)
      .eq("email", email)
      .is("used_at", null);

    if (invErr) {
      return { ok: false, error: invErr.message ?? "Failed verifying invite cleanup." };
    }
    if (Number(invCount ?? 0) > 0) {
      return { ok: false, error: "Pending invite codes still exist for this user." };
    }
  }

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
  if (authErr) {
    const msg = String(authErr.message ?? "").toLowerCase();
    if (msg.includes("not found") || msg.includes("user not found")) {
      return { ok: true };
    }
    return { ok: false, error: authErr.message ?? "Failed verifying auth user removal." };
  }
  if (authData?.user) {
    return { ok: false, error: "Auth user still exists after delete." };
  }

  return { ok: true };
}
