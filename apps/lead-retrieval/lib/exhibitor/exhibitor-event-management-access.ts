import type { EventAccessResolution } from "@/lib/access/event-access-mode";
import { isExhibitorDirectPortfolioEventAccessResolution } from "@/lib/access/event-access-mode";

/**
 * Exhibitor admins may load `/app/events`, `/app/events/new`, and `/app/events/{id}/settings`
 * only on the **direct** company-portfolio branch (`company_all_events` from the canonical resolver).
 */
export function exhibitorAdminMayUseAppEventManagementRoutes(params: {
  role: string | null;
  resolution: EventAccessResolution;
}): boolean {
  const role = String(params.role ?? "").trim().toLowerCase();
  if (role !== "exhibitor_admin" && role !== "platform_admin") {
    return false;
  }
  return isExhibitorDirectPortfolioEventAccessResolution(params.resolution);
}
