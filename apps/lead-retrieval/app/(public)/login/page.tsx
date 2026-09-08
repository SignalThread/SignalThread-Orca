import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";
import { LoginPageClient } from "./login-page-client";

type LoginPageProps = {
  searchParams?:
    | Promise<{ reset?: string; error?: string }>
    | { reset?: string; error?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams =
    searchParams &&
    typeof (searchParams as Promise<{ reset?: string; error?: string }>).then ===
      "function"
      ? await (searchParams as Promise<{ reset?: string; error?: string }>)
      : ((searchParams ?? {}) as { reset?: string; error?: string });

  const resetSuccess = String(resolvedSearchParams.reset ?? "") === "1";
  const initialRoleError = String(resolvedSearchParams.error ?? "") === "role";
  const authUser = await getCurrentSessionUser();

  if (authUser) {
    if (authUser.role === "platform_admin") {
      redirect("/admin");
    }
    if (authUser.role === "organizer_admin") {
      redirect("/app/organizer");
    }
    if (authUser.role === "exhibitor_admin" || authUser.role === "exhibitor_viewer") {
      redirect(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
    }
    // Unknown role: fall through and render the login page. The login form
    // handles the "role not configured" banner in local state — it is NOT
    // rendered here, and NOT rendered based on URL state alone.
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <LeadRetrievalBrandMark decorative={false} className="mb-5 h-12 w-12 object-contain" />
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Access your SignalThread Lead Retrieval workspace.</p>
        {resetSuccess ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Password updated. Sign in.
          </p>
        ) : null}
        <LoginPageClient initialRoleError={initialRoleError} />
      </div>
    </main>
  );
}
