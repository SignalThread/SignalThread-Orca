import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignRow = {
  id: string;
  company_id: string;
};

async function getScopedCampaign(campaignId: string, companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("campaigns")
    .select("id, company_id")
    .eq("id", campaignId)
    .eq("company_id", companyId)
    .maybeSingle()) as {
    data: CampaignRow | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  return data;
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ campaignId: string; leadId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sessionUser.company_id) {
      return NextResponse.json({ error: "No company assigned" }, { status: 400 });
    }

    const { campaignId: rawCampaignId, leadId: rawLeadId } = await params;
    const campaignId = rawCampaignId.trim();
    const leadId = rawLeadId.trim();
    if (!campaignId || !leadId) {
      return NextResponse.json({ error: "Missing campaign id or lead id in route" }, { status: 400 });
    }

    const campaign = await getScopedCampaign(campaignId, sessionUser.company_id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const supabase = await createSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("campaign_recipients")
      .delete()
      .eq("campaign_id", campaign.id)
      .eq("lead_id", leadId);

    if (deleteError) {
      return NextResponse.json(
        { error: `${deleteError.message} (${deleteError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { count, error: countError } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id);

    if (countError) {
      return NextResponse.json(
        { error: `${countError.message} (${countError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ recipientCount: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
