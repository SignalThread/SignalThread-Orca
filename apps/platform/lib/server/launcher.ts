import "server-only";

import { getPlatformAdminClient } from "./admin-client";
import { getProductAppUrl } from "./handoff";
import { getOrganizationAccessForUser, type OrganizationAccess } from "./registry";

/**
 * The Platform front door's data: what the signed-in user can reach, and where
 * each product opens.
 */

export type LaunchTarget = {
  productKey: string;
  productName: string;
  /** Absolute handoff URL, or null when that product has no configured app yet. */
  href: string | null;
};

export type LauncherEvent = {
  id: string;
  slug: string;
  name: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  products: LaunchTarget[];
};

export type LauncherOrganization = OrganizationAccess & { events: LauncherEvent[] };

/**
 * Where a product opens for a given event.
 *
 * The event id travels in the URL, which is a *navigation hint and nothing more*.
 * The receiving product re-validates it against the session server-side, so a
 * hand-edited id grants nothing. This is exactly why event ids stay out of the JWT.
 */
export function buildLaunchHref(productKey: string, eventId: string): string | null {
  // Launches go through Platform's own authorization endpoint, never straight at
  // the product. That endpoint re-verifies membership and entitlement server-side
  // and only then mints a one-time auth handoff, so the product receives a real
  // session on its own host instead of relying on a shared cookie.
  if (!getProductAppUrl(productKey)) {
    // No deployed app for this product yet: listed, but not launchable.
    return null;
  }
  return `/api/launch/${encodeURIComponent(productKey)}?event_id=${encodeURIComponent(eventId)}`;
}

function buildLaunchTarget(productKey: string, productName: string, eventId: string): LaunchTarget {
  return { productKey, productName, href: buildLaunchHref(productKey, eventId) };
}

export async function getLauncherData(userId: string): Promise<LauncherOrganization[]> {
  const access = await getOrganizationAccessForUser(userId);
  if (access.length === 0) return [];

  const supabase = getPlatformAdminClient();
  const orgIds = access.map((entry) => entry.organizationId);

  const [{ data: events, error: eventError }, { data: products, error: productError }] = await Promise.all([
    readLauncherEvents(orgIds),
    supabase.from("products").select("key, name"),
  ]);

  if (eventError) throw new Error(`Failed to read events: ${eventError.message}`);
  if (productError) throw new Error(`Failed to read products: ${productError.message}`);

  const productNames = new Map((products ?? []).map((p) => [String(p.key), String(p.name)]));

  return access.map((organization) => ({
    ...organization,
    events: (events ?? [])
      .filter((event) => event.organization_id === organization.organizationId)
      .map((event) => ({
        id: String(event.id),
        slug: String(event.slug),
        name: String(event.name),
        status: String(event.status),
        startsAt: event.starts_at ? String(event.starts_at) : null,
        endsAt: event.ends_at ? String(event.ends_at) : null,
        timezone: event.timezone ? String(event.timezone) : null,
        // Only products this organization is entitled to. An org without the
        // entitlement shows no action at all, rather than a link that will be denied.
        products: organization.products.map((key) =>
          buildLaunchTarget(key, productNames.get(key) ?? key, String(event.id)),
        ),
      })),
  }));
}

async function readLauncherEvents(orgIds: string[]) {
  const supabase = getPlatformAdminClient();
  const full = await supabase.from("events")
    .select("id, slug, name, status, starts_at, ends_at, organization_id, timezone")
    .in("organization_id", orgIds).neq("status", "ARCHIVED").order("name");
  if (!full.error || full.error.code !== "42703") return full;
  // Match the overview's additive metadata migration fallback on older projects.
  const core = await supabase.from("events")
    .select("id, slug, name, status, starts_at, ends_at, organization_id")
    .in("organization_id", orgIds).neq("status", "ARCHIVED").order("name");
  return { ...core, data: core.data?.map((event) => ({ ...event, timezone: null })) ?? null };
}
