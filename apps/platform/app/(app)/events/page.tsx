import Link from "next/link";
import { Badge } from "@signalthread/ui";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { getLauncherData } from "@/lib/server/launcher";
import { formatDateRange, humanizeStatus } from "@/lib/event-overview/format";
import { orderProductKeys, productDefinition } from "@/lib/event-overview/product-catalog";

export const dynamic = "force-dynamic";

/**
 * Every event the signed-in user can reach, grouped by organization. Each row
 * opens the event's overview, where product launches live.
 */
export default async function EventsPage() {
  const supabase = await createPlatformServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const organizations = await getLauncherData(user.id);
  const eventCount = organizations.reduce((total, org) => total + org.events.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col">
      <div className="flex flex-col gap-2">
        <span className="st-eyebrow" style={{ color: "var(--text-subtle)" }}>
          Events
        </span>
        <h1 className="text-[28px] leading-8 font-semibold tracking-[-0.02em] sm:text-[32px] sm:leading-9" style={{ color: "var(--text-strong)" }}>
          Your events
        </h1>
        <p className="text-sm leading-5" style={{ color: "var(--text-muted)" }}>
          {eventCount === 0
            ? "No events are available to this account yet."
            : `${eventCount} ${eventCount === 1 ? "event" : "events"} across ${organizations.length} ${
                organizations.length === 1 ? "organization" : "organizations"
              }. Open one to see every enabled product on its lifecycle.`}
        </p>
      </div>

      {organizations.map((organization) => (
        <section key={organization.organizationId} className="mt-8" aria-labelledby={`org-${organization.organizationId}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`org-${organization.organizationId}`} className="text-base font-semibold" style={{ color: "var(--text-strong)" }}>
              {organization.organizationName}
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {organization.organizationRole} ·{" "}
              {organization.products.length > 0
                ? orderProductKeys(organization.products)
                    .map((key) => productDefinition(key).displayName)
                    .join(", ")
                : "no products enabled"}
            </span>
          </div>

          {organization.events.length === 0 ? (
            <p
              className="rounded-2xl border border-dashed px-5 py-4 text-[13px]"
              style={{ borderColor: "var(--border-strong)", background: "var(--surface-card)", color: "var(--text-muted)" }}
            >
              No active events in this organization yet.
            </p>
          ) : (
            <ul
              className="m-0 list-none overflow-hidden rounded-2xl border p-0"
              style={{ background: "var(--surface-card)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-card)" }}
            >
              {organization.events.map((event, index) => {
                const dates = formatDateRange(event.startsAt, event.endsAt, event.timezone);
                return (
                  <li key={event.id} style={index === 0 ? undefined : { borderTop: "1px solid var(--border-hairline)" }}>
                    <Link
                      href={`/events/${event.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-slate-50 hover:no-underline sm:grid-cols-[minmax(0,1fr)_140px_110px_auto]"
                      style={{ color: "inherit" }}
                      data-testid={`event-link-${event.id}`}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold" style={{ color: "var(--text-strong)" }}>
                          {event.name}
                        </span>
                        <span className="truncate font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                          {event.slug}
                        </span>
                      </span>
                      <span className="col-span-2 text-[13px] sm:col-span-1" style={{ color: "var(--text-body)" }}>
                        {dates ?? "Dates not set"}
                      </span>
                      <span className="hidden sm:block">
                        <Badge tone={event.status === "ACTIVE" ? "success" : "neutral"}>{humanizeStatus(event.status)}</Badge>
                      </span>
                      <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "var(--text-link)" }}>
                        Open overview →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
