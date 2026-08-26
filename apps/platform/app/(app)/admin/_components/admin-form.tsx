"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/server/admin-actions";

/**
 * A thin client wrapper around a server action.
 *
 * Its one real job beyond submitting is telling the user when a change will not
 * take effect in their own session until the access token is refreshed. Claims
 * live in the token, so an entitlement change reaches a live session only on
 * refresh — leaving that implicit is how "I granted it but nothing happened"
 * turns into a support ticket.
 */
export function AdminForm({
  action,
  title,
  description,
  children,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  title: string;
  description?: string;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const outcome = await action(formData);
    setResult(outcome);
    if (outcome.ok) startTransition(() => router.refresh());
  }

  async function refreshSession() {
    setRefreshing(true);
    // A full reload re-runs the server components with a refreshed token, which is
    // what actually picks up the new claim.
    const { createPlatformBrowserClient } = await import("@/lib/supabase/browser");
    await createPlatformBrowserClient().auth.refreshSession();
    window.location.reload();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold" style={{ color: "var(--signalthread-ink)" }}>
          {title}
        </h3>
        {description ? (
          <p className="text-xs" style={{ color: "var(--signalthread-muted)" }}>
            {description}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">{children}</div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--signalthread-accent)" }}
      >
        {pending ? "Working…" : submitLabel}
      </button>

      {result ? (
        <div className="space-y-2">
          <p
            role="status"
            className="text-xs"
            style={{ color: result.ok ? "var(--signalthread-muted)" : "#b91c1c" }}
          >
            {result.ok ? result.message : result.error}
          </p>

          {result.ok && result.refreshRequired ? (
            <div
              className="space-y-2 rounded-md border p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <p className="text-xs" data-testid="refresh-required" style={{ color: "var(--signalthread-ink)" }}>
                Authorization claims changed. Signed-in sessions keep the previous
                access until their token refreshes — up to one token lifetime.
              </p>
              <button
                type="button"
                onClick={refreshSession}
                disabled={refreshing}
                className="rounded-md border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--border)" }}
              >
                {refreshing ? "Refreshing…" : "Refresh my session now"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function Field({ label, name, type = "text", required, defaultValue }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2.5 py-1.5 text-xs"
        style={{ borderColor: "var(--border)", background: "var(--background)" }}
      />
    </label>
  );
}

export function SelectField({ label, name, options }: {
  label: string; name: string; options: { value: string; label: string }[];
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium">{label}</span>
      <select
        name={name}
        className="w-full rounded-md border px-2.5 py-1.5 text-xs"
        style={{ borderColor: "var(--border)", background: "var(--background)" }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
