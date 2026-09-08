/**
 * Shared building blocks for Lead Retrieval internal Product Health endpoints.
 *
 * The existing conversation-lifecycle endpoint predates this module and keeps its own
 * richer response shape for backwards compatibility with the already-wired Internal-app
 * client. New P0/P1 health sources should use the shared contract + helpers below so we
 * do not maintain seven one-off shapes.
 *
 * Safety rules baked in:
 * - aggregate-only: helpers return counts/ages, never row IDs or customer content
 * - row-count safe: `loadAllHealthRows` paginates so checks never silently read only the
 *   first 1,000 rows (the bug that produced false readiness mismatches)
 * - deterministic: callers pass `nowIso`; thresholds live in the calling service
 */
import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type ProductHealthStatus = "healthy" | "warning" | "critical" | "unknown";
export type ProductHealthIssueSeverity = "warning" | "critical";

export type ProductHealthIssue = {
  code: string;
  severity: ProductHealthIssueSeverity;
  message: string;
  count?: number;
  oldestAgeMinutes?: number;
  threshold?: number;
};

export type LeadRetrievalHealthResponse = {
  product: "lead-retrieval";
  check: string;
  source: string;
  status: ProductHealthStatus;
  checkedAt: string;
  summary: string;
  metrics: Record<string, number | string | boolean | null>;
  issues: ProductHealthIssue[];
  window?: {
    recentMinutes?: number;
    staleAfterMinutes?: number;
  };
};

/** Derive an overall status from the issue list. critical > warning > healthy. */
export function deriveHealthStatus(issues: ReadonlyArray<{ severity: ProductHealthIssueSeverity }>): ProductHealthStatus {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "healthy";
}

/**
 * Append a count-based issue with warning/critical escalation, omitting it entirely when
 * the count is zero. Optionally carries the oldest age in minutes for triage.
 */
export function pushCountIssue(
  issues: ProductHealthIssue[],
  input: {
    code: string;
    count: number;
    warningAt?: number;
    criticalAt: number;
    warningMessage: string;
    criticalMessage: string;
    oldestAgeMinutes?: number | null;
  }
): void {
  const warningAt = input.warningAt ?? 1;
  if (input.count < warningAt) return;
  const critical = input.count >= input.criticalAt;
  const issue: ProductHealthIssue = {
    code: input.code,
    severity: critical ? "critical" : "warning",
    message: critical ? input.criticalMessage : input.warningMessage,
    count: input.count,
    threshold: input.criticalAt,
  };
  if (input.oldestAgeMinutes != null && Number.isFinite(input.oldestAgeMinutes)) {
    issue.oldestAgeMinutes = Math.max(0, Math.round(input.oldestAgeMinutes));
  }
  issues.push(issue);
}

/** Assemble a shared-contract response, deriving status from the issues. */
export function buildHealthResponse(input: {
  source: string;
  checkedAt: string;
  summary: string;
  metrics: Record<string, number | string | boolean | null>;
  issues: ProductHealthIssue[];
  window?: LeadRetrievalHealthResponse["window"];
  status?: ProductHealthStatus;
}): LeadRetrievalHealthResponse {
  return {
    product: "lead-retrieval",
    check: input.source,
    source: input.source,
    status: input.status ?? deriveHealthStatus(input.issues),
    checkedAt: input.checkedAt,
    summary: input.summary,
    metrics: input.metrics,
    issues: input.issues,
    ...(input.window ? { window: input.window } : {}),
  };
}

/**
 * Row-count-safe paginated read. Never relies on Supabase's implicit 1,000-row default
 * when full coverage is required. `configure` applies filters/order to bound the scan.
 */
export async function loadAllHealthRows<T>(input: {
  supabase: SupabaseAdmin;
  table: string;
  select: string;
  configure?: (query: any) => any;
  errorMessage: string;
  pageSize?: number;
  maxRows?: number;
}): Promise<T[]> {
  const pageSize = input.pageSize ?? 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const baseQuery = (input.supabase as any).from(input.table).select(input.select);
    const filteredQuery = input.configure ? input.configure(baseQuery) : baseQuery;
    const { data, error } = await filteredQuery.range(from, to);

    if (error) {
      throw new Error(input.errorMessage);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) return rows;
    if (input.maxRows != null && rows.length >= input.maxRows) return rows;
  }
}

// ---- date / age helpers (UTC ISO, deterministic) ----

export function minutesBeforeIso(nowIso: string, minutes: number): string {
  return new Date(new Date(nowIso).getTime() - minutes * 60_000).toISOString();
}

/** Minutes between `value` and `nowIso` (>= 0), or null when `value` is unparseable. */
export function ageMinutes(value: string | null | undefined, nowIso: string): number | null {
  const valueMs = Date.parse(String(value ?? ""));
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(valueMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, (nowMs - valueMs) / 60_000);
}

export function isAtOrBefore(value: string | null | undefined, cutoffIso: string): boolean {
  const iso = normalizedIso(value);
  if (!iso) return false;
  return iso <= cutoffIso;
}

export function isAtOrAfter(value: string | null | undefined, cutoffIso: string): boolean {
  const iso = normalizedIso(value);
  if (!iso) return false;
  return iso >= cutoffIso;
}

/** Count timestamps within `windowMinutes` before `nowIso` (inclusive, not in the future). */
export function countWithinWindow(
  values: ReadonlyArray<string | null | undefined>,
  nowIso: string,
  windowMinutes: number
): number {
  const cutoff = minutesBeforeIso(nowIso, windowMinutes);
  let count = 0;
  for (const value of values) {
    const iso = normalizedIso(value);
    if (iso && iso >= cutoff && iso <= nowIso) count += 1;
  }
  return count;
}

export function minIso(values: ReadonlyArray<string | null | undefined>): string | null {
  let min: string | null = null;
  for (const value of values) {
    const iso = normalizedIso(value);
    if (iso && (min === null || iso < min)) min = iso;
  }
  return min;
}

export function maxIso(values: ReadonlyArray<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const value of values) {
    const iso = normalizedIso(value);
    if (iso && (max === null || iso > max)) max = iso;
  }
  return max;
}

export function normalizedIso(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeId(value: unknown): string | null {
  const id = String(value ?? "").trim();
  return id || null;
}

export function positiveInt(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null;
}
