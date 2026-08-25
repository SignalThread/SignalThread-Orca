import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function HelpNotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-5 py-12 text-center">
      <div className="max-w-md">
        <FileQuestion className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-4 text-[10px] font-semibold uppercase text-[#28439A]">Help Center</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">This Help article is unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">The link may be outdated, the article may be restricted, or the page may no longer exist.</p>
        <Link href="/help" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#28439A] px-4 text-sm font-semibold text-white hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-[#28439A]/30"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Return to Help Center</Link>
      </div>
    </main>
  );
}

