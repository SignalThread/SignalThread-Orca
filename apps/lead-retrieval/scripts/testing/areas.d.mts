export type Severity = "P0" | "P1" | "P2" | "P3";

export type Layer =
  | "static" | "unit" | "component" | "api" | "db" | "provider" | "migration"
  | "e2e-web" | "e2e-mobile" | "cross-surface" | "perf" | "security" | "smoke";

export interface AreaDef {
  description: string;
  repo: "web" | "mobile" | "both";
  /** Owning prompt in TESTING_PROMPTS.md */
  prompt: number;
  /** Plan sections this area proves */
  planRefs: string;
}

export declare const SEVERITIES: readonly Severity[];
export declare const LAYERS: readonly Layer[];
export declare const AREAS: Record<string, AreaDef>;
export declare const AREA_NAMES: readonly string[];

export declare function assertKnownArea(name: string): string;
export declare function assertKnownSeverity(name: string): Severity;
export declare function assertKnownLayer(name: string): Layer;
