# HubSpot Integration

The HubSpot integration connects a company workspace to HubSpot so selected leads can be pushed to HubSpot contacts.

Status: live configuration and manual lead sync are implemented when HubSpot OAuth credentials are configured for the environment.

---

## What It Does

HubSpot sync can create or update HubSpot contacts from SignalThread lead records.

Verified fields used by the sync path include:

- Email
- First name and last name, split from full name
- Company
- Job title

The sync looks for an existing HubSpot contact by email. If one exists, it updates that contact. If none exists, it creates a new contact.

---

## Who Can Configure It

Exhibitor Admins with company access can open the HubSpot integration page. Setup requires HubSpot OAuth environment configuration and a HubSpot account with contact read/write permissions.

---

## Where to Configure It

Open **Admin Portal → Integrations → HubSpot**.

The setup flow redirects to HubSpot so the user can sign in and approve contact read/write scopes.

---

## Sync Behavior

The current visible workflow includes manual sync from the HubSpot integration page. The page lets an admin search for a lead and push that lead to HubSpot on demand.

Product question: confirm whether any automatic HubSpot sync is intended beyond the manual lead push flow.

---

## Common Issues

**Connect button is disabled or unavailable.**
The environment may be missing HubSpot OAuth configuration, or the user may not have company access.

**Lead cannot sync.**
Confirm the lead has an email address. HubSpot contact matching uses email.

**HubSpot rejects the request.**
Reconnect HubSpot and confirm the connected HubSpot account has contact permissions.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
