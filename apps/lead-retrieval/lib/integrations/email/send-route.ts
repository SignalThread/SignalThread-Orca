import "server-only";

import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { sendFollowUpEmail } from "@/lib/integrations/email/send-service";
import {
  parseEmailProviderOverride,
  type EmailSendResult
} from "@/lib/integrations/email/types";

function responseForOutcome(result: EmailSendResult) {
  if (result.ok) return NextResponse.json(result);
  const status =
    result.outcome === "invalid_input" || result.outcome === "missing_email"
      ? 400
      : result.outcome === "unauthorized"
        ? 403
        : result.outcome === "lead_not_found"
          ? 404
          : result.outcome === "missing_connection" ||
              result.outcome === "reconnect_required" ||
              result.outcome === "provider_selection_required"
            ? 409
            : result.outcome === "unknown"
              ? 202
              : 502;
  return NextResponse.json(result, { status });
}

export async function handleCanonicalEmailSend(
  request: Request,
  params: Promise<{ leadId: string }>
) {
  try {
    const session = await resolveApiSession(request);
    const userId = String(session.userId ?? "").trim();
    const companyId = String(session.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, outcome: "unauthorized" }, { status: 401 });
    }
    const leadId = String((await params).leadId ?? "").trim();
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!leadId || !payload) {
      return NextResponse.json({ ok: false, outcome: "invalid_input" }, { status: 400 });
    }
    const parsedOverride = parseEmailProviderOverride(payload.providerOverride);
    if (!parsedOverride.valid) {
      return NextResponse.json({ ok: false, outcome: "invalid_input" }, { status: 400 });
    }
    // The optional providerOverride is a one-time request. The server still
    // resolves it from scoped connection health; it never writes the default.
    const result = await sendFollowUpEmail({
      userId,
      companyId,
      role: String(session.role ?? ""),
      isBearer: /^Bearer\s/i.test(request.headers.get("authorization") ?? ""),
      activePlatformAdminCompanyId: session.activeCompanyId,
      leadId,
      idempotencyKey: String(payload.idempotencyKey ?? ""),
      subject: String(payload.subject ?? ""),
      body: String(payload.body ?? ""),
      providerOverride: parsedOverride.provider
    });
    return responseForOutcome(result);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[email/send]", {
      code: "EMAIL_SEND_FAILED",
      stage: "server",
      errorType: error instanceof Error ? error.name : "unknown"
    });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
