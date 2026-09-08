"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getResetPasswordValidation,
  setResetPasswordField
} from "@/app/auth/reset/password-form-state";
import { isDashboardRole, roleHomePath } from "./role-home-path";

const EXPIRED_MESSAGE = "Reset link expired, request a new one.";
export const APP_ONLY_RESET_SUCCESS_MESSAGE =
  "Password updated. Return to the SignalThread Scan mobile app and sign in.";

function isInvalidOrExpiredTokenError(message: string | undefined | null): boolean {
  const text = (message ?? "").toLowerCase();
  if (!text) return false;
  return (
    text.includes("expired") ||
    text.includes("invalid") ||
    text.includes("token") ||
    text.includes("jwt") ||
    text.includes("not found")
  );
}

function clearRecoveryHash() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  } catch {
    // no-op: hash cleanup is best-effort
  }
}

type Props = {
  initialError?: string | null;
};

export function RecoveryPasswordForm({ initialError }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [expired, setExpired] = useState<boolean>(
    isInvalidOrExpiredTokenError(initialError ?? undefined)
  );
  const [appOnlySuccess, setAppOnlySuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  const validation = getResetPasswordValidation({ newPassword, confirmPassword });

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

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      if (isInvalidOrExpiredTokenError(updateError.message)) {
        setExpired(true);
        setError(EXPIRED_MESSAGE);
      } else {
        setError(updateError.message);
      }
      setLoading(false);
      return;
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      clearRecoveryHash();
      await supabase.auth.signOut();
      router.replace("/login?reset=1");
      return;
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null }>();

    clearRecoveryHash();

    if (!isDashboardRole(userRow?.role)) {
      // App-only users (no dashboard role) land here. Do NOT redirect to
      // /login?error=role — that stale banner is misleading. Sign them out
      // and show a success state pointing them to the mobile app.
      await supabase.auth.signOut();
      setAppOnlySuccess(true);
      setLoading(false);
      return;
    }

    router.replace(roleHomePath(userRow?.role));
    router.refresh();
  };

  if (appOnlySuccess) {
    return (
      <div className="mt-4 space-y-3">
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
        >
          {APP_ONLY_RESET_SUCCESS_MESSAGE}
        </p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mt-4 space-y-3">
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        >
          {EXPIRED_MESSAGE}
        </p>
        <p className="text-sm text-slate-600">
          Please request a new password reset link from the sign-in screen.
        </p>
        <Link href="/login" className="text-sm font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-label="Set new password">
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
  );
}
