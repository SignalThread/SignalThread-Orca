import { formatCount } from "@/lib/event-overview/format";
import { PHASES, spanColumns } from "@/lib/event-overview/product-catalog";
import type { ProductFact } from "@/lib/event-overview/product-feed";
import {
  productCountLabel,
  type EventOverviewModel,
  type ParticipatingProduct,
} from "@/lib/event-overview/view-model";
import { CheckIcon, LinkIcon, ProductIcon } from "./icons";
import { ActionLink, Eyebrow, StatusInline, Surface } from "./primitives";

/** Fixed matrix columns at desktop: capability · phases · status · open. */
const MATRIX_COLUMNS = "md:grid-cols-[190px_minmax(0,1fr)_112px_70px]";
const MATRIX_FIXED_WIDTH = 190 + 112 + 70;

const PHASE_LABEL: Record<(typeof PHASES)[number], string> = { before: "Before", during: "During", after: "After" };

/**
 * The connected platform hero: one event object on the left, the lifecycle
 * architecture on the right, joined by a connector. Every product is a band
 * spanning the phases it owns; a product that is not enabled is simply absent,
 * so the frame reads the same with one product or five.
 */
export function ConnectedPlatform({ model }: { model: EventOverviewModel }) {
  const { products, lifecycle } = model;
  const count = products.length;
  const fewWord = ["no", "one", "two", "three", "four", "five"][count] ?? String(count);
  const subtitle = `One event · ${fewWord} ${count === 1 ? "product" : "products"} · one connected lifecycle`;

  return (
    <Surface className="mt-7">
      {/* Platform status rail */}
      <div
        className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5 sm:px-[22px]"
        style={{ background: "var(--surface-muted)", borderColor: "var(--border-subtle)" }}
        data-testid="platform-rail"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "var(--accent-primary)", boxShadow: "0 0 0 3px var(--accent-primary-soft)" }}
          />
          <Eyebrow color="#334155" tracking="0.06em">
            SignalThread Platform
          </Eyebrow>
          <span className="text-xs leading-4" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </span>
        </div>
        <ul className="flex flex-wrap items-center gap-x-[18px] gap-y-1" aria-label="Shared platform state">
          <SharedState>One organization</SharedState>
          <SharedState>One identity layer</SharedState>
          <SharedState>One event context</SharedState>
          <SharedState ok={count > 0}>{productCountLabel(count)}</SharedState>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 xl:grid-cols-[300px_40px_minmax(0,1fr)] xl:gap-0">
        <EventObject model={model} />

        {/* Connector: the event record feeds every band to its right. */}
        <div className="relative hidden xl:block" aria-hidden>
          <div className="absolute top-11 right-0 left-0 h-px" style={{ background: "#94a3b8" }} />
          <div
            className="absolute -right-px top-10 h-[9px] w-[9px] rounded-full"
            style={{ background: "#fff", border: "2px solid var(--accent-primary)" }}
          />
        </div>

        {/* Lifecycle architecture */}
        <div className="flex min-w-0 flex-col">
          <div
            className={`hidden h-11 items-end border-b md:grid ${MATRIX_COLUMNS}`}
            style={{ borderColor: "#94a3b8" }}
          >
            <Eyebrow color="#64748b" tracking="0.06em" className="pb-2.5">
              Capability
            </Eyebrow>
            <div className="relative grid grid-cols-3 pb-2.5">
              {PHASES.map((phase, index) => (
                <Eyebrow key={phase} color="#64748b" tracking="0.06em" className={index > 0 ? "pl-2.5 whitespace-nowrap" : ""}>
                  {PHASE_LABEL[phase]}
                </Eyebrow>
              ))}
              {lifecycle.markerPosition !== null ? (
                <span
                  className="st-eyebrow absolute -top-5 -translate-x-1/2 whitespace-nowrap"
                  style={{
                    left: `${lifecycle.markerPosition * 100}%`,
                    color: "var(--accent-primary)",
                    letterSpacing: "0.04em",
                    textTransform: "none",
                  }}
                  data-testid="lifecycle-now"
                >
                  Now · {lifecycle.label}
                </span>
              ) : null}
            </div>
            <Eyebrow color="#64748b" tracking="0.06em" className="pb-2.5">
              Status
            </Eyebrow>
            <Eyebrow color="#64748b" className="pb-2.5 text-right">Open</Eyebrow>
          </div>

          {/* Compact phase legend where the matrix header does not fit. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2 md:hidden" style={{ borderColor: "#94a3b8" }}>
            <Eyebrow color="#64748b" tracking="0.06em">
              Capability · Before / During / After
            </Eyebrow>
            {lifecycle.markerPosition !== null ? (
              <span className="text-[10px] leading-3 font-semibold whitespace-nowrap" style={{ color: "var(--accent-primary)" }}>
                Now · {lifecycle.label}
              </span>
            ) : null}
          </div>

          <div className="relative flex flex-col">
            {lifecycle.markerPosition !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 z-0 hidden w-0 border-l border-dashed opacity-50 md:block"
                style={{
                  left: `calc(190px + (100% - ${MATRIX_FIXED_WIDTH}px) * ${lifecycle.markerPosition})`,
                  borderColor: "var(--accent-primary)",
                }}
              />
            ) : null}

            {products.length === 0 ? (
              <p className="py-6 text-[13px] leading-[18px]" style={{ color: "var(--text-muted)" }}>
                No SignalThread products are enabled for this organization yet. Enabled products join this
                lifecycle as bands; nothing else about the page changes.
              </p>
            ) : (
              products.map((product, index) => (
                <LifecycleRow key={product.key} product={product} last={index === products.length - 1} />
              ))
            )}
          </div>

          {/* Shared identity rail */}
          <div
            className="mt-3.5 flex items-center gap-3.5 rounded-lg border px-3.5 py-2.5"
            style={{ background: "var(--surface-muted)", borderColor: "var(--border-subtle)" }}
          >
            <span className="flex w-24 shrink-0 items-center gap-2">
              <LinkIcon size={14} className="shrink-0" style={{ color: "var(--accent-primary)" }} />
              <Eyebrow color="#334155" tracking="0.06em" className="min-w-0">
                {count > 2 ? `Shared by all ${fewWord}` : count === 2 ? "Shared by both" : "Shared foundation"}
              </Eyebrow>
            </span>
            <span className="min-w-0 flex-1 text-xs leading-4" style={{ color: "#475569" }}>
              Same organization · shared Platform identity · same event context · one lifecycle clock.
              Each enabled product joins this connected event.
            </span>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function SharedState({ children, ok = true }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-center gap-1.5 text-xs leading-4 font-medium whitespace-nowrap" style={{ color: "#334155" }}>
      {ok ? (
        <CheckIcon size={13} style={{ color: "var(--status-success-text)" }} />
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ border: "1.5px solid #94a3b8" }} />
      )}
      {children}
    </li>
  );
}

