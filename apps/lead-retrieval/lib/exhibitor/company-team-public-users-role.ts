import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";

/**
 * Map company-team / exhibitor-invite product roles to `public.users.role`.
 * Must satisfy `users_role_check` (0064): `exhibitor_admin` or `exhibitor_viewer` for booth staff.
 *
 * Product `viewer` ({@link CompanyMemberDbRole}) is the non-admin seat; it maps to
 * `exhibitor_viewer` (view-only DB role), not the legacy `exhibitor` string.
 */
export function publicUsersRoleForCompanyMember(
  companyRole: CompanyMemberDbRole
): "exhibitor_admin" | "exhibitor_viewer" {
  return companyRole === "exhibitor_admin" ? "exhibitor_admin" : "exhibitor_viewer";
}
