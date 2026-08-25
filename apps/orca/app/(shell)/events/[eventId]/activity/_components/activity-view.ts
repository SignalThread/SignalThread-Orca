// Pure, framework-free view logic for the event Activity audit log.
// Extracted so it can be unit-tested without a DOM harness (the repo has none).

export type ActivityActorKind = "USER" | "SYSTEM" | "INTEGRATION" | "PORTAL";

export type ActivityModule =
  | "ROADMAP"
  | "BUDGET"
  | "RUN_OF_SHOW"
  | "DOCUMENTS"
  | "EVENT_DIRECTORY"
  | "MARKETING"
  | "EVENT_SETTINGS"
  | "SPEAKERS"
  | "INTEGRATIONS"
  | "REPORTS";

export type ActivityAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "ASSIGNED"
  | "UNASSIGNED"
  | "IMPORTED"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "REOPENED"
  | "STATUS_CHANGED"
  | "LINKED"
  | "UNLINKED"
  | "MERGED"
  | "UPLOADED"
  | "SENT"
  | "SCHEDULED"
  | "RESCHEDULED"
  | "CANCELED"
  | "RETRIED"
  | "SYNCED"
  | "GENERATED";

export type ActivityChange = {
  field: string;
  label?: string | null;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

export type ActivityEntry = {
  id: string;
  createdAt: string;
  actorKind: ActivityActorKind;
  actorUserId: string | null;
  actorLabel: string | null;
  module: ActivityModule | null;
  action: ActivityAction | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  legacyType: LegacyActivityType | null;
  message: string;
  changes: ActivityChange[] | null;
};

export type ActivityActorOption = { id: string; label: string; kind: ActivityActorKind };

export type LegacyActivityType =
  | "EVENT_CREATED"
  | "EVENT_UPDATED"
  | "DEADLINE_CREATED"
  | "DEADLINE_UPDATED"
  | "BUDGET_SUBMITTED"
  | "BUDGET_APPROVED"
  | "BUDGET_REJECTED"
  | "MATRIX_UPDATED"
  | "SEATING_UPDATED"
  | "REPORT_GENERATED"
  | "INTEGRATION_SYNCED"
  | "SPEAKER_UPDATED";

export type ActivityResponse = {
  entries: ActivityEntry[];
  nextCursor: string | null;
  actors: ActivityActorOption[];
};

export type ActivityFilters = {
  from: string; // YYYY-MM-DD or ""
  to: string; // YYYY-MM-DD or ""
  actor: string; // opaque actor key or ""
  module: string; // ActivityModule or ""
  action: string; // ActivityAction or ""
  search: string;
};

export const EMPTY_FILTERS: ActivityFilters = {
  from: "",
  to: "",
  actor: "",
  module: "",
  action: "",
  search: "",
};

export const PAGE_SIZE = 20;

export const MODULE_LABELS: Record<ActivityModule, string> = {
  ROADMAP: "Roadmap",
  BUDGET: "Budget",
  RUN_OF_SHOW: "Run of Show",
  DOCUMENTS: "Documents",
  EVENT_DIRECTORY: "Event Directory",
  MARKETING: "Marketing",
  EVENT_SETTINGS: "Event Settings",
  SPEAKERS: "Speakers",
  INTEGRATIONS: "Integrations",
  REPORTS: "Reports",
};

export const ACTION_LABELS: Record<ActivityAction, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  DELETED: "Deleted",
  ASSIGNED: "Assigned",
  UNASSIGNED: "Unassigned",
  IMPORTED: "Imported",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REOPENED: "Reopened",
  STATUS_CHANGED: "Status changed",
  LINKED: "Linked",
  UNLINKED: "Unlinked",
  MERGED: "Merged",
  UPLOADED: "Uploaded",
  SENT: "Sent",
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  CANCELED: "Canceled",
  RETRIED: "Retried",
  SYNCED: "Synced",
  GENERATED: "Generated",
};

export const ACTOR_KIND_LABELS: Record<ActivityActorKind, string> = {
  USER: "User",
  SYSTEM: "System",
  INTEGRATION: "Integration",
  PORTAL: "Portal",
};

