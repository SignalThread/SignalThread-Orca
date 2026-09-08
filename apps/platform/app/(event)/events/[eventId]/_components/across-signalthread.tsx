import type { EventOverviewModel } from "@/lib/event-overview/view-model";
import { productAccent } from "@/lib/event-overview/product-catalog";
import { ArrowUpRightIcon } from "./icons";
import { Eyebrow, SectionHeading } from "./primitives";

/**
 * Cross-product intelligence: cards that exist only because two products share
 * one event. Provenance is part of every card. With no insight source connected
 * the section says so instead of showing plausible filler.
 */
export function AcrossSignalThread({ model }: { model: EventOverviewModel }) {
  const { insights, products } = model;
  return (
    <section aria-labelledby="across-signalthread">
      <SectionHeading
        id="across-signalthread"
        eyebrow="Across SignalThread"
        description="Signals from across the lifecycle that only make sense because they share one event"
        meta="Provenance shown per insight"
      />

      {insights.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-5 py-6 sm:px-6"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-card)" }}
          data-testid="insights-empty"
        >
          <p className="text-[15px] leading-[21px] font-semibold text-pretty" style={{ color: "var(--text-strong)" }}>
            No cross-product signals yet
          </p>
          <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[18px] text-pretty" style={{ color: "var(--text-muted)" }}>
            {products.length < 2
              ? "Insights combine facts from two or more enabled products on the same event. They appear when connected products report a supported finding."
              : model.connectedProductCount < 2
                ? `${products.length} products are enabled; ${model.connectedProductCount} share a summary for this event. Cross-product findings need at least two connected summaries and a supported insight source.`
                : "Connected products have not produced a combined signal for this event yet."}
          </p>
          {products.length >= 2 ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Products that will contribute">
              {products.map((product, index) => (
                <span key={product.key} className="flex items-center gap-2">
                  {index > 0 ? (
                    <span className="text-[10px] leading-3 font-medium" style={{ color: "#94a3b8" }}>
                      +
                    </span>
                  ) : null}
                  <Provenance productKey={product.key} label={product.definition.displayName} />
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="insights-grid">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </section>
  );
}

function Provenance({ productKey, label }: { productKey: string; label: string }) {
  const accent = productAccent(productKey);
  return (
    <span className="flex items-center gap-[5px]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: accent.text }} />
      <Eyebrow color={accent.text} tracking="0.06em">
        {label}
      </Eyebrow>
    </span>
  );
}

function InsightCard({ insight }: { insight: EventOverviewModel["insights"][number] }) {
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="insight-provenance">
        {insight.provenance.map((source, index) => (
          <span key={source.key} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-[10px] leading-3 font-medium" style={{ color: "#94a3b8" }}>
                +
              </span>
            ) : null}
            <Provenance productKey={source.key} label={source.label} />
          </span>
        ))}
      </div>
      <span className="text-[15px] leading-[21px] font-semibold text-pretty" style={{ color: "var(--text-strong)" }}>
        {insight.title}
      </span>
      <span className="text-[13px] leading-[18px] text-pretty" style={{ color: "var(--text-muted)" }}>
        {insight.evidence}
      </span>
      {insight.action ? (
        <span
          className="mt-auto flex items-center gap-1 text-[13px] leading-4 font-medium"
          style={{ color: "var(--text-link)" }}
        >
          {insight.action.label}
          <ArrowUpRightIcon size={13} />
        </span>
      ) : null}
    </>
  );
  const className = "flex flex-col gap-2.5 rounded-2xl border px-5 py-[18px] transition-colors";
  const style = {
    background: "var(--surface-card)",
    boxShadow: "var(--shadow-card)",
    color: "inherit",
  };
  return insight.action ? (
    <a href={insight.action.href} className={`${className} border-slate-200 hover:border-slate-300 hover:no-underline`} style={style} data-testid="insight-card">
      {body}
    </a>
  ) : (
    <div className={`${className} border-slate-200`} style={style} data-testid="insight-card">
      {body}
    </div>
  );
}
