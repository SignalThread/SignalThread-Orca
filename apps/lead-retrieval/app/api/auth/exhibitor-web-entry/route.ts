import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getRoleHomePath, normalizeSessionRole } from "@/lib/auth/session";
import { getExhibitorWebEntryPathAfterSignIn } from "@/lib/server/exhibitor-web-entry-redirect";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

function buildRedirect(request: Request, path: string, source?: NextResponse) {
  const target = NextResponse.redirect(buildBrowserFacingUrl(request, path));
  if (source) {
    copyCookies(source, target);
  }
  return target;
}

export async function GET(request: NextRequest) {
  assertSupabaseEnv();

  let response = NextResponse.next();
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          if (value) {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          } else {
            request.cookies.delete(name);
            response.cookies.delete(name);
          }
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return buildRedirect(request, "/login", response);
  }

  const { data: userRow, error: userRowError } = await supabase
    .from("users")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; company_id: string | null }>();

  if (userRowError || !userRow) {
    return buildRedirect(request, "/login", response);
  }

  const role = normalizeSessionRole(userRow.role);
  if (role !== "exhibitor_admin" && role !== "exhibitor_viewer") {
    return buildRedirect(request, getRoleHomePath(role), response);
  }
  const path = await getExhibitorWebEntryPathAfterSignIn({
    userId: user.id,
    companyId: userRow.company_id ?? null,
    role
  });
  return buildRedirect(request, path, response);
}
