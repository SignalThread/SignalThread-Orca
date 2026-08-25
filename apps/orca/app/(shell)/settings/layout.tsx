import type { ReactNode } from "react";
import Link from "next/link";

export default function AccountSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-8 sm:px-8">
      <Link
        href="/events"
        className="flex h-8 w-fit items-center rounded-lg px-3 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B1638]/15"
        aria-label="Go to all events"
      >
        All events
      </Link>
      <div className="mt-6">{children}</div>
    </main>
  );
}
