import { handleExhibitorLeadBriefingGet } from "@/lib/server/leads/exhibitorLeadBriefingGetHandler";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadFields } from "@/lib/import-wizard/build-briefing-detail";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type LeadBriefingRow = {
  id: string;
  content: Json;
  approval_status: string | null;
  updated_at: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  return handleExhibitorLeadBriefingGet(
    request,
    await params,
    {
      resolveApiSession,
      fetchLeadForCompany: async (leadId: string, companyId: string) => {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any)
          .from("leads")
          .select(
            "id, full_name, email, job_title, company_text, enriched_job_title, enriched_company_size, enriched_industry, enriched_linkedin_url, enriched_company_domain, enriched_seniority"
          )
          .eq("id", leadId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (error) {
          return { lead: null, error: error.message ?? "Failed to load lead." };
        }

        return {
          lead: data ?? null,
          error: null,
        };
      },
      fetchLeadBriefingForLead: async (leadId: string, companyId: string) => {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any)
          .from("lead_briefings")
          .select("id, content, approval_status, updated_at")
          .eq("lead_id", leadId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (error) {
          return { briefing: null, error: error.message ?? "Failed to load lead briefing." };
        }

        return {
          briefing: data ?? null,
          error: null,
        };
      },
    }
  );
}
