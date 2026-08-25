import { verifyMarketingUnsubscribeToken } from "@/src/server/services/marketing-unsubscribe";

type MarketingUnsubscribePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ status?: string }>;
};

export default async function MarketingUnsubscribePage({ params, searchParams }: MarketingUnsubscribePageProps) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const status = query.status;
  let valid = true;

  try {
    verifyMarketingUnsubscribeToken(token);
  } catch {
    valid = false;
  }

  if (!valid || status === "invalid") {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Marketing emails</p>
          <h1 className="mt-3 text-[28px] leading-[32px] font-semibold text-slate-900">Unsubscribe link unavailable</h1>
          <p className="mt-3 text-[14px] leading-6 text-slate-600">
            This unsubscribe link is invalid or no longer available.
          </p>
        </div>
      </main>
    );
  }

  if (status === "unsubscribed") {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Marketing emails</p>
          <h1 className="mt-3 text-[28px] leading-[32px] font-semibold text-slate-900">
            You have been unsubscribed from this event&apos;s marketing emails.
          </h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Marketing emails</p>
        <h1 className="mt-3 text-[28px] leading-[32px] font-semibold text-slate-900">
          Unsubscribe from this event&apos;s marketing emails?
        </h1>
        <form className="mt-6" action={`/api/public/marketing/unsubscribe/${encodeURIComponent(token)}`} method="post">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[14px] font-semibold text-white"
          >
            Unsubscribe
          </button>
        </form>
      </div>
    </main>
  );
}
