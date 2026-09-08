import Link from "next/link";

export default function HelpNotFound() {
  return (
    <main className="min-h-[60vh] bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-sky-700">Help Docs</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          We could not find that article.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The link may have moved, or the article may not be published yet. Start from the Help
          home page to browse available docs.
        </p>
        <Link
          href="/help"
          className="mt-6 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Back to Help
        </Link>
      </section>
    </main>
  );
}
