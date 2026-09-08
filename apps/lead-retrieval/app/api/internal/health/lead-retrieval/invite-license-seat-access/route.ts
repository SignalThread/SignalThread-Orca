import { NextResponse } from "next/server";
import { authorizeLeadRetrievalInternalHealthRequest } from "@/lib/internal-health/lead-retrieval/route-auth";
import { getLeadRetrievalInviteLicenseSeatAccessHealth } from "@/lib/internal-health/lead-retrieval/invite-license-seat-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = authorizeLeadRetrievalInternalHealthRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const supabase = createAdminClient();
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase });
    return NextResponse.json(health);
  } catch (error) {
    console.error("[internal-health] lead retrieval invite license seat access failed", error);
    return NextResponse.json(
      { error: "Invite license seat access health check failed." },
      { status: 500 }
    );
  }
}
