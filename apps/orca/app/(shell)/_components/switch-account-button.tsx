"use client";

import { createContext, type ReactNode, useContext, useRef, useState } from "react";
import { clearOrganizationScopedBrowserState } from "@/lib/organization-scoped-browser-state";

const AccountAccessContext = createContext({ canSwitchAccount: false });

export function AccountAccessProvider({
  canSwitchAccount,
  children,
}: {
  canSwitchAccount: boolean;
  children: ReactNode;
}) {
  return <AccountAccessContext.Provider value={{ canSwitchAccount }}>{children}</AccountAccessContext.Provider>;
}

export function SwitchAccountButton({ canSwitchAccount: explicitCanSwitchAccount }: { canSwitchAccount?: boolean }) {
  const { canSwitchAccount: contextCanSwitchAccount } = useContext(AccountAccessContext);
  const canSwitchAccount = explicitCanSwitchAccount ?? contextCanSwitchAccount;
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const switchInFlightRef = useRef(false);

  if (!canSwitchAccount) return null;

  async function switchAccount() {
    if (switchInFlightRef.current) return;
    switchInFlightRef.current = true;
    setIsSwitching(true);
    setError(null);

    try {
      const response = await fetch("/api/me", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; userId?: string | null } | null;
      if (!response.ok || !body?.ok || !body.userId) {
        setError("Could not clear the current account context.");
        return;
      }

      clearOrganizationScopedBrowserState();
      window.location.replace("/select-account");
    } catch {
      setError("Could not clear the current account context.");
    } finally {
      switchInFlightRef.current = false;
      setIsSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={switchAccount}
        disabled={isSwitching}
        className="text-sm text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
      >
        {isSwitching ? "Switching..." : "Switch account"}
      </button>
      {error ? <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
