export type RoomSetMode = "layout" | "seating";

function encodeRoutePart(value: string): string {
  return encodeURIComponent(value);
}

export function eventRunOfShowHref(eventId: string): string {
  return `/events/${encodeRoutePart(eventId)}/matrix`;
}

export function runOfShowSessionHref(eventId: string, sessionId: string): string {
  return `${eventRunOfShowHref(eventId)}/sessions/${encodeRoutePart(sessionId)}`;
}

export function roomSetHref(eventId: string, sessionId: string, mode: RoomSetMode = "layout"): string {
  return `${runOfShowSessionHref(eventId, sessionId)}/room-set?mode=${mode}`;
}
