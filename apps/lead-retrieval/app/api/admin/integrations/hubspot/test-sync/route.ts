import { NextResponse } from "next/server";
import { syncLeadToHubSpot } from "@/lib/integrations/hubspot/syncLeadToHubSpot";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { leadId?: string };
    const leadId = String(payload.leadId ?? "").trim();

    if (!leadId) {
      return NextResponse.json({ success: false, error: "leadId is required" }, { status: 400 });
    }

    const result = await syncLeadToHubSpot(leadId);

    if (result.success) {
      return NextResponse.json({ success: true, hubspotId: result.hubspotId ?? null });
    }

    return NextResponse.json({ success: false, error: "HubSpot sync failed" }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[admin/hubspot/test-sync]", {
      error: message,
    });

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
