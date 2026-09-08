import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { Database } from "@/types/database";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { getRoleHomePath, normalizeSessionRole } from "@/lib/auth/session-role";
import { isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess } from "@/lib/licenses/exhibitor-company-license-admin-eligibility";
import { isExhibitorMultiEventAdminPathAllowed } from "@/lib/admin/exhibitor-admin-paths";
import { selectLatestCompanyScopedLicense } from "@/lib/server/company-scoped-license-select";
import {
  isE2eAuthBypassApiPath,
  isE2eAuthBypassRuntimeEnabled
} from "@/lib/e2e/e2e-auth-bypass-policy";
import {
  isAppleReviewLoginApiPath,
  isAppleReviewLoginRuntimeEnabled
} from "@/lib/auth/apple-review-login-policy";
import { isLeadRetrievalInternalHealthPath } from "@/lib/internal-health/lead-retrieval/paths";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import { isOAuthBrowserHandoffRequest } from "@/lib/integrations/mobile-oauth/middleware-policy";
import { buildRequestHeadersWithCurrentCookies } from "@/lib/supabase/route-auth";

const INTERNAL_WORKFLOW_TICK_PATH = "/api/internal/workflow-tick";

/** Public URLs from /public, Next metadata, or common CDN-style roots — anon access, no OTP/login changes elsewhere. */
function isAnonymousPublicBrowserAssetPath(pathname: string): boolean {
  if (pathname === "/logo.png" || pathname === "/app-store-badge.png") return true;

  const lower = pathname.toLowerCase();
  if (lower === "/icons" || lower.startsWith("/icons/")) return true;
  if (lower === "/favicon.ico" || lower.startsWith("/favicon/")) return true;
  if (lower === "/icon" || lower.startsWith("/icon/")) return true;

  return /\.(?:png|jpe?g|svg|webp|ico)$/i.test(pathname);
}

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

