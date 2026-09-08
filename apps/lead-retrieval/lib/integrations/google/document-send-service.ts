import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { sendFollowUpEmail } from "@/lib/integrations/email/send-service";
import type { EmailActivity } from "@/lib/integrations/email/types";

type DocumentSendOutcome =
  | "sent"
  | "duplicate"
  | "unknown"
  | "failed"
  | "invalid_input"
  | "document_not_found"
  | "lead_not_found"
  | "missing_email"
  | "unauthorized"
  | "missing_connection"
  | "reconnect_required"
  | "provider_selection_required";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function sendDocumentWithGoogle(input: {
  userId: string;
  companyId: string;
  role: string;
  isBearer: boolean;
  activePlatformAdminCompanyId?: string | null;
  leadId: string;
  documentId: string;
  idempotencyKey: string;
  subject: string;
  body: string;
  browserOrigin: string;
}): Promise<{
  ok: boolean;
  outcome: DocumentSendOutcome;
  sendId?: string;
  trackedUrl?: string;
  activity?: EmailActivity;
}> {
  if (!isUuid(input.idempotencyKey) || !input.leadId || !input.documentId) {
    return { ok: false, outcome: "invalid_input" };
  }

  const supabase = createAdminClient();
  const [{ data: lead, error: leadError }, { data: document, error: documentError }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, company_id, event_id, email")
      .eq("id", input.leadId)
      .eq("company_id", input.companyId)
      .maybeSingle(),
    (supabase as any)
      .from("documents")
      .select("id, account_id, title, type, rep_sendable, is_archived, sent_count")
      .eq("id", input.documentId)
      .eq("account_id", input.companyId)
      .eq("is_archived", false)
      .maybeSingle()
  ]);
  if (leadError || !lead) return { ok: false, outcome: "lead_not_found" };
  if (documentError || !document || !document.rep_sendable) {
    return { ok: false, outcome: "document_not_found" };
  }
  if (!(await canMutateExhibitorLeadsInContext({
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    isBearer: input.isBearer,
    activePlatformAdminCompanyId: input.activePlatformAdminCompanyId,
    leadEventId: lead.event_id,
    denyExhibitorViewer: true
  }))) {
    return { ok: false, outcome: "unauthorized" };
  }
  const recipientEmail = String(lead.email ?? "").trim().toLowerCase();
  if (!recipientEmail) return { ok: false, outcome: "missing_email" };

  const sendId = input.idempotencyKey;
  const trackedUrl = `${input.browserOrigin.replace(/\/$/, "")}/api/exhibitor/documents/sends/${sendId}/click`;
  const shareBlock = [
    `Resource: ${String(document.title ?? "Document").trim() || "Document"}`,
    `Type: ${String(document.type ?? "Resource").trim() || "Resource"}`,
    `Open item: ${trackedUrl}`
  ].join("\n");
  const messageBody = `${String(input.body ?? "").trim()}\n\n${shareBlock}`.trim();

  const { data: claimed, error: claimError } = await (supabase as any)
    .from("document_sends")
    .insert({
      id: sendId,
      document_id: document.id,
      lead_id: lead.id,
      recipient_email: recipientEmail,
      sent_by: input.userId,
      provider_message_id: null
    })
    .select("id")
    .maybeSingle();
  if (claimError && claimError.code !== "23505") {
    throw new Error("Unable to reserve the document send.");
  }
  if (!claimed) {
    const { data: existing } = await (supabase as any)
      .from("document_sends")
      .select("id")
      .eq("id", sendId)
      .eq("document_id", document.id)
      .eq("lead_id", lead.id)
      .eq("sent_by", input.userId)
      .maybeSingle();
    if (!existing) throw new Error("Unable to resolve the duplicate document send.");
  }

  const result = await sendFollowUpEmail({
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    isBearer: input.isBearer,
    leadId: lead.id,
    documentId: document.id,
    idempotencyKey: input.idempotencyKey,
    subject: input.subject,
    body: messageBody
  });

  const providerMessageId = result.activity?.providerMessageId ?? null;
  if (providerMessageId) {
    await (supabase as any)
      .from("document_sends")
      .update({ provider_message_id: providerMessageId })
      .eq("id", sendId)
      .eq("document_id", document.id)
      .eq("lead_id", lead.id);
  }
  if (claimed && (result.ok || providerMessageId)) {
    await (supabase as any)
      .from("documents")
      .update({ sent_count: Number(document.sent_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("account_id", input.companyId);
  }

  return {
    ok: result.ok,
    outcome: result.outcome,
    sendId,
    trackedUrl,
    ...(result.activity ? { activity: result.activity } : {})
  };
}
