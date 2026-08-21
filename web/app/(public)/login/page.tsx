import { redirect } from "next/navigation";
import { getPlatformSignInUrl, isPlatformEntryRoutingConfigured } from "@/lib/platform/entry";
import { isLegacyAuthAuthorityAllowed, resolveAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";
import { LegacyOtpLoginForm } from "./legacy-otp-login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Orca is not an authentication entry point.
 *
 * Platform Core owns sign-in, so this route is a redirector: it sends visitors to the
 * configured Platform Core sign-in URL and carries a return-to link so they land back where
 * they were headed. The local one-time-code form survives only for the legacy Orca auth
 * authority, which production may not use unless it has been deliberately rolled back.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnToPath = firstValue(params.next);

  const platformSignInUrl = getPlatformSignInUrl(returnToPath);
  if (platformSignInUrl) {
    redirect(platformSignInUrl);
  }

  const authority = (() => {
    try {
      return resolveAuthAuthorityConfig();
    } catch {
      return null;
    }
  })();

  const legacyLoginAvailable = authority?.source === "legacy-orca" && isLegacyAuthAuthorityAllowed();

  if (legacyLoginAvailable) {
    return <LegacyOtpLoginForm />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <section className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in through SignalThread</h1>
        <p className="text-sm text-slate-600">
          Orca no longer signs users in directly. Sign in to SignalThread and open Orca from there.
        </p>
        <p className="text-xs text-slate-500">
          {isPlatformEntryRoutingConfigured()
            ? "The SignalThread sign-in link could not be built. Contact your administrator."
            : "Platform Core sign-in routing is not configured for this deployment."}
        </p>
      </section>
    </main>
  );
}
