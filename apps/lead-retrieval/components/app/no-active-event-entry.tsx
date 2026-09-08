import Link from "next/link";

export type EventEntryListItem = {
  id: string;
  name: string;
  /** Short line under the name (e.g. date · status). */
  subtitle?: string | null;
};

type NoActiveEventEntryProps = {
  mode: "empty" | "choose";
  /** When null, user cannot self-serve create on this surface (CTA hidden). */
  createEventHref: string | null;
  events: EventEntryListItem[];
  buildOpenHref: (eventId: string) => string;
  /** Overrides default empty-mode headline. */
  emptyHeadline?: string;
  /** Overrides default empty-mode body (both with- and without-CTA sentences use this if set). */
  emptyDescription?: string;
  /** Dedicated first-event experience for the company portfolio home. */
  variant?: "default" | "exhibitor-onboarding";
};

const EMPTY_HEADLINE_DEFAULT = "No events yet";
const EMPTY_BODY_WITH_CREATE =
  "You don't have any events yet. Create your first event to get started.";
const EMPTY_BODY_WITHOUT_CREATE = "You don't have any events yet.";
const EMPTY_HELPER =
  "If your team manages events for you, ask an admin to assign one to your account.";

const btnPrimary =
  "inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:w-auto sm:self-start";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50";

export function NoActiveEventEntry({
  mode,
  createEventHref,
  events,
  buildOpenHref,
  emptyHeadline,
  emptyDescription,
  variant = "default"
}: NoActiveEventEntryProps) {
  const isEmpty = mode === "empty";
  const showList = !isEmpty && events.length > 0;
  const exhibitorOnboarding = isEmpty && variant === "exhibitor-onboarding";

  const emptyBodyResolved =
    emptyDescription ??
    (createEventHref ? EMPTY_BODY_WITH_CREATE : EMPTY_BODY_WITHOUT_CREATE);

  if (exhibitorOnboarding) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-15rem)] w-full max-w-4xl items-center justify-center px-4 py-10 md:px-6 md:py-14">
        <section
          data-testid="exhibitor-no-events-onboarding"
          className="relative w-full overflow-hidden rounded-3xl border border-indigo-100 bg-white px-6 py-9 shadow-[0_20px_60px_rgba(79,70,229,0.10)] sm:px-10 sm:py-11"
          aria-labelledby="no-events-title"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className="relative grid items-center gap-9 md:grid-cols-[minmax(0,1fr)_250px] md:gap-12">
            <div className="max-w-xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">SignalThread LR</p>
              <h1 id="no-events-title" className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                No events yet
              </h1>
              <p className="mt-3 max-w-[42ch] text-base leading-7 text-slate-600">
                Create your first event to start capturing and managing leads.
              </p>
              {createEventHref ? (
                <Link
                  href={createEventHref}
                  className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Create event
                </Link>
              ) : (
                <p className="mt-6 max-w-[40ch] text-sm leading-6 text-slate-500">{EMPTY_HELPER}</p>
              )}
            </div>

            <div className="mx-auto flex h-48 w-full max-w-[15rem] items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-violet-50 to-white p-5 shadow-inner md:h-56" aria-hidden="true">
              <svg viewBox="0 0 220 176" className="h-full w-full" fill="none">
                <rect x="30" y="38" width="160" height="112" rx="18" fill="white" stroke="#C7D2FE" strokeWidth="3" />
                <rect x="30" y="38" width="160" height="30" rx="18" fill="#4F46E5" />
                <path d="M30 57h160v11H30z" fill="#4F46E5" />
                <circle cx="53" cy="53" r="4" fill="white" fillOpacity=".9" />
                <circle cx="67" cy="53" r="4" fill="white" fillOpacity=".7" />
                <circle cx="81" cy="53" r="4" fill="white" fillOpacity=".5" />
                <rect x="54" y="86" width="112" height="13" rx="6.5" fill="#E0E7FF" />
                <rect x="54" y="111" width="72" height="11" rx="5.5" fill="#EEF2FF" />
                <rect x="54" y="132" width="43" height="9" rx="4.5" fill="#F1F5F9" />
                <path d="M163 23v25M150.5 35.5h25" stroke="#A78BFA" strokeWidth="5" strokeLinecap="round" />
                <circle cx="178" cy="128" r="14" fill="#C4B5FD" fillOpacity=".45" />
                <path d="M172 128h12M178 122v12" stroke="#6D28D9" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full justify-center px-4 pb-10 pt-1 md:px-6 md:pb-12">
      <section className="w-full max-w-[22rem] rounded-2xl border border-slate-200/90 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.04] md:max-w-[24rem] md:p-8">
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-[1.35rem]">
              {isEmpty ? (emptyHeadline ?? EMPTY_HEADLINE_DEFAULT) : "Choose an event"}
            </h1>
            <p className="max-w-[34ch] text-sm leading-relaxed text-slate-600">
              {isEmpty ? emptyBodyResolved : "Select an event to continue, or create a new one."}
            </p>
          </div>

          {createEventHref ? (
            <Link href={createEventHref} className={btnPrimary}>
              Create Event
            </Link>
          ) : null}

          {isEmpty ? (
            <p className="max-w-[36ch] text-xs font-medium leading-relaxed text-slate-400">{EMPTY_HELPER}</p>
          ) : null}
        </div>

        {showList ? (
          <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-6">
            <h2 className="px-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Your events</h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/40">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 first:pt-3 last:pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{ev.name}</p>
                    {ev.subtitle ? <p className="truncate text-xs text-slate-500">{ev.subtitle}</p> : null}
                  </div>
                  <Link href={buildOpenHref(ev.id)} className={`${btnSecondary} shrink-0`}>
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function formatEventEntrySubtitle(startDate: string | null | undefined, status: string | null | undefined): string | null {
  const parts: string[] = [];
  if (startDate) {
    const d = new Date(startDate);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        })
      );
    }
  }
  const st = String(status ?? "").trim();
  if (st) parts.push(st);
  return parts.length ? parts.join(" · ") : null;
}
