import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  DEFAULT_APPLE_REVIEW_EMAIL,
  getAppleReviewLoginDenialReason,
  getAppleReviewUserRowDenialReason,
  isAppleReviewLoginRequestEmailValid,
  normalizeConfiguredAppleReviewEmail,
  resolveConfiguredAppleReviewEmailFromEnv
} from "@/lib/auth/apple-review-login-policy";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function issueSessionViaMagicLink(emailForAuthApi: string): Promise<Session> {
  assertSupabaseEnv();

  const jar = new Map<string, string>();

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieEncoding: "base64url",
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        for (const c of cookiesToSet) {
          if (!c?.name) continue;
          if (c.value) {
            jar.set(c.name, c.value);
          } else {
            jar.delete(c.name);
          }
        }
      }
    }
  });

  const admin = createAdminClient();
  const { data: linkPayload, error: genErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: emailForAuthApi,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/login`
    }
  });

  const tokenHash = String(linkPayload?.properties?.hashed_token ?? "").trim();
  if (genErr || !tokenHash) {
    throw new Error(genErr?.message ?? "generateLink did not return hashed_token");
  }

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash
  });

  if (otpErr) {
    throw new Error(otpErr.message ?? "verifyOtp failed");
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();

  const session = sessionData.session ?? null;

  if (sessionErr || !session?.access_token || !session.refresh_token) {
    throw new Error(sessionErr?.message ?? "missing session tokens after magic link verification");
  }

  return session;
}

export async function POST(request: Request) {
  const denial = getAppleReviewLoginDenialReason();
  if (denial) {
    return NextResponse.json({ error: "Forbidden", reason: denial }, { status: 403 });
  }

  const configured = resolveConfiguredAppleReviewEmailFromEnv({
    APPLE_REVIEW_EMAIL: process.env.APPLE_REVIEW_EMAIL ?? DEFAULT_APPLE_REVIEW_EMAIL
  });
  if (!configured) {
    return NextResponse.json(
      { error: "Forbidden", reason: "APPLE_REVIEW_EMAIL is missing or invalid" },
      { status: 403 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const record = body as Record<string, unknown>;
  if (!isAppleReviewLoginRequestEmailValid(configured, record.email)) {
    return NextResponse.json({ error: "Forbidden", reason: "email mismatch" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await (admin as any)
    .from("users")
    .select("id,email,role")
    .eq("email", configured)
    .maybeSingle();

  if (profileErr) {
    console.error("[api/auth/apple-review-login] profile load failed", { message: profileErr.message });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const roleRaw = profile?.role != null ? String(profile.role) : "";
  const userDenial = getAppleReviewUserRowDenialReason({ userId: profile?.id ?? null, role: roleRaw });
  if (!profile || userDenial) {
    return NextResponse.json(
      {
        error: "Forbidden",
        reason: profile ? userDenial : "demo user not provisioned"
      },
      { status: 403 }
    );
  }

  const emailRow = String(profile.email ?? "").trim();
  const normalizedRow = normalizeConfiguredAppleReviewEmail(emailRow);
  const emailForMagicLink =
    normalizedRow === configured ? emailRow : normalizeConfiguredAppleReviewEmail(configured);

  try {
    const session = await issueSessionViaMagicLink(emailForMagicLink);
    return NextResponse.json({ session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/auth/apple-review-login] session issue failed", { configured, message });
    return NextResponse.json({ error: "Bad Request", details: message }, { status: 400 });
  }
}
