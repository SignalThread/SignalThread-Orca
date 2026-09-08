export default function EventLoading() {
  return (
    <div className="mx-auto max-w-[1160px] px-5 py-16 sm:px-10" role="status" aria-live="polite" aria-busy="true">
      <p className="text-sm text-slate-600">Loading event overview…</p>
      <div aria-hidden className="mt-7 h-72 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
