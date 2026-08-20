# Platform Admin MVP Notes

PlatformAdmin maps to the current schema role `SUPER_ADMIN` and is platform-wide. Customer accounts remain `Organization` records in the database, even when the UI labels them as accounts.

Tenancy follows `Organization -> Client -> Event`. `Membership` links users to organizations and supports account-level user management. Event visibility is separate: `EventMember` rows control whether a user can see a specific event and what event-level role they have.

All `/api/platform/*` routes are server-side PlatformAdmin surfaces and must call the canonical PlatformAdmin gate. UI controls may guide the workflow, but server authorization and org/event scoping own enforcement.

The Platform Admin context switch stores only an organization/account id in the `platformActiveOrgId` cookie. It lets the real PlatformAdmin user view the normal app shell scoped to that account. It is not impersonation, does not change the authenticated user identity, and does not create `EventMember` rows.

Normal org users should continue through the existing membership and event-access paths. Platform context is only honored for `SUPER_ADMIN`.