export const MODULE_OPTIONS = Object.keys(MODULE_LABELS) as ActivityModule[];
export const ACTION_OPTIONS = Object.keys(ACTION_LABELS) as ActivityAction[];

export function moduleLabel(module: ActivityModule | null): string | null {
  return module ? MODULE_LABELS[module] : null;
}

export function actionLabel(action: ActivityAction | null): string | null {
  return action ? ACTION_LABELS[action] : null;
}

const LEGACY_TYPE_LABELS: Partial<Record<LegacyActivityType, { module: ActivityModule; action: ActivityAction }>> = {
  EVENT_CREATED: { module: "EVENT_SETTINGS", action: "CREATED" },
  // This was written only by the historical directory-email writer.
  EVENT_UPDATED: { module: "EVENT_DIRECTORY", action: "SENT" },
  DEADLINE_CREATED: { module: "ROADMAP", action: "CREATED" },
  DEADLINE_UPDATED: { module: "ROADMAP", action: "UPDATED" },
  BUDGET_SUBMITTED: { module: "BUDGET", action: "SUBMITTED" },
  BUDGET_APPROVED: { module: "BUDGET", action: "APPROVED" },
  BUDGET_REJECTED: { module: "BUDGET", action: "REJECTED" },
  MATRIX_UPDATED: { module: "RUN_OF_SHOW", action: "UPDATED" },
  REPORT_GENERATED: { module: "REPORTS", action: "GENERATED" },
  INTEGRATION_SYNCED: { module: "INTEGRATIONS", action: "SYNCED" },
  SPEAKER_UPDATED: { module: "SPEAKERS", action: "UPDATED" },
};

export function legacyPresentation(type: LegacyActivityType | null): { module: ActivityModule; action: ActivityAction } | null {
  return type ? LEGACY_TYPE_LABELS[type] ?? null : null;
}

export function isLegacyActivity(entry: Pick<ActivityEntry, "module" | "legacyType">): boolean {
  return Boolean(entry.legacyType);
}

/** Concise headline like "Roadmap · Status changed". Legacy rows never fall back to generic Activity. */
export function entryHeadline(entry: Pick<ActivityEntry, "module" | "action" | "legacyType">): string {
  const mapped = !entry.module ? legacyPresentation(entry.legacyType) : null;
  if (!entry.module && entry.legacyType && !mapped) return "Legacy activity";
  const activityModule = entry.module ?? mapped?.module ?? null;
  const action = entry.action ?? mapped?.action ?? null;
  const parts = [moduleLabel(activityModule), actionLabel(action)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : "Legacy activity";
}

export function actorDisplayLabel(entry: Pick<ActivityEntry, "actorKind" | "actorLabel">): string {
  if (entry.actorKind === "SYSTEM") return "System";
  const label = entry.actorLabel?.trim();
  if (label) return label;
  return entry.actorKind === "USER" ? "Unknown user" : ACTOR_KIND_LABELS[entry.actorKind];
}

/** Whether an entry has meaningful change rows worth an expander. */
export function hasChanges(entry: Pick<ActivityEntry, "changes">): boolean {
  return Array.isArray(entry.changes) && entry.changes.length > 0;
}

export function changeFieldLabel(change: ActivityChange): string {
  if (change.label && change.label.trim()) return change.label;
  // Humanize a machine field name into sentence case: "dueDate" -> "Due date".
  const spaced = change.field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.replace(/^\w/, (c) => c.toUpperCase());
}

export function formatChangeValue(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const str = String(value);
  return str.trim() === "" ? "—" : str;
}

/**
 * Build the API query string from filters + optional cursor. Empty filters are
 * omitted so the URL/query stays clean (no noisy empty parameters).
 */
export function buildActivityQuery(filters: ActivityFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.module) params.set("module", filters.module);
  if (filters.action) params.set("action", filters.action);
  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function hasActiveFilters(filters: ActivityFilters): boolean {
  return Boolean(
    filters.from || filters.to || filters.actor || filters.module || filters.action || filters.search.trim(),
  );
}