function EventObject({ model }: { model: EventOverviewModel }) {
  const { event, products } = model;
  const subline = [event.dateRange ?? "Dates not set", event.venue].filter(Boolean).join(" · ");
  return (
    <div
      className="flex flex-col rounded-xl p-5 sm:p-6 sm:pb-[22px]"
      style={{ background: "var(--surface-event)", color: "var(--text-on-event)" }}
      data-testid="event-object"
    >
      <Eyebrow color="var(--text-on-event-subtle)" tracking="0.08em">
        One connected event
      </Eyebrow>
      <span className="mt-3 text-[26px] leading-[30px] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{event.name}</span>
      <span className="mt-1.5 text-[13px] leading-[18px]" style={{ color: "var(--text-on-event-muted)" }}>
        {subline}
      </span>

      <dl className="mt-5 flex flex-col" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
        {products.map((product, index) => (
          <div
            key={product.key}
            className="flex items-baseline justify-between gap-2.5 py-[9px]"
            style={index < products.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,.08)" } : undefined}
          >
            <dt className="flex items-center gap-[7px] text-xs leading-4" style={{ color: "var(--text-on-event-muted)" }}>
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: product.accent.dot }} />
              {product.definition.factLabel}
            </dt>
            <dd className="m-0 text-right">
              <FactValue fact={product.fact} />
            </dd>
          </div>
        ))}
        {products.length === 0 ? (
          <div className="py-[9px] text-xs leading-4" style={{ color: "var(--text-on-event-muted)" }}>
            No products are enabled for this event’s organization yet.
          </div>
        ) : null}
      </dl>

      <div className="flex-1" />
      <span className="mt-4 text-xs leading-4 text-pretty" style={{ color: "var(--text-on-event-subtle)" }}>
        {model.connectedProductCount > 0
          ? "Product-owned facts, brought together for this same event."
          : "Measures join this event as product summaries connect."}
      </span>
    </div>
  );
}

