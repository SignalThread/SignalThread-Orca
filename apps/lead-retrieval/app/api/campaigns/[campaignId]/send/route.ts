import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { executeCampaignSend } from "@/lib/campaigns/executeCampaignSend";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function canSendCampaigns(role: string | null | undefined) {
  return role === "exhibitor_admin" || role === "platform_admin";
}

export async function POST(_: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canSendCampaigns(sessionUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!sessionUser.company_id) {
      return NextResponse.json({ error: "No company assigned" }, { status: 400 });
    }

    const { campaignId: rawCampaignId } = await params;
    const campaignId = rawCampaignId.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const result = await executeCampaignSend({
      supabase: supabase as unknown as SupabaseClient,
      campaignId,
      companyId: sessionUser.company_id
    });

    if (!result.ok) {
      const statusByCode: Record<typeof result.code, number> = {
        NOT_FOUND: 404,
        ALREADY_SENT: 409,
        IN_PROGRESS: 409,
        NOTHING_TO_SEND: 400,
        UNAUTHORIZED: 403,
        BAD_STATE: 500
      };
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: statusByCode[result.code] ?? 400 }
      );
    }

    return NextResponse.json({ summary: result.summary });
  } catch (error) {
    console.error("[api/campaigns/send POST]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
