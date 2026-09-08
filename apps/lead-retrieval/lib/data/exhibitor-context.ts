import { requireAuth } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/app";
import { resolveValidatedActiveEventIdForUser } from "@/lib/server/company-event-access";

export type ScopedUserContext = {
  id: string;
  role: AppRole;
  companyId: string | null;
  licenseId: string | null;
  eventId: string | null;
};

function normalizeAppRole(role: string | null | undefined): AppRole {
  const value = String(role ?? "").toLowerCase();
  if (value === "platform_admin") return "platform_admin";
  if (value === "organizer_admin" || value === "event_organizer") return "organizer_admin";
  if (value === "exhibitor_admin") return "exhibitor_admin";
  if (value === "exhibitor_viewer") return "exhibitor_viewer";
  return "viewer";
}

export async function getCurrentScopedUserContext(): Promise<ScopedUserContext> {
  const sessionUser = await requireAuth();
  const supabase = await createSupabaseServerClient();

  const { data } = (await supabase
    .from("users")
    .select("id, role, company_id, license_id")
    .eq("id", sessionUser.id)
    .maybeSingle()) as {
    data:
      | {
          id: string;
          role: AppRole;
          company_id: string | null;
          license_id: string | null;
        }
      | null;
  };

  if (!data) {
    const { eventId } = await resolveValidatedActiveEventIdForUser(sessionUser.id, null);
    return {
      id: sessionUser.id,
      role: normalizeAppRole(sessionUser.role),
      companyId: sessionUser.company_id,
      licenseId: null,
      eventId
    };
  }

  const { eventId } = await resolveValidatedActiveEventIdForUser(data.id, null);

  return {
    id: data.id,
    role: normalizeAppRole(data.role),
    companyId: sessionUser.active_company_id ?? data.company_id,
    licenseId: data.license_id,
    eventId
  };
}
