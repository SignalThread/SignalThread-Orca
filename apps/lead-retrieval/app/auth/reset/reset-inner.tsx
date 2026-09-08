"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";
import {
  getResetPasswordValidation,
  setResetPasswordField
} from "./password-form-state";

type ResetState = "checking" | "ready" | "missing";

export default function ResetInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [state, setState] = useState<ResetState>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const code = String(searchParams.get("code") ?? "").trim();
  const queryType = String(searchParams.get("type") ?? "").toLowerCase();
  const validation = getResetPasswordValidation({ newPassword, confirmPassword });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
      );
      const hashType = String(hashParams.get("type") ?? "").toLowerCase();

      const isRecoveryType = queryType === "recovery" || hashType === "recovery";
      const shouldAttemptRecovery = Boolean(code) || isRecoveryType;
      if (!shouldAttemptRecovery) {
        if (!cancelled) {
          setState("missing");
          setError("Recovery session not found. Open the link again.");
        }
        return;
      }

      let exchangeError: Error | null = null;
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        exchangeError = error;
      }

      let sessionError: Error | null = null;
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null =
        null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = await supabase.auth.getSession();
        session = result.data.session;
        sessionError = result.error;
        if (session) break;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      if (cancelled) return;

      if (sessionError || !session) {
        setState("missing");
        setError(
          sessionError?.message ??
            exchangeError?.message ??
            "Recovery session not found. Open the link again."
        );
        return;
      }

      setState("ready");
      setError(null);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [code, queryType, supabase]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <LeadRetrievalBrandMark decorative={false} className="mb-5 h-12 w-12 object-contain" />
        <h1 className="text-2xl font-semibold">Set new password</h1>
        {state === "checking" ? <p className="mt-2 text-sm text-slate-600">Checking recovery session...</p> : null}

        {state === "missing" ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error ?? "Recovery session not found. Open the link again."}
            </p>
            <Link href="/login" className="text-sm font-semibold text-accent hover:underline">
              Back to login
            </Link>
          </div>
        ) : null}

        {state === "ready" ? (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              <span>New password</span>
              <input
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
                type="password"
                id="new-password"
                name="newPassword"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(
                    setResetPasswordField(
                      { newPassword, confirmPassword },
                      "newPassword",
                      event.target.value
                    ).newPassword
                  )
                }
                autoComplete="new-password"
                minLength={8}
                disabled={loading}
                aria-invalid={Boolean(error || validation.mismatchError)}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <span>Confirm new password</span>
              <input
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
                type="password"
                id="confirm-password"
                name="confirmPassword"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    setResetPasswordField(
                      { newPassword, confirmPassword },
                      "confirmPassword",
                      event.target.value
                    ).confirmPassword
                  )
                }
                autoComplete="new-password"
                minLength={8}
                disabled={loading}
                aria-invalid={Boolean(error || validation.mismatchError)}
                required
              />
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {!error && validation.mismatchError ? (
              <p className="text-sm text-red-600">{validation.mismatchError}</p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50"
              disabled={loading || !validation.canSubmit}
            >
              {loading ? "Updating password..." : "Set new password"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
