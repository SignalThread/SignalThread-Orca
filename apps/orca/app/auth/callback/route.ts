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

/**
 * Account-lifecycle token types Orca must never process once Platform Core owns accounts.
 *
 * Signup, password recovery, and email change are identity operations. Handling them here
 * would keep Orca acting as an account authority; Platform Core's own callback owns them.
 * Under the legacy Orca authority they remain accepted so a rolled-back deployment works.
 */
type VerifyOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

const LEGACY_ONLY_OTP_TYPES: ReadonlySet<string> = new Set([
  "signup",
  "recovery",
  "email_change",
]);

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

  if (!authAuthority || !supabaseUrl || !supabaseAnonKey) {
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
    if (authAuthority.source === "platform-core" && LEGACY_ONLY_OTP_TYPES.has(type)) {
      // Orca does not run account lifecycle against Platform Core. Send the user to sign
      // in centrally rather than silently establishing a session from an identity token.
      return NextResponse.redirect(new URL("/login", request.url));
    }

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
