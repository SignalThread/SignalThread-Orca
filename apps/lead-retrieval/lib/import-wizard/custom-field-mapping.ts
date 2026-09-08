/**
 * Dynamic custom column mappings: selections[columnIndex] = `custom:<storageKey>`.
 * Labels live in `import_batch_field_mapping_state.custom_field_definitions[storageKey]`.
 */

export const CUSTOM_FIELD_PREFIX = "custom:" as const;

/** Safety cap (not a normal product limit). */
export const MAX_CUSTOM_FIELD_DEFINITIONS = 500;

export type CustomFieldDefinition = { label: string };

export type CustomFieldDefinitions = Record<string, CustomFieldDefinition>;

export function isCustomMappingValue(v: string): boolean {
  if (!v.startsWith(CUSTOM_FIELD_PREFIX)) return false;
  const key = v.slice(CUSTOM_FIELD_PREFIX.length);
  return /^[a-z0-9_]{1,64}$/i.test(key);
}

export function parseCustomStorageKey(v: string): string | null {
  if (!isCustomMappingValue(v)) return null;
  return v.slice(CUSTOM_FIELD_PREFIX.length);
}

/** Deterministic key from header + salt for uniqueness within the batch. */
export function generateCustomStorageKey(headerLabel: string, salt: string): string {
  const base = headerLabel
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  const safe = base.length > 0 ? base : "field";
  return `cf_${safe}_${salt.slice(0, 8)}`;
}

export function stableStringifyCustomFieldDefinitions(defs: CustomFieldDefinitions): string {
  const keys = Object.keys(defs).sort();
  const o: CustomFieldDefinitions = {};
  for (const k of keys) o[k] = defs[k]!;
  return JSON.stringify(o);
}

/** Per-row custom values keyed by storage key (for publish / downstream). Cell text lives in `import_batch_rows`. */
export function customFieldValuesForRow(
  row: string[],
  selections: Record<string, string>,
  definitions: CustomFieldDefinitions
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let col = 0; col < row.length; col++) {
    const sel = selections[String(col)] ?? "";
    const k = parseCustomStorageKey(sel);
    if (!k || !definitions[k]) continue;
    out[k] = row[col] ?? "";
  }
  return out;
}

export function pruneCustomFieldDefinitions(
  selections: Record<string, string>,
  defs: CustomFieldDefinitions
): CustomFieldDefinitions {
  const used = new Set<string>();
  for (const v of Object.values(selections)) {
    const k = parseCustomStorageKey(v);
    if (k) used.add(k);
  }
  const out: CustomFieldDefinitions = {};
  for (const k of used) {
    if (defs[k]) out[k] = defs[k]!;
  }
  return out;
}
