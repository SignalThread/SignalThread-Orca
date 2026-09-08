/**
 * Microsoft 365 binding for the shared OAuth callback diagnostics core.
 */
import {
  createOAuthCallbackConsoleLogger,
  createOAuthCallbackDiagnostic,
  createOAuthCallbackProgress,
  emitOAuthCallbackDiagnostic,
  oauthCallbackErrorCode,
  oauthCallbackErrorStatus,
  sanitizeOAuthCallbackMessage,
  type OAuthCallbackDiagnostic,
  type OAuthCallbackLogger,
  type OAuthCallbackProgress,
  type OAuthCallbackSafeErrorCategory
} from "@/lib/integrations/oauth/callback-diagnostics-core";

export type MicrosoftOAuthCallbackSafeErrorCategory = OAuthCallbackSafeErrorCategory;
export type MicrosoftOAuthCallbackProgress = OAuthCallbackProgress;
export type MicrosoftOAuthCallbackDiagnostic = OAuthCallbackDiagnostic;
export type MicrosoftOAuthCallbackLogger = OAuthCallbackLogger;

export const sanitizeMicrosoftOAuthCallbackMessage = sanitizeOAuthCallbackMessage;
export const microsoftCallbackErrorCode = oauthCallbackErrorCode;
export const microsoftCallbackErrorStatus = oauthCallbackErrorStatus;
export const createMicrosoftOAuthCallbackProgress = createOAuthCallbackProgress;
export const createMicrosoftOAuthCallbackDiagnostic = createOAuthCallbackDiagnostic;
export const logMicrosoftOAuthCallbackDiagnostic: MicrosoftOAuthCallbackLogger =
  createOAuthCallbackConsoleLogger("[microsoft-oauth-callback]");

export function emitMicrosoftOAuthCallbackDiagnostic(input: {
  level: "info" | "warn" | "error";
  stage: string;
  safeErrorCategory: MicrosoftOAuthCallbackSafeErrorCategory;
  providerHttpStatus?: unknown;
  providerCode?: unknown;
  message?: unknown;
  progress?: Partial<MicrosoftOAuthCallbackProgress>;
  logger?: MicrosoftOAuthCallbackLogger;
}) {
  emitOAuthCallbackDiagnostic({ ...input, logger: input.logger ?? logMicrosoftOAuthCallbackDiagnostic });
}
