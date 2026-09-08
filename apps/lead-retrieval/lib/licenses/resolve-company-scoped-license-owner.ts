/**
 * Pure resolution rules documented for company-scoped license `licenses.company_id` (host / billing side).
 */

export type ResolveCompanyScopedLicenseOwnerResult =
  | { ok: true; licenseOwnerCompanyId: string }
  | { ok: false; error: string };

/**
 * When an explicit host company id is provided (platform admin), it must match the exhibitor
 * company's organizer linkage.
 */
export function resolveCompanyScopedLicenseOwnerWithExplicitHost(input: {
  exhibitorOrganizerId: string;
  hostCompanyId: string;
  hostOrganizerId: string;
}): ResolveCompanyScopedLicenseOwnerResult {
  const { exhibitorOrganizerId, hostCompanyId, hostOrganizerId } = input;
  if (!hostCompanyId) {
    return { ok: false, error: "Host company is required for this license." };
  }
  if (exhibitorOrganizerId !== hostOrganizerId) {
    return {
      ok: false,
      error: "Host company must belong to the same organizer as the exhibitor company."
    };
  }
  return { ok: true, licenseOwnerCompanyId: hostCompanyId };
}
