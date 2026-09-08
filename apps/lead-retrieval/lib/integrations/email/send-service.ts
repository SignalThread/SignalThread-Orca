import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { resolveEmailProviderForUser } from "@/lib/integrations/email/provider-preference";
import { sendWithSelectedEmailProvider } from "@/lib/integrations/email/provider-adapters";
import {
  sendEmailWithDependencies,
  type SendEmailInput
} from "@/lib/integrations/email/send-core";
import type {
  EmailActivity,
  EmailActivityStatus,
  EmailProvider,
  EmailSafeErrorCategory
} from "@/lib/integrations/email/types";

type ActivityRow = {
  id: string;
  company_id: string;
  event_id: string | null;
  lead_id: string;
  document_id: string | null;
  provider: EmailProvider;
  google_connection_id: string | null;
  microsoft_connection_id: string | null;
  acting_user_id: string | null;
  recipient_email: string;
  idempotency_key: string;
  provider_message_id: string | null;
  provider_thread_id: string | null;
  status: EmailActivityStatus;
  safe_error_category: EmailSafeErrorCategory | null;
  provider_http_status: number | null;
  retry_after_seconds: number | null;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
};

const ACTIVITY_COLUMNS = [
  "id",
  "company_id",
  "event_id",
  "lead_id",
  "document_id",
  "provider",
  "google_connection_id",
  "microsoft_connection_id",
  "acting_user_id",
  "recipient_email",
  "idempotency_key",
  "provider_message_id",
  "provider_thread_id",
  "status",
  "safe_error_category",
  "provider_http_status",
  "retry_after_seconds",
  "created_at",
  "sent_at",
  "failed_at"
].join(", ");

function toActivity(row: ActivityRow): EmailActivity {
  return {
    id: row.id,
    companyId: row.company_id,
    eventId: row.event_id,
    leadId: row.lead_id,
    documentId: row.document_id,
    provider: row.provider,
    providerConnectionId:
      row.provider === "google_workspace" ? row.google_connection_id : row.microsoft_connection_id,
    actingUserId: row.acting_user_id,
    recipientEmail: row.recipient_email,
    idempotencyKey: row.idempotency_key,
    providerMessageId: row.provider_message_id,
    providerThreadId: row.provider_thread_id,
    status: row.status,
    safeErrorCategory: row.safe_error_category,
    providerHttpStatus: row.provider_http_status,
    retryAfterSeconds: row.retry_after_seconds,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at
  };
}

export async function sendFollowUpEmail(input: SendEmailInput & {
  role: string;
  isBearer: boolean;
  activePlatformAdminCompanyId?: string | null;
}) {
  const supabase = createAdminClient() as any;
  return sendEmailWithDependencies(
    {
      loadLead: async (leadId, companyId) => {
        const { data, error } = await supabase
          .from("leads")
          .select("id, company_id, event_id, email")
          .eq("id", leadId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (error) throw new Error("Unable to load the scoped lead.");
        return data
          ? { id: data.id, companyId: data.company_id, eventId: data.event_id, email: data.email }
          : null;
      },
      canWriteLead: (lead) =>
        canMutateExhibitorLeadsInContext({
          userId: input.userId,
          companyId: input.companyId,
          role: input.role,
          isBearer: input.isBearer,
          leadEventId: lead.eventId,
          denyExhibitorViewer: true,
          activePlatformAdminCompanyId: input.activePlatformAdminCompanyId
        }),
      resolveProvider: (userId, companyId, providerOverride) =>
        resolveEmailProviderForUser({ userId, companyId, providerOverride, supabase }),
      claimActivity: async (claim) => {
        const { data, error } = await supabase
          .from("email_activities")
          .insert({
            company_id: claim.companyId,
            event_id: claim.eventId,
            lead_id: claim.leadId,
            document_id: claim.documentId,
            provider: claim.provider,
            google_connection_id:
              claim.provider === "google_workspace" ? claim.providerConnectionId : null,
            microsoft_connection_id:
              claim.provider === "microsoft_365" ? claim.providerConnectionId : null,
            acting_user_id: claim.actingUserId,
            recipient_email: claim.recipientEmail,
            idempotency_key: claim.idempotencyKey,
            status: "pending"
          })
          .select(ACTIVITY_COLUMNS)
          .single();
        if (!error && data) return { claimed: true as const, activity: toActivity(data) };
        if (error?.code !== "23505") throw new Error("Unable to reserve the email send.");
        const { data: existing, error: existingError } = await supabase
          .from("email_activities")
          .select(ACTIVITY_COLUMNS)
          .eq("idempotency_key", claim.idempotencyKey)
          .eq("company_id", claim.companyId)
          .eq("lead_id", claim.leadId)
          .eq("acting_user_id", claim.actingUserId)
          .maybeSingle();
        if (existingError || !existing) throw new Error("Unable to resolve the duplicate email send.");
        return { claimed: false as const, activity: toActivity(existing) };
      },
      reclaimFailedActivity: async (activityId) => {
        const { data, error } = await supabase
          .from("email_activities")
          .update({
            status: "pending",
            safe_error_category: null,
            provider_http_status: null,
            retry_after_seconds: null,
            failed_at: null
          })
          .eq("id", activityId)
          .eq("company_id", input.companyId)
          .eq("lead_id", input.leadId)
          .eq("acting_user_id", input.userId)
          .eq("status", "failed")
          .select(ACTIVITY_COLUMNS)
          .maybeSingle();
        if (error) throw new Error("Unable to retry the failed email send.");
        return data ? toActivity(data) : null;
      },
      sendMessage: sendWithSelectedEmailProvider,
      updateActivity: async (update) => {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("email_activities")
          .update({
            status: update.status,
            safe_error_category: update.safeErrorCategory,
            provider_message_id: update.providerMessageId ?? null,
            provider_thread_id: update.providerThreadId ?? null,
            provider_http_status: update.providerHttpStatus ?? null,
            retry_after_seconds: update.retryAfterSeconds ?? null,
            sent_at: update.status === "sent" ? now : null,
            failed_at: update.status === "failed" || update.status === "unknown" ? now : null
          })
          .eq("id", update.activityId)
          .eq("company_id", input.companyId)
          .eq("lead_id", input.leadId)
          .select(ACTIVITY_COLUMNS)
          .maybeSingle();
        if (error) throw new Error("Unable to persist email activity status.");
        return data ? toActivity(data) : null;
      }
    },
    input
  );
}

export async function listEmailActivitiesForLead(input: {
  companyId: string;
  leadId: string;
  limit?: number;
}) {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("email_activities")
    .select(ACTIVITY_COLUMNS)
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 10, 1), 50));
  if (error) throw new Error("Unable to load email activity.");
  return ((data ?? []) as ActivityRow[]).map(toActivity);
}
