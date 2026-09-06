"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "./actions";

/**
 * Email + password sign-in.
 *
 * The provider choice is not arbitrary: the Platform Core project has only the
 * `email` provider enabled (no OAuth, no phone, no SAML), so password grant is
 * the one flow that works today.
 *
 * Submission is a **server action**, deliberately. An earlier version used only
 * an `onSubmit` handler on a form with no `method` and no `action`; before React
 * hydrated, the browser's default submission took over and issued a GET with
 * `email` and `password` as query parameters. `useActionState` keeps the pending
 * and error UX while guaranteeing POST semantics even with JavaScript disabled,
 * so there is no degraded path that can put a credential in a URL.
 */

const INITIAL: SignInState = { error: null };

export function SignInForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <form
      action={formAction}
      // No explicit `method` attribute: React renders server-action forms as POST on
      // the server but normalises the attribute to lower case on the client, so any
      // literal here hydration-mismatches. POST is guaranteed structurally by
      // `action={formAction}` -- a server action has no GET form -- and the
      // regression test pins that the server action is what submits this form.
      className="space-y-4"
    >
      {/* Carried in the body, never the query string. */}
      <input type="hidden" name="next" value={nextPath} />

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
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm" style={{ color: "#b91c1c" }}>
          {state.error}
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
