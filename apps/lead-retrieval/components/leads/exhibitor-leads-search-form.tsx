"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

/**
 * Client search form so clearing the query can update the URL (strip `q`).
 * Uncontrolled defaultValue + fill() does not re-run the RSC tree; stale `q` in the URL
 * would keep the filtered server result until navigation.
 */
export function ExhibitorLeadsSearchForm({
  eventId,
  companyId,
  accountScope = false
}: {
  eventId: string | null;
  companyId: string | null;
  accountScope?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  const pushParamsFromForm = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const nextQ = String(fd.get("q") ?? "").trim();
    const ev = String(fd.get("eventId") ?? "").trim();
    const co = String(fd.get("companyId") ?? "").trim();

    const params = new URLSearchParams();
    if (ev) params.set("eventId", ev);
    if (co) params.set("companyId", co);
    if (accountScope) params.set("accountScope", "1");
    if (nextQ) params.set("q", nextQ);
    for (const key of ["rating", "temperature", "followUp", "workflowStatus"]) {
      const value = searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }
    const view = searchParams.get("view")?.trim();
    if (view) params.set("view", view);
    params.delete("minPriority");
    params.delete("followUpDue");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const stripSearchParam = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    pushParamsFromForm(e.currentTarget);
  };

  return (
    <form className="relative flex w-full max-w-xl items-center" onSubmit={onSubmit}>
      <input type="hidden" name="eventId" value={eventId ?? ""} />
      <input type="hidden" name="companyId" value={companyId ?? ""} />

      <svg
        className="absolute left-3.5 h-5 w-5 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <input
        name="q"
        type="search"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          if (!v.trim() && searchParams.get("q")) {
            stripSearchParam();
          }
        }}
        placeholder="Search leads by name, email, or company..."
        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-24 text-sm font-medium text-slate-900 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400"
      />
      <button
        type="submit"
        className="absolute right-1.5 h-8 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
      >
        Search
      </button>
    </form>
  );
}
