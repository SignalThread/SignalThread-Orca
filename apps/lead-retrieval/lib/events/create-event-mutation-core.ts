import type { AppRole } from "@/types/app";
import type { EventContainerKind } from "@/lib/events/event-container-kind";
import { isIanaTimeZone } from "@/lib/events/event-calendar";
import type {
  ExhibitorCompanyEventCreationReason,
  ExhibitorCompanyEventCreationResult
} from "@/lib/licenses/evaluate-exhibitor-company-event-creation";

export type CreateEventMutationPayload = {
  companyId: string;
  name: string;
  timezone: string;
  /** Canonical `events.location` value, shared with Event Settings. */
  location?: string | null;
  city: string | null;
  state: string | null;
  /** Optional in the self-serve exhibitor flow; admin surface still enforces required dates. */
  startDate: string | null;
  endDate: string | null;
  status: "ACTIVE" | "UPCOMING" | "COMPLETED";
  /** Default `event`; `continuous_capture` = persistent company bucket (portfolio/direct-create only). */
  containerKind?: EventContainerKind;
};

export type CreateEventMutationActor = {
  role: AppRole | null;
  userId: string;
  companyId: string | null;
};

export type CreateEventMutationError = {
  code: string;
  message: string;
  /** Set for exhibitor entitlement denials (matches helper `reason`). */
  reason?: ExhibitorCompanyEventCreationReason;
};

export type CreateEventMutationResult =
  | { ok: true; eventId: string }
  | { ok: false; status: number; error: CreateEventMutationError };

/** Pre-submit validation (admin / API). No `reason` — not an entitlement denial. */
export function eventCreationValidationError(message: string): CreateEventMutationError {
  return { code: "EVENT_CREATION_VALIDATION", message };
}

/** Admin flow: could not resolve a company_id to own the new event. */
export function eventCreationNoAssigneeCompanyError(): CreateEventMutationError {
  return {
    code: "EVENT_CREATION_MISSING_COMPANY",
    message: "No company available to assign this event."
  };
}

/** Stable API / service codes; branch on `reason` and `code`, not `message`. */
export function createEventEntitlementReasonToError(
  reason: Exclude<ExhibitorCompanyEventCreationReason, "allowed">
): CreateEventMutationError {
  switch (reason) {
    case "no_license":
      return {
        code: "EVENT_CREATION_NO_ELIGIBLE_LICENSE",
        message: "No eligible company-scoped license allows event creation for this company.",
        reason
      };
    case "license_inactive":
      return {
        code: "EVENT_CREATION_LICENSE_INACTIVE",
        message: "The company license is not active.",
        reason
      };
    case "license_expired":
      return {
        code: "EVENT_CREATION_LICENSE_EXPIRED",
        message: "The company license has expired.",
        reason
      };
    case "capability_disabled":
      return {
        code: "EVENT_CREATION_CAPABILITY_DISABLED",
        message: "Event creation is not enabled on this license.",
        reason
      };
    case "event_limit_reached":
      return {
        code: "EVENT_CREATION_EVENT_LIMIT_REACHED",
        message: "The maximum number of events for this license has been reached.",
        reason
      };
    case "wrong_scope":
      return {
        code: "EVENT_CREATION_LICENSE_WRONG_SCOPE",
        message: "Event creation requires a company-scoped license.",
        reason
      };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export type CreateEventMutationDeps = {
  evaluateExhibitorEntitlement: (
    exhibitorCompanyId: string,
    opts?: { nowMs?: number }
  ) => Promise<ExhibitorCompanyEventCreationResult>;
  insertEvent: (payload: CreateEventMutationPayload) => Promise<{
    eventId: string | null;
    errorMessage: string | null;
  }>;
  reconcileEventSignals?: (eventId: string, actor: CreateEventMutationActor) => Promise<{
    ok: boolean;
    errorMessage?: string | null;
  }>;
  nowMs?: number;
};

/**
 * Canonical create pipeline (no I/O defaults): inject entitlement + insert.
 * Used by the server wrapper and by deterministic tests.
 */
export async function executeCreateEventMutation(
  actor: CreateEventMutationActor,
  payload: CreateEventMutationPayload,
  deps: CreateEventMutationDeps
): Promise<CreateEventMutationResult> {
  const companyId = String(payload.companyId ?? "").trim();
  if (!companyId) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "EVENT_CREATION_MISSING_COMPANY",
        message: "companyId is required to create an event."
      }
    };
  }

  const timezone = String(payload.timezone ?? "").trim();
  if (!isIanaTimeZone(timezone)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "EVENT_CREATION_INVALID_TIMEZONE",
        message: "A valid IANA event timezone is required."
      }
    };
  }

  const role = actor.role;
  const { evaluateExhibitorEntitlement, insertEvent, reconcileEventSignals } = deps;
  const nowMs = deps.nowMs;

  if (role === "exhibitor_admin") {
    const sessionCo = String(actor.companyId ?? "").trim();
    if (!sessionCo || sessionCo !== companyId) {
      return {
        ok: false,
        status: 403,
        error: {
          code: "EVENT_CREATION_EXHIBITOR_SCOPE_MISMATCH",
          message: "Exhibitor admins may only create events for their own company."
        }
      };
    }

    const ent = await evaluateExhibitorEntitlement(companyId, nowMs != null ? { nowMs } : undefined);
    if (!ent.allowed) {
      const mapped = createEventEntitlementReasonToError(
        ent.reason as Exclude<ExhibitorCompanyEventCreationReason, "allowed">
      );
      return {
        ok: false,
        status: 403,
        error: mapped
      };
    }
  } else if (role !== "platform_admin" && role !== "organizer_admin") {
    return {
      ok: false,
      status: 403,
      error: {
        code: "EVENT_CREATION_FORBIDDEN_ROLE",
        message: "You are not allowed to create events."
      }
    };
  }

  const inserted = await insertEvent({ ...payload, companyId, timezone });
  if (!inserted.eventId) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "EVENT_CREATION_INSERT_FAILED",
        message: inserted.errorMessage ?? "Failed to create event."
      }
    };
  }

  if (reconcileEventSignals) {
    const reconciled = await reconcileEventSignals(inserted.eventId, actor);
    if (!reconciled.ok) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "EVENT_CREATION_SIGNAL_COPY_FAILED",
          message: reconciled.errorMessage ?? "Failed to create event signal copies."
        }
      };
    }
  }

  return { ok: true, eventId: inserted.eventId };
}
