"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LoginForm } from "./login-form";
import { RecoveryPasswordForm } from "./recovery-password-form";
import { isRecoveryHash, parseRecoveryHash } from "./recovery-hash";

type RecoveryState =
  | { kind: "idle" }
  | { kind: "initializing" }
  | { kind: "ready" }
  | { kind: "expired"; message: string };

const DEFAULT_EXPIRED_MESSAGE = "Reset link expired, request a new one.";

type LoginPageClientProps = {
  initialRoleError?: boolean;
};

export function LoginPageClient({ initialRoleError = false }: LoginPageClientProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [recovery, setRecovery] = useState<RecoveryState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash;

      if (!isRecoveryHash(hash)) {
        return;
      }

      setRecovery({ kind: "initializing" });

      const parsed = parseRecoveryHash(hash);
      if (!parsed) {
        if (!cancelled) {
          setRecovery({ kind: "expired", message: DEFAULT_EXPIRED_MESSAGE });
        }
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken
      });

      if (cancelled) return;

      if (setSessionError) {
        setRecovery({
          kind: "expired",
          message: DEFAULT_EXPIRED_MESSAGE
        });
        return;
      }

      setRecovery({ kind: "ready" });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (recovery.kind === "initializing") {
    return <p className="mt-2 text-sm text-slate-600">Checking recovery link...</p>;
  }

  if (recovery.kind === "ready") {
    return <RecoveryPasswordForm />;
  }

  if (recovery.kind === "expired") {
    return <RecoveryPasswordForm initialError={recovery.message} />;
  }

  return <LoginForm initialRoleError={initialRoleError} />;
}
