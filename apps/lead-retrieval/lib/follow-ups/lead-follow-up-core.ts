import { createHash } from "node:crypto";
import { isIanaTimeZone } from "@/lib/integrations/google/calendar-core";

export type FollowUpAction = "save" | "complete" | "clear";
export type FollowUpProvider = "google_workspace";

export type FollowUpCommand = {
  action: FollowUpAction;
  idempotencyKey: string;
  followUpAt?: string;
  timezone?: string;
  note?: string | null;
  reminder?: { enabled: boolean; provider?: FollowUpProvider };
};

export type NormalizedFollowUpCommand = {
  action: FollowUpAction;
  idempotencyKey: string;
  followUpAt: string | null;
  followUpDate: string | null;
  timezone: string | null;
  note: string | null;
  reminderEnabled: boolean | null;
  reminderProvider: FollowUpProvider;
  fingerprint: string;
};

export type FollowUpCalendarResult = {
  provider: FollowUpProvider | null;
  requested: boolean;
  status: "not_requested" | "synced" | "deleted" | "failed";
  operation: "create" | "update" | "delete" | null;
  errorCategory: string | null;
};

export type FollowUpResult = {
  ok: true;
  outcome: "saved" | "completed" | "cleared" | "duplicate";
  partialSuccess: boolean;
  followUp: {
    at: string | null;
    date: string | null;
    note: string | null;
    completedAt: string | null;
    hasCalendarReminder: boolean;
  };
  calendar: FollowUpCalendarResult;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function dateInTimeZone(instant: string | Date, timeZone: string) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime()) || !isIanaTimeZone(timeZone)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const ymd = `${value("year")}-${value("month")}-${value("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export function normalizeFollowUpCommand(command: FollowUpCommand):
  | { ok: true; value: NormalizedFollowUpCommand }
  | { ok: false; error: string } {
  if (!isUuid(command.idempotencyKey)) {
    return { ok: false, error: "idempotencyKey must be a UUID." };
  }
  if (command.action !== "save" && command.action !== "complete" && command.action !== "clear") {
    return { ok: false, error: "Unsupported follow-up action." };
  }

  let followUpAt: string | null = null;
  let followUpDate: string | null = null;
  let timezone: string | null = null;
  let note: string | null = null;
  let reminderEnabled: boolean | null = null;
  const reminderProvider: FollowUpProvider = "google_workspace";

  if (command.action === "save") {
    const parsed = new Date(String(command.followUpAt ?? ""));
    timezone = String(command.timezone ?? "").trim();
    if (!Number.isFinite(parsed.getTime())) {
      return { ok: false, error: "followUpAt must be a valid RFC3339 timestamp." };
    }
    if (!isIanaTimeZone(timezone)) {
      return { ok: false, error: "timezone must be a valid IANA timezone." };
    }
    followUpAt = parsed.toISOString();
    followUpDate = dateInTimeZone(parsed, timezone);
    if (!followUpDate) return { ok: false, error: "Unable to derive follow-up date." };
    note = String(command.note ?? "").trim() || null;
    if (note && note.length > 2_000) {
      return { ok: false, error: "note must be 2,000 characters or fewer." };
    }
    if (command.reminder !== undefined) {
      if (typeof command.reminder.enabled !== "boolean") {
        return { ok: false, error: "reminder.enabled must be a boolean." };
      }
      if (command.reminder.provider && command.reminder.provider !== reminderProvider) {
        return { ok: false, error: "Unsupported reminder provider." };
      }
      reminderEnabled = command.reminder.enabled;
    }
  }

  const canonical = {
    action: command.action,
    idempotencyKey: command.idempotencyKey.toLowerCase(),
    followUpAt,
    followUpDate,
    timezone,
    note,
    reminderEnabled,
    reminderProvider
  };
  return {
    ok: true,
    value: {
      ...canonical,
      fingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
    }
  };
}

export function deterministicFollowUpReminderId(input: {
  companyId: string;
  leadId: string;
  userId: string;
}) {
  return `lrf${createHash("sha256")
    .update(`${input.companyId}:${input.leadId}:${input.userId}`)
    .digest("hex")}`;
}

