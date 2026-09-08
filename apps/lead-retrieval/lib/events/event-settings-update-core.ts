import type { AppRole } from "@/types/app";
import { isIanaTimeZone } from "@/lib/events/event-calendar";

export type EventSettingsUpdateActor = {
  userId: string;
  role: AppRole | "viewer" | null;
};

export type EventSettingsUpdateInput = {
  eventId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  timezone?: string | null;
};

export type EventSettingsUpdatePatch = {
  name: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  timezone: string;
  updated_at: string;
};

export type EventSettingsUpdateResult =
  | { ok: true; eventId: string; patch: EventSettingsUpdatePatch }
  | { ok: false; code: string; message: string };

export type EventSettingsUpdateDeps = {
  nowIso: () => string;
  assertEventAccessible: (userId: string, eventId: string) => Promise<void>;
  updateEvent: (eventId: string, patch: EventSettingsUpdatePatch) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Event settings are a management surface. Scope is checked separately by
 * `assertEventAccessible`, which is also responsible for validating a
 * platform-admin's selected company context or an organizer's event scope.
 */
const EVENT_SETTINGS_ALLOWED_ROLES = new Set(["platform_admin", "organizer_admin", "exhibitor_admin"]);

export function mayUpdateEventSettings(role: string | null | undefined): boolean {
  return EVENT_SETTINGS_ALLOWED_ROLES.has(String(role ?? "").trim());
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDate(value: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (!ISO_DATE_RE.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed };
}

export function buildEventSettingsUpdatePatch(
  input: EventSettingsUpdateInput,
  nowIso: string
): EventSettingsUpdateResult {
  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) {
    return { ok: false, code: "EVENT_SETTINGS_MISSING_EVENT", message: "Missing event." };
  }

  const name = String(input.name ?? "").trim();
  if (!name) {
    return { ok: false, code: "EVENT_SETTINGS_NAME_REQUIRED", message: "Event name is required." };
  }

  const start = normalizeOptionalDate(input.startDate);
  const end = normalizeOptionalDate(input.endDate);
  if (!start.ok || !end.ok) {
    return { ok: false, code: "EVENT_SETTINGS_INVALID_DATE", message: "Dates must use YYYY-MM-DD format." };
  }

  if (start.value && end.value && start.value > end.value) {
    return {
      ok: false,
      code: "EVENT_SETTINGS_DATE_RANGE",
      message: "End date must be on or after the start date."
    };
  }

  const timezone = String(input.timezone ?? "").trim();
  if (!isIanaTimeZone(timezone)) {
    return { ok: false, code: "EVENT_SETTINGS_INVALID_TIMEZONE", message: "A valid IANA event timezone is required." };
  }

  return {
    ok: true,
    eventId,
    patch: {
      name,
      start_date: start.value,
      end_date: end.value,
      location: normalizeOptionalText(input.location),
      timezone,
      updated_at: nowIso
    }
  };
}

export async function updateEventSettingsWithDeps(
  actor: EventSettingsUpdateActor,
  input: EventSettingsUpdateInput,
  deps: EventSettingsUpdateDeps
): Promise<EventSettingsUpdateResult> {
  const role = String(actor.role ?? "").trim();
  if (!mayUpdateEventSettings(role)) {
    return {
      ok: false,
      code: "EVENT_SETTINGS_FORBIDDEN_ROLE",
      message: "You are not allowed to update event settings."
    };
  }

  const built = buildEventSettingsUpdatePatch(input, deps.nowIso());
  if (!built.ok) return built;

  try {
    await deps.assertEventAccessible(actor.userId, built.eventId);
  } catch {
    return {
      ok: false,
      code: "EVENT_SETTINGS_ACCESS_DENIED",
      message: "You can only update settings for events you can access."
    };
  }

  const updated = await deps.updateEvent(built.eventId, built.patch);
  if (!updated.ok) {
    return {
      ok: false,
      code: "EVENT_SETTINGS_UPDATE_FAILED",
      message: updated.message
    };
  }

  return built;
}
