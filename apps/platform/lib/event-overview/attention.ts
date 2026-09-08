import { humanizeStatus } from "./format";
import { orderProductKeys, productDefinition } from "./product-catalog";
import type { EventLifecycle } from "./lifecycle";

/**
 * One event-level attention queue, ranked by impact rather than grouped by
 * product. Items come from two places: products that report on the event
 * (through their feed) and the Platform registry itself (setup gaps that stop a
 * product from participating). Both flow into the same list.
 */

export type AttentionSeverity = "critical" | "at-risk" | "review";

export type AttentionSource = { key: string; label: string };

export type AttentionItem = {
  id: string;
  severity: AttentionSeverity;
  source: AttentionSource;
  title: string;
  context: string;
  action: { label: string; href: string } | null;
};

export const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, "at-risk": 1, review: 2 };

export const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  critical: "Critical",
  "at-risk": "At risk",
  review: "Review",
};

export const PLATFORM_SOURCE: AttentionSource = { key: "platform", label: "Platform" };

/** Severity first, then lifecycle product order, then title — deterministic for identical inputs. */
export function rankAttention(items: readonly AttentionItem[]): AttentionItem[] {
  const productOrder = (key: string) => (key === PLATFORM_SOURCE.key ? -1 : productDefinition(key).order);
  return [...items].sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    const order = productOrder(a.source.key) - productOrder(b.source.key);
    if (order !== 0) return order;
    return a.title.localeCompare(b.title);
  });
}

export function worstSeverity(items: readonly AttentionItem[]): AttentionSeverity | null {
  let worst: AttentionSeverity | null = null;
  for (const item of items) {
    if (worst === null || SEVERITY_RANK[item.severity] < SEVERITY_RANK[worst]) worst = item.severity;
  }
  return worst;
}

/**
 * Attention derived from real registry state — what Platform itself knows is
 * incomplete about the event. Nothing here is speculative: each item points at
 * a concrete gap and, when the viewer can fix it, at where.
 */
export function deriveRegistryAttention(input: {
  eventStatus: string;
  lifecycle: EventLifecycle;
  /** Entitled product keys and whether each has a live app. */
  products: readonly { key: string; deployed: boolean; registryName?: string | null }[];
  /** Where a Platform admin edits the event; null when the viewer cannot. */
  adminHref: string | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const adminAction = input.adminHref ? { label: "Open Platform admin", href: input.adminHref } : null;

  if (input.lifecycle.phase === "unknown") {
    items.push({
      id: "registry:dates",
      severity: "review",
      source: PLATFORM_SOURCE,
      title: input.lifecycle.reason === "invalid-dates" ? "Event dates need review" : "Event dates are not set",
      context: "The shared lifecycle clock needs valid event dates to place Before, During and After",
      action: adminAction,
    });
  }

  if (input.eventStatus === "DRAFT") {
    items.push({
      id: "registry:draft",
      severity: "review",
      source: PLATFORM_SOURCE,
      title: "Event is still a draft",
      context: `Status ${humanizeStatus(input.eventStatus)} · products can open it, but it is not marked active`,
      action: adminAction,
    });
  }

  for (const key of orderProductKeys(input.products.map((p) => p.key))) {
    const product = input.products.find((p) => p.key === key);
    if (!product || product.deployed) continue;
    const definition = productDefinition(key, product.registryName);
    items.push({
      id: `registry:not-live:${key}`,
      severity: "review",
      source: { key, label: definition.displayName },
      title: `${definition.displayName} launch is not connected`,
      context: "Enabled for this organization · Platform has no configured launch for this product",
      action: null,
    });
  }

  return items;
}
