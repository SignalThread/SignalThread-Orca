import { NextResponse } from "next/server";
import { authorizeGoogleWorkspaceAdmin } from "@/lib/integrations/google/authorization";
import {
  consumeGoogleOAuthNonce,
  saveGoogleWorkspaceConnection
} from "@/lib/integrations/google/connection-service";
import {
  exchangeGoogleAuthorizationCode,
  verifyGoogleIdToken
} from "@/lib/integrations/google/oauth-client";
import {
  GOOGLE_OAUTH_PKCE_COOKIE,
  verifyGoogleOAuthState,
  type GoogleOAuthStatePayload
} from "@/lib/integrations/google/oauth-state";
import {
  getGoogleWorkspaceCapabilities,
  normalizeGrantedGoogleScopes
} from "@/lib/integrations/google/scopes";
import {
  buildGoogleOAuthResultUrl,
  buildGoogleOAuthResultUrlForState
} from "@/lib/integrations/google/redirect";
import {
  callbackErrorCode,
  callbackErrorStatus,
  createGoogleOAuthCallbackProgress,
  emitGoogleOAuthCallbackDiagnostic,
  logGoogleOAuthCallbackDiagnostic,
  type GoogleOAuthCallbackProgress,
  type GoogleOAuthCallbackSafeErrorCategory
} from "@/lib/integrations/google/oauth-callback-diagnostics";

export const runtime = "nodejs";

function logGoogleGrantedScopes(input: { scopeResponsePresent: boolean; scopes: string[] }) {
  if (process.env.NODE_ENV === "production") return;
  const capabilities = getGoogleWorkspaceCapabilities(input.scopes);
  console.info("[google/callback]", {
    code: "GOOGLE_SCOPE_GRANT",
    scopeResponsePresent: input.scopeResponsePresent,
    grantedScopeCount: input.scopes.length,
    gmailSendGranted: capabilities.gmailSend,
    calendarEventsOwnedGranted: capabilities.calendarEventsOwned,
    calendarFreeBusyGranted: capabilities.calendarFreeBusy
  });
}

function redirectWithResult(
  request: Request,
  target: string | GoogleOAuthStatePayload,
  result: string,
  progress: GoogleOAuthCallbackProgress
) {
  let url: URL;
  try {
    url =
      typeof target === "string"
        ? buildGoogleOAuthResultUrl(request, target, result)
        : buildGoogleOAuthResultUrlForState(request, target, result);
  } catch (error) {
    emitGoogleOAuthCallbackDiagnostic({
      level: "error",
      stage: "final_mobile_redirect",
      safeErrorCategory: "redirect_failed",
      providerCode: callbackErrorCode(error),
      providerHttpStatus: callbackErrorStatus(error),
      message: error,
      progress
    });
    throw error;
  }
  if (typeof target !== "string" && target.channel === "mobile") {
    emitGoogleOAuthCallbackDiagnostic({
      level: "info",
      stage: "final_mobile_redirect",
      safeErrorCategory: "none",
      progress
    });
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_OAUTH_PKCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/google/callback",
    maxAge: 0
  });
  return response;
}

