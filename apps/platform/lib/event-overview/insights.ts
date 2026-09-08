import { orderProductKeys, productDefinition } from "./product-catalog";

/**
 * Across SignalThread: conclusions that only exist because two or more
 * products share one event. Every insight names its provenance — the products
 * whose facts were combined — and points at the work item inside one of them.
 *
 * Insights are produced by an `InsightSource`. Like product feeds, no source
 * is connected today; the section renders its empty state rather than a
 * plausible-looking card.
 */

export type InsightProvenance = { key: string; label: string };

export type CrossProductInsight = {
  id: string;
  organizationId: string;
  eventId: string;
  /** At least two distinct products. Insights with fewer are not cross-product and are dropped. */
  provenance: InsightProvenance[];
  title: string;
  evidence: string;
  /** A product target, never an arbitrary URL. Platform resolves the secure event launch. */
  action: { productKey: string } | null;
};

export type ResolvedInsight = Omit<CrossProductInsight, "action"> & {
  action: { label: string; href: string } | null;
};

export interface InsightSource {
  getInsights(input: { organizationId: string; eventId: string; productKeys: readonly string[] }): Promise<
    CrossProductInsight[]
  >;
}

export const NO_INSIGHTS: InsightSource = {
  async getInsights() {
    return [];
  },
};

/**
 * Keep only insights whose provenance is genuinely cross-product and whose
 * products all participate in this event; order provenance in lifecycle order
 * so cards read consistently.
 */
export function prepareInsights(
  insights: readonly CrossProductInsight[],
  participatingKeys: readonly string[],
  launchHrefFor: (productKey: string) => string | null = () => null,
): ResolvedInsight[] {
  const participating = new Set(participatingKeys);
  const prepared: ResolvedInsight[] = [];
  for (const insight of insights) {
    const keys = orderProductKeys(insight.provenance.map((p) => p.key));
    if (keys.length < 2) continue;
    if (!keys.every((key) => participating.has(key))) continue;
    const target = insight.action?.productKey;
    const href = target && keys.includes(target) ? launchHrefFor(target) : null;
    prepared.push({
      ...insight,
      action: href && target ? { label: `Open ${productDefinition(target).displayName}`, href } : null,
      provenance: keys.map((key) => ({
        key,
        label: insight.provenance.find((p) => p.key === key)?.label ?? productDefinition(key).displayName,
      })),
    });
  }
  return prepared;
}
