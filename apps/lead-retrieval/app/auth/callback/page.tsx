"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";

type CallbackState = "processing" | "done" | "error";

function resolveRoleRedirectPath(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "platform_admin") return "/admin";
  if (normalized === "organizer_admin" || normalized === "event_organizer" || normalized === "organizer") {
    return "/app/organizer";
  }
  if (normalized === "exhibitor_admin" || normalized === "exhibitor_viewer") {
    return EXHIBITOR_WEB_ENTRY_RESOLVER_PATH;
  }
  return "/login?error=role";
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<CallbackState>("processing");
  const [message, setMessage] = useState("Processing sign-in...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const rawHash = window.location.hash || "";
      const hashParams = new URLSearchParams(rawHash.startsWith("#") ? rawHash.slice(1) : rawHash);
      const queryParams = new URLSearchParams(window.location.search || "");

      const queryError = queryParams.get("error");
      if (queryError) {
        const detail = queryParams.get("error_description") ?? queryError;
        router.replace(
          `/auth/error?reason=${encodeURIComponent("oauth_error")}&detail=${encodeURIComponent(detail)}`
        );
        return;
      }

      const hashError = hashParams.get("error");
      if (hashError) {
        const detail = hashParams.get("error_description") ?? hashError;
        router.replace(
          `/auth/error?reason=${encodeURIComponent("oauth_error")}&detail=${encodeURIComponent(detail)}`
        );
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");
      const code = queryParams.get("code");
      const tokenHash = queryParams.get("token_hash");
      const legacyToken = queryParams.get("token");
      const inviteCodeParam = queryParams.get("invite_code");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (sessionError) {
          if (cancelled) return;
          setState("error");
          setMessage(sessionError.message || "Failed to establish session.");
          router.replace(`/auth/error?reason=${encodeURIComponent("set_session_failed")}`);
          return;
        }

        const {
          data: { user },
          error: authUserError
        } = await supabase.auth.getUser();

        if (authUserError || !user) {
          if (cancelled) return;
          setState("error");
          setMessage(authUserError?.message || "Missing user after session setup.");
          router.replace(`/auth/error?reason=${encodeURIComponent("user_fetch_failed")}`);
          return;
        }

        if (!cancelled) {
          setMessage(type === "invite" ? "Invite accepted. Redirecting..." : "Signed in. Redirecting...");
        }

        const invitePayload =
          typeof inviteCodeParam === "string" && inviteCodeParam.trim() ? { invite_code: inviteCodeParam.trim() } : {};

        const completeRes = await fetch("/api/invites/complete-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(invitePayload)
        });

        if (!completeRes.ok) {
          if (cancelled) return;
          const errText = (await completeRes.text()) || "Invite completion failed.";
          setState("error");
          setMessage(errText);
          router.replace(
            `/auth/error?reason=${encodeURIComponent("invite_complete_failed")}&detail=${encodeURIComponent(errText)}`
          );
          return;
        }

        const { data: userRowAfter, error: roleAfterError } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle<{ role: string | null }>();

        if (roleAfterError) {
          if (cancelled) return;
          setState("error");
          setMessage(roleAfterError.message || "Failed loading user role after invite.");
          router.replace(`/auth/error?reason=${encodeURIComponent("role_fetch_failed")}`);
          return;
        }

        if (!cancelled) {
          setState("done");
        }

        router.replace(resolveRoleRedirectPath(userRowAfter?.role));
        return;
      }

      if (code || tokenHash || legacyToken) {
        setMessage("Completing server-side auth callback...");
        setState("done");
        window.location.replace(`/auth/server-callback${window.location.search || ""}`);
        return;
      }

      setMessage("Missing auth callback parameters.");
      setState("error");
      router.replace(`/auth/error?reason=${encodeURIComponent("missing_params")}`);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <LeadRetrievalBrandMark decorative={false} className="mb-5 h-12 w-12 object-contain" />
        <h1 className="text-2xl font-semibold">Auth Callback</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        {state === "processing" ? <p className="mt-3 text-xs text-slate-500">Please wait...</p> : null}
      </section>
    </main>
  );
}
