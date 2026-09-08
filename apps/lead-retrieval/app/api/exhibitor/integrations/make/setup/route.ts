import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import {
  areValidOutboundTriggerEvents,
  isValidOutboundPayloadTemplate,
  setupIntegration,
} from "@/lib/integrations/outbound-webhook-config";

const REDIRECT_BASE = "/exhibitor/integrations/make";

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

  if (!isCompanyAccountAdminSession(sessionUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return redirectTo(request, { error: "missing_account" });
  }

  const formData = await request.formData();
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  const payloadTemplate = String(formData.get("payloadTemplate") ?? "").trim();
  const triggerEventsRaw = formData.getAll("triggerEvents").map((value) => String(value).trim());
  const triggerEvents = Array.from(new Set(triggerEventsRaw)).filter(Boolean);
  const isEnabled = formData.get("isEnabled") === "on";

  if (!webhookUrl || !isValidHttpUrl(webhookUrl)) {
    return redirectTo(request, { error: "invalid_webhook_url" });
  }

  if (!isValidOutboundPayloadTemplate(payloadTemplate)) {
    return redirectTo(request, { error: "invalid_payload_template" });
  }

  if (!areValidOutboundTriggerEvents(triggerEvents)) {
    return redirectTo(request, { error: "invalid_trigger_events" });
  }

  const { error } = await setupIntegration({
    accountId: sessionUser.company_id,
    provider: "make",
    webhookUrl,
    payloadTemplate,
    triggerEvents,
    isEnabled,
  });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, { error: "save_failed", reason: error.message ?? "Unknown DB error" });
    }
    return redirectTo(request, { error: "save_failed" });
  }

  return redirectTo(request, { saved: "1" });
}
