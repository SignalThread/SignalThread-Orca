import { Badge } from "@signalthread/ui";
import type { EventOverviewModel, ParticipatingProduct } from "@/lib/event-overview/view-model";
import { ProductIcon } from "./icons";
import { LaunchButton, SectionHeading, Surface } from "./primitives";

/**
 * One ledger, one row per participating product. The dashboard tells you what
 * is happening; the work happens inside the product with the event still
 * selected, through Platform's authorizing launcher.
 */
export function GoDeeper({ model }: { model: EventOverviewModel }) {
  const { products, event } = model;
  return (
    <section aria-labelledby="go-deeper">
      <SectionHeading
        id="go-deeper"
        eyebrow="Go deeper"
        description={`What each product contributes to ${event.name} right now. Detailed work happens inside; the event stays selected.`}
      />
      {products.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-5 py-5 text-[13px] leading-[18px] sm:px-6"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-card)", color: "var(--text-muted)" }}
        >
          No products are enabled for this organization. A Platform admin enables them per organization; each one
          then appears here as a row.
        </div>
      ) : (
        <Surface>
          <ul className="m-0 list-none p-0" data-testid="go-deeper-list">
            {products.map((product, index) => (
              <ProductRow key={product.key} product={product} first={index === 0} />
            ))}
          </ul>
        </Surface>
      )}
    </section>
  );
}

function ProductRow({ product, first }: { product: ParticipatingProduct; first: boolean }) {
  const { definition, accent } = product;
  return (
    <li
      className="relative grid grid-cols-1 items-center gap-x-[18px] gap-y-3 py-4 pr-4 pl-5 transition-colors hover:bg-slate-50 sm:pr-[22px] lg:grid-cols-[4px_200px_128px_150px_minmax(0,1fr)_auto] lg:pl-0"
      style={first ? undefined : { borderTop: "1px solid var(--border-hairline)" }}
      data-testid={`go-deeper-row-${product.key}`}
    >
      {/* Product accent: full-height bar on desktop, left edge on smaller screens. */}
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-0 w-1 lg:static lg:h-full"
        style={{ background: accent.text, opacity: product.status.kind === "setup" ? 0.45 : 1 }}
      />

      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: accent.soft, color: accent.text }}
        >
          <ProductIcon name={definition.icon} size={16} />
        </span>
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-[15px] leading-[18px] font-semibold" style={{ color: "var(--text-strong)" }}>
            {definition.displayName}
          </span>
          <span className="text-xs leading-[15px]" style={{ color: "var(--text-muted)" }}>
            {definition.responsibility}
          </span>
        </div>
      </div>

      <div>
        <Badge tone={product.ledgerStatus.tone} withDot style={{ height: 22, paddingBlock: 0, lineHeight: "16px" }}>
          {product.ledgerStatus.label}
        </Badge>
      </div>

      <div className="flex gap-4">
        {product.metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-0.5">
            <span
              className="text-xl leading-6 font-semibold tracking-[-0.02em] tabular-nums"
              style={{ color: metric.value === null ? "var(--text-subtle)" : "var(--text-strong)" }}
            >
              {metric.value ?? "—"}
            </span>
            <span className="text-[11px] leading-[14px]" style={{ color: "var(--text-muted)" }}>
              {metric.detail ?? metric.label}
            </span>
          </div>
        ))}
      </div>

      <p className="m-0 text-[13px] leading-[18px] text-pretty [overflow-wrap:anywhere]" style={{ color: "var(--text-body)" }}>
        {product.narrative}
      </p>

      <div className="flex lg:justify-end">
        <LaunchButton
          href={product.launchHref}
          disabledReason={product.launchUnavailableReason ?? undefined}
          testId={`open-${product.key}`}
        >
          Open {definition.displayName}
        </LaunchButton>
      </div>
    </li>
  );
}
