export interface TestResult {
  lane?: string;
  repo?: string;
  fileId?: string;
  tags?: { area: string; severity: string; layer: string; category?: string; prodWrites?: boolean; source?: string };
  name?: string;
  status: "passed" | "failed" | "skipped" | "todo" | "not-run" | "excluded";
  durationMs?: number | null;
  retries?: number;
  skipReason?: string | null;
  notRunReason?: string;
  excludedReason?: string;
  error?: { message: string; [key: string]: unknown } | null;
}

export interface Totals {
  passed: number;
  failed: number;
  skipped: number;
  knownDefect: number;
  notRun: number;
  flaky: number;
  /** Out-of-program categories: listed separately from passes, failures, and skips. */
  excluded: number;
}

export interface CategoryRow {
  category: string;
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  excluded: number;
}

export interface AreaBucket extends Totals {
  area: string;
  failures: TestResult[];
}

export declare function isKnownDefect(result: TestResult): boolean;
export declare function isFlake(result: TestResult): boolean;
export declare function emptyBucket(area: string): AreaBucket;
export declare function summarize(results: TestResult[]): {
  byArea: AreaBucket[];
  totals: Totals;
  excludedByCategory: Record<string, number>;
  deferredLiveEvent: TestResult[];
};
export declare function summarizeCategories(results: TestResult[]): CategoryRow[];
export declare function unknownCategories(results: TestResult[]): string[];
export declare function exitCodeFor(totals: Totals): 0 | 1;
export declare function severitySkipViolations(results: TestResult[]): TestResult[];
