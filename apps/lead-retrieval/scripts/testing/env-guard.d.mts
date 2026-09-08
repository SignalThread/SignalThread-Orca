export declare const GUARD_OK: "ok";
export declare const GUARD_ABORT: "abort";

export interface GuardCheckDetail {
  configuredSupabaseRef: string | null;
  configuredOAuthClientPresent: boolean;
  productionRefsKnown: number;
  productionClientsKnown: number;
  productionIdentifierSources: { envVars: boolean; prodEnvFile: boolean };
  strictMode: boolean;
}

export interface GuardResult {
  status: "ok" | "abort";
  reasons: string[];
  checked: GuardCheckDetail;
}

export declare function parseDotEnv(text: string): Record<string, string>;
export declare function supabaseProjectRef(url: string | undefined | null): string | null;

export declare function resolveProductionIdentifiers(input: {
  repoRoot: string;
  env: Record<string, string | undefined>;
}): { refs: Set<string>; clients: Set<string>; sources: { envVars: boolean; prodEnvFile: boolean } };

export declare function checkEnvironment(input: {
  repoRoot: string;
  env?: Record<string, string | undefined>;
}): GuardResult;

export declare function enforceEnvironment(input: {
  repoRoot: string;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
}): { ok: boolean; result: GuardResult };
