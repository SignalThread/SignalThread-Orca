import "server-only";

/**
 * Apollo OpenAPI defines `apiKey` as header `x-api-key` for dashboard API keys.
 * `bearerAuth` is for OAuth JWT access tokens, not the static key — sending Bearer + API key yields 401.
 */

export function normalizeApolloApiKey(value: string): string {
  let s = String(value ?? "").trim();
  if (s.toLowerCase().startsWith("bearer ")) {
    s = s.slice(7).trim();
  }
  return s;
}

export function apolloJsonRequestHeaders(apiKey: string): Record<string, string> {
  return {
    "X-Api-Key": normalizeApolloApiKey(apiKey),
    "Content-Type": "application/json",
    Accept: "application/json",
    "Cache-Control": "no-cache",
  };
}

/** Non-secret fingerprint for logs (dev / APOLLO_ENRICHMENT_DEBUG=1 only). */
export function fingerprintApolloKey(apiKey: string): { length: number; preview: string } {
  const k = normalizeApolloApiKey(apiKey);
  const length = k.length;
  if (length === 0) return { length: 0, preview: "<empty>" };
  if (length <= 8) return { length, preview: "<redacted>" };
  return { length, preview: `${k.slice(0, 4)}…${k.slice(-4)}` };
}

export function shouldLogApolloEnrichmentAuth(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.APOLLO_ENRICHMENT_DEBUG === "1";
}
