export interface Tags {
  area: string;
  severity: string;
  layer: string;
  /** Decides WHERE the test may run. No default — see categories.mjs. */
  category: string;
  /** Whether a prod-safe test WRITES to production. Drives the live-event guard. */
  prodWrites: boolean;
  /** "directive" | "registry:<pattern>" | "none" */
  source: string;
  /** Which required tags were absent, when resolution failed. */
  missing?: string[];
}

export interface CompiledRule {
  pattern: string;
  tags: { area: string; severity: string; layer: string; category?: string; prodWrites?: boolean };
  re: RegExp;
  weight: number;
}

export declare function parseDirective(source: string): Partial<Tags> | null;
export declare function compileRegistry(
  registry: Record<string, { area: string; severity: string; layer: string; category?: string }>
): CompiledRule[];
export declare function resolveTags(
  relPath: string,
  compiled: CompiledRule[],
  source: string | null
): Tags;
export declare function readSourceSafe(absPath: string): string | null;
