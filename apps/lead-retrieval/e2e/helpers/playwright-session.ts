/**
 * Seeds the same SSR-style Supabase auth cookies Next.js middleware expects (`@supabase/ssr`).
 * Uses the password grant in Node only — OTP UI unchanged; seeded Playwright accounts must remain
 * password-capable on the Supabase Auth backend even when the Admin login form is OTP-only.
 */
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import type { Database } from "../../types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export const LOGIN_ORIGIN = (
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

function assertSupabaseSeedEnv(): void {
  const url = SUPABASE_URL.trim();
  const anon = SUPABASE_ANON_KEY.trim();
  if (!url || !anon) {
    throw new Error(
      "Playwright seed: missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (set env or add to .env.local)"
    );
  }
}

/** Returns cookies `{ name, value, url }` ready for Playwright `addCookies`. */
export async function seedCookiesViaPasswordGrant(email: string, password: string) {
  assertSupabaseSeedEnv();

  const jar = new Map<string, string>();

  const supabase = createServerClient<Database>(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim(), {
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `Playwright seed: password grant failed for ${email}: ${error.message}. Ensure this user exists and password auth stays enabled on Supabase for E2E.`
    );
  }

  if (jar.size === 0) {
    throw new Error(
      `Playwright seed: no auth cookies emitted for ${email} after sign-in; check SUPABASE_* env wiring.`
    );
  }

  return [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    url: LOGIN_ORIGIN
  }));
}

type BypassCookie = { name: string; value: string; url: string };

/** OTP-era seeding: server-only magic-link completion via `/api/e2e/auth-bypass` (`E2E_AUTH_BYPASS_ENABLED=true`, non-production). */
export async function fetchCookiesViaE2eAuthBypass(email: string): Promise<BypassCookie[]> {
  const res = await fetch(`${LOGIN_ORIGIN}/api/e2e/auth-bypass`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email })
  });

  const body = (await res.json().catch(() => null)) as {
    cookies?: BypassCookie[];
    error?: string;
    reason?: string;
    details?: string;
  } | null;

  if (!res.ok) {
    const hint = body?.reason ?? body?.error ?? body?.details ?? res.statusText;
    throw new Error(`Playwright E2E auth bypass failed (${res.status}): ${hint}`);
  }

  const cookies = Array.isArray(body?.cookies) ? body!.cookies : [];
  if (cookies.length === 0) {
    throw new Error("Playwright E2E auth bypass returned no cookies");
  }

  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    url: LOGIN_ORIGIN
  }));
}
