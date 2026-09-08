/**
 * Google Workspace binding for the shared OAuth callback diagnostics core.
 */
import {
  createOAuthCallbackConsoleLogger,
  createOAuthCallbackDiagnostic,
  createOAuthCallbackProgress,
  emitOAuthCallbackDiagnostic,
  oauthCallbackErrorCode,
  oauthCallbackErrorStatus,
  safeOAuthCallbackCode,
  safeOAuthCallbackHttpStatus,
  sanitizeOAuthCallbackMessage,
  type OAuthCallbackDiagnostic,
  type OAuthCallbackLogger,
  type OAuthCallbackProgress,
  type OAuthCallbackSafeErrorCategory
} from "@/lib/integrations/oauth/callback-diagnostics-core";

export type GoogleOAuthCallbackSafeErrorCategory = OAuthCallbackSafeErrorCategory;
export type GoogleOAuthCallbackProgress = OAuthCallbackProgress;
export type GoogleOAuthCallbackDiagnostic = OAuthCallbackDiagnostic;
export type GoogleOAuthCallbackLogger = OAuthCallbackLogger;

export const sanitizeGoogleOAuthCallbackMessage = sanitizeOAuthCallbackMessage;
export const safeGoogleOAuthCallbackCode = safeOAuthCallbackCode;
export const safeGoogleOAuthCallbackHttpStatus = safeOAuthCallbackHttpStatus;
export const callbackErrorCode = oauthCallbackErrorCode;
export const callbackErrorStatus = oauthCallbackErrorStatus;
export const createGoogleOAuthCallbackProgress = createOAuthCallbackProgress;
export const createGoogleOAuthCallbackDiagnostic = createOAuthCallbackDiagnostic;
export const logGoogleOAuthCallbackDiagnostic: GoogleOAuthCallbackLogger =
  createOAuthCallbackConsoleLogger("[google-oauth-callback]");

export function emitGoogleOAuthCallbackDiagnostic(input: {
  level: "info" | "warn" | "error";
  stage: string;
  safeErrorCategory: GoogleOAuthCallbackSafeErrorCategory;
  providerHttpStatus?: unknown;
  providerCode?: unknown;
  message?: unknown;
  progress?: Partial<GoogleOAuthCallbackProgress>;
  logger?: GoogleOAuthCallbackLogger;
}) {
  emitOAuthCallbackDiagnostic({ ...input, logger: input.logger ?? logGoogleOAuthCallbackDiagnostic });
}
