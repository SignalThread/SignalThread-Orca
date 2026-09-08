import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import {
  MOBILE_OAUTH_INTERNAL_RETURN_PATH,
  MOBILE_OAUTH_PROVIDER,
  isMobileOAuthProvider,
  isOpaqueMobileOAuthCorrelation,
  type MobileOAuthProvider
} from "@/lib/integrations/mobile-oauth/bridge-core";
import { MOBILE_OAUTH_BROWSER_LAUNCH_PATH } from "@/lib/integrations/mobile-oauth/middleware-policy";
import {
  classifyMobileOAuthLaunchException,
  getMobileOAuthLaunchErrorCode,
  getMobileOAuthLaunchHttpStatus,
  sanitizeMobileOAuthLaunchErrorMessage,
  type MobileOAuthLaunchLogger
} from "@/lib/integrations/mobile-oauth/launch-diagnostics";

const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MobileOAuthLaunchTicketBinding = {
  provider: MobileOAuthProvider;
  user_id: string;
  company_id: string;
  correlation: string;
  force_reconnect: boolean;
};

type PreparedProviderOAuthLaunch = {
  authorizationUrl: URL;
  codeVerifier: string;
  maxAge: number;
};

export type PrepareProviderOAuthLaunch = (input: {
  userId: string;
  companyId: string;
  channel: "mobile";
  correlation: string;
  returnTo: string;
  forceConsent: boolean;
}) => Promise<PreparedProviderOAuthLaunch>;

type MobileOAuthLaunchDeps = {
  consumeTicket: (ticket: string) => Promise<MobileOAuthLaunchTicketBinding | null>;
  prepareGoogleLaunch: PrepareProviderOAuthLaunch;
  prepareMicrosoftLaunch?: PrepareProviderOAuthLaunch;
  logger?: MobileOAuthLaunchLogger;
};

export type MobileOAuthBrowserLaunchResult =
  | ({ ok: true; provider: MobileOAuthProvider } & PreparedProviderOAuthLaunch)
  | { ok: false; status: 400 | 500; error: string };

/**
 * A launch may only ever start the provider recorded on the consumed ticket, and
 * only when that provider has a registered preparation. This is what stops a
 * ticket issued for one provider from being redeemed against another.
 */
function selectProviderLaunch(
  provider: MobileOAuthProvider,
  deps: MobileOAuthLaunchDeps
): PrepareProviderOAuthLaunch | null {
  if (provider === MOBILE_OAUTH_PROVIDER) return deps.prepareGoogleLaunch;
  if (provider === "microsoft_365") return deps.prepareMicrosoftLaunch ?? null;
  return null;
}

function isValidBinding(value: MobileOAuthLaunchTicketBinding | null): value is MobileOAuthLaunchTicketBinding {
  return Boolean(
    value &&
      isMobileOAuthProvider(value.provider) &&
      UUID_PATTERN.test(value.user_id) &&
      UUID_PATTERN.test(value.company_id) &&
      isOpaqueMobileOAuthCorrelation(value.correlation) &&
      typeof value.force_reconnect === "boolean"
  );
}

export function buildMobileOAuthLaunchUrl(input: {
  request: Pick<Request, "url">;
  ticket: string;
}) {
  const authorizationUrl = buildBrowserFacingUrl(input.request, MOBILE_OAUTH_BROWSER_LAUNCH_PATH);
  authorizationUrl.searchParams.set("ticket", input.ticket);
  return authorizationUrl.toString();
}

export function buildMobileOAuthStartPayload(input: {
  authorizationUrl: string;
  correlation: string;
  provider?: MobileOAuthProvider;
}) {
  return {
    provider: input.provider ?? MOBILE_OAUTH_PROVIDER,
    authorizationUrl: input.authorizationUrl,
    correlation: input.correlation
  };
}