export async function updateSession(request: NextRequest) {
  assertSupabaseEnv();
  const { pathname } = request.nextUrl;
  const isDevBypass = request.headers.get("x-dev-bypass") === "true";
  const isApiRoute = pathname.startsWith("/api/");
  const authorizationHeader = request.headers.get("authorization");
  const hasBearerAuth = /^Bearer\s+.+$/i.test(String(authorizationHeader ?? ""));
  if (isOAuthBrowserHandoffRequest({ pathname, method: request.method })) {
    return NextResponse.next();
  }
  if (isApiRoute && isDevBypass && process.env.NODE_ENV === "development") {
    console.log("[middleware/updateSession] api dev bypass", { pathname });
    return NextResponse.next();
  }
  if (isApiRoute && hasBearerAuth) {
    console.log("[middleware/updateSession] api bearer auth passthrough", { pathname });
    return NextResponse.next();
  }

  if (isApiRoute && pathname === INTERNAL_WORKFLOW_TICK_PATH) {
    console.log("[middleware/updateSession] internal workflow tick passthrough", { pathname });
    return NextResponse.next();
  }

  if (isApiRoute && isLeadRetrievalInternalHealthPath(pathname)) {
    console.log("[middleware/updateSession] internal health passthrough", { pathname });
    return NextResponse.next();
  }

  if (isApiRoute && isE2eAuthBypassApiPath(pathname) && isE2eAuthBypassRuntimeEnabled()) {
    return NextResponse.next();
  }

  if (isApiRoute && isAppleReviewLoginApiPath(pathname) && isAppleReviewLoginRuntimeEnabled()) {
    return NextResponse.next();
  }

  const isSalesforceAdminSurface =
    pathname === "/admin/integrations/salesforce" ||
    pathname.startsWith("/admin/integrations/salesforce/");
  const isZapierAdminSurface =
    pathname === "/admin/integrations/zapier" ||
    pathname.startsWith("/admin/integrations/zapier/");
  const requestHeaders = new Headers(request.headers);
  if (isSalesforceAdminSurface || isZapierAdminSurface) {
    requestHeaders.set("x-admin-integration-surface", "1");
  }
  if (isSalesforceAdminSurface) {
    requestHeaders.set("x-admin-salesforce-surface", "1");
  }

  const createPassThroughResponse = () => NextResponse.next({
    request: {
      headers: buildRequestHeadersWithCurrentCookies(request, requestHeaders)
    }
  });
  let response = createPassThroughResponse();

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          if (value) {
            request.cookies.set({ name, value, ...options });
          } else {
            request.cookies.delete(name);
          }
        });
        // Supabase may have rotated the session above. Forward the mutated
        // Cookie header to this request's route handler as well as returning
        // Set-Cookie to the browser, so the handler cannot reuse a stale
        // one-time refresh token.
        response = createPassThroughResponse();
        cookiesToSet.forEach(({ name, value, options }) => {
          if (value) {
            response.cookies.set({ name, value, ...options });
          } else {
            response.cookies.delete(name);
          }
        });
      }
    }
  });

  const withResponseCookies = (target: NextResponse) => {
    copyCookies(response, target);
    return target;
  };

  const redirectWithResponseCookies = (path: string) =>
    withResponseCookies(NextResponse.redirect(buildBrowserFacingUrl(request, path)));

  const jsonWithResponseCookies = (body: unknown, init?: ResponseInit) =>
    withResponseCookies(NextResponse.json(body, init));

  const isLoginRoute = pathname === "/login";
  const isAuthRoute = pathname.startsWith("/auth/");
  const isStaticRoute = pathname.startsWith("/_next/");
  const isPublicAssetPath = isAnonymousPublicBrowserAssetPath(pathname);
  const isPublicRoute = isLoginRoute || isAuthRoute;
  const isAdminRoute = pathname.startsWith("/admin");
  const isOrganizerRoute = pathname.startsWith("/app/organizer") || pathname.startsWith("/organizer");
  const isExhibitorRoute = pathname.startsWith("/app/exhibitor") || pathname.startsWith("/exhibitor");
  const isAppRoot = pathname === "/app";
  const isRoot = pathname === "/";

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("[middleware/updateSession] auth decision", {
      pathname,
      role: null,
      accountId: null,
      redirectTarget:
        isPublicRoute || isStaticRoute || isPublicAssetPath ? null : isApiRoute ? "401-json" : "/login"
    });
    if (isApiRoute) {
      return jsonWithResponseCookies({ error: "Unauthorized" }, { status: 401 });
    }
    if (isPublicRoute || isStaticRoute || isPublicAssetPath) {
      return response;
    }
    return redirectWithResponseCookies("/login");
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; company_id: string | null }>();

  const role = normalizeSessionRole(userRecord?.role);
  const roleHome = getRoleHomePath(role);
  const accountId = userRecord?.company_id ?? null;

  if (!role) {
    console.log("[middleware/updateSession] auth decision", {
      pathname,
      role: userRecord?.role ?? null,
      accountId,
      redirectTarget:
        isLoginRoute || isAuthRoute || isPublicAssetPath ? null : "/login?error=role"
    });
    if (isLoginRoute || isAuthRoute || isPublicAssetPath) {
      return response;
    }
    return redirectWithResponseCookies("/login?error=role");
  }

  if (isRoot || isLoginRoute) {
    console.log("[middleware/updateSession] auth decision", {
      pathname,
      role,
      accountId,
      redirectTarget: roleHome
    });
    return redirectWithResponseCookies(roleHome);
  }

  if (isAppRoot && pathname !== roleHome) {
    console.log("[middleware/updateSession] auth decision", {
      pathname,
      role,
      accountId,
      redirectTarget: roleHome
    });
    return redirectWithResponseCookies(roleHome);
  }

  if (isAdminRoute && role !== "platform_admin") {
    if (role === "exhibitor_admin") {
      const nowMs = Date.now();
      let multiEventLicensed = false;
      if (accountId) {
        const { data: lic, error: licErr } = await selectLatestCompanyScopedLicense(
          supabase,
          accountId,
          "scope, status, expires_at, starts_at"
        );
        if (licErr) {
          console.error("[middleware/updateSession] company license lookup failed", {
            accountId,
            message: licErr.message
          });
        }
        multiEventLicensed = isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
          lic as {
            scope: string | null;
            status: string | null;
            expires_at: string | null;
            starts_at: string | null;
          } | null,
          nowMs
        );
      }

      if (multiEventLicensed) {
        if (pathname === "/admin" || pathname === "/admin/dashboard") {
          return redirectWithResponseCookies("/admin/events");
        }
        if (!isExhibitorMultiEventAdminPathAllowed(pathname)) {
          return redirectWithResponseCookies("/admin/events");
        }
        console.log("[middleware/updateSession] auth decision", {
          pathname,
          role,
          accountId,
          redirectTarget: null,
          exhibitorAdmin: "multi_event"
        });
        return response;
      }

      const canAccessSalesforceAdminSurface = isSalesforceAdminSurface;
      const canAccessZapierAdminSurface = isZapierAdminSurface;
      console.log("[middleware/updateSession] auth decision", {
        pathname,
        role,
        accountId,
        redirectTarget:
          canAccessSalesforceAdminSurface || canAccessZapierAdminSurface ? null : roleHome
      });
      if (canAccessSalesforceAdminSurface || canAccessZapierAdminSurface) {
        return response;
      }
      return redirectWithResponseCookies(roleHome);
    }

    return redirectWithResponseCookies(roleHome);
  }

  if (isOrganizerRoute && role !== "organizer_admin") {
    console.log("[middleware/updateSession] auth decision", {
      pathname,
      role,
      accountId,
      redirectTarget: roleHome
    });
    return redirectWithResponseCookies(roleHome);
  }

  // Platform admins are admitted to the route boundary; the server page/session
  // layer requires and validates an active account context before any data access.
  if (
    isExhibitorRoute &&
    role !== "exhibitor_admin" &&
    role !== "exhibitor_viewer" &&
    role !== "platform_admin"
  ) {
    console.log("[middleware/updateSession] auth decision", {
      pathname,
      role,
      accountId,
      redirectTarget: roleHome
    });
    return redirectWithResponseCookies(roleHome);
  }

  console.log("[middleware/updateSession] auth decision", {
    pathname,
    role,
    accountId,
    redirectTarget: null
  });

  return response;
}
