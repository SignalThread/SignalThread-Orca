/**
 * Maps ZoomInfo HTTP status codes to stable operator-facing messages.
 * Response body may include JSON:API errors with `detail` (appended when present).
 */
export function extractZoomInfoErrorDetail(body: unknown): string | null {
  const rec = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const errors = rec?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (!first || typeof first !== "object") return null;
  const detail = (first as Record<string, unknown>).detail;
  return typeof detail === "string" && detail.trim() ? detail.trim() : null;
}

export function mapZoomInfoHttpError(status: number, body: unknown): string {
  const detail = extractZoomInfoErrorDetail(body);
  const suffix = detail ? ` ${detail}` : "";

  switch (status) {
    case 401:
      return `ZoomInfo authentication failed (401).${suffix}`;
    case 403:
      return `ZoomInfo forbidden — check API scopes and account access (403).${suffix}`;
    case 429:
      return `ZoomInfo rate limit exceeded (429).${suffix}`;
    default:
      if (status >= 500) {
        return `ZoomInfo server error (${status}).${suffix}`;
      }
      return `ZoomInfo request failed (${status}).${suffix}`;
  }
}