export async function resolveMobileOAuthBrowserLaunch(
  request: Pick<Request, "url">,
  deps: MobileOAuthLaunchDeps
): Promise<MobileOAuthBrowserLaunchResult> {
  const logger = deps.logger ?? (() => undefined);
  const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
  if (!TICKET_PATTERN.test(ticket)) {
    logger("warn", {
      stage: "request_ticket_validation",
      safe_error_category: "invalid_ticket",
      supabase_code: null,
      sanitized_message: "Launch request did not contain a valid ticket format.",
      http_status: 400,
      ticket_row_matched: false,
      atomic_consumption_succeeded: false,
      binding_validation_succeeded: false
    });
    return { ok: false, status: 400, error: "This authorization link is invalid or has expired." };
  }

  let binding: MobileOAuthLaunchTicketBinding | null;
  try {
    binding = await deps.consumeTicket(ticket);
  } catch (error) {
    logger("error", {
      stage: "ticket_consumption_dependency",
      safe_error_category: classifyMobileOAuthLaunchException(error),
      supabase_code: getMobileOAuthLaunchErrorCode(error),
      sanitized_message: sanitizeMobileOAuthLaunchErrorMessage(error),
      http_status: getMobileOAuthLaunchHttpStatus(error),
      ticket_row_matched: null,
      atomic_consumption_succeeded: false,
      binding_validation_succeeded: null
    });
    throw error;
  }
  if (!isValidBinding(binding)) {
    logger("warn", {
      stage: "ticket_binding_validation",
      safe_error_category: binding ? "binding_validation_failed" : "ticket_not_found_or_unavailable",
      supabase_code: null,
      sanitized_message: binding
        ? "Consumed launch ticket binding failed validation."
        : "No consumable launch ticket binding was returned.",
      http_status: 400,
      ticket_row_matched: Boolean(binding),
      atomic_consumption_succeeded: Boolean(binding),
      binding_validation_succeeded: false
    });
    return { ok: false, status: 400, error: "This authorization link is invalid or has expired." };
  }
  logger("info", {
    stage: "ticket_binding_validation",
    safe_error_category: "none",
    supabase_code: null,
    sanitized_message: null,
    http_status: null,
    ticket_row_matched: true,
    atomic_consumption_succeeded: true,
    binding_validation_succeeded: true
  });

  const prepareLaunch = selectProviderLaunch(binding.provider, deps);
  if (!prepareLaunch) {
    logger("warn", {
      stage: "ticket_binding_validation",
      safe_error_category: "binding_validation_failed",
      supabase_code: null,
      sanitized_message: "No launch preparation is registered for the ticket provider.",
      http_status: 400,
      ticket_row_matched: true,
      atomic_consumption_succeeded: true,
      binding_validation_succeeded: false
    });
    return { ok: false, status: 400, error: "This authorization link is invalid or has expired." };
  }
  const launchStage =
    binding.provider === MOBILE_OAUTH_PROVIDER ? "google_launch_preparation" : "microsoft_launch_preparation";
  const launchFailureCategory =
    binding.provider === MOBILE_OAUTH_PROVIDER ? "google_launch_failed" : "microsoft_launch_failed";
  try {
    const launch = await prepareLaunch({
      userId: binding.user_id,
      companyId: binding.company_id,
      channel: "mobile",
      correlation: binding.correlation,
      returnTo: MOBILE_OAUTH_INTERNAL_RETURN_PATH,
      forceConsent: binding.force_reconnect
    });
    return { ok: true, provider: binding.provider, ...launch };
  } catch (error) {
    logger("error", {
      stage: launchStage,
      safe_error_category: launchFailureCategory,
      supabase_code: getMobileOAuthLaunchErrorCode(error),
      sanitized_message: sanitizeMobileOAuthLaunchErrorMessage(error),
      http_status: getMobileOAuthLaunchHttpStatus(error),
      ticket_row_matched: true,
      atomic_consumption_succeeded: true,
      binding_validation_succeeded: true
    });
    return { ok: false, status: 500, error: "Unable to start mobile authorization." };
  }
}
