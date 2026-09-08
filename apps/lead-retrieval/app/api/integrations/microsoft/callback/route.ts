import { NextResponse } from "next/server";
import { authorizeIntegrationConnectionAdmin } from "@/lib/integrations/oauth/authorization";
import {
  consumeMicrosoftOAuthNonce,
  saveMicrosoft365Connection
} from "@/lib/integrations/microsoft/connection-service";
import {
  exchangeMicrosoftAuthorizationCode,
  fetchMicrosoftIdentity
} from "@/lib/integrations/microsoft/oauth-client";
import {
  verifyMicrosoftOAuthState,
  type MicrosoftOAuthStatePayload
} from "@/lib/integrations/microsoft/oauth-state";
import {
  MICROSOFT_365_MANAGE_PATH,
  MICROSOFT_OAUTH_PKCE_COOKIE
} from "@/lib/integrations/microsoft/provider";
import { MICROSOFT_OAUTH_CALLBACK_PATH } from "@/lib/integrations/mobile-oauth/middleware-policy";
import {
  getMicrosoft365Capabilities,
  normalizeGrantedMicrosoft365Scopes
} from "@/lib/integrations/microsoft/scopes";
import {
  buildMicrosoftOAuthResultUrl,
  buildMicrosoftOAuthResultUrlForState
} from "@/lib/integrations/microsoft/redirect";
import {
  createMicrosoftOAuthCallbackProgress,
  emitMicrosoftOAuthCallbackDiagnostic,
  logMicrosoftOAuthCallbackDiagnostic,
  microsoftCallbackErrorCode,
  microsoftCallbackErrorStatus,
  type MicrosoftOAuthCallbackProgress,
  type MicrosoftOAuthCallbackSafeErrorCategory
} from "@/lib/integrations/microsoft/oauth-callback-diagnostics";

export const runtime = "nodejs";

function logMicrosoftGrantedScopes(input: { scopeResponsePresent: boolean; scopes: string[] }) {
  if (process.env.NODE_ENV === "production") return;
  const capabilities = getMicrosoft365Capabilities(input.scopes);
  console.info("[microsoft/callback]", {
    code: "MICROSOFT_SCOPE_GRANT",
    scopeResponsePresent: input.scopeResponsePresent,
    grantedScopeCount: input.scopes.length,
    mailSendGranted: capabilities.mailSend,
    calendarReadWriteGranted: capabilities.calendarReadWrite
  });
}

function redirectWithResult(
  request: Request,
  target: string | MicrosoftOAuthStatePayload,
  result: string,
  progress: MicrosoftOAuthCallbackProgress
) {
  let url: URL;
  try {
    url =
      typeof target === "string"
        ? buildMicrosoftOAuthResultUrl(request, target, result)
        : buildMicrosoftOAuthResultUrlForState(request, target, result);
  } catch (error) {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "error",
      stage: "final_mobile_redirect",
      safeErrorCategory: "redirect_failed",
      providerCode: microsoftCallbackErrorCode(error),
      providerHttpStatus: microsoftCallbackErrorStatus(error),
      message: error,
      progress
    });
    throw error;
  }
  if (typeof target !== "string" && target.channel === "mobile") {
    emitMicrosoftOAuthCallbackDiagnostic({
      level: "info",
      stage: "final_mobile_redirect",
      safeErrorCategory: "none",
      progress
    });
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(MICROSOFT_OAUTH_PKCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: MICROSOFT_OAUTH_CALLBACK_PATH,
    maxAge: 0
  });
  return response;
}

