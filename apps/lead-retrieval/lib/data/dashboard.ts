import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getOrganizerDashboardData() {
  await requireRole("organizer_admin");
  const supabase = await createSupabaseServerClient();

  const [companies, users, leads, licenses] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
  ]);

  return {
    totalCompanies: companies.count ?? 0,
    totalUsers: users.count ?? 0,
    totalLeads: leads.count ?? 0,
    activeLicenses: licenses.count ?? 0
  };
}
