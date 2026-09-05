/**
 * Product catalogue helpers: where each product app lives, and where a launch
 * lands inside it.
 *
 * Deliberately NOT marked `server-only`. These functions hold no secret -- they
 * read a base URL and build a relative path -- and keeping them importable makes
 * them directly testable. Everything that touches the service-role key lives in
 * `handoff.ts`, which is `server-only`.
 *
 * Registration, Housing and Lead Retrieval extend the two tables below; no
 * authorization or handoff code changes for a new product.
 *
 * Pulse is registered with a base URL but deliberately no product-local return
 * path: it has no `/platform-entry` equivalent yet, so a launch lands on its root
 * via the default below. Give it a path when that entry point exists.
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
};

export function getProductAppUrl(productKey: string): string | null {
  for (const name of PRODUCT_APP_URL_ENV[productKey] ?? []) {
    const configured = process.env[name]?.trim();
    if (configured) return configured.replace(/\/$/, "");
  }
  return null;
}

/**
 * The product-local continuation path.
 *
 * Event context travels **separately from authentication**: a relative path on
 * the product's own origin, carrying no authority. The product re-validates the
 * event against the session it just created.
 */
export function buildProductReturnPath(productKey: string, eventId: string): string {
  if (productKey === "orca") {
    return `/platform-entry?event_id=${encodeURIComponent(eventId)}`;
  }
  return "/";
}
