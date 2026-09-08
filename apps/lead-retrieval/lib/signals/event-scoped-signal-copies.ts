import type { Database } from "@/types/database";

export const APPROVED_EVENT_STARTER_SIGNAL_NAMES = [
  "Conversation Brief Agent",
  "Company Intel Agent",
  "Follow-Up Agent",
  "Positioning Agent"
] as const;

export type ApprovedEventStarterSignalName = (typeof APPROVED_EVENT_STARTER_SIGNAL_NAMES)[number];

export const APPROVED_EVENT_STARTER_SIGNAL_NAME_SET: Set<string> = new Set(APPROVED_EVENT_STARTER_SIGNAL_NAMES);

export const SIGNAL_SELECT_COLUMNS =
  "id, name, category, default_prompt, admin_override_prompt, visibility, signal_scope, company_id, owner_user_id, role_scope, template_scope, is_active, available_in_pattern_mode, tones, event_id, source_signal_id, created_by, updated_at, created_at";

export type EventScopedSignalSourceRow = Pick<
  Database["public"]["Tables"]["signals"]["Row"],
  | "id"
  | "name"
  | "category"
  | "default_prompt"
  | "admin_override_prompt"
  | "visibility"
  | "role_scope"
  | "template_scope"
  | "is_active"
  | "available_in_pattern_mode"
  | "tones"
  | "created_by"
>;

export type EventScopedSignalExistingRow = Pick<
  Database["public"]["Tables"]["signals"]["Row"],
  "name" | "source_signal_id"
>;

export function isApprovedEventStarterSignalName(name: string | null | undefined): name is ApprovedEventStarterSignalName {
  return APPROVED_EVENT_STARTER_SIGNAL_NAME_SET.has(String(name ?? "").trim());
}

export function orderedApprovedStarterNames() {
  return [...APPROVED_EVENT_STARTER_SIGNAL_NAMES];
}

export function pickApprovedGlobalStarterRows<T extends EventScopedSignalSourceRow>(rows: readonly T[]): T[] {
  const byName = new Map<string, T>();
  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    if (!isApprovedEventStarterSignalName(name)) continue;
    if (!byName.has(name)) {
      byName.set(name, row);
    }
  }

  return APPROVED_EVENT_STARTER_SIGNAL_NAMES.map((name) => byName.get(name)).filter((row): row is T => Boolean(row));
}

export function buildEventScopedSignalCopyRows(input: {
  eventId: string;
  companyId: string;
  sourceRows: readonly EventScopedSignalSourceRow[];
  existingRows?: readonly EventScopedSignalExistingRow[];
  createdBy?: string | null;
}): Database["public"]["Tables"]["signals"]["Insert"][] {
  const eventId = input.eventId.trim();
  const companyId = input.companyId.trim();
  if (!eventId || !companyId) return [];

  const existingSourceIds = new Set(
    (input.existingRows ?? [])
      .map((row) => String(row.source_signal_id ?? "").trim())
      .filter(Boolean)
  );
  const existingNames: Set<string> = new Set(
    (input.existingRows ?? [])
      .map((row) => String(row.name ?? "").trim())
      .filter((name) => isApprovedEventStarterSignalName(name))
  );

  return pickApprovedGlobalStarterRows(input.sourceRows)
    .filter((source) => !existingSourceIds.has(source.id) && !existingNames.has(source.name))
    .map((source) => ({
      name: source.name,
      category: source.category,
      default_prompt: source.default_prompt,
      admin_override_prompt: source.admin_override_prompt,
      visibility: source.visibility,
      role_scope: source.role_scope,
      template_scope: source.template_scope,
      is_active: source.is_active,
      available_in_pattern_mode: source.available_in_pattern_mode,
      tones: [...(source.tones ?? [])],
      signal_scope: "event",
      company_id: companyId,
      owner_user_id: null,
      event_id: eventId,
      source_signal_id: source.id,
      created_by: input.createdBy ?? source.created_by
    }));
}
