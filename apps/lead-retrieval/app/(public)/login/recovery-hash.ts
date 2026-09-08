export type ParsedRecoveryHash = {
  type: "recovery";
  accessToken: string;
  refreshToken: string;
};

/**
 * Parse a URL fragment (hash) looking for a Supabase password recovery
 * payload of the form `#type=recovery&access_token=...&refresh_token=...`.
 *
 * Returns the parsed tokens when the fragment represents a recovery
 * callback, or `null` otherwise. Never throws. Never logs tokens.
 */
export function parseRecoveryHash(rawHash: string | null | undefined): ParsedRecoveryHash | null {
  if (!rawHash || typeof rawHash !== "string") return null;
  if (rawHash.startsWith("?")) return null;
  const trimmed = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (trimmed.length === 0) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(trimmed);
  } catch {
    return null;
  }

  const type = (params.get("type") ?? "").toLowerCase();
  if (type !== "recovery") return null;

  const accessToken = (params.get("access_token") ?? "").trim();
  const refreshToken = (params.get("refresh_token") ?? "").trim();
  if (!accessToken || !refreshToken) return null;

  return {
    type: "recovery",
    accessToken,
    refreshToken
  };
}

/**
 * Detect whether a URL fragment is _intended_ for recovery, even if it is
 * missing tokens (e.g. expired, or the provider stripped them). Used to
 * decide between showing the reset UI with an error vs. the normal login
 * form.
 */
export function isRecoveryHash(rawHash: string | null | undefined): boolean {
  if (!rawHash || typeof rawHash !== "string") return false;
  if (rawHash.startsWith("?")) return false;
  const trimmed = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (trimmed.length === 0) return false;
  try {
    const params = new URLSearchParams(trimmed);
    return (params.get("type") ?? "").toLowerCase() === "recovery";
  } catch {
    return false;
  }
}
