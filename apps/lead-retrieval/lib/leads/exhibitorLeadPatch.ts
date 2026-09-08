import { parseIntentSignalsFromPatch } from "@/lib/leads/canonical-lead-fields";
import { legacyPriorityScoreToLeadTemperature, parseLeadTemperature } from "@/lib/leads/temperature";

export type LeadStatus = "new" | "follow_up" | "closed";

function isSimpleValidEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) return false;
  const dot = value.indexOf(".", at + 2);
  return dot > at + 1 && dot < value.length - 1;
}

function isLeadStatus(value: string): value is LeadStatus {
  return value === "new" || value === "follow_up" || value === "closed";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeExhibitorLeadPatch(payload: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  if ("full_name" in payload) {
    const fullName = String(payload.full_name ?? "").trim();
    if (!fullName) {
      return { patch: null as Record<string, unknown> | null, error: "full_name must not be empty." };
    }
    patch.full_name = fullName;
  }

  if ("email" in payload) {
    const raw = payload.email;
    const email = raw === null ? null : String(raw ?? "").trim();
    if (email && !isSimpleValidEmail(email)) {
      return { patch: null as Record<string, unknown> | null, error: "Invalid email format." };
    }
    patch.email = email || null;
  }

  if ("phone" in payload) {
    const raw = payload.phone;
    patch.phone = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("job_title" in payload) {
    const raw = payload.job_title;
    patch.job_title = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("temperature" in payload) {
    if (payload.temperature === null) {
      patch.temperature = null;
    } else {
      const parsed = parseLeadTemperature(payload.temperature);
      if (!parsed) {
        return {
          patch: null as Record<string, unknown> | null,
          error: "temperature must be one of: hot, warm, cold."
        };
      }
      patch.temperature = parsed;
    }
  } else if ("priority_score" in payload) {
    // Legacy compatibility path: old clients may still send numeric priority.
    // Canonical write stays on `temperature` only.
    const parsed = Number(payload.priority_score);
    if (!Number.isFinite(parsed)) {
      return { patch: null as Record<string, unknown> | null, error: "priority_score must be numeric." };
    }
    patch.temperature = legacyPriorityScoreToLeadTemperature(Math.round(parsed));
  }

  if ("status" in payload) {
    const status = String(payload.status ?? "").trim();
    if (!isLeadStatus(status)) {
      return { patch: null as Record<string, unknown> | null, error: "Invalid status value." };
    }
    patch.status = status;
  }

  if ("follow_up_date" in payload) {
    const raw = payload.follow_up_date;
    const followUpDate = raw === null ? null : String(raw ?? "").trim();
    if (followUpDate && !isIsoDate(followUpDate)) {
      return { patch: null as Record<string, unknown> | null, error: "follow_up_date must be YYYY-MM-DD." };
    }
    patch.follow_up_date = followUpDate || null;
  }

  // Legacy web/mobile compatibility. New complete follow-up workflows must use
  // the canonical follow-up service, which accepts an explicit timezone and
  // owns Calendar synchronization and idempotency.
  if ("follow_up_at" in payload) {
    const raw = payload.follow_up_at;
    const at = raw === null ? null : new Date(String(raw ?? ""));
    if (at && !Number.isFinite(at.getTime())) return { patch: null as Record<string, unknown> | null, error: "follow_up_at must be a valid timestamp." };
    patch.follow_up_at = at?.toISOString() ?? null;
    patch.follow_up_date = at ? at.toISOString().slice(0, 10) : null;
  }
  if ("follow_up_note" in payload) {
    const note = payload.follow_up_note === null ? "" : String(payload.follow_up_note ?? "").trim();
    if (note.length > 2_000) return { patch: null as Record<string, unknown> | null, error: "follow_up_note is too long." };
    patch.follow_up_note = note || null;
  }
  if ("follow_up_completed_at" in payload) {
    const raw = payload.follow_up_completed_at;
    const at = raw === null ? null : new Date(String(raw ?? ""));
    if (at && !Number.isFinite(at.getTime())) return { patch: null as Record<string, unknown> | null, error: "follow_up_completed_at must be a valid timestamp." };
    patch.follow_up_completed_at = at?.toISOString() ?? null;
  }

  if ("rating" in payload) {
    const parsed = Number(payload.rating);
    if (!Number.isFinite(parsed)) {
      return { patch: null as Record<string, unknown> | null, error: "rating must be numeric." };
    }
    patch.rating = Math.max(0, Math.min(5, Math.round(parsed)));
  }

  if ("company_text" in payload) {
    const raw = payload.company_text;
    patch.company_text = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("linkedin_url" in payload) {
    const raw = payload.linkedin_url;
    patch.linkedin_url = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("company_domain" in payload) {
    const raw = payload.company_domain;
    patch.company_domain = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("industry" in payload) {
    const raw = payload.industry;
    patch.industry = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("company_size" in payload) {
    const raw = payload.company_size;
    patch.company_size = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("seniority" in payload) {
    const raw = payload.seniority;
    patch.seniority = raw === null ? null : String(raw ?? "").trim() || null;
  }

  if ("intent_signals" in payload) {
    const parsed = parseIntentSignalsFromPatch(payload.intent_signals);
    if (parsed === null) {
      return { patch: null as Record<string, unknown> | null, error: "intent_signals must be a JSON array." };
    }
    patch.intent_signals = parsed;
  }

  if (Object.keys(patch).length === 0) {
    return { patch: null as Record<string, unknown> | null, error: "No valid lead fields provided." };
  }

  return { patch, error: null as string | null };
}
