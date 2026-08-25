"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";
import { getPlatformSignOutUrl } from "@/lib/platform/entry";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    if (isLoading) return;
    setIsLoading(true);

    const supabase = createBrowserSupabaseClient();
    // Clear Orca's organization context first, then the shared auth session.
    await fetch("/api/me", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    await supabase.auth.signOut({ scope: "global" }).catch(() => null);

    // Every input is a NEXT_PUBLIC_ value inlined at build time, so the browser can resolve
    // the Platform Core sign-out URL without a round trip.
    const platformSignOutUrl = getPlatformSignOutUrl();
    if (platformSignOutUrl) {
      window.location.assign(platformSignOutUrl);
      return;
    }

    // No Platform Core routing configured: fall back to the local entry point, which is
    // itself a redirector to Platform Core when that is configured.
    router.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className="text-sm text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
    >
      {isLoading ? "Logging out..." : "Log out"}
    </button>
  );
}
