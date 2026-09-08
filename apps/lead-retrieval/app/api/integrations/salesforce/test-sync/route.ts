import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { syncLeadToSalesforce } from "@/lib/integrations/salesforce/syncLeadToSalesforce";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (sessionUser.role !== "platform_admin" && sessionUser.role !== "exhibitor_admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const accountId = String(sessionUser.company_id ?? "").trim();
  if (!accountId) {
    return NextResponse.json({ success: false, error: "Missing account scope." }, { status: 400 });
  }

  const payload = (await request.json().catch(() => ({}))) as { leadId?: string };
  const leadId = String(payload.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ success: false, error: "leadId is required." }, { status: 400 });
  }

  const result = await syncLeadToSalesforce({ accountId, leadId });
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Salesforce sync failed." },
      { status: result.status ?? 500 }
    );
  }

  return NextResponse.json({
    success: true,
    action: result.action,
    salesforceLeadId: result.salesforceLeadId ?? null,
  });
}
