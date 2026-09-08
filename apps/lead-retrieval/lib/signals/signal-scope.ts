export const SIGNAL_SCOPE_OPTIONS = ["default", "company", "event", "private"] as const;
export const SIGNAL_FORM_SCOPE_OPTIONS = ["company", "event", "private"] as const;

export type SignalScope = (typeof SIGNAL_SCOPE_OPTIONS)[number];

export const SIGNAL_SCOPE_LABELS: Record<SignalScope, string> = {
  default: "Default",
  company: "Global",
  event: "Event",
  private: "Private"
};

export type SignalEventLifecycle = {
  status?: string | null;
  endDate?: string | null;
  containerKind?: string | null;
};

export type SignalOwnershipContext = {
  userId: string;
  companyId: string | null;
  eventId?: string | null;
  eventArchived?: boolean;
};

export type ScopedSignalLike = {
  signal_scope?: string | null;
  company_id?: string | null;
  event_id?: string | null;
  owner_user_id?: string | null;
};

export function normalizeSignalScope(value: string | null | undefined, fallback: SignalScope = "company"): SignalScope {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (SIGNAL_SCOPE_OPTIONS as readonly string[]).includes(normalized) ? (normalized as SignalScope) : fallback;
}

export function signalScopeLabel(value: string | null | undefined) {
  return SIGNAL_SCOPE_LABELS[normalizeSignalScope(value)];
}

export function signalScopeRequiresEvent(scope: SignalScope) {
  return scope === "event" || scope === "private";
}

export function isEventArchivedForSignalMutations(
  event: SignalEventLifecycle,
  nowMs = Date.now()
): boolean {
  const status = String(event.status ?? "").trim().toUpperCase();
  if (status === "COMPLETED") return true;
  if (String(event.containerKind ?? "").trim() === "continuous_capture") return false;

  const endDate = String(event.endDate ?? "").trim();
  if (!endDate) return false;

  const today = new Date(nowMs).toISOString().slice(0, 10);
  return endDate < today;
}

export function canMutateSignalInContext(signal: ScopedSignalLike, context: SignalOwnershipContext): boolean {
  const scope = normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "default");
  if (scope === "default") return false;

  if (scope === "company") {
    return Boolean(context.companyId && signal.company_id === context.companyId && !signal.event_id);
  }

  if (context.eventArchived) return false;

  if (scope === "event") {
    return Boolean(
      context.companyId &&
        context.eventId &&
        signal.company_id === context.companyId &&
        signal.event_id === context.eventId
    );
  }

  return Boolean(
    context.companyId &&
      context.eventId &&
      context.userId &&
      signal.company_id === context.companyId &&
      signal.event_id === context.eventId &&
      signal.owner_user_id === context.userId
  );
}
