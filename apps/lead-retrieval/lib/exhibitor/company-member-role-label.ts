import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";

/**
 * Product-facing labels for company / exhibitor team roles.
 * Canonical stored values remain `exhibitor_admin` | `viewer`.
 */
export function companyMemberRoleProductLabel(role: CompanyMemberDbRole | string | null | undefined): string {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "exhibitor_admin") return "Exhibitor admin";
  return "App user";
}
