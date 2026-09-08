/** Apollo REST API base (v1). */
export const APOLLO_API_BASE = "https://api.apollo.io/api/v1";

/**
 * Stored in `integrations.provider_account_id` when the last connection test failed
 * (enrichment providers: Apollo, etc.). Successful setup or test clears this to null.
 */
export const INTEGRATION_CONNECTION_ERROR_MARKER = "connection_error";