export async function GET(request: Request) {
  const progress = createMicrosoftOAuthCallbackProgress();
  const log = (
    level: "info" | "warn" | "error",
    stage: string,
    safeErrorCategory: MicrosoftOAuthCallbackSafeErrorCategory,
    details: { providerHttpStatus?: unknown; providerCode?: unknown; message?: unknown } = {}
  ) =>
    emitMicrosoftOAuthCallbackDiagnostic({
      level,
      stage,
      safeErrorCategory,
      ...details,
      progress,
      logger: logMicrosoftOAuthCallbackDiagnostic
    });
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) {
    progress.state_validation_succeeded = false;
    log("warn", "state_verification", "invalid_state", { message: "OAuth state was not present." });
    return redirectWithResult(request, MICROSOFT_365_MANAGE_PATH, "invalid_state", progress);
  }

  let payload;
  try {
    // The state is signed with a Microsoft-scoped key and carries the provider,
    // so a state minted for another provider can never verify here.
    payload = verifyMicrosoftOAuthState(state);
    progress.state_validation_succeeded = true;
    log("info", "state_verification", "none");
  } catch (error) {
    progress.state_validation_succeeded = false;
    log("warn", "state_verification", "invalid_state", {
      providerCode: microsoftCallbackErrorCode(error),
      providerHttpStatus: microsoftCallbackErrorStatus(error),
      message: error
    });
    return redirectWithResult(request, MICROSOFT_365_MANAGE_PATH, "invalid_state", progress);
  }

  if (payload.channel !== "mobile") {
    const authorization = await authorizeIntegrationConnectionAdmin();
    if (
      !authorization.ok ||
      authorization.context.userId !== payload.userId ||
      authorization.context.companyId !== payload.companyId
    ) {
      log("warn", "session_binding", "session_mismatch", { message: "OAuth session binding failed." });
      return redirectWithResult(request, payload, "session_mismatch", progress);
    }
  }

  const pkceVerifier = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${MICROSOFT_OAUTH_PKCE_COOKIE}=`))
    ?.slice(MICROSOFT_OAUTH_PKCE_COOKIE.length + 1);
  if (!pkceVerifier) {
    progress.pkce_validation_succeeded = false;
    log("warn", "pkce_cookie_validation", "invalid_pkce", {
      message: "The OAuth PKCE cookie was not present."
    });
    return redirectWithResult(request, payload, "invalid_state", progress);
  }
  progress.pkce_validation_succeeded = true;
  log("info", "pkce_cookie_validation", "none");

  let decodedPkceVerifier: string;
  try {
    decodedPkceVerifier = decodeURIComponent(pkceVerifier);
  } catch (error) {
    progress.pkce_validation_succeeded = false;
    log("error", "pkce_cookie_validation", "invalid_pkce", { message: error });
    throw error;
  }

  // Single-use: the nonce row is consumed atomically, bound to this user,
  // company and PKCE verifier, before the authorization code is ever exchanged.
  const consumedReturnTo = await consumeMicrosoftOAuthNonce({
    jti: payload.jti,
    userId: payload.userId,
    companyId: payload.companyId,
    codeVerifier: decodedPkceVerifier
  });
  if (!consumedReturnTo || consumedReturnTo !== payload.returnTo) {
    progress.nonce_validation_succeeded = false;
    log("warn", "nonce_lookup_and_consumption", "nonce_unavailable", {
      message: "No matching unconsumed OAuth nonce was returned."
    });
    return redirectWithResult(request, payload, "invalid_state", progress);
  }
  progress.nonce_validation_succeeded = true;
  log("info", "nonce_lookup_and_consumption", "none");

  if (url.searchParams.get("error")) {
    log("warn", "provider_authorization", "provider_denied", {
      providerCode: url.searchParams.get("error"),
      message: url.searchParams.get("error_description") ?? "Microsoft authorization was denied."
    });
    return redirectWithResult(request, payload, "access_denied", progress);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    log("warn", "authorization_code_presence", "missing_authorization_code", {
      message: "Microsoft did not return an authorization code."
    });
    return redirectWithResult(request, payload, "missing_code", progress);
  }

  let stage = "microsoft_code_exchange";
  let safeErrorCategory: MicrosoftOAuthCallbackSafeErrorCategory = "provider_unavailable";
  let tokenFailure:
    | { httpStatus: number; providerError?: string; providerDescription?: string }
    | undefined;
  try {
    const tokenResult = await exchangeMicrosoftAuthorizationCode({
      code,
      codeVerifier: decodedPkceVerifier
    });
    progress.token_exchange_succeeded = tokenResult.ok;
    if (!tokenResult.ok) {
      tokenFailure = {
        httpStatus: tokenResult.status,
        providerError: tokenResult.payload.error,
        providerDescription: tokenResult.payload.error_description
      };
      safeErrorCategory = tokenResult.status >= 500 ? "provider_unavailable" : "provider_rejected";
      throw new Error("Microsoft authorization code exchange failed.");
    }
    log("info", "microsoft_code_exchange", "none", { providerHttpStatus: tokenResult.status });
    stage = "microsoft_token_response_validation";
    safeErrorCategory = "invalid_token_response";
    if (!tokenResult.payload.access_token) {
      progress.token_response_validation_succeeded = false;
      tokenFailure = {
        httpStatus: tokenResult.status,
        providerError: tokenResult.payload.error,
        providerDescription: tokenResult.payload.error_description
      };
      throw new Error("Microsoft token response was missing required credentials.");
    }
    progress.token_response_validation_succeeded = true;
    log("info", "microsoft_token_response_validation", "none", {
      providerHttpStatus: tokenResult.status
    });
    stage = "microsoft_graph_identity_verification";
    safeErrorCategory = "invalid_identity";
    const identity = await fetchMicrosoftIdentity({ accessToken: tokenResult.payload.access_token });
    log("info", "microsoft_graph_identity_verification", "none");
    progress.subject_account_binding_succeeded = true;
    log("info", "microsoft_subject_account_binding", "none");
    const scopeResponsePresent = typeof tokenResult.payload.scope === "string";
    // Microsoft documents the token response scope field as the source of truth
    // for granted permissions. An absent field is intentionally treated as an
    // unverified/partial grant, never as every scope we requested.
    const grantedScopes = normalizeGrantedMicrosoft365Scopes(tokenResult.payload.scope ?? "");
    logMicrosoftGrantedScopes({ scopeResponsePresent, scopes: grantedScopes });
    stage = "connection_persistence";
    safeErrorCategory = "persistence_failed";
    await saveMicrosoft365Connection({
      userId: payload.userId,
      companyId: payload.companyId,
      identity,
      accessToken: tokenResult.payload.access_token,
      refreshToken: tokenResult.payload.refresh_token,
      expiresIn: tokenResult.payload.expires_in,
      scopes: grantedScopes,
      tokenType: tokenResult.payload.token_type
    });
    progress.encryption_succeeded = true;
    progress.persistence_succeeded = true;
    log("info", "connection_persistence", "none");
    const capabilities = getMicrosoft365Capabilities(grantedScopes);
    return redirectWithResult(
      request,
      payload,
      capabilities.mailSend && capabilities.calendarReadWrite ? "connected" : "permission_required",
      progress
    );
  } catch (error) {
    log("error", stage, safeErrorCategory, {
      providerHttpStatus: tokenFailure?.httpStatus ?? microsoftCallbackErrorStatus(error),
      providerCode: tokenFailure?.providerError ?? microsoftCallbackErrorCode(error),
      message: tokenFailure?.providerDescription ?? error
    });
    return redirectWithResult(request, payload, "connection_failed", progress);
  }
}
