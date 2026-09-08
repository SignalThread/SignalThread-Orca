import { isSafeCanonicalId } from "../server/canonical-id";
import type { OrganizationAccess } from "../server/registry";
import { NO_INSIGHTS, type InsightSource } from "./insights";
import { NO_PRODUCT_FEEDS, type ProductFeedSource } from "./product-feed";
import { buildEventOverview, type EventOverviewModel, type EventRecord } from "./view-model";

export type OverviewEventRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  organization_id: string;
  venue?: string | null;
  timezone?: string | null;
};

export type OverviewLoadInput = {
  userId: string;
  eventId: string;
  platformAdmin: boolean;
  now?: Date;
  feedSource?: ProductFeedSource;
  insightSource?: InsightSource;
};

/** Registry reads are injected for deterministic access tests; production binds the canonical server services. */
export interface OverviewRegistry {
  getAccess(userId: string): Promise<OrganizationAccess[]>;
  readEvent(eventId: string): Promise<OverviewEventRow | null>;
  getProductNames(): Promise<ReadonlyMap<string, string>>;
  getProductAppUrl(key: string): string | null;
  buildLaunchHref(key: string, eventId: string): string | null;
}

export async function loadAuthorizedEventOverview(input: OverviewLoadInput, registry: OverviewRegistry): Promise<EventOverviewModel | null> {
  if (!isSafeCanonicalId(input.eventId)) return null;

  const [access, row] = await Promise.all([registry.getAccess(input.userId), registry.readEvent(input.eventId)]);
  if (!row) return null;

  const organization = access.find((entry) => entry.organizationId === String(row.organization_id));
  if (!organization) return null;

  const productNames = await registry.getProductNames();

  const event: EventRecord = {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    status: String(row.status),
    startsAt: row.starts_at ? String(row.starts_at) : null,
    endsAt: row.ends_at ? String(row.ends_at) : null,
    venue: row.venue ? String(row.venue) : null,
    timezone: row.timezone ? String(row.timezone) : null,
  };

  const feedSource = input.feedSource ?? NO_PRODUCT_FEEDS;
  const insightSource = input.insightSource ?? NO_INSIGHTS;
  const scope = { organizationId: organization.organizationId, eventId: event.id, productKeys: organization.products };
  const [feeds, insights] = await Promise.all([feedSource.getFeeds(scope), insightSource.getInsights(scope)]);

  return buildEventOverview({
    event,
    organization: {
      id: organization.organizationId,
      slug: organization.organizationSlug,
      name: organization.organizationName,
      role: organization.organizationRole,
    },
    entitledProducts: organization.products,
    productNames,
    deployedProducts: organization.products.filter((key) => registry.getProductAppUrl(key) !== null),
    launchHrefFor: registry.buildLaunchHref,
    feeds,
    insights,
    now: input.now ?? new Date(),
    adminHref: input.platformAdmin ? "/admin" : null,
  });
}
