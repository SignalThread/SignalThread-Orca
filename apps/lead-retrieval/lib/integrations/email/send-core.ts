import type {
  EmailActivity,
  EmailActivityStatus,
  EmailLead,
  EmailProviderConnection,
  EmailProviderResolution,
  EmailProviderSendResult,
  EmailSafeErrorCategory,
  EmailSendResult
} from "@/lib/integrations/email/types";

export type EmailSendDependencies = {
  loadLead: (leadId: string, companyId: string) => Promise<EmailLead | null>;
  canWriteLead: (lead: EmailLead) => Promise<boolean>;
  resolveProvider: (
    userId: string,
    companyId: string,
    providerOverride?: EmailProviderConnection["provider"]
  ) => Promise<EmailProviderResolution>;
  claimActivity: (input: {
    companyId: string;
    eventId: string | null;
    leadId: string;
    documentId: string | null;
    provider: EmailProviderConnection["provider"];
    providerConnectionId: string;
    actingUserId: string;
    recipientEmail: string;
    idempotencyKey: string;
  }) => Promise<{ claimed: true; activity: EmailActivity } | { claimed: false; activity: EmailActivity }>;
  reclaimFailedActivity: (activityId: string) => Promise<EmailActivity | null>;
  sendMessage: (input: {
    connection: EmailProviderConnection;
    userId: string;
    companyId: string;
    recipientEmail: string;
    subject: string;
    body: string;
  }) => Promise<EmailProviderSendResult>;
  updateActivity: (input: {
    activityId: string;
    status: Exclude<EmailActivityStatus, "pending">;
    safeErrorCategory: EmailSafeErrorCategory | null;
    providerMessageId?: string | null;
    providerThreadId?: string | null;
    providerHttpStatus?: number | null;
    retryAfterSeconds?: number | null;
  }) => Promise<EmailActivity | null>;
};

export type SendEmailInput = {
  userId: string;
  companyId: string;
  leadId: string;
  idempotencyKey: string;
  subject: string;
  body: string;
  documentId?: string | null;
  /** One-time sender choice. It never persists a default provider preference. */
  providerOverride?: EmailProviderConnection["provider"];
};

export function normalizeEmailMessage(subjectValue: string, bodyValue: string) {
  const subject = String(subjectValue ?? "").trim();
  const body = String(bodyValue ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) return null;
  if (!body || body.length > 20_000) return null;
  return { subject, body };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value: string) {
  return /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
}

async function safelyUpdateActivity(
  dependencies: EmailSendDependencies,
  input: Parameters<EmailSendDependencies["updateActivity"]>[0]
) {
  try {
    return await dependencies.updateActivity(input);
  } catch {
    return null;
  }
}

function success(outcome: "sent" | "duplicate", activity: EmailActivity): EmailSendResult {
  return {
    ok: true,
    outcome,
    status: "sent",
    provider: activity.provider,
    providerMessageId: activity.providerMessageId,
    providerThreadId: activity.providerThreadId,
    activityId: activity.id,
    activity
  };
}

export async function sendEmailWithDependencies(
  dependencies: EmailSendDependencies,
  input: SendEmailInput
): Promise<EmailSendResult> {
  const message = normalizeEmailMessage(input.subject, input.body);
  if (!message || !isUuid(input.idempotencyKey)) {
    return { ok: false, outcome: "invalid_input" };
  }

  const lead = await dependencies.loadLead(input.leadId, input.companyId);
  if (!lead) return { ok: false, outcome: "lead_not_found" };
  if (!(await dependencies.canWriteLead(lead))) return { ok: false, outcome: "unauthorized" };

  const recipientEmail = String(lead.email ?? "").trim();
  if (!recipientEmail) return { ok: false, outcome: "missing_email" };
  if (!isEmail(recipientEmail)) return { ok: false, outcome: "invalid_input" };

  const resolution = await dependencies.resolveProvider(
    input.userId,
    input.companyId,
    input.providerOverride
  );
  if (!resolution.ok) return { ok: false, outcome: resolution.outcome };
  const connection = resolution.connection;

  const claim = await dependencies.claimActivity({
    companyId: input.companyId,
    eventId: lead.eventId,
    leadId: lead.id,
    documentId: input.documentId ?? null,
    provider: connection.provider,
    providerConnectionId: connection.id,
    actingUserId: input.userId,
    recipientEmail,
    idempotencyKey: input.idempotencyKey
  });
  let activeActivity = claim.activity;
  if (!claim.claimed) {
    if (claim.activity.status === "sent") return success("duplicate", claim.activity);
    if (claim.activity.status !== "failed") {
      return {
        ok: false,
        outcome: "unknown",
        provider: claim.activity.provider,
        activity: claim.activity
      };
    }
    // An idempotency claim remains bound to its original provider. Do not
    // mutate a failed claim to pending if the user's preference changed.
    if (claim.activity.provider !== connection.provider) {
      return {
        ok: false,
        outcome: "unknown",
        provider: claim.activity.provider,
        activity: claim.activity
      };
    }
    const reclaimed = await dependencies.reclaimFailedActivity(claim.activity.id);
    if (!reclaimed) {
      return {
        ok: false,
        outcome: "unknown",
        provider: claim.activity.provider,
        activity: claim.activity
      };
    }
    if (reclaimed.provider !== connection.provider) {
      return { ok: false, outcome: "unknown", provider: reclaimed.provider, activity: reclaimed };
    }
    activeActivity = reclaimed;
  }

  let providerResult: EmailProviderSendResult;
  try {
    providerResult = await dependencies.sendMessage({
      connection,
      userId: input.userId,
      companyId: input.companyId,
      recipientEmail,
      subject: message.subject,
      body: message.body
    });
  } catch {
    providerResult = {
      ok: false,
      outcome: "unknown",
      category: "unknown_outcome",
      status: null
    };
  }

  if (!providerResult.ok) {
    const activity = await safelyUpdateActivity(dependencies, {
      activityId: activeActivity.id,
      status: providerResult.outcome,
      safeErrorCategory: providerResult.category,
      providerHttpStatus: providerResult.status,
      retryAfterSeconds: providerResult.retryAfterSeconds ?? null
    });
    return {
      ok: false,
      outcome: providerResult.reconnectRequired ? "reconnect_required" : providerResult.outcome,
      provider: connection.provider,
      ...(activity ? { activity } : {})
    };
  }

  const sent = await safelyUpdateActivity(dependencies, {
    activityId: activeActivity.id,
    status: "sent",
    safeErrorCategory: null,
    providerMessageId: providerResult.providerMessageId,
    providerThreadId: providerResult.providerThreadId,
    providerHttpStatus: providerResult.status,
    retryAfterSeconds: null
  });
  if (sent) return success("sent", sent);

  const unknown = await safelyUpdateActivity(dependencies, {
    activityId: activeActivity.id,
    status: "unknown",
    safeErrorCategory: "persistence_failure",
    providerMessageId: providerResult.providerMessageId,
    providerThreadId: providerResult.providerThreadId,
    providerHttpStatus: providerResult.status,
    retryAfterSeconds: null
  });
  return {
    ok: false,
    outcome: "unknown",
    provider: connection.provider,
    ...(unknown ? { activity: unknown } : {})
  };
}
