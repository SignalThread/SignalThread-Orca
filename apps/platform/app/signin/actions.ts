"use server";

import { redirect } from "next/navigation";
import { createPlatformServerClient } from "@/lib/supabase/server";

/**
 * Server-side password sign-in.
 *
 * This exists so the credential never depends on client JavaScript. The form
 * previously carried only an `onSubmit` handler with no `method` and no `action`:
 * if React had not hydrated, the browser fell back to its default submission,
 * which is a **GET to the current URL with every named input as a query
 * parameter**. That put the password in the address bar, and from there into
 * browser history, the `Referer` header on the next request, and any access log
 * in front of the app.
 *
 * A server action submits as POST by definition, so there is no degraded path
 * that can put credentials in a URL. It also keeps the password out of the
 * client bundle's control flow entirely.
 */

export type SignInState = { error: string | null };

/** Only same-origin relative paths, so `?next=` can never become an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/home";
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  let supabase;
  try {
    supabase = await createPlatformServerClient();
  } catch {
    // Auth is not configured for this deployment. Fail closed and say so without
    // leaking configuration detail.
    return { error: "Sign-in is unavailable right now. Please try again." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately one message for both "no such user" and "wrong password":
    // distinguishing them is an account-enumeration oracle. The Supabase error is
    // intentionally not echoed or logged -- it can carry the submitted address,
    // and nothing here may ever record a credential.
    return { error: "That email and password combination did not match an account." };
  }

  // redirect() throws internally, so it must sit outside the try/catch above or
  // the control-flow exception would be swallowed and reported as a failure.
  redirect(next);
}
