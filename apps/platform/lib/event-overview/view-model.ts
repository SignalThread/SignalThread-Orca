import {
  deriveRegistryAttention,
  rankAttention,
  worstSeverity,
  SEVERITY_RANK,
  type AttentionItem,
  type AttentionSeverity,
} from "./attention";
import { formatDateRange, humanizeStatus } from "./format";
import { prepareInsights, type CrossProductInsight, type ResolvedInsight } from "./insights";
import { deriveLifecycle, safeTimeZone, type EventLifecycle } from "./lifecycle";
import {
  orderProductKeys,
  productAccent,
  productDefinition,
  type ProductAccent,
  type ProductDefinition,
} from "./product-catalog";
import type { ProductFact, ProductFeed, ProductMetric } from "./product-feed";

/**
 * The connected-event dashboard's view model, assembled from registry state,
 * launch configuration and whatever product feeds and insights are connected.
 *
 * Pure: the server loader gathers inputs, this function decides what the page
 * says. Every rule about participation, status, fallbacks and ranking lives
 * here so it can be asserted directly.
 */

export type EventRecord = {
  id: string;
  slug: string;
  name: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  timezone: string | null;
};

export type OverviewOrganization = { id: string; slug: string; name: string; role: string };

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

export type ProductStatusKind = "active" | "available" | "setup" | "needs-review" | "at-risk";

export type ProductStatus = { kind: ProductStatusKind; label: string; tone: Tone };

export type ParticipatingProduct = {
  key: string;
  definition: ProductDefinition;
  accent: ProductAccent;
  /** A product app is configured, so the launcher can open it. */
  deployed: boolean;
  /** Platform's authorizing launch URL for this event, or null when the product cannot open. */
  launchHref: string | null;
  launchUnavailableReason: string | null;
  /** Whether a feed for this event reached Platform. */
  connected: boolean;
  status: ProductStatus;
  /** Label used in the Go deeper ledger badge. */
  ledgerStatus: { label: string; tone: Tone };
  purpose: string;
  band: { copy: string; pending: boolean };
  fact: ProductFact;
  metrics: [ProductMetric, ProductMetric];
  narrative: string;
};

export type EventOverviewModel = {
  event: EventRecord & { dateRange: string | null };
  organization: OverviewOrganization;
  lifecycle: EventLifecycle;
  health: { label: string; tone: Tone };
  /** "Nov 3–5, 2026 · Moscone Center · 74 days out · Planning" as parts. */
  headingMeta: string[];
  products: ParticipatingProduct[];
  connectedProductCount: number;
  insights: ResolvedInsight[];
  attention: AttentionItem[];
  footer: { label: string; value: string; mono?: boolean; title?: string }[];
};

export type BuildEventOverviewInput = {
  event: EventRecord;
  organization: OverviewOrganization;
  /** Product keys the organization is entitled to (already ACTIVE-filtered by the registry). */
  entitledProducts: readonly string[];
  /** Registry display names by key, used for products this catalogue does not know. */
  productNames?: ReadonlyMap<string, string>;
  /** Product keys with a configured app. */
  deployedProducts: readonly string[];
  /** Platform's launch URL for a product and this event; null when it cannot open. */
  launchHrefFor: (productKey: string, eventId: string) => string | null;
  feeds: Readonly<Record<string, ProductFeed>>;
  insights: readonly CrossProductInsight[];
  now: Date;
  /** Where the viewer edits the event, when they are a Platform admin. */
  adminHref: string | null;
};

const STATUS_PRESENTATION: Record<ProductStatusKind, ProductStatus> = {
  available: { kind: "available", label: "Available", tone: "neutral" },
  active: { kind: "active", label: "Active", tone: "success" },
  setup: { kind: "setup", label: "Setup", tone: "neutral" },
  "needs-review": { kind: "needs-review", label: "Needs review", tone: "warning" },
  "at-risk": { kind: "at-risk", label: "At risk", tone: "warning" },
};

