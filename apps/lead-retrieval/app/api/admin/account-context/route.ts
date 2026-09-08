import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import type { Database } from "@/types/database";
import {
  PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE,
  resolvePlatformAdminAccountContext
} from "@/lib/auth/platform-admin-account-context-core";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12
};

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

function redirectTo(request: Request, path: string, authResponse: NextResponse) {
  const response = NextResponse.redirect(buildBrowserFacingUrl(request, path), { status: 303 });
  copyCookies(authResponse, response);
  return response;
}

function jsonWithAuthCookies(body: unknown, status: number, authResponse: NextResponse) {
  const response = NextResponse.json(body, { status });
  copyCookies(authResponse, response);
  return response;
}

export async function POST(request: NextRequest) {
  assertSupabaseEnv();

  // `auth.getUser()` may rotate Supabase cookies. Keep those writes on the
  // 303 response alongside the account-context cookie so the redirected app
  // request never sees the stale pre-refresh browser session.
  const authResponse = NextResponse.next();
  const authClient = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        for (const { name, value, options } of cookiesToSet) {
          if (value) {
            request.cookies.set({ name, value, ...options });
            authResponse.cookies.set({ name, value, ...options });
          } else {
            request.cookies.delete(name);
            authResponse.cookies.delete(name);
          }
        }
      }
    }
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.id) return jsonWithAuthCookies({ error: "Unauthorized" }, 401, authResponse);

  const admin = createAdminClient();
  const { data: principal } = await (admin as any)
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (principal?.role !== "platform_admin") {
    return jsonWithAuthCookies({ error: "Forbidden" }, 403, authResponse);
  }

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "enter");
  if (action === "exit") {
    const response = redirectTo(request, "/admin/exhibitors", authResponse);
    response.cookies.set(PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE, "", {
      ...COOKIE_OPTIONS,
      maxAge: 0
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const requestedCompanyId = String(formData.get("companyId") ?? "").trim();
  const { data: company } = requestedCompanyId
    ? await (admin as any)
        .from("companies")
        .select("id, name")
        .eq("id", requestedCompanyId)
        .maybeSingle()
    : { data: null };

  const context = resolvePlatformAdminAccountContext({
    principal: principal ? { userId: principal.id, role: principal.role } : null,
    requestedCompanyId,
    company
  });
  if (!context) {
    return jsonWithAuthCookies({ error: "Company not found or inaccessible" }, 404, authResponse);
  }

  const response = redirectTo(request, "/app/events", authResponse);
  response.cookies.set(
    PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE,
    encodeURIComponent(context.companyId),
    COOKIE_OPTIONS
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