function FactValue({ fact }: { fact: ProductFact }) {
  if (fact.kind === "count") {
    return <span className="text-base leading-5 font-semibold tabular-nums">{formatCount(fact.value)}</span>;
  }
  return (
    <span className="text-[13px] leading-5 font-medium" style={{ color: "var(--text-on-event-subtle)" }}>
      {fact.label}
    </span>
  );
}

function LifecycleRow({ product, last }: { product: ParticipatingProduct; last: boolean }) {
  const { definition, accent, band } = product;
  const columns = spanColumns(definition.span);
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 md:min-h-14 md:gap-0 md:py-0 ${MATRIX_COLUMNS}`}
      style={last ? undefined : { borderBottom: "1px solid var(--border-hairline)" }}
      data-testid={`lifecycle-row-${product.key}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]"
          style={{ background: accent.soft, color: accent.text }}
        >
          <ProductIcon name={definition.icon} size={15} />
        </span>
        <div className="flex min-w-0 flex-col gap-px">
          <Eyebrow color={accent.text} tracking="0.06em">
            {definition.capability}
          </Eyebrow>
          <span className="truncate text-[13px] leading-4 font-semibold" style={{ color: "var(--text-strong)" }}>
            {definition.displayName}
          </span>
          <span className="text-[11px] leading-[14px] md:whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            {product.purpose}
          </span>
        </div>
      </div>

      {/* Band: spans the phases this product owns. */}
      <div className="order-3 col-span-2 grid min-w-0 grid-cols-3 md:order-none md:col-span-1 md:py-2">
        <div
          className="relative z-[1] flex min-h-8 min-w-0 items-center justify-between gap-2.5 rounded-[7px] px-3 py-1"
          style={{
            gridColumn: `${columns.start} / ${columns.end}`,
            marginLeft: columns.start > 1 ? 10 : 0,
            background: band.pending ? accent.faint : accent.soft,
            border: `1px ${band.pending ? "dashed" : "solid"} ${accent.border}`,
          }}
        >
          <span className="text-xs leading-4 font-medium [overflow-wrap:anywhere]" style={{ color: accent.ink }}>
            {band.copy}
          </span>
        </div>
      </div>

      <div className="order-2 flex flex-wrap items-center justify-end gap-3 md:order-none md:contents">
        <StatusInline label={product.status.label} tone={product.status.tone} />
        {product.launchHref ? (
          <ActionLink href={product.launchHref} size="xs" className="justify-end md:flex" external>
            Open
          </ActionLink>
        ) : (
          <span title={product.launchUnavailableReason ?? undefined} className="text-xs leading-4 text-right whitespace-nowrap" style={{ color: "var(--text-subtle)" }}>
            Unavailable
          </span>
        )}
      </div>
    </div>
  );
}
