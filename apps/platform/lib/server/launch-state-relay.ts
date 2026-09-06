/**
 * The product's browser-bound launch correlator, relayed through Platform.
 *
 * A product with its own auth authority (Pulse) binds a launch to the browser
 * that started it: before sending the browser here, it stores a secret in an
 * HttpOnly cookie and puts a *correlator* derived from that secret in the launch
 * URL. Platform's only job is to hand the same correlator back on the redirect
 * that carries the one-time handoff, so the product can prove the returning
 * browser is the one that started the launch.
 *
 * Platform treats it as **correlation only, never authorization**:
 *
 *   - it is never read as identity, entitlement, organization, event or product
 *   - it never reaches `authorizeProductLaunch`, so it cannot influence the
 *     locked authorization order in any direction
 *   - it is never stored, never logged, and never compared against anything here
 *   - it is opaque: Platform validates only that it is short and printable enough
 *     to survive a URL round trip, and echoes it back unchanged
 *   - a launch without one still works; the product decides whether to require it
 *
 * The value that travels is deliberately not the product's secret. Pulse sends
 * `SHA-256(nonce)` and keeps `nonce` in its cookie, so a leaked launch URL
 * reveals nothing that would let anyone forge matching browser state.
 */

/**
 * Unreserved URL characters only (RFC 3986 §2.3), bounded length. Anything else
 * is refused rather than sanitised: a correlator that needed escaping would not
 * survive the round trip byte-identical, and byte-identity is the whole point.
 */
const LAUNCH_STATE = /^[A-Za-z0-9._~-]{16,256}$/;

export function isValidLaunchState(value: unknown): value is string {
  return typeof value === "string" && LAUNCH_STATE.test(value);
}

/**
 * The correlator to relay, or null when the caller supplied none.
 *
 * A *malformed* value is rejected by the caller rather than silently dropped, so
 * a product that meant to bind a launch never gets a redirect it will refuse for
 * a reason it cannot see.
 */
export function readLaunchState(raw: string | null): { status: "ABSENT" } | { status: "VALID"; state: string } | { status: "MALFORMED" } {
  if (raw === null || raw === "") return { status: "ABSENT" };
  return isValidLaunchState(raw) ? { status: "VALID", state: raw } : { status: "MALFORMED" };
}
