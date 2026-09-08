import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  MOBILE_OAUTH_LAUNCH_TTL_SECONDS,
  MOBILE_OAUTH_PROVIDER,
  createMobileOAuthLaunchSecrets,
  digestMobileOAuthTicket,
  type MobileOAuthProvider
} from "@/lib/integrations/mobile-oauth/bridge-core";
import { buildMobileOAuthLaunchUrl } from "@/lib/integrations/mobile-oauth/launch-route-core";
import {
  classifyMobileOAuthLaunchException,
  getMobileOAuthLaunchErrorCode,
  getMobileOAuthLaunchHttpStatus,
  logMobileOAuthLaunchDiagnostic,
  logMobileOAuthLaunchPostgrestError,
  sanitizeMobileOAuthLaunchErrorMessage,
  type MobileOAuthLaunchLogger
} from "@/lib/integrations/mobile-oauth/launch-diagnostics";

type MobileOAuthLaunchTicketRow = {
  provider: MobileOAuthProvider;
  user_id: string;
  company_id: string;
  correlation: string;
  force_reconnect: boolean;
};

export async function issueMobileOAuthLaunchTicket(input: {
  request: Pick<Request, "url">;
  userId: string;
  companyId: string;
  provider?: MobileOAuthProvider;
  forceReconnect?: boolean;
  now?: Date;
}) {
  const provider = input.provider ?? MOBILE_OAUTH_PROVIDER;
  const now = input.now ?? new Date();
  const { ticket, correlation } = createMobileOAuthLaunchSecrets();
  const { error } = await createAdminClient().from("mobile_oauth_launch_tickets").insert({
    ticket_digest: digestMobileOAuthTicket(ticket),
    provider,
    user_id: input.userId,
    company_id: input.companyId,
    correlation,
    force_reconnect: input.forceReconnect === true,
    expires_at: new Date(now.getTime() + MOBILE_OAUTH_LAUNCH_TTL_SECONDS * 1000).toISOString()
  });
  if (error) throw new Error("Unable to start mobile authorization.");

  const authorizationUrl = buildMobileOAuthLaunchUrl({ request: input.request, ticket });
  return { authorizationUrl, correlation, provider };
}

export async function consumeMobileOAuthLaunchTicket(input: {
  ticket: string;
  now?: Date;
  logger?: MobileOAuthLaunchLogger;
}): Promise<MobileOAuthLaunchTicketRow | null> {
  const logger = input.logger ?? logMobileOAuthLaunchDiagnostic;
  const ticket = String(input.ticket ?? "");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) {
    logger("warn", {
      stage: "ticket_format_validation",
      safe_error_category: "invalid_ticket",
      supabase_code: null,
      sanitized_message: "Launch ticket format validation failed.",
      http_status: 400,
      ticket_row_matched: false,
      atomic_consumption_succeeded: false,
      binding_validation_succeeded: false
    });
    return null;
  }
  const consumedAt = (input.now ?? new Date()).toISOString();
  try {
    const response = await createAdminClient()
      .from("mobile_oauth_launch_tickets")
      .update({ consumed_at: consumedAt })
      .eq("ticket_digest", digestMobileOAuthTicket(ticket))
      .is("consumed_at", null)
      .gt("expires_at", consumedAt)
      .select("provider, user_id, company_id, correlation, force_reconnect")
      .maybeSingle();
    const { data, error } = response;
    if (error) {
      logMobileOAuthLaunchPostgrestError({
        stage: "ticket_atomic_consumption",
        error,
        httpStatus: response.status,
        ticketRowMatched: null,
        atomicConsumptionSucceeded: false,
        bindingValidationSucceeded: null,
        logger
      });
      return null;
    }
    if (!data) {
      logger("warn", {
        stage: "ticket_atomic_consumption",
        safe_error_category: "ticket_not_found_or_unavailable",
        supabase_code: null,
        sanitized_message: "No unconsumed, unexpired launch ticket row matched.",
        http_status: getMobileOAuthLaunchHttpStatus(null, response.status),
        ticket_row_matched: false,
        atomic_consumption_succeeded: false,
        binding_validation_succeeded: null
      });
      return null;
    }
    logger("info", {
      stage: "ticket_atomic_consumption",
      safe_error_category: "none",
      supabase_code: null,
      sanitized_message: null,
      http_status: getMobileOAuthLaunchHttpStatus(null, response.status),
      ticket_row_matched: true,
      atomic_consumption_succeeded: true,
      binding_validation_succeeded: null
    });
    return data as MobileOAuthLaunchTicketRow;
  } catch (error) {
    logger("error", {
      stage: "ticket_atomic_consumption_exception",
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
}
