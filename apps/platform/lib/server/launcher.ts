import "server-only";

import { getPlatformAdminClient } from "./admin-client";
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
function buildLaunchTarget(productKey: string, productName: string, eventId: string): LaunchTarget {
  if (productKey === "orca") {
    const base = process.env.NEXT_PUBLIC_ORCA_APP_URL?.trim();
    if (!base) return { productKey, productName, href: null };
    return {
      productKey,
      productName,
      href: `${base.replace(/\/$/, "")}/platform-entry?event_id=${encodeURIComponent(eventId)}`,
    };
  }
  // Other products have no deployed app yet; they are listed but not launchable.
  return { productKey, productName, href: null };
}

export async function getLauncherData(userId: string): Promise<LauncherOrganization[]> {
  const access = await getOrganizationAccessForUser(userId);
  if (access.length === 0) return [];

  const supabase = getPlatformAdminClient();
  const orgIds = access.map((entry) => entry.organizationId);

  const [{ data: events, error: eventError }, { data: products, error: productError }] = await Promise.all([
    supabase
      .from("events")
      .select("id, slug, name, status, organization_id")
      .in("organization_id", orgIds)
      .neq("status", "ARCHIVED")
      .order("name"),
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
        // Only products this organization is entitled to. An org without the
        // entitlement shows no action at all, rather than a link that will be denied.
        products: organization.products.map((key) =>
          buildLaunchTarget(key, productNames.get(key) ?? key, String(event.id)),
        ),
      })),
  }));
}
