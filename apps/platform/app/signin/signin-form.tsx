"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPlatformBrowserClient } from "@/lib/supabase/browser";

/**
 * Email + password sign-in.
 *
 * The provider choice is not arbitrary: the Platform Core project has only the
 * `email` provider enabled (no OAuth, no phone, no SAML), so password grant is
 * the one flow that works today. Magic link is also email-based but depends on
 * outbound mail, which is rate-limited on the default SMTP sender, so it is left
 * for a later pass rather than made the only way in.
 */
export function SignInForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createPlatformBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        // Deliberately not distinguishing "no such user" from "wrong password":
        // that difference is an account-enumeration oracle.
        setError("That email and password combination did not match an account.");
        setPending(false);
        return;
      }

      // Refresh so the server re-reads the freshly set auth cookies.
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Sign-in is unavailable right now. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--signalthread-accent)" }}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