export function buildEventOverview(input: BuildEventOverviewInput): EventOverviewModel {
  const lifecycle = deriveLifecycle({
    startsAt: input.event.startsAt,
    endsAt: input.event.endsAt,
    timeZone: input.event.timezone,
    now: input.now,
  });
  const dateRange = formatDateRange(input.event.startsAt, input.event.endsAt, input.event.timezone);
  const deployed = new Set(input.deployedProducts);
  const launchable = input.event.status !== "ARCHIVED";
  const feeds = Object.fromEntries(Object.entries(input.feeds).filter(([key, feed]) =>
    feed.productKey === key && feed.eventId === input.event.id && feed.organizationId === input.organization.id,
  ));

  const products = orderProductKeys(input.entitledProducts).map((key) =>
    buildProduct({
      key,
      registryName: input.productNames?.get(key) ?? null,
      organizationName: input.organization.name,
      deployed: deployed.has(key),
      launchHref: launchable && deployed.has(key) ? input.launchHrefFor(key, input.event.id) : null,
      archived: !launchable,
      feed: feeds[key],
    }),
  );

  const feedAttention: AttentionItem[] = products.flatMap((product) => {
    const feed = feeds[product.key];
    if (!feed) return [];
    return feed.attention.map((item) => ({
      id: `${product.key}:${item.id}`,
      severity: item.severity,
      source: { key: product.key, label: product.definition.displayName },
      title: item.title,
      context: item.context,
      action: item.action && product.launchHref ? { label: `Open ${product.definition.displayName}`, href: product.launchHref } : null,
    }));
  });

  const attention = rankAttention([
    ...feedAttention,
    ...deriveRegistryAttention({
      eventStatus: input.event.status,
      lifecycle,
      products: products.map((p) => ({ key: p.key, deployed: p.deployed, registryName: p.definition.displayName })),
      adminHref: input.adminHref,
    }),
  ]);

  const headingMeta = [
    lifecycle.phase === "unknown" ? lifecycle.label : dateRange ?? "Dates not set",
    input.event.venue,
    lifecycle.phase === "unknown" ? null : lifecycle.label,
    lifecycle.phase === "unknown" ? null : lifecycle.phaseLabel,
  ].filter((part): part is string => Boolean(part));
  const reportedSeverity: AttentionSeverity | null = products.some((p) => p.status.kind === "at-risk") ? "at-risk"
    : products.some((p) => p.status.kind === "needs-review") ? "review" : null;
  const queueSeverity = worstSeverity(attention);
  const eventSeverity = reportedSeverity && (!queueSeverity || SEVERITY_RANK[reportedSeverity] < SEVERITY_RANK[queueSeverity])
    ? reportedSeverity : queueSeverity;

  return {
    event: { ...input.event, dateRange },
    organization: input.organization,
    lifecycle,
    health: deriveHealth(input.event.status, eventSeverity),
    headingMeta,
    products,
    connectedProductCount: products.filter((p) => p.connected).length,
    insights: prepareInsights(
      input.insights.filter((insight) => insight.eventId === input.event.id && insight.organizationId === input.organization.id),
      products.map((p) => p.key),
      (key) => products.find((p) => p.key === key)?.launchHref ?? null,
    ),
    attention,
    footer: [
      { label: "Organization", value: input.organization.name },
      { label: "Dates", value: dateRange ?? "Not set" },
      { label: "Venue", value: input.event.venue ?? "Not set" },
      { label: "Timezone", value: input.event.timezone && safeTimeZone(input.event.timezone) === input.event.timezone ? input.event.timezone : "UTC (fallback)" },
      { label: "Lifecycle", value: `${humanizeStatus(input.event.status)} · ${lifecycle.phaseLabel}` },
      { label: "Event ID", value: input.event.id, mono: true, title: input.event.slug },
    ],
  };
}

function buildProduct(input: {
  key: string;
  registryName: string | null;
  organizationName: string;
  deployed: boolean;
  launchHref: string | null;
  archived: boolean;
  feed: ProductFeed | undefined;
}): ParticipatingProduct {
  const definition = productDefinition(input.key, input.registryName);
  const accent = productAccent(input.key);
  const name = definition.displayName;
  const launchUnavailableReason = input.launchHref ? null : input.archived
    ? "Archived events cannot be opened in products."
    : `${name} does not have a configured Platform launch yet.`;

  if (input.feed) {
    const status = STATUS_PRESENTATION[input.feed.status];
    return {
      key: input.key,
      definition,
      accent,
      deployed: input.deployed,
      launchHref: input.launchHref,
      launchUnavailableReason,
      connected: true,
      status,
      ledgerStatus: { label: status.label, tone: status.tone },
      purpose: input.feed.status === "setup" ? definition.purpose.pending : definition.purpose.live,
      band: { copy: input.feed.headline, pending: input.feed.status === "setup" },
      fact: input.feed.fact,
      metrics: input.feed.metrics,
      narrative: input.feed.narrative,
    };
  }

  if (input.deployed) {
    // Entitlement and deployment establish launch availability, not event activation or health.
    const status = STATUS_PRESENTATION.available;
    return {
      key: input.key,
      definition,
      accent,
      deployed: true,
      launchHref: input.launchHref,
      launchUnavailableReason,
      connected: false,
      status,
      ledgerStatus: { label: status.label, tone: status.tone },
      purpose: definition.purpose.pending,
      band: { copy: "Summary not connected", pending: true },
      fact: { kind: "unavailable", label: "Not connected" },
      metrics: [
        { label: definition.metricLabels[0], value: null },
        { label: definition.metricLabels[1], value: null },
      ],
      narrative: `${name} can open with this event selected. Its operational status and metrics are not shared with Platform yet.`,
    };
  }

  const status = STATUS_PRESENTATION.setup;
  return {
    key: input.key,
    definition,
    accent,
    deployed: false,
    launchHref: null,
    launchUnavailableReason,
    connected: false,
    status,
    ledgerStatus: { label: "Setup incomplete", tone: "neutral" },
    purpose: definition.purpose.pending,
    band: { copy: "Launch not connected", pending: true },
    fact: { kind: "unavailable", label: "Setup" },
    metrics: [
      { label: definition.metricLabels[0], value: null },
      { label: definition.metricLabels[1], value: null },
    ],
    narrative: `${name} is enabled for ${input.organizationName}. Its Platform launch and event summary are not connected yet.`,
  };
}

function deriveHealth(status: string, worst: AttentionSeverity | null): { label: string; tone: Tone } {
  // An archived event is closed; open items no longer change how it reads.
  if (status === "ARCHIVED") return { label: "Archived", tone: "neutral" };
  if (worst === "critical") return { label: "Critical", tone: "danger" };
  if (worst === "at-risk") return { label: "At risk", tone: "warning" };
  if (worst === "review") return { label: "Needs review", tone: "warning" };
  if (status === "ACTIVE") return { label: "Active", tone: "neutral" };
  if (status === "DRAFT") return { label: "Draft", tone: "neutral" };
  return { label: humanizeStatus(status), tone: "neutral" };
}

/** "5 products enabled", "1 product enabled". */
export function productCountLabel(count: number): string {
  return `${count} ${count === 1 ? "product" : "products"} enabled`;
}
