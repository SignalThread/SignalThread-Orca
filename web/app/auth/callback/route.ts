import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ORGANIZATION_SELECTION_COOKIE_NAME,
} from "@/lib/request-user";
import { resolveAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";
import { PLATFORM_CONTEXT_COOKIE_NAME } from "@/src/server/services/platform-admin";

const createRouteHandlerClient = createServerClient;
export const runtime = "nodejs";

type VerifyOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

function isVerifyOtpType(value: string): value is VerifyOtpType {
  return ["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(value);
}

export async function GET(request: NextRequest) {
  // The callback belongs to whichever project is the authentication authority.
  const authAuthority = resolveAuthAuthorityConfig();
  const supabaseUrl = authAuthority?.url;
  const supabaseAnonKey = authAuthority?.anonKey;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  let error: Error | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (tokenHash && type && isVerifyOtpType(type)) {
    const result = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    error = result.error;
  } else {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  const response = NextResponse.redirect(new URL("/select-account", request.url));
  for (const name of [ACTIVE_ORG_COOKIE_NAME, ORGANIZATION_SELECTION_COOKIE_NAME, PLATFORM_CONTEXT_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  }
  return response;
}
