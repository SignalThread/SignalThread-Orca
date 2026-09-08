import { NextResponse } from "next/server";
import { authorizeLeadRetrievalInternalHealthRequest } from "@/lib/internal-health/lead-retrieval/route-auth";
import { getLeadRetrievalJobCronFreshnessHealth } from "@/lib/internal-health/lead-retrieval/job-cron-freshness";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = authorizeLeadRetrievalInternalHealthRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const supabase = createAdminClient();
    const health = await getLeadRetrievalJobCronFreshnessHealth({ supabase });
    return NextResponse.json(health);
  } catch (error) {
    console.error("[internal-health] lead retrieval job cron freshness failed", error);
    return NextResponse.json(
      { error: "Job cron freshness health check failed." },
      { status: 500 }
    );
  }
}
