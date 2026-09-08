// License seat enforcement is handled exclusively by evaluateAppAccessGrant / reconcileLicenseSeatsUsed
// in lib/server/event-user-access.ts. The following stale helpers were removed:
//   - ensureCompanyLicense (queried by company_id only, no event_id scoping)
//   - syncLicenseSeatUsage (was a no-op, now handled by reconcileLicenseSeatsUsed)
//
// License creation is handled by:
//   - POST /api/admin/licenses (platform admin)
//   - POST /api/v1/exhibitors (exhibitor registration with upsert)
