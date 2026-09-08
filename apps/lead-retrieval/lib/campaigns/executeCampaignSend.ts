import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFinalCampaignStatus } from "@/lib/campaigns/campaign-send-status";
import type { SendCampaignMailResult } from "@/lib/server/email/sendCampaignMail";

type CampaignRow = {
  id: string;
  company_id: string;
  mode: "single" | "group";
  status: string;
};

type RecipientRow = { id: string; lead_id: string };
type MessageRow = {
  id: string;
  recipient_id: string;
  subject: string | null;
  body_text: string | null;
  status: string;
};
type LeadRow = { id: string; email: string | null };

export type CampaignSendItemResult = {
  leadId: string;
  messageId: string;
  email: string | null;
  ok: boolean;
  skippedNoEmail?: boolean;
  providerMessageId?: string | null;
  error?: string;
};

export type CampaignSendExecutionResult =
  | {
      ok: true;
      summary: {
        campaignId: string;
        attempted: number;
        sent: number;
        failed: number;
        skippedNoEmail: number;
        campaignStatus: "sent" | "failed";
        items: CampaignSendItemResult[];
      };
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "ALREADY_SENT" | "IN_PROGRESS" | "NOTHING_TO_SEND" | "UNAUTHORIZED" | "BAD_STATE";
      message: string;
    };

/**
 * Locks campaign (draft | scheduled | failed → sending), ensures per-recipient rows for group mode,
 * sends one SendGrid email per recipient using stored subject/body, persists provider ids / errors.
 */
