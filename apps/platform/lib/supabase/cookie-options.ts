import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie contract for the Platform Core auth session.
 *
 * The session cookie is deliberately **host-scoped**: no `Domain` attribute is
 * ever set, so a cookie written by `app.signalthread.ai` is not sent to
 * `orca.signalthread.ai`. That is the intended architecture, not an oversight.
 * A parent-domain cookie (`Domain=.signalthread.ai`) would make one session
 * readable by every present and future subdomain, and because `@supabase/ssr`
 * writes the session with `httpOnly: false`, an XSS or subdomain takeover
 * anywhere under the apex would yield a session valid for every product.
 * Cross-product SSO is solved by an explicit handoff instead.
 *
 * `@supabase/ssr` defaults supply `path`, `sameSite`, `httpOnly` and `maxAge`
 * but never `secure`, so that flag is set here.
 */

/**
 * True when this deployment is served over HTTPS.
 *
 * Derived from the app's own configured URL rather than `NODE_ENV` alone, so a
 * local production build served over plain HTTP still receives a usable cookie.
 * Marking a cookie `Secure` on an HTTP origin makes the browser drop it, which
 * would silently break local verification of a production build.
 */
export function isSecureDeployment(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_PLATFORM_APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).protocol === "https:";
    } catch {
      // Malformed value: fall through to the environment check rather than
      // guessing, so a typo cannot silently disable Secure in production.
    }
  }
  return process.env.NODE_ENV === "production";
}

/**
 * Options applied to every Platform auth cookie write and removal.
 *
 * `@supabase/ssr` merges these over its defaults for set *and* remove, so sign-out
 * clears with exactly the scope sign-in wrote.
 */
export function platformAuthCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: isSecureDeployment(),
    // No `domain` key, by design. Its absence is what makes the cookie host-only.
  };
}
