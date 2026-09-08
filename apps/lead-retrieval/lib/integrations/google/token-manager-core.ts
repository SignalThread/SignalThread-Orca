/**
 * Google Workspace binding for the shared provider OAuth token engine.
 *
 * The refresh lifecycle itself lives in `lib/integrations/oauth/token-manager-core`
 * and is shared with every other integration OAuth provider. This module only
 * keeps the Google-facing names stable for existing callers.
 */
export {
  PROVIDER_TOKEN_EXPIRY_BUFFER_MS as GOOGLE_TOKEN_EXPIRY_BUFFER_MS,
  PROVIDER_REFRESH_LEASE_MS as GOOGLE_REFRESH_LEASE_MS,
  ProviderTokenManagerStageError as GoogleTokenManagerStageError,
  getValidProviderAccessTokenWithDeps as getValidGoogleAccessTokenWithDeps
} from "@/lib/integrations/oauth/token-manager-core";

export type {
  ProviderTokenFailureStage as GoogleTokenFailureStage,
  ProviderTokenFailureCategory as GoogleTokenFailureCategory,
  ProviderTokenConnection as GoogleTokenConnection,
  ProviderRefreshResult as GoogleRefreshResult,
  ProviderTokenManagerDeps as GoogleTokenManagerDeps,
  ProviderTokenManagerResult as GoogleTokenManagerResult
} from "@/lib/integrations/oauth/token-manager-core";
