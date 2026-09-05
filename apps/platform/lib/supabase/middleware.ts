import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAuthConfig } from "./config";
import { platformAuthCookieOptions } from "./cookie-options";

/** Paths reachable without a session. Everything else fails closed. */
const PUBLIC_PATHS = ["/signin", "/auth/callback", "/signout"];

/**
 * The handoff claim endpoint is authenticated by the one-time token in its body,
 * not by a Platform session: it is called server-to-server by a product app that
 * holds no Platform cookie. It is the only /api/launch path without a session.
 */
const CLAIM_PATH = /^\/api\/launch\/[a-z0-9-]+\/claim$/;

function isPublicPath(pathname: string): boolean {
  if (CLAIM_PATH.test(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresh the Platform Core session and gate private routes.
 *
 * `getUser()` is used rather than `getSession()` because it verifies the token
 * with the auth server; a forged or expired cookie must not be treated as a
 * session. An unverifiable session is therefore a redirect to /signin, never an
 * assumed identity.
 */
export async function updatePlatformSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  let config;
  try {
    config = requirePlatformAuthConfig();
  } catch {
    // Auth is not configured. Fail closed for private routes rather than
    // rendering an authenticated shell that cannot verify anyone.
    if (isPublicPath(request.nextUrl.pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("error", "auth_not_configured");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookieOptions: platformAuthCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    // Carry the intended destination so sign-in can return the user to it.
    if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // A signed-in user has no reason to sit on the sign-in page.
  if (user && pathname === "/signin") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
