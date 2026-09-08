import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { activateInvitedMembershipsWithSeatEnforcement } from "@/lib/server/event-user-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInviteActivationScopeFromAuthMetadata } from "@/lib/server/invites/invite-auth-membership-activation";
import { tryCompletePendingInvitesAfterAuth } from "@/lib/server/invites/invite-redeem-execute";

import { normalizeSessionRole } from "@/lib/auth/session";
import { getExhibitorWebEntryPathAfterSignIn } from "@/lib/server/exhibitor-web-entry-redirect";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email"
] as const;

function isEmailOtpType(value: string | null): value is EmailOtpType {
  if (!value) return false;
  return (OTP_TYPES as readonly string[]).includes(value);
}

function normalizeRole(role: string | null | undefined) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "platform_admin") return "platform_admin";
  if (value === "organizer_admin" || value === "event_organizer" || value === "organizer") return "organizer_admin";
  if (value === "exhibitor_admin") return "exhibitor_admin";
  if (value === "exhibitor_viewer") return "exhibitor_viewer";
  return null;
}

function nonExhibitorRoleHomePath(role: string | null) {
  if (role === "platform_admin") return "/admin";
  if (role === "organizer_admin") return "/app/organizer";
  return "/login?error=role";
}

async function resolveRedirectPath(supabase: ReturnType<typeof createServerClient<Database>>) {
  const {
    data: { user },
    error: authUserError
  } = await supabase.auth.getUser();

  if (authUserError || !user) {
    console.error("auth.callback.resolve_user_failed", {
      message: authUserError?.message ?? "Missing user after auth callback"
    });
    return "/login?error=role";
  }

  const { data: userRow, error: userRowError } = await supabase
    .from("users")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; company_id: string | null }>();

  if (userRowError) {
    console.error("auth.callback.resolve_role_failed", {
      userId: user.id,
      message: userRowError.message
    });
    return "/login?error=role";
  }

  const appRole = normalizeSessionRole(userRow?.role);
  if (appRole === "exhibitor_admin" || appRole === "exhibitor_viewer") {
    return getExhibitorWebEntryPathAfterSignIn({
      userId: user.id,
      companyId: userRow?.company_id ?? null,
      role: appRole
    });
  }
  return nonExhibitorRoleHomePath(normalizeRole(userRow?.role));
}

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

function buildRedirect(request: NextRequest, path: string, source?: NextResponse) {
  const target = NextResponse.redirect(buildBrowserFacingUrl(request, path));
  if (source) {
    copyCookies(source, target);
  }
  return target;
}

function buildErrorRedirect(request: NextRequest, reason: string) {
  return buildRedirect(request, `/auth/error?reason=${encodeURIComponent(reason)}`);
}

async function resolveInviteActivationScopeForAuthenticatedUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message ?? "Failed loading auth invite metadata.");
  }

  return resolveInviteActivationScopeFromAuthMetadata(
    (data.user?.user_metadata ?? {}) as Record<string, unknown>
  );
}

async function completeInviteAndActivateMemberships(
  supabase: ReturnType<typeof createServerClient<Database>>,
  options: { rawInviteCode: string | null }
) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const entry = { reason: "no_user_after_session" as const };
    console.info("auth.invite_completion.skip", entry);
    return;
  }

  const admin = createAdminClient();
  await tryCompletePendingInvitesAfterAuth({
    admin,
    userId: user.id,
    rawInviteCode: options.rawInviteCode
  });

  const activationScope = await resolveInviteActivationScopeForAuthenticatedUser(admin, user.id);
  const activation = await activateInvitedMembershipsWithSeatEnforcement(user.id, activationScope);
  if (activation.blocked.length > 0) {
    console.error("auth.callback.activate_memberships_failed", {
      userId: user.id,
      activated: activation.activated,
      blocked: activation.blocked
    });
  }
}

export async function GET(request: NextRequest) {
  assertSupabaseEnv();

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash") ?? request.nextUrl.searchParams.get("token");
  const typeParam = request.nextUrl.searchParams.get("type");
  /** App invite code for `invite_codes` redeem — not the Supabase PKCE `code` */
  const rawInviteCode = request.nextUrl.searchParams.get("invite_code");

  console.info("auth.callback.params", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    hasType: Boolean(typeParam),
    hasInviteCode: Boolean(String(rawInviteCode ?? "").trim()),
    hasError: request.nextUrl.searchParams.has("error")
  });

  let response = NextResponse.redirect(buildBrowserFacingUrl(request, "/app"));

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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth.callback.exchange_failed", {
        message: error.message,
        code: error.code
      });
      return buildErrorRedirect(request, "exchange_failed");
    }
    console.info("auth.callback.exchange_success");
    await completeInviteAndActivateMemberships(supabase, { rawInviteCode });
    const redirectPath = await resolveRedirectPath(supabase);
    console.info("auth.callback.redirect", { path: redirectPath });
    return buildRedirect(request, redirectPath, response);
  }

  if (tokenHash) {
    const otpType: EmailOtpType = isEmailOtpType(typeParam) ? typeParam : "invite";

    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash
    });

    if (error) {
      console.error("auth.callback.otp_failed", {
        message: error.message,
        code: error.code,
        type: otpType
      });
      return buildErrorRedirect(request, "otp_failed");
    }

    console.info("auth.callback.otp_success", { type: otpType });
    await completeInviteAndActivateMemberships(supabase, { rawInviteCode });
    const redirectPath = await resolveRedirectPath(supabase);
    console.info("auth.callback.redirect", { path: redirectPath });
    return buildRedirect(request, redirectPath, response);
  }

  console.error("auth.callback.missing_params");
  return buildErrorRedirect(request, "missing_params");
}
