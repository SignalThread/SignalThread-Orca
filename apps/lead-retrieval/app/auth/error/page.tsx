import Link from "next/link";
import { LeadRetrievalBrandMark } from "@/components/layout/lead-retrieval-brand-mark";

type AuthErrorPageProps = {
  searchParams?: Promise<{ reason?: string; detail?: string }> | { reason?: string; detail?: string };
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ reason?: string; detail?: string }>).then === "function"
      ? await (searchParams as Promise<{ reason?: string; detail?: string }>)
      : ((searchParams ?? {}) as { reason?: string; detail?: string });

  const reason = String(resolvedSearchParams.reason ?? "unknown").trim() || "unknown";
  const detailRaw = resolvedSearchParams.detail;
  const detail = typeof detailRaw === "string" && detailRaw.trim() ? detailRaw.trim() : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <LeadRetrievalBrandMark decorative={false} className="mb-5 h-12 w-12 object-contain" />
        <h1 className="text-2xl font-semibold">Authentication Error</h1>
        <p className="mt-2 text-sm text-slate-600">
          We could not complete sign-in. Reason: <span className="font-mono">{reason}</span>
        </p>
        {detail ? (
          <p className="mt-2 break-words text-sm text-slate-600">
            <span className="font-semibold text-slate-700">Detail: </span>
            <span className="font-mono text-xs">{detail}</span>
          </p>
        ) : null}
        <div className="mt-4">
          <Link href="/login" className="text-sm font-semibold text-accent hover:underline">
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}
