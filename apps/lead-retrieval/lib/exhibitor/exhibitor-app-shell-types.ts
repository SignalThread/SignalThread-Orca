import type { EventContainerKind } from "@/lib/events/event-container-kind";

export type ExhibitorAppShellEventChrome = {
  accessibleEvents: Array<{ id: string; name: string; container_kind?: EventContainerKind }>;
  activeEventId: string | null;
  activeEventName: string | null;
  /** Server-derived: "Manage events" in the top bar only for company all-events exhibitor admins. */
  showManageEventsLink: boolean;
  /**
   * When true, the user cannot switch events in UI (assigned-only / legacy event-scoped tenant).
   */
  eventSelectorLocked: boolean;
};
