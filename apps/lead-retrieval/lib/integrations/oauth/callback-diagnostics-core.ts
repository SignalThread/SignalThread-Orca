/**
 * Provider-neutral OAuth callback diagnostics.
 *
 * Every integration OAuth callback logs the same shape: which stage failed, a
 * safe error category, the provider's HTTP status and error code, and a
 * sanitized message. Raw provider token responses, bearer tokens, authorization
 * codes, PKCE verifiers and state values are redacted before they can reach a log.
 */
export type OAuthCallbackSafeErrorCategory =
  | "none"
  | "invalid_state"
  | "session_mismatch"
  | "invalid_pkce"
  | "nonce_unavailable"
  | "provider_denied"
  | "missing_authorization_code"
  | "provider_rejected"
  | "provider_unavailable"
  | "invalid_token_response"
  | "invalid_identity"
  | "account_binding_conflict"
  | "missing_refresh_token"
  | "encryption_configuration"
  | "encryption_failed"
  | "persistence_failed"
  | "redirect_failed"
  | "unexpected_error";

export type OAuthCallbackProgress = {
  state_validation_succeeded: boolean | null;
  nonce_validation_succeeded: boolean | null;
  pkce_validation_succeeded: boolean | null;
  token_exchange_succeeded: boolean | null;
  token_response_validation_succeeded: boolean | null;
  subject_account_binding_succeeded: boolean | null;
  encryption_succeeded: boolean | null;
  persistence_succeeded: boolean | null;
};

export type OAuthCallbackDiagnostic = OAuthCallbackProgress & {
  stage: string;
  safe_error_category: OAuthCallbackSafeErrorCategory;
  provider_http_status: number | null;
  provider_code: string | null;
  sanitized_message: string | null;
};

export type OAuthCallbackLogger = (
  level: "info" | "warn" | "error",
  diagnostic: OAuthCallbackDiagnostic
) => void;

const DEFAULT_PROGRESS: OAuthCallbackProgress = {
  state_validation_succeeded: null,
  nonce_validation_succeeded: null,
  pkce_validation_succeeded: null,
  token_exchange_succeeded: null,
  token_response_validation_succeeded: null,
  subject_account_binding_succeeded: null,
  encryption_succeeded: null,
  persistence_succeeded: null
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  return { message: error };
}

export function sanitizeOAuthCallbackMessage(error: unknown): string {
  const value = asErrorLike(error).message;
  const message = typeof value === "string" ? value : "Unknown callback error.";
  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /(^|[?&])((?:code|state|token|access_token|refresh_token|id_token|client_secret|code_verifier|pkce)=)[^&\s]+/gi,
      "$1$2[redacted]"
    )
    .replace(/\b(?:eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,256}\b/g, "[redacted]")
    .slice(0, 300);
}

export function safeOAuthCallbackCode(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const code = String(value).slice(0, 80);
  return /^[A-Za-z0-9_.-]+$/.test(code) ? code : null;
}

export function safeOAuthCallbackHttpStatus(value: unknown): number | null {
  const candidate = typeof value === "string" ? Number(value) : value;
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599
    ? candidate
    : null;
}

export function oauthCallbackErrorCode(error: unknown): string | null {
  return safeOAuthCallbackCode(asErrorLike(error).code);
}

export function oauthCallbackErrorStatus(error: unknown, fallback?: unknown): number | null {
  const value = asErrorLike(error).status ?? asErrorLike(error).statusCode ?? fallback;
  return safeOAuthCallbackHttpStatus(value);
}

export function createOAuthCallbackProgress(
  overrides: Partial<OAuthCallbackProgress> = {}
): OAuthCallbackProgress {
  return { ...DEFAULT_PROGRESS, ...overrides };
}

export function createOAuthCallbackDiagnostic(input: {
  stage: string;
  safeErrorCategory: OAuthCallbackSafeErrorCategory;
  providerHttpStatus?: unknown;
  providerCode?: unknown;
  message?: unknown;
  progress?: Partial<OAuthCallbackProgress>;
}): OAuthCallbackDiagnostic {
  return {
    stage: input.stage,
    safe_error_category: input.safeErrorCategory,
    provider_http_status: safeOAuthCallbackHttpStatus(input.providerHttpStatus),
    provider_code: safeOAuthCallbackCode(input.providerCode),
    sanitized_message: input.message === undefined ? null : sanitizeOAuthCallbackMessage(input.message),
    ...createOAuthCallbackProgress(input.progress)
  };
}

export function createOAuthCallbackConsoleLogger(prefix: string): OAuthCallbackLogger {
  return (level, diagnostic) => {
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    method(prefix, diagnostic);
  };
}

export function emitOAuthCallbackDiagnostic(input: {
  level: "info" | "warn" | "error";
  stage: string;
  safeErrorCategory: OAuthCallbackSafeErrorCategory;
  providerHttpStatus?: unknown;
  providerCode?: unknown;
  message?: unknown;
  progress?: Partial<OAuthCallbackProgress>;
  logger: OAuthCallbackLogger;
}) {
  input.logger(input.level, createOAuthCallbackDiagnostic(input));
}
