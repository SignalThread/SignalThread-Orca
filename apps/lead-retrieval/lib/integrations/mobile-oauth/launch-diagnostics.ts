export type MobileOAuthLaunchSafeErrorCategory =
  | "none"
  | "invalid_ticket"
  | "ticket_not_found_or_unavailable"
  | "postgrest_error"
  | "configuration_error"
  | "network_error"
  | "binding_validation_failed"
  | "google_launch_failed"
  | "microsoft_launch_failed"
  | "unexpected_error";

export type MobileOAuthLaunchDiagnostic = {
  stage: string;
  safe_error_category: MobileOAuthLaunchSafeErrorCategory;
  supabase_code: string | null;
  sanitized_message: string | null;
  http_status: number | null;
  ticket_row_matched: boolean | null;
  atomic_consumption_succeeded: boolean | null;
  binding_validation_succeeded: boolean | null;
};

export type MobileOAuthLaunchLogger = (
  level: "info" | "warn" | "error",
  diagnostic: MobileOAuthLaunchDiagnostic
) => void;

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const MAX_SAFE_MESSAGE_LENGTH = 300;

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  return { message: error };
}

export function sanitizeMobileOAuthLaunchErrorMessage(error: unknown): string {
  const value = asErrorLike(error).message;
  const message = typeof value === "string" ? value : "Unknown launch error.";
  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/([?&](?:ticket|token|code|state|code_verifier|pkce|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,128}\b/g, "[redacted]")
    .slice(0, MAX_SAFE_MESSAGE_LENGTH);
}

export function getMobileOAuthLaunchErrorCode(error: unknown): string | null {
  const code = asErrorLike(error).code;
  if (typeof code !== "string" && typeof code !== "number") return null;
  const normalized = String(code).slice(0, 64);
  return /^[A-Za-z0-9_-]+$/.test(normalized) ? normalized : null;
}

export function getMobileOAuthLaunchHttpStatus(error: unknown, fallback?: unknown): number | null {
  const candidate = asErrorLike(error).status ?? asErrorLike(error).statusCode ?? fallback;
  const value = typeof candidate === "string" ? Number(candidate) : candidate;
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

export function classifyMobileOAuthLaunchException(
  error: unknown
): "configuration_error" | "network_error" | "unexpected_error" {
  const message = sanitizeMobileOAuthLaunchErrorMessage(error).toLowerCase();
  if (message.includes("missing ") || message.includes("must be at least")) {
    return "configuration_error";
  }
  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econn")
  ) {
    return "network_error";
  }
  return "unexpected_error";
}

export const logMobileOAuthLaunchDiagnostic: MobileOAuthLaunchLogger = (level, diagnostic) => {
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  method("[mobile-oauth-launch]", diagnostic);
};

export function logMobileOAuthLaunchPostgrestError(input: {
  stage: string;
  error: unknown;
  httpStatus?: unknown;
  ticketRowMatched: boolean | null;
  atomicConsumptionSucceeded: boolean | null;
  bindingValidationSucceeded: boolean | null;
  logger?: MobileOAuthLaunchLogger;
}) {
  (input.logger ?? logMobileOAuthLaunchDiagnostic)("error", {
    stage: input.stage,
    safe_error_category: "postgrest_error",
    supabase_code: getMobileOAuthLaunchErrorCode(input.error),
    sanitized_message: sanitizeMobileOAuthLaunchErrorMessage(input.error),
    http_status: getMobileOAuthLaunchHttpStatus(input.error, input.httpStatus),
    ticket_row_matched: input.ticketRowMatched,
    atomic_consumption_succeeded: input.atomicConsumptionSucceeded,
    binding_validation_succeeded: input.bindingValidationSucceeded
  });
}
