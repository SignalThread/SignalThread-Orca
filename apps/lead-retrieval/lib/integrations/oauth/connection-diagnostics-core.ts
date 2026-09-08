/**
 * Provider-neutral connection diagnostics: safe health booleans and lifecycle
 * fields only. No identity, scope values, ciphertext or provider payloads.
 */
export type ProviderConnectionDiagnostic = {
  stage: "oauth_persistence_verification" | "status_calculation";
  safe_error_category:
    | "none"
    | "missing_connection"
    | "credential_missing"
    | "credential_unreadable"
    | "lifecycle_unhealthy"
    | "persistence_failed";
  connection_row_matched: boolean;
  refresh_credential_present: boolean;
  refresh_credential_decryptable: boolean;
  persisted_status: string | null;
  effective_status: string;
  required_scopes_granted: boolean;
};

export type ProviderConnectionDiagnosticLogger = (
  level: "info" | "warn" | "error",
  diagnostic: ProviderConnectionDiagnostic
) => void;

export function createConnectionDiagnosticConsoleLogger(
  prefix: string
): ProviderConnectionDiagnosticLogger {
  return (level, diagnostic) => {
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    method(prefix, diagnostic);
  };
}

export function emitProviderConnectionDiagnostic(input: {
  level: "info" | "warn" | "error";
  diagnostic: ProviderConnectionDiagnostic;
  logger: ProviderConnectionDiagnosticLogger;
}) {
  input.logger(input.level, input.diagnostic);
}
