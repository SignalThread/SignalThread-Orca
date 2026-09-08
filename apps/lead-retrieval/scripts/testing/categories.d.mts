export type Category =
  | "prod-safe"
  | "local-only"
  | "requires-device"
  | "separate-security-db"
  | "migration"
  | "deliberate-break"
  | "load-stress";

export interface CategoryDef {
  description: string;
  /** Whether a production target is permitted at all. */
  mayTargetProduction: boolean;
  /** Whether this program ever executes it. */
  runnable: boolean;
  accounting: "pass-count" | "not-run" | "excluded";
  reason: string;
}

export type RouteAction = "run" | "not-run" | "excluded" | "abort";

export interface RouteDecision {
  action: RouteAction;
  reason: string | null;
}

export interface RouteOptions {
  target?: "local" | "production";
  liveEvent?: boolean;
  prodWrites?: boolean;
}

export declare const CATEGORIES: Record<Category, CategoryDef>;
export declare const CATEGORY_NAMES: readonly Category[];
export declare const EXCLUDED_CATEGORIES: readonly Category[];
export declare const PRODUCTION_FORBIDDEN: readonly Category[];

export declare function isKnownCategory(name: unknown): name is Category;
export declare function assertKnownCategory(name: unknown, context?: string): Category;
export declare function resolveTarget(
  env?: Record<string, string | undefined>,
  productionRefs?: Set<string>
): "local" | "production";
export declare function routeCategory(category: string, options?: RouteOptions): RouteDecision;
export declare function assertOwnedTestRecipient(
  recipient: string,
  allowedDomainsOrAddresses: readonly string[]
): string;
