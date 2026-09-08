import {
  isExhibitorEventLevelTenantUiResolution,
  type EventAccessResolution
} from "@/lib/access/event-access-mode";

export type ExhibitorInviteEventScopeInput = {
  requestedEventId: string | null | undefined;
  activeEventId: string | null | undefined;
  accessibleEventIds: string[];
  accessResolution: EventAccessResolution;
};

export function resolveExhibitorInviteEventId(
  input: ExhibitorInviteEventScopeInput
): { eventId: string | null; error: string | null } {
  const requestedEventId = String(input.requestedEventId ?? "").trim();
  const activeEventId = String(input.activeEventId ?? "").trim();
  const accessibleEventIds = [...new Set(input.accessibleEventIds.map((id) => String(id ?? "").trim()).filter(Boolean))];

  if (requestedEventId) {
    if (accessibleEventIds.includes(requestedEventId)) {
      return { eventId: requestedEventId, error: null };
    }
    return { eventId: null, error: "Selected event is outside your exhibitor scope." };
  }

  if (isExhibitorEventLevelTenantUiResolution(input.accessResolution)) {
    if (activeEventId && accessibleEventIds.includes(activeEventId)) {
      return { eventId: activeEventId, error: null };
    }
    return { eventId: null, error: "Missing current assigned event for this exhibitor invite." };
  }

  if (accessibleEventIds.length === 1) {
    return { eventId: accessibleEventIds[0], error: null };
  }

  return {
    eventId: null,
    error: "Choose an event before sending this exhibitor invite."
  };
}
