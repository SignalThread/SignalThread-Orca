import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { Database } from "@/types/database";
import { getE2eAuthBypassDenialReason } from "@/lib/e2e/e2e-auth-bypass-policy";
import { isSeededE2eAuthEmail, normalizeE2eAuthEmail } from "@/lib/e2e/e2e-seeded-auth-emails";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cookie jar cookieEncoding matches middleware / Playwright seeds (`base64url`). */
async function issueSupabaseCookiesForSeededUser(emailNorm: string): Promise<
  { name: string; value: string; url: string }[]
> {
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
    email: emailNorm,
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

  if (jar.size === 0) {
    throw new Error("No Supabase auth cookies after verifyOtp");
  }

  const origin =
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";

  return [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    url: origin.replace(/\/$/, "")
  }));
}

export async function POST(request: Request) {
  const denial = getE2eAuthBypassDenialReason();
  if (denial) {
    return NextResponse.json({ error: "Forbidden", reason: denial }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const record = body as Record<string, unknown>;
  const emailNorm = normalizeE2eAuthEmail(record.email);

  if (!emailNorm || !isSeededE2eAuthEmail(emailNorm)) {
    return NextResponse.json({ error: "Forbidden", reason: "email not allowlisted" }, { status: 403 });
  }

  try {
    const cookies = await issueSupabaseCookiesForSeededUser(emailNorm);
    return NextResponse.json({ ok: true, cookies });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/e2e/auth-bypass] failed", { emailNorm, message });
    return NextResponse.json({ error: "Bad Request", details: message }, { status: 400 });
  }
}
