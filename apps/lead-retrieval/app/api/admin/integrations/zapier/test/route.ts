import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendZapierWebhook } from "@/lib/integrations/zapier";

const REDIRECT_BASE = "/admin/integrations/zapier";

function redirectTo(request: Request, params: Record<string, string>) {
  const url = new URL(REDIRECT_BASE, request.url);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

function eventNameForPayloadType(payloadType: string | null | undefined) {
  const normalized = String(payloadType ?? "").trim();
  if (normalized === "lead_updated") return "lead.updated";
  if (normalized === "lead_scored") return "lead.scored";
  if (normalized === "conversation_completed") return "conversation.completed";
  return "lead.created";
}

function firstTriggerEvent(triggerEvents: string[] | null | undefined) {
  const first = Array.isArray(triggerEvents) ? String(triggerEvents[0] ?? "").trim() : "";
  return first || null;
}

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (sessionUser.role !== "platform_admin" && sessionUser.role !== "exhibitor_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return redirectTo(request, { error: "missing_account" });
  }

  const supabase = createAdminClient();
  const { data: companyRow, error: companyError } = await (supabase as any)
    .from("companies")
    .select("zapier_webhook_url, zapier_payload_type, zapier_trigger_events")
    .eq("id", sessionUser.company_id)
    .maybeSingle();

  if (companyError) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, { error: "test_failed", reason: companyError.message ?? "Company lookup failed" });
    }
    return redirectTo(request, { error: "test_failed" });
  }

  const webhookUrl = String(companyRow?.zapier_webhook_url ?? "").trim();
  if (!webhookUrl) {
    return redirectTo(request, { error: "missing_webhook" });
  }

  const samplePayload = {
    event: eventNameForPayloadType(
      firstTriggerEvent(companyRow?.zapier_trigger_events) ?? companyRow?.zapier_payload_type
    ),
    account_id: sessionUser.company_id,
    timestamp: new Date().toISOString(),
    lead: {
      id: "test_lead",
      name: "John Smith",
      email: "john@example.com",
      company: "Acme Corp",
      rating: "A",
      priority_score: 85,
      follow_up_date: "2026-03-12"
    }
  };

  const result = await sendZapierWebhook(sessionUser.company_id, samplePayload);

  if (!result.ok) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, {
        error: "test_failed",
        reason: String(result.reason ?? "Webhook request failed")
      });
    }
    return redirectTo(request, { error: "test_failed" });
  }

  return redirectTo(request, { tested: "1" });
}
