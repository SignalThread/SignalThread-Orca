import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_BASE = "/admin/integrations/zapier";
const VALID_TRIGGER_EVENTS = new Set([
  "lead_created",
  "lead_updated",
  "lead_scored",
  "conversation_completed"
]);
const VALID_PAYLOAD_FIELDS = new Set([
  "full_name",
  "job_title",
  "company_text",
  "email",
  "phone",
  "rating",
  "priority_score",
  "follow_up_date",
  "notes",
  "ai_summary",
  "transcript",
  "event_name",
  "owner_name"
]);

function redirectTo(request: Request, params: Record<string, string>) {
  const url = new URL(REDIRECT_BASE, request.url);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

  const formData = await request.formData();
  const webhookUrlRaw = String(formData.get("webhookUrl") ?? "").trim();
  const triggerEventsRaw = formData.getAll("triggerEvents").map((value) => String(value).trim());
  const payloadFieldsRaw = formData.getAll("payloadFields").map((value) => String(value).trim());
  const triggerEvents = Array.from(new Set(triggerEventsRaw)).filter(Boolean);
  const payloadFields = Array.from(new Set(payloadFieldsRaw)).filter(Boolean);

  if (!webhookUrlRaw || !isValidHttpUrl(webhookUrlRaw)) {
    return redirectTo(request, { error: "invalid_webhook_url" });
  }
  if (!triggerEvents.length || !triggerEvents.every((value) => VALID_TRIGGER_EVENTS.has(value))) {
    return redirectTo(request, { error: "invalid_trigger_events" });
  }
  if (!payloadFields.length || !payloadFields.every((value) => VALID_PAYLOAD_FIELDS.has(value))) {
    return redirectTo(request, { error: "invalid_payload_fields" });
  }

  const supabase = createAdminClient();
  const { error } = await (supabase as any)
    .from("companies")
    .update({
      zapier_webhook_url: webhookUrlRaw || null,
      zapier_payload_type: triggerEvents[0],
      zapier_trigger_events: triggerEvents,
      zapier_payload_fields: payloadFields
    })
    .eq("id", sessionUser.company_id);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, { error: "save_failed", reason: error.message ?? "Unknown DB error" });
    }
    return redirectTo(request, { error: "save_failed" });
  }

  return redirectTo(request, { saved: "1" });
}
