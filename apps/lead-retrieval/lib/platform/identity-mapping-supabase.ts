import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MappingDeps } from "@/lib/platform/identity-mapping";

/**
 * Real loaders for identity-mapping.ts, over Lead Retrieval's own database with
 * the service role (the same client every server-side LR read path uses). Each
 * query is keyed by a canonical id or a local primary key only; there is no
 * email, name or slug predicate anywhere in this file.
 */
export function createSupabaseMappingDeps(
  supabase: ReturnType<typeof createAdminClient> = createAdminClient()
): MappingDeps {
  return {
    async findUserByPlatformUserId(platformUserId) {
      const { data, error } = await supabase
        .from("users")
        .select("id, role, company_id, platform_user_id")
        .eq("platform_user_id", platformUserId)
        .maybeSingle();
      if (error) throw new Error(`Failed resolving Platform user mapping: ${error.message}`);
      if (!data?.platform_user_id) return null;
      return {
        id: String(data.id),
        role: data.role ?? null,
        companyId: data.company_id ?? null,
        platformUserId: String(data.platform_user_id)
      };
    },

    async findEventByPlatformEventId(platformEventId) {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, company_id, container_kind, platform_event_id")
        .eq("platform_event_id", platformEventId)
        .maybeSingle();
      if (error) throw new Error(`Failed resolving Platform event mapping: ${error.message}`);
      if (!data?.platform_event_id) return null;
      return {
        id: String(data.id),
        name: String(data.name ?? ""),
        companyId: String(data.company_id),
        containerKind: String(data.container_kind ?? ""),
        platformEventId: String(data.platform_event_id)
      };
    },

    async findCompanyIdsByPlatformOrganizationId(platformOrganizationId) {
      const { data, error } = await supabase
        .from("companies")
        .select("id")
        .eq("platform_organization_id", platformOrganizationId)
        .order("id", { ascending: true })
        .limit(100);
      if (error) throw new Error(`Failed resolving Platform organization mapping: ${error.message}`);
      return (data ?? []).map((row) => String(row.id));
    },

    async findExhibitorCompanyIdsForEvent(eventId) {
      const { data, error } = await supabase.from("exhibitors").select("company_id").eq("event_id", eventId);
      if (error) throw new Error(`Failed loading exhibitors for event: ${error.message}`);
      return (data ?? []).map((row) => String(row.company_id));
    },

    async findMembershipCompanyIdsForUserAtEvent(userId, eventId) {
      const { data, error } = await supabase
        .from("event_users")
        .select("exhibitor_company_id")
        .eq("user_id", userId)
        .eq("event_id", eventId)
        .in("status", ["active", "invited"]);
      if (error) throw new Error(`Failed loading event membership for user: ${error.message}`);
      return (data ?? [])
        .map((row) => (row.exhibitor_company_id ? String(row.exhibitor_company_id) : ""))
        .filter(Boolean);
    }
  };
}
