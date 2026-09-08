import { SEVERITY_LABEL, type AttentionItem } from "@/lib/event-overview/attention";
import type { EventOverviewModel } from "@/lib/event-overview/view-model";
import { ArrowUpRightIcon, SeverityIcon } from "./icons";
import { Eyebrow, SectionHeading, Surface } from "./primitives";

const SEVERITY_COLOR: Record<AttentionItem["severity"], string> = {
  critical: "var(--status-danger)",
  "at-risk": "var(--status-warning)",
  review: "var(--status-review-text)",
};

/**
 * One ranked, event-level queue. Rows are ordered by impact, never grouped by
 * product; Registration and Housing surface their pre-live blockers through
 * whichever product plans them until they report for themselves.
 */
export function NeedsAttention({ model }: { model: EventOverviewModel }) {
  const { attention } = model;
  const count = attention.length;
  const description =
    count === 0
      ? "No attention items reported for this event"
      : `${count} ${count === 1 ? "item" : "items"} across the event, ranked by severity`;

  return (
    <section aria-labelledby="needs-attention">
      <SectionHeading id="needs-attention" eyebrow="Needs attention" description={description} />

      {count === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-5 py-5 text-[13px] leading-[18px] sm:px-6"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-card)", color: "var(--text-muted)" }}
          data-testid="attention-empty"
        >
          No blockers have been reported by the connected sources.
        </div>
      ) : (
        <Surface>
          <ol className="m-0 list-none p-0" data-testid="attention-list">
            {attention.map((item, index) => (
              <AttentionRow key={item.id} item={item} first={index === 0} />
            ))}
          </ol>
        </Surface>
      )}
      {model.connectedProductCount < model.products.length ? (
        <p className="mt-2 text-xs leading-4" style={{ color: "var(--text-muted)" }}>
          Product attention is available from {model.connectedProductCount} of {model.products.length} enabled products.
          Check the remaining products for operational issues; this queue includes Platform setup gaps.
        </p>
      ) : null}
    </section>
  );
}

function AttentionRow({ item, first }: { item: AttentionItem; first: boolean }) {
  const content = (
    <>
      <span
        className="flex items-center gap-1.5 text-xs leading-4 font-semibold whitespace-nowrap"
        style={{ color: SEVERITY_COLOR[item.severity] }}
        data-testid="attention-severity"
      >
        <SeverityIcon severity={item.severity} size={13} />
        {SEVERITY_LABEL[item.severity]}
      </span>
      <Eyebrow color="#64748b" tracking="0.06em" className="truncate">
        {item.source.label}
      </Eyebrow>
      <span className="col-span-2 flex min-w-0 flex-col gap-0.5 md:col-span-1">
        <span className="text-sm leading-5 font-semibold [overflow-wrap:anywhere]" style={{ color: "var(--text-strong)" }}>
          {item.title}
        </span>
        <span className="text-[13px] leading-[18px] [overflow-wrap:anywhere]" style={{ color: "var(--text-muted)" }}>
          {item.context}
        </span>
      </span>
      <span
        className="col-span-2 flex items-center gap-1 text-[13px] leading-4 font-medium whitespace-nowrap md:col-span-1 md:justify-self-end"
        style={{ color: item.action ? "var(--text-link)" : "var(--text-subtle)" }}
      >
        {item.action ? (
          <>
            {item.action.label}
            <ArrowUpRightIcon size={13} />
          </>
        ) : (
          "No action available"
        )}
      </span>
    </>
  );
  const className =
    "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 transition-colors sm:px-[22px] md:grid-cols-[100px_118px_minmax(0,1fr)_auto] md:gap-x-5";
  const style = first ? undefined : { borderTop: "1px solid var(--border-hairline)" };
  return (
    <li style={style} data-testid="attention-row">
      {item.action ? (
        <a href={item.action.href} className={`${className} hover:bg-slate-50 hover:no-underline`} style={{ color: "inherit" }}>
          {content}
        </a>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}
