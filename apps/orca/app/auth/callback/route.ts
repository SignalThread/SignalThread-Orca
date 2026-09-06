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

/**
 * Where the callback continues after a session exists.
 *
 * Only a same-origin *relative* path is honoured. A value carrying a scheme, or a
 * protocol-relative `//host` form, is discarded in favour of the default -- so a
 * crafted `next` cannot turn the callback into an open redirect that hands a
 * freshly minted session to another origin.
 *
 * The path carries no authority of its own: `/platform-entry` re-validates the
 * event against the session, the Platform claim, and Orca's own EventMember rows.
 */
const DEFAULT_CONTINUATION = "/select-account";

function safeContinuation(value: string | null): string {
  if (!value) return DEFAULT_CONTINUATION;
  if (!value.startsWith("/")) return DEFAULT_CONTINUATION;
  if (value.startsWith("//")) return DEFAULT_CONTINUATION;
  // Reject anything that still parses as absolute once resolved (e.g. "/\\evil.com").
  if (/^\/[\\]/.test(value)) return DEFAULT_CONTINUATION;
  return value;
}

/**
 * The callback URL carries a one-time handoff token in its query string. Suppress
 * the referrer so the token cannot leak to anything the destination page loads,
 * and forbid caching of the exchange response.
 */
const HANDOFF_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, max-age=0",
} as const;

/**
 * Redirect with a relative Location.
 *
 * An absolute URL rebuilt from the request normalises the host -- observed turning
 * `orca.localtest.me` into `localhost` -- which would move the user to a different
 * origin than the one whose cookies were just set. Browsers resolve a relative
 * Location against the request URL, preserving the host exactly. `/platform-entry`
 * already relies on this for the same reason.
 */
function relativeRedirect(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { ...HANDOFF_HEADERS, Location: location },
  });
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
  const continuation = safeContinuation(requestUrl.searchParams.get("next"));

  if (!authAuthority || !supabaseUrl || !supabaseAnonKey) {
    return relativeRedirect("/login");
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
      return relativeRedirect("/login");
    }

    const result = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    error = result.error;
  } else {
    return relativeRedirect("/login");
  }

  if (error) {
    // Covers malformed, expired, and replayed handoffs identically: GoTrue returns
    // one error for all three, and distinguishing them would be an oracle.
    return relativeRedirect("/login?error=auth_failed");
  }

  // Redirecting to the continuation is what removes the one-time token from the
  // visible URL: the browser's resulting document is the continuation, not this
  // callback. The token is single-use, so the transient history entry is spent.
  // A *relative* Location is deliberate, for the same reason /platform-entry uses
  // one: an absolute URL rebuilt from the request normalises the host -- observed
  // turning orca.localtest.me into localhost -- which would send the user to a
  // different origin than the one whose session cookies were just set, silently
  // discarding the session this exchange created. Browsers resolve a relative
  // Location against the request URL, so the host is preserved exactly.
  const response = new NextResponse(null, {
    status: 303,
    headers: { ...HANDOFF_HEADERS, Location: continuation },
  });
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
