import Link from "next/link";

function buildHref(params: {
  companyId?: string | null;
  eventId?: string | null;
  q?: string | null;
  status?: string | null;
}) {
  const search = new URLSearchParams();
  if (params.companyId) {
    search.set("companyId", params.companyId);
  }
  if (params.eventId) {
    search.set("eventId", params.eventId);
  }
  if (params.q) {
    search.set("q", params.q);
  }
  if (params.status) {
    search.set("status", params.status);
  }
  const qs = search.toString();
  return `/api/admin/leads/export${qs ? `?${qs}` : ""}`;
}

/** Platform admin: must pass exhibitor company id; optional event scope. */
export function PlatformLeadsExportLink(props: {
  companyId: string;
  eventId?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={buildHref({ companyId: props.companyId, eventId: props.eventId ?? undefined })}
      className={
        props.className ??
        "inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
      }
    >
      Export leads (CSV)
    </Link>
  );
}

/** Exhibitor: company comes from session; do not put companyId in the URL. */
export function ExhibitorLeadsExportLink(props: {
  eventId?: string | null;
  q?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={buildHref({ eventId: props.eventId ?? undefined, q: props.q ?? undefined })}
      className={
        props.className ??
        "inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
      }
    >
      Export CSV
    </Link>
  );
}

/** Organizer: eventId required for scoped export. */
export function OrganizerLeadsExportLink(props: {
  eventId: string;
  q?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={buildHref({ eventId: props.eventId, q: props.q ?? undefined })}
      className={
        props.className ??
        "inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900"
      }
    >
      Export CSV
    </Link>
  );
}
