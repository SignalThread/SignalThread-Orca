import { isValidLaunchState } from "./launch-state-relay";

/**
 * Product catalogue helpers: where each product app lives, how a launch enters
 * it, and where a launch lands inside it.
 *
 * Deliberately NOT marked `server-only`. These functions hold no secret -- they
 * read a base URL and build paths -- and keeping them importable makes them
 * directly testable. Everything that touches the service-role key lives in
 * `handoff.ts`, which is `server-only`.
 *
 * Registration and Housing extend the tables below the same way Lead Retrieval
 * did; no authorization or handoff code changes for a new product.
 */

/**
 * Env var names per product, most specific first.
 *
 * The server-only name is preferred: a product's base URL is only needed on the
 * server, and `NEXT_PUBLIC_*` values are statically inlined at compile time,
 * which makes them awkward to vary per environment. The public name remains a
 * fallback so existing deployments keep working.
 */
const PRODUCT_APP_URL_ENV: Record<string, readonly string[]> = {
  orca: ["ORCA_APP_URL", "NEXT_PUBLIC_ORCA_APP_URL"],
  pulse: ["PULSE_APP_URL", "NEXT_PUBLIC_PULSE_APP_URL"],
  "lead-retrieval": ["LEAD_RETRIEVAL_APP_URL", "NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL"],
};

/**
 * Which authentication authority a product runs on. This decides how the
 * one-time handoff token is consumed:
 *
 *   "platform-core"  The product authenticates against Platform Core's own
 *                    Supabase Auth project. It exchanges the token itself, with
 *                    the anon key, at its `/auth/callback`, and the resulting
 *                    session *is* the Platform identity. (Orca.)
 *
 *   "own"            The product owns a separate Supabase Auth project and must
 *                    never hold a Platform Core session. It hands the token back
 *                    to Platform's claim endpoint, which verifies it and returns
 *                    the canonical user/organization/event; the product then
 *                    establishes a session in its own authority for its own
 *                    mapped user. (Pulse.)
 */
export type ProductAuthAuthority = "platform-core" | "own";

const PRODUCT_AUTH_AUTHORITY: Record<string, ProductAuthAuthority> = {
  orca: "platform-core",
  pulse: "own",
  // Lead Retrieval runs its own Supabase Auth project (signalthread-lead-retrieval)
  // and claims the handoff back through Platform, exactly like Pulse.
  "lead-retrieval": "own",
};

export function getProductAppUrl(productKey: string): string | null {
  for (const name of PRODUCT_APP_URL_ENV[productKey] ?? []) {
    const configured = process.env[name]?.trim();
    if (configured) return configured.replace(/\/$/, "");
  }
  return null;
}

export function getProductAuthAuthority(productKey: string): ProductAuthAuthority | null {
  return PRODUCT_AUTH_AUTHORITY[productKey] ?? null;
}

/**
 * The product-local continuation path.
 *
 * Event context travels **separately from authentication**: a relative path on
 * the product's own origin, carrying no authority. The product re-validates the
 * event against the session it just created (Orca), or has Platform re-derive
 * the whole canonical context from the token at claim time (Pulse).
 */
export function buildProductReturnPath(productKey: string, eventId: string): string {
  if (productKey === "orca" || productKey === "pulse" || productKey === "lead-retrieval") {
    return `/platform-entry?event_id=${encodeURIComponent(eventId)}`;
  }
  return "/";
}

/** Only a same-origin relative path may be handed to a product. */
export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !/^\/[\\]/.test(path);
}

/**
 * The absolute URL the browser is sent to with the one-time token.
 *
 * Built here, by Platform, from the validated event -- never from anything the
 * request supplied -- so Supabase's redirect allowlist is not involved and no
 * caller can choose where a freshly minted credential lands.
 *
 *   platform-core authority:  {app}/auth/callback?token_hash=…&type=magiclink&next={returnPath}
 *   own authority:            {app}/platform-entry?handoff=…&event_id=…[&state=…]
 *
 * `launchState` is the product's own browser-bound correlator, echoed back
 * unchanged so the product can prove the returning browser started the launch.
 * It is relayed for own-authority products only: a platform-core product shares
 * this app's auth authority and has no separate browser binding to correlate.
 * Platform never interprets it -- see `launch-state-relay.ts`.
 *
 * Returns null when the product is unknown, the return path is unsafe, or a
 * relayed correlator is not a valid opaque value.
 */
export function buildProductHandoffUrl(input: {
  productKey: string;
  appUrl: string;
  hashedToken: string;
  eventId: string;
  launchState?: string | null;
}): string | null {
  const authority = getProductAuthAuthority(input.productKey);
  if (!authority) return null;

  const launchState = input.launchState ?? null;
  if (launchState !== null && !isValidLaunchState(launchState)) return null;

  if (authority === "own") {
    const url = new URL(`${input.appUrl}/platform-entry`);
    url.searchParams.set("handoff", input.hashedToken);
    url.searchParams.set("event_id", input.eventId);
    if (launchState !== null) url.searchParams.set("state", launchState);
    return url.toString();
  }

  const returnPath = buildProductReturnPath(input.productKey, input.eventId);
  if (!isSafeReturnPath(returnPath)) return null;
  const url = new URL(`${input.appUrl}/auth/callback`);
  url.searchParams.set("token_hash", input.hashedToken);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", returnPath);
  return url.toString();
}
