export const EMAIL_SEND_CAPABILITY = "email_send" as const;
export const EMAIL_PROVIDERS = ["google_workspace", "microsoft_365"] as const;

export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
export type EmailActivityStatus = "pending" | "sent" | "failed" | "unknown";
export type EmailSafeErrorCategory =
  | "reconnect_required"
  | "provider_rejected"
  | "provider_unauthorized"
  | "provider_permission_denied"
  | "provider_throttled"
  | "provider_unavailable"
  | "persistence_failure"
  | "unknown_outcome";

export type EmailActivity = {
  id: string;
  companyId: string;
  eventId: string | null;
  leadId: string;
  documentId: string | null;
  provider: EmailProvider;
  providerConnectionId: string | null;
  actingUserId: string | null;
  recipientEmail: string;
  idempotencyKey: string;
  providerMessageId: string | null;
  providerThreadId: string | null;
  status: EmailActivityStatus;
  safeErrorCategory: EmailSafeErrorCategory | null;
  providerHttpStatus: number | null;
  retryAfterSeconds: number | null;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
};

export type EmailLead = {
  id: string;
  companyId: string;
  eventId: string | null;
  email: string | null;
};

export type EmailProviderConnection = {
  id: string;
  provider: EmailProvider;
  senderEmail: string;
  senderName: string | null;
};

/** Non-sensitive sender information suitable for client status responses. */
export type EligibleEmailSender = {
  provider: EmailProvider;
  accountEmail: string;
  isDefault: boolean;
};

export type EmailProviderSendResult =
  | {
      ok: true;
      providerMessageId: string | null;
      providerThreadId: string | null;
      status: number;
    }
  | {
      ok: false;
      outcome: "failed" | "unknown";
      category: Exclude<EmailSafeErrorCategory, "persistence_failure">;
      status: number | null;
      retryAfterSeconds?: number | null;
      reconnectRequired?: boolean;
    };

export type EmailProviderResolution =
  | {
      ok: true;
      connection: EmailProviderConnection;
      source: "only_healthy" | "preference" | "override";
    }
  | {
      ok: false;
      outcome: "missing_connection" | "reconnect_required" | "provider_selection_required";
    };

export type EmailSendResult =
  | {
      ok: true;
      outcome: "sent" | "duplicate";
      status: "sent";
      provider: EmailProvider;
      providerMessageId: string | null;
      providerThreadId: string | null;
      activityId: string;
      activity: EmailActivity;
    }
  | {
      ok: false;
      outcome:
        | "unauthorized"
        | "lead_not_found"
        | "missing_email"
        | "invalid_input"
        | "missing_connection"
        | "reconnect_required"
        | "provider_selection_required"
        | "failed"
        | "unknown";
      provider?: EmailProvider;
      activity?: EmailActivity;
    };

export function isEmailProvider(value: unknown): value is EmailProvider {
  return typeof value === "string" && (EMAIL_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Keep the optional send override explicit: absence means normal resolution,
 * while every supplied value must be one of the supported provider ids.
 */
export function parseEmailProviderOverride(
  value: unknown
): { valid: true; provider?: EmailProvider } | { valid: false } {
  if (typeof value === "undefined") return { valid: true };
  return isEmailProvider(value) ? { valid: true, provider: value } : { valid: false };
}
