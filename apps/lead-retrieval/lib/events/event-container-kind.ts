export type EventContainerKind = "event" | "continuous_capture";

export function normalizeEventContainerKind(raw: unknown): EventContainerKind {
  return raw === "continuous_capture" ? "continuous_capture" : "event";
}

export function isContinuousCaptureContainerKind(kind: EventContainerKind): boolean {
  return kind === "continuous_capture";
}
