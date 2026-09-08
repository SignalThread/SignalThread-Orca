import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE,
  resolvePlatformAdminAccountContext,
  type PlatformAdminAccountContext
} from "@/lib/auth/platform-admin-account-context-core";

function readCookieValue(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolves the HttpOnly preference into a canonical, server-validated scope.
 * A forged/stale cookie is inert, and cookies are ignored for every non-platform role.
 */
export async function getValidatedPlatformAdminAccountContext(input: {
  userId: string;
  role: string | null;
}): Promise<PlatformAdminAccountContext | null> {
  if (input.role !== "platform_admin") return null;

  const store = await cookies();
  const requestedCompanyId = readCookieValue(
    store.get(PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE)?.value
  );
  if (!requestedCompanyId) return null;

  const supabase = createAdminClient();
  const { data: company, error } = await (supabase as any)
    .from("companies")
    .select("id, name")
    .eq("id", requestedCompanyId)
    .maybeSingle();

  if (error || !company) return null;

  return resolvePlatformAdminAccountContext({
    principal: { userId: input.userId, role: input.role },
    requestedCompanyId,
    company
  });
}
