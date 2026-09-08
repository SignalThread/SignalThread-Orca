"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isDashboardRole, roleHomePath, stripErrorParamFromUrl } from "./role-home-path";

export const ROLE_NOT_CONFIGURED_MESSAGE =
  "Your account role is not configured for dashboard access. Contact an administrator.";

function stripRoleErrorFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const next = stripErrorParamFromUrl(window.location.href);
    if (next !== window.location.href) {
      window.history.replaceState(null, "", next);
    }
  } catch {
    // no-op: URL cleanup is best-effort
  }
}

/** Digits-only OTP token for `verifyOtp` (typically 6 digits from email). */
function normalizeOtpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 12);
}

type LoginPhase = "email" | "code";
type LoginCodeSource = "email" | "emergency";

type LoginFormProps = {
  initialRoleError?: boolean;
};

export function LoginForm({ initialRoleError = false }: LoginFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [roleNotConfigured, setRoleNotConfigured] = useState<boolean>(initialRoleError);
  const [phase, setPhase] = useState<LoginPhase>("email");
  const [email, setEmail] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loginCodeSource, setLoginCodeSource] = useState<LoginCodeSource>("email");
  const [error, setError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (initialRoleError) {
      stripRoleErrorFromUrl();
    }
  }, [initialRoleError]);

  const resolveRoleAndNavigate = useCallback(async () => {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message ?? "Signed in but failed to resolve user.");
      return false;
    }

    const { data: userRow, error: roleError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null }>();

    if (roleError) {
      setError(roleError.message ?? "Signed in but failed to resolve user role.");
      return false;
    }

    if (!isDashboardRole(userRow?.role)) {
      await supabase.auth.signOut();
      setRoleNotConfigured(true);
      return false;
    }

    router.replace(roleHomePath(userRow?.role));
    router.refresh();
    return true;
  }, [router, supabase]);

  const completeInviteSessionAfterLogin = useCallback(async () => {
    const response = await fetch("/api/invites/complete-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({})
    });

    if (response.ok) {
      return { ok: true as const };
    }

    const detail = (await response.text()) || "Failed completing invite activation.";
    return { ok: false as const, error: detail };
  }, []);

  const onEmailChange = (value: string) => {
    setEmail(value);
    if (roleNotConfigured) setRoleNotConfigured(false);
  };

  const onOtpChange = (value: string) => {
    setOtpCode(normalizeOtpInput(value));
    if (roleNotConfigured) setRoleNotConfigured(false);
  };

  const normalizedEmailReady = (): string => {
    const t = email.trim().toLowerCase();
    return t;
  };

  const sendSignInCode = async (normalized: string, opts?: { isResend?: boolean }) => {
    setSendingCode(true);
    setError(null);
    if (!opts?.isResend) {
      setRecoveryMessage(null);
    }

    const { error: otpSendError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (otpSendError) {
      setError(otpSendError.message);
      setSendingCode(false);
      return;
    }

    setOtpEmail(normalized);
    setLoginCodeSource("email");
    setPhase("code");
    setOtpCode("");
    setSendingCode(false);
    if (opts?.isResend) {
      setRecoveryMessage("A new sign-in code was sent. Check your inbox.");
    } else {
      setRecoveryMessage("Check your email for the sign-in code.");
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRoleNotConfigured(false);

    const normalized = normalizedEmailReady();

    if (phase === "email") {
      if (!normalized) {
        setError("Enter your work email.");
        return;
      }
      await sendSignInCode(normalized);
      return;
    }

    const token = otpCode.trim();
    if (token.length < 6) {
      setError(
        loginCodeSource === "emergency"
          ? "Enter the Emergency Login Code (usually 6 digits)."
          : "Enter the verification code from your email (usually 6 digits)."
      );
      return;
    }

    setVerifying(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "email",
      email: otpEmail || normalized,
      token
    });

    if (verifyError) {
      setError(verifyError.message);
      setVerifying(false);
      return;
    }

    const completion = await completeInviteSessionAfterLogin();
    if (!completion.ok) {
      setError(completion.error);
      setVerifying(false);
      return;
    }

    const ok = await resolveRoleAndNavigate();
    setVerifying(false);

    if (ok) {
      setRecoveryMessage(null);
    }
  };

  const onBackToEmail = () => {
    setPhase("email");
    setOtpCode("");
    setError(null);
    setRecoveryMessage(null);
    setLoginCodeSource("email");
  };

  const onUseEmergencyCode = () => {
    const normalized = normalizedEmailReady();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setError("Enter the valid email associated with the Emergency Login Code.");
      return;
    }
    setError(null);
    setOtpEmail(normalized);
    setOtpCode("");
    setLoginCodeSource("emergency");
    setPhase("code");
    setRecoveryMessage("Enter the Emergency Login Code provided by your administrator.");
  };

  const onResendCode = async () => {
    const normalized = (otpEmail || normalizedEmailReady()).trim().toLowerCase();
    if (!normalized) {
      setError("Send a code from the previous step first.");
      return;
    }
    await sendSignInCode(normalized, { isResend: true });
  };

  const primaryBusy = phase === "email" ? sendingCode : verifying;
  const primaryLabel =
    phase === "email"
      ? sendingCode
        ? "Sending code…"
        : "Email sign-in code"
      : verifying
        ? "Verifying…"
        : loginCodeSource === "emergency"
          ? "Verify Emergency Login Code"
          : "Verify and sign in";

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      {roleNotConfigured ? (
        <p
          role="alert"
          data-testid="role-not-configured-banner"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
        >
          {ROLE_NOT_CONFIGURED_MESSAGE}
        </p>
      ) : null}

      {phase === "email" ? (
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
          />
        </label>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-slate-600">
            {loginCodeSource === "emergency" ? "Enter the Emergency Login Code for " : "Enter the verification code sent to "}
            <span className="font-medium text-slate-900">{otpEmail}</span>.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            {loginCodeSource === "emergency" ? "Emergency Login Code" : "Verification code"}
            <input
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono tracking-widest"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={loginCodeSource === "emergency" ? "Emergency Login Code" : "Email verification code"}
              placeholder="Enter code"
              value={otpCode}
              onChange={(event) => onOtpChange(event.target.value)}
              required={phase === "code"}
            />
          </label>
          <div className="flex flex-wrap gap-3 text-xs font-semibold">
            {loginCodeSource === "email" ? (
              <button
                type="button"
                className="text-accent underline underline-offset-2 hover:opacity-90"
                disabled={sendingCode}
                onClick={() => void onResendCode()}
              >
                Resend code
              </button>
            ) : null}
            <button
              type="button"
              className="text-slate-600 underline underline-offset-2 hover:text-slate-900"
              onClick={onBackToEmail}
            >
              Use a different email
            </button>
          </div>
        </>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {recoveryMessage ? <p className="text-sm text-emerald-700">{recoveryMessage}</p> : null}

      {phase === "email" ? (
        <button
          type="button"
          className="w-full text-sm font-semibold text-accent underline underline-offset-2 hover:opacity-90"
          disabled={sendingCode}
          onClick={onUseEmergencyCode}
        >
          Use an Emergency Login Code
        </button>
      ) : null}

      <button
        type="submit"
        className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50"
        disabled={primaryBusy}
      >
        {primaryLabel}
      </button>
    </form>
  );
}
