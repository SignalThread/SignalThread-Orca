import {
  SESSION_REGISTRATION_COMING_SOON_BADGE,
  SESSION_REGISTRATION_COMING_SOON_COPY,
} from "@/config/features";

/** Shared unavailable treatment for all unfinished session-registration entry points. */
export function SessionRegistrationUnavailableCard({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={compact
        ? "rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
        : "rounded-2xl border border-slate-200 bg-slate-50 p-4"}
      data-session-registration-unavailable
      role="group"
      aria-disabled="true"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-slate-700">Session registration</p>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {SESSION_REGISTRATION_COMING_SOON_BADGE}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">{SESSION_REGISTRATION_COMING_SOON_COPY}</p>
    </section>
  );
}
