/**
 * URL step param for `/exhibitor/import/wizard?step=N` — 0-based, 0..4.
 */

const MIN = 0;
const MAX = 4;

/**
 * Parse and clamp a step query value. Non-numeric and out-of-range values clamp safely.
 */
export function parseImportWizardStepParam(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === "") return 0;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX, Math.max(MIN, Math.trunc(n)));
}

/**
 * Whether the URL should be replaced with canonical `?step=<normalized>` (invalid format, out of range, or leading zeros).
 */
export function shouldNormalizeImportWizardStepUrl(raw: string | null | undefined, normalized: number): boolean {
  if (raw == null || raw === "") return false;
  return String(normalized) !== raw.trim();
}
