"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    if (isLoading) return;
    setIsLoading(true);

    const supabase = createBrowserSupabaseClient();
    await fetch("/api/me", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    await supabase.auth.signOut();
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
