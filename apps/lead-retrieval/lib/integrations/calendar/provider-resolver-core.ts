import {
  CALENDAR_PROVIDERS,
  type CalendarProvider,
  type CalendarProviderCandidate,
  type CalendarProviderResolution,
  type EligibleCalendar
} from "@/lib/integrations/calendar/types";

export function resolveCalendarProvider(input: {
  candidates: CalendarProviderCandidate[];
  preferredProvider: CalendarProvider | null;
  providerOverride?: CalendarProvider;
}): CalendarProviderResolution {
  if (input.providerOverride) {
    const requested = input.candidates.find(
      (candidate) => candidate.provider === input.providerOverride
    );
    if (requested?.healthy) {
      return { ok: true, connection: requested, source: "override" };
    }
    return {
      ok: false,
      outcome: requested ? "reconnect_required" : "missing_connection"
    };
  }

  const healthy = input.candidates.filter((candidate) => candidate.healthy);
  if (healthy.length === 1) {
    return { ok: true, connection: healthy[0], source: "only_healthy" };
  }
  if (healthy.length > 1) {
    const preferred = healthy.find(
      (candidate) => candidate.provider === input.preferredProvider
    );
    if (preferred) return { ok: true, connection: preferred, source: "preference" };
    return { ok: false, outcome: "provider_selection_required" };
  }
  if (input.candidates.some((candidate) => candidate.reconnectRequired)) {
    return { ok: false, outcome: "reconnect_required" };
  }
  return { ok: false, outcome: "missing_connection" };
}

export function eligibleCalendarsFromCandidates(input: {
  candidates: CalendarProviderCandidate[];
  preferredProvider: CalendarProvider | null;
}): EligibleCalendar[] {
  return input.candidates
    .filter((candidate) => candidate.healthy)
    .sort(
      (left, right) =>
        CALENDAR_PROVIDERS.indexOf(left.provider) -
        CALENDAR_PROVIDERS.indexOf(right.provider)
    )
    .map((candidate) => ({
      provider: candidate.provider,
      accountEmail: candidate.accountEmail,
      isDefault: candidate.provider === input.preferredProvider
    }));
}
