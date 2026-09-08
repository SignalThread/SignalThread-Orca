import type { SessionUser } from "@/lib/auth/session";
import {
  canMutateSignalInContext,
  normalizeSignalScope,
  type SignalOwnershipContext,
  type ScopedSignalLike
} from "@/lib/signals/signal-scope";

type SignalDeleteRow = ScopedSignalLike & {
  source_signal_id?: string | null;
};

type SignalDeleteEventContext = Omit<SignalOwnershipContext, "userId"> & {
  eventId: string;
};

export type SignalDeleteAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 409; error: string };

export function authorizeSignalDelete(input: {
  sessionUser: Pick<SessionUser, "id" | "role" | "company_id">;
  signal: SignalDeleteRow;
  eventContext?: SignalDeleteEventContext | null;
}): SignalDeleteAuthorizationResult {
  const scope = normalizeSignalScope(input.signal.signal_scope, input.signal.event_id ? "event" : "default");

  if (scope === "default" || input.signal.source_signal_id) {
    return {
      ok: false,
      status: 403,
      error: "Default Campaign Agents are starter templates and cannot be deleted directly."
    };
  }

  if (input.sessionUser.role === "platform_admin") {
    return { ok: true };
  }

  if (input.sessionUser.role !== "exhibitor_admin") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (scope === "company") {
    const companyId = String(input.sessionUser.company_id ?? "").trim();
    if (companyId && input.signal.company_id === companyId && !input.signal.event_id) {
      return { ok: true };
    }
    return { ok: false, status: 403, error: "Campaign Agent is not deletable in this company scope." };
  }

  if (!input.eventContext?.eventId) {
    return {
      ok: false,
      status: 400,
      error: "Event id is required for event-scoped Campaign Agent deletes."
    };
  }

  if (
    canMutateSignalInContext(input.signal, {
      userId: input.sessionUser.id,
      companyId: input.eventContext.companyId,
      eventId: input.eventContext.eventId,
      eventArchived: input.eventContext.eventArchived
    })
  ) {
    return { ok: true };
  }

  if (input.eventContext.eventArchived) {
    return {
      ok: false,
      status: 409,
      error: "Event-scoped and private Campaign Agents are read-only after an event ends."
    };
  }

  return { ok: false, status: 403, error: "Campaign Agent is not deletable in this event scope." };
}
