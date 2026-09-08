/**
 * The typed boundary through which a product reports on an event.
 *
 * Platform holds the registry (who, which org, which event, which products);
 * the facts about an event — sessions, registrants, rooms, leads, responses —
 * live inside each product's own database. A product contributes them to the
 * dashboard by publishing a `ProductFeed` for the event through an adapter that
 * implements `ProductFeedSource`.
 *
 * No adapter exists yet: there is no service-to-service contract between
 * Platform and any product today (the only cross-app contract is the launch
 * handoff), and `apps/*` may not import each other's code. Until one ships the
 * dashboard renders each product's *registry* state — entitled and launchable —
 * and says plainly that its summary is not connected. It never fabricates a
 * number to look complete.
 */

export type ProductFact =
  | { kind: "count"; value: number }
  /** A semantic state standing in for a number, e.g. "Not open", "Contracts pending". */
  | { kind: "state"; label: string }
  /** The product has not shared this fact with Platform. */
  | { kind: "unavailable"; label: string };

export type ProductReportedStatus = "active" | "setup" | "needs-review" | "at-risk";

export type ProductMetric = { label: string; value: string | null; detail?: string };

export type FeedAttentionItem = {
  id: string;
  severity: "critical" | "at-risk" | "review";
  title: string;
  context: string;
  /** Whether to offer a secure event launch. Work-item destinations are not yet supported by the launcher. */
  action?: { label: string } | null;
};

export type ProductFeed = {
  productKey: string;
  organizationId: string;
  eventId: string;
  status: ProductReportedStatus;
  /** Compact copy for the lifecycle band, e.g. "24% roadmap · 18 sessions · 1 overdue". */
  headline: string;
  /** The product's contribution to the shared event object. */
  fact: ProductFact;
  /** Two headline metrics for the Go deeper ledger. */
  metrics: [ProductMetric, ProductMetric];
  /** One or two sentences of current state. */
  narrative: string;
  attention: FeedAttentionItem[];
  /** When the product produced this feed. */
  reportedAt: string;
};

export interface ProductFeedSource {
  /** Feeds for the products that can report on this event; absent keys mean "not connected". */
  getFeeds(input: { organizationId: string; eventId: string; productKeys: readonly string[] }): Promise<
    Record<string, ProductFeed>
  >;
}

/** The current production source: no product publishes a feed to Platform yet. */
export const NO_PRODUCT_FEEDS: ProductFeedSource = {
  async getFeeds() {
    return {};
  },
};
