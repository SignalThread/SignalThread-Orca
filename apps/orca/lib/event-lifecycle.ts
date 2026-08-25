export const EVENT_STATUS_VALUES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELED"] as const;

export type EventStatusValue = (typeof EVENT_STATUS_VALUES)[number];
export type EventLifecycleLabel = "Planning" | "Live" | "Completed" | "Canceled";
export type EventLifecycleFilterValue = "ALL" | EventStatusValue;

export type EventLifecycleTone = "planning" | "live" | "completed" | "canceled";

export const EVENT_LIFECYCLE_META: Record<
  EventStatusValue,
  { label: EventLifecycleLabel; tone: EventLifecycleTone }
> = {
  DRAFT: { label: "Planning", tone: "planning" },
  ACTIVE: { label: "Live", tone: "live" },
  COMPLETED: { label: "Completed", tone: "completed" },
  CANCELED: { label: "Canceled", tone: "canceled" },
};

export const EVENT_LIFECYCLE_FILTER_OPTIONS: Array<{
  value: EventLifecycleFilterValue;
  label: string;
}> = [
  { value: "ALL", label: "All visible events" },
  { value: "DRAFT", label: EVENT_LIFECYCLE_META.DRAFT.label },
  { value: "ACTIVE", label: EVENT_LIFECYCLE_META.ACTIVE.label },
  { value: "COMPLETED", label: EVENT_LIFECYCLE_META.COMPLETED.label },
  { value: "CANCELED", label: EVENT_LIFECYCLE_META.CANCELED.label },
];

export function isEventStatusValue(value: string): value is EventStatusValue {
  return EVENT_STATUS_VALUES.includes(value as EventStatusValue);
}

export function getEventLifecycleLabel(status: string | null | undefined): EventLifecycleLabel {
  return status && isEventStatusValue(status)
    ? EVENT_LIFECYCLE_META[status].label
    : "Planning";
}

export function getEventLifecycleTone(status: string | null | undefined): EventLifecycleTone {
  return status && isEventStatusValue(status)
    ? EVENT_LIFECYCLE_META[status].tone
    : "planning";
}
