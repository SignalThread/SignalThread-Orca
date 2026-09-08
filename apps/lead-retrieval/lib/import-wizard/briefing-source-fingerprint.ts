import { createHash } from "node:crypto";
import { stableStringifyCustomFieldDefinitions, type CustomFieldDefinitions } from "@/lib/import-wizard/custom-field-mapping";

/**
 * Stable fingerprint for import row + mapping. When it changes, the three real briefing blocks
 * are re-derived; approval_status is not modified (see import-batch-briefing-service).
 */
export function computeBriefingSourceFingerprint(
  cells: string[],
  csvHeaders: string[],
  selections: Record<string, string>,
  customFieldDefinitions: CustomFieldDefinitions = {}
): string {
  const sortedSelections = Object.keys(selections)
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = selections[k] ?? "";
      return acc;
    }, {});
  const payload = JSON.stringify({
    csvHeaders,
    cells,
    selections: sortedSelections,
    customFieldDefinitions: stableStringifyCustomFieldDefinitions(customFieldDefinitions),
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