export async function GET(request: Request) {
  const progress = createGoogleOAuthCallbackProgress();
  const log = (
    level: "info" | "warn" | "error",
    stage: string,
    safeErrorCategory: GoogleOAuthCallbackSafeErrorCategory,
    details: { providerHttpStatus?: unknown; providerCode?: unknown; message?: unknown } = {}
  ) =>
    emitGoogleOAuthCallbackDiagnostic({
      level,
      stage,
      safeErrorCategory,
      ...details,
      progress,
      logger: logGoogleOAuthCallbackDiagnostic
    });
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) {
    progress.state_validation_succeeded = false;
    log("warn", "state_verification", "invalid_state", { message: "OAuth state was not present." });
    return redirectWithResult(request, "/exhibitor/integrations/google-workspace", "invalid_state", progress);
  }

  let payload;
  try {
    payload = verifyGoogleOAuthState(state);
    progress.state_validation_succeeded = true;
    log("info", "state_verification", "none");
  } catch (error) {
    progress.state_validation_succeeded = false;
    log("warn", "state_verification", "invalid_state", {
      providerCode: callbackErrorCode(error),
      providerHttpStatus: callbackErrorStatus(error),
      message: error
    });
    return redirectWithResult(request, "/exhibitor/integrations/google-workspace", "invalid_state", progress);
  }

  if (payload.channel !== "mobile") {
    const authorization = await authorizeGoogleWorkspaceAdmin();
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
    .find((part) => part.startsWith(`${GOOGLE_OAUTH_PKCE_COOKIE}=`))
    ?.slice(GOOGLE_OAUTH_PKCE_COOKIE.length + 1);
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

  const consumedReturnTo = await consumeGoogleOAuthNonce({
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
      message: url.searchParams.get("error_description") ?? "Google authorization was denied."
    });
    return redirectWithResult(request, payload, "access_denied", progress);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    log("warn", "authorization_code_presence", "missing_authorization_code", {
      message: "Google did not return an authorization code."
    });
    return redirectWithResult(request, payload, "missing_code", progress);
  }

  let stage = "google_code_exchange";
  let safeErrorCategory: GoogleOAuthCallbackSafeErrorCategory = "provider_unavailable";
  let tokenFailure:
    | { httpStatus: number; providerError?: string; providerDescription?: string }
    | undefined;
  try {
    const tokenResult = await exchangeGoogleAuthorizationCode({
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
      throw new Error("Google authorization code exchange failed.");
    }
    log("info", "google_code_exchange", "none", { providerHttpStatus: tokenResult.status });
    stage = "google_token_response_validation";
    safeErrorCategory = "invalid_token_response";
    if (!tokenResult.payload.access_token || !tokenResult.payload.id_token) {
      progress.token_response_validation_succeeded = false;
      tokenFailure = {
        httpStatus: tokenResult.status,
        providerError: tokenResult.payload.error,
        providerDescription: tokenResult.payload.error_description
      };
      throw new Error("Google token response was missing required credentials.");
    }
    progress.token_response_validation_succeeded = true;
    log("info", "google_token_response_validation", "none", {
      providerHttpStatus: tokenResult.status
    });
    stage = "google_id_token_verification";
    safeErrorCategory = "invalid_identity";
    const identity = await verifyGoogleIdToken(tokenResult.payload.id_token);
    log("info", "google_id_token_verification", "none");
    progress.subject_account_binding_succeeded = true;
    log("info", "google_subject_account_binding", "none");
    const scopeResponsePresent = typeof tokenResult.payload.scope === "string";
    // Google documents the token response scope field as the source of truth
    // for granted permissions. An absent field is intentionally treated as an
    // unverified/partial grant, never as every scope we requested.
    const grantedScopes = normalizeGrantedGoogleScopes(tokenResult.payload.scope ?? "");
    logGoogleGrantedScopes({ scopeResponsePresent, scopes: grantedScopes });
    stage = "connection_persistence";
    safeErrorCategory = "persistence_failed";
    await saveGoogleWorkspaceConnection({
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
    const capabilities = getGoogleWorkspaceCapabilities(grantedScopes);
    return redirectWithResult(
      request,
      payload,
      capabilities.calendarFreeBusy ? "connected" : "permission_required",
      progress
    );
  } catch (error) {
    log("error", stage, safeErrorCategory, {
      providerHttpStatus: tokenFailure?.httpStatus ?? callbackErrorStatus(error),
      providerCode: tokenFailure?.providerError ?? callbackErrorCode(error),
      message: tokenFailure?.providerDescription ?? error
    });
    return redirectWithResult(request, payload, "connection_failed", progress);
  }
}
