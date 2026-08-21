"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";

/**
 * Legacy one-time-code sign-in for the pre-Platform-Core Orca auth project.
 *
 * Reachable only when the legacy Orca authority is both configured and permitted (see
 * `isLegacyAuthAuthorityAllowed`), which production disallows unless it has been rolled
 * back on purpose. It no longer creates accounts: `shouldCreateUser` is false, so Orca
 * cannot mint an identity even in this mode.
 */

type Step = "email" | "code";

function normalizeErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Invalid code. Please try again.";
  }
  if (lower.includes("token has expired")) {
    return "Code expired. Please resend and try again.";
  }
  if (lower.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and retry.";
  }
  if (lower.includes("signups not allowed") || lower.includes("user not found")) {
    return "No account exists for that email. Access is provisioned in SignalThread.";
  }
  return message;
}

export function LegacyOtpLoginForm() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isVerifyingRef = useRef(false);

  async function sendCode() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        // Orca does not create identities. Accounts come from Platform Core.
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      setError(normalizeErrorMessage(otpError.message));
      setIsLoading(false);
      return;
    }

    setStep("code");
    setSuccess("Check your email for a 6-digit code.");
    setIsLoading(false);
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode();
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isVerifyingRef.current) return;

    const trimmedEmail = email.trim();
    const normalizedCode = code.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      setStep("email");
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    isVerifyingRef.current = true;
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: normalizedCode,
      type: "email",
    });

    if (verifyError) {
      setError(normalizeErrorMessage(verifyError.message));
      setIsLoading(false);
      isVerifyingRef.current = false;
      return;
    }

    await supabase.auth.getSession();

    const contextReset = await fetch("/api/me", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
    if (!contextReset.ok) {
      setError("Could not start a new account session. Please try again.");
      setIsLoading(false);
      isVerifyingRef.current = false;
      return;
    }

    router.replace("/select-account");
    router.refresh();
  }

  async function handleResendCode() {
    await sendCode();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <div className="w-full space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Login</h1>
        <p className="text-xs text-slate-500">
          Legacy sign-in. This deployment has not been cut over to SignalThread Platform Core.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="you@company.com"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? "Sending..." : "Send Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700" htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-[0.2em]"
              placeholder="123456"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleResendCode}
              className="text-sm font-medium text-slate-700 underline disabled:opacity-60"
            >
              Resend code
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