export async function executeCampaignSend(params: {
  supabase: SupabaseClient;
  campaignId: string;
  companyId: string;
  sendMail?: (input: { to: string; subject: string; text: string }) => Promise<SendCampaignMailResult>;
}): Promise<CampaignSendExecutionResult> {
  const { supabase, campaignId, companyId } = params;
  const sendMail =
    params.sendMail ??
    (async (input: { to: string; subject: string; text: string }) => {
      const { sendCampaignMailViaSendGrid } = await import("@/lib/server/email/sendCampaignMail");
      return sendCampaignMailViaSendGrid(input);
    });

  const { data: lockRow, error: lockError } = (await supabase
    .from("campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId)
    .eq("company_id", companyId)
    .in("status", ["draft", "scheduled", "failed"])
    .select("id, company_id, mode, status")
    .maybeSingle()) as {
    data: CampaignRow | null;
    error: { message: string; code?: string } | null;
  };

  if (lockError) {
    return { ok: false, code: "BAD_STATE", message: lockError.message };
  }

  if (!lockRow) {
    const { data: cur } = (await supabase
      .from("campaigns")
      .select("status")
      .eq("id", campaignId)
      .eq("company_id", companyId)
      .maybeSingle()) as { data: { status: string } | null };

    if (!cur) {
      return { ok: false, code: "NOT_FOUND", message: "Campaign not found" };
    }
    if (cur.status === "sent") {
      return { ok: false, code: "ALREADY_SENT", message: "Campaign has already been sent" };
    }
    if (cur.status === "sending") {
      return { ok: false, code: "IN_PROGRESS", message: "A send is already in progress" };
    }
    return { ok: false, code: "BAD_STATE", message: "Campaign cannot be sent in its current state" };
  }

  const campaign = {
    id: lockRow.id,
    company_id: lockRow.company_id,
    mode: lockRow.mode as "single" | "group"
  };

  const { data: recipients, error: recErr } = (await supabase
    .from("campaign_recipients")
    .select("id, lead_id")
    .eq("campaign_id", campaignId)) as {
    data: RecipientRow[] | null;
    error: { message: string; code?: string } | null;
  };

  if (recErr || !recipients?.length) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
    return { ok: false, code: "NOTHING_TO_SEND", message: "No recipients on this campaign" };
  }

  const leadIds = [...new Set(recipients.map((r) => r.lead_id))];

  const { data: leads, error: leadsErr } = (await supabase
    .from("leads")
    .select("id, email")
    .in("id", leadIds)
    .eq("company_id", companyId)) as {
    data: LeadRow[] | null;
    error: { message: string; code?: string } | null;
  };

  if (leadsErr) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
    return { ok: false, code: "BAD_STATE", message: leadsErr.message };
  }

  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));

  let { data: messages, error: msgErr } = (await supabase
    .from("campaign_messages")
    .select("id, recipient_id, subject, body_text, status")
    .eq("campaign_id", campaignId)) as {
    data: MessageRow[] | null;
    error: { message: string; code?: string } | null;
  };

  if (msgErr) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
    return { ok: false, code: "BAD_STATE", message: msgErr.message };
  }

  let messageList = messages ?? [];

  /** No rows yet — hydrate from campaign draft (group or single-recipient only). */
  if (messageList.length === 0) {
    const { data: meta, error: metaErr } = (await supabase
      .from("campaigns")
      .select("draft_subject, draft_body_text, subject_line, mode")
      .eq("id", campaignId)
      .single()) as {
      data: {
        draft_subject: string | null;
        draft_body_text: string | null;
        subject_line: string | null;
        mode: string;
      } | null;
      error: { message: string; code?: string } | null;
    };

    if (metaErr || !meta) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
      return { ok: false, code: "BAD_STATE", message: metaErr?.message ?? "Campaign load failed" };
    }

    const subject = (meta.draft_subject ?? meta.subject_line ?? "").trim();
    const body = (meta.draft_body_text ?? "").trim();
    const canShareDraft = meta.mode === "group" || recipients.length === 1;

    if (!subject || !body || !canShareDraft) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
      return {
        ok: false,
        code: "NOTHING_TO_SEND",
        message:
          canShareDraft
            ? "No draft content to send"
            : "Generate per-lead drafts before sending this campaign"
      };
    }

    const rowsToUpsert = recipients.map((recipient) => ({
      campaign_id: campaignId,
      recipient_id: recipient.id,
      subject,
      body_text: body,
      status: "draft" as const
    }));

    const { error: upsertAllErr } = await supabase.from("campaign_messages").upsert(rowsToUpsert as never, {
      onConflict: "campaign_id,recipient_id"
    });
    if (upsertAllErr) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
      return { ok: false, code: "BAD_STATE", message: upsertAllErr.message };
    }

    const { data: refetched } = (await supabase
      .from("campaign_messages")
      .select("id, recipient_id, subject, body_text, status")
      .eq("campaign_id", campaignId)) as {
      data: MessageRow[] | null;
    };
    messageList = refetched ?? [];
  }

  /** Group mode historically stores one row on the primary recipient — clone content for every recipient. */
  if (campaign.mode === "group" && recipients.length > 0 && messageList.length > 0) {
    const template = messageList.reduce<MessageRow | null>((best, row) => {
      if (row.subject?.trim() && row.body_text?.trim()) {
        return row;
      }
      return best;
    }, null);

    if (template?.subject?.trim() && template.body_text?.trim()) {
      const rowsToUpsert = recipients
        .map((recipient) => {
          const exists = messageList.some((m) => m.recipient_id === recipient.id);
          if (exists) return null;
          return {
            campaign_id: campaignId,
            recipient_id: recipient.id,
            subject: template.subject,
            body_text: template.body_text,
            status: "draft" as const
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (rowsToUpsert.length > 0) {
        const { error: upsertErr } = await supabase.from("campaign_messages").upsert(rowsToUpsert as never, {
          onConflict: "campaign_id,recipient_id"
        });
        if (upsertErr) {
          await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId);
          return { ok: false, code: "BAD_STATE", message: upsertErr.message };
        }
        const refetch = (await supabase
          .from("campaign_messages")
          .select("id, recipient_id, subject, body_text, status")
          .eq("campaign_id", campaignId)) as {
          data: MessageRow[] | null;
          error: { message: string; code?: string } | null;
        };
        if (!refetch.error && refetch.data) {
          messages = refetch.data;
        }
      }
    }
  }

  const messagesByRecipient = new Map((messages ?? []).map((m) => [m.recipient_id, m]));
  const items: CampaignSendItemResult[] = [];
  let sent = 0;
  let failed = 0;
  let skippedNoEmail = 0;

  for (const recipient of recipients) {
    const lead = leadById.get(recipient.lead_id);
    const msg = messagesByRecipient.get(recipient.id);
    const email = lead?.email?.trim() || null;

    if (!msg) {
      failed += 1;
      items.push({
        leadId: recipient.lead_id,
        messageId: "",
        email,
        ok: false,
        error: "Missing campaign message row for recipient"
      });
      continue;
    }

    const subject = (msg.subject ?? "").trim();
    const body = (msg.body_text ?? "").trim();
    if (!subject || !body) {
      await supabase
        .from("campaign_messages")
        .update({ status: "failed", send_error: "Subject and body are required before send" } as never)
        .eq("id", msg.id);
      failed += 1;
      items.push({
        leadId: recipient.lead_id,
        messageId: msg.id,
        email,
        ok: false,
        error: "Empty subject or body"
      });
      continue;
    }

    if (!email) {
      skippedNoEmail += 1;
      await supabase
        .from("campaign_messages")
        .update({ status: "failed", send_error: "Lead has no email address" } as never)
        .eq("id", msg.id);
      items.push({
        leadId: recipient.lead_id,
        messageId: msg.id,
        email: null,
        ok: false,
        skippedNoEmail: true,
        error: "Lead has no email"
      });
      continue;
    }

    await supabase.from("campaign_messages").update({ status: "sending" } as never).eq("id", msg.id);

    try {
      const out = await sendMail({ to: email, subject, text: body });
      const now = new Date().toISOString();
      await supabase
        .from("campaign_messages")
        .update({
          status: "sent",
          sent_at: now,
          provider: "sendgrid",
          provider_message_id: out.providerMessageId,
          send_error: null
        } as never)
        .eq("id", msg.id);
      sent += 1;
      items.push({
        leadId: recipient.lead_id,
        messageId: msg.id,
        email,
        ok: true,
        providerMessageId: out.providerMessageId
      });
    } catch (sendErr) {
      const errText = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await supabase
        .from("campaign_messages")
        .update({ status: "failed", send_error: errText } as never)
        .eq("id", msg.id);
      failed += 1;
      items.push({
        leadId: recipient.lead_id,
        messageId: msg.id,
        email,
        ok: false,
        error: errText
      });
    }
  }

  const campaignStatus = resolveFinalCampaignStatus({ sent, failed, skippedNoEmail });
  await supabase.from("campaigns").update({ status: campaignStatus }).eq("id", campaignId);

  return {
    ok: true,
    summary: {
      campaignId,
      attempted: recipients.length,
      sent,
      failed,
      skippedNoEmail,
      campaignStatus,
      items
    }
  };
}
