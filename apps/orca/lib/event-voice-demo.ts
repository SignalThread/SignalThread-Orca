/** The Voice demo is deliberately scoped to this single event. */
export const VOICE_DEMO_EVENT_ID = "717ca942-5701-4bfb-82e7-afddf41f19a7";

export function isVoiceDemoEvent(eventId: string): boolean {
  return eventId === VOICE_DEMO_EVENT_ID;
}
