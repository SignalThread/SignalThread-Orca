/**
 * Route allowlist for exhibitor_admin users with multi-event admin access.
 * Keeps platform-only surfaces (dashboard, exhibitors, licenses, etc.) unreachable.
 */
export function isExhibitorMultiEventAdminPathAllowed(pathname: string): boolean {
  if (pathname === "/admin/integrations") {
    return false;
  }
  if (pathname.startsWith("/admin/integrations/salesforce")) {
    return true;
  }
  if (pathname.startsWith("/admin/integrations/zapier")) {
    return true;
  }
  if (pathname === "/admin/events" || pathname.startsWith("/admin/events/")) {
    return true;
  }
  return false;
}
