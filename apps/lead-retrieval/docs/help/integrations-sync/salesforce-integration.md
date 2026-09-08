# Salesforce Integration

The Salesforce integration connects a company workspace to Salesforce through OAuth and supports lead sync setup and test sync.

Status: live connection and setup screens are implemented. Test sync currently targets Salesforce Leads.

---

## What It Does

Salesforce sync can send lead profile data to Salesforce Lead records.

Verified fields used by the test sync path include:

- First name and last name, split from full name
- Email
- Company
- Job title

The current sync behavior can create a Salesforce Lead, update an existing Lead, or upsert by email depending on the saved setup.

---

## Who Can Configure It

Platform Admins and Exhibitor Admins with company access can open Salesforce setup. OAuth configuration must be present for the environment.

---

## Where to Configure It

Open **Admin Portal → Integrations → Salesforce Setup**.

The setup page shows connection status, OAuth scopes, sync target settings, and sync behavior settings.

---

## Supported Sync Settings

Current setup includes:

- Sync target object options such as Lead, Contact, or Campaign Member
- Sync behavior options such as create only, update existing, or upsert by email
- Campaign name configuration

The implemented test sync path currently supports the Salesforce Lead target. Product question: confirm which non-Lead target flows are production-ready before documenting them as live.

---

## Common Issues

**OAuth fails.**
Confirm Salesforce OAuth environment configuration and reconnect.

**Upsert or update fails.**
Email is required for update/upsert by email behavior.

**The wrong Salesforce object is selected.**
Use Lead for the currently verified test sync path unless support confirms another target is enabled.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Field Mapping](field-mapping.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
