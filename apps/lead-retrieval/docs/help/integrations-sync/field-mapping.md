# Field Mapping

Field mapping tells the Admin Portal how source fields should line up with lead fields before data is imported, enriched, briefed, or synced.

Review mappings carefully. Incorrect mapping can create incomplete leads, weak Pre-Sales Briefs, or failed sync attempts.

---

## Where Field Mapping Appears

Verified field mapping behavior exists in the lead import and AI Briefings workflow. Uploaded or selected lead data is mapped into expected lead fields before review.

Some external integration field mapping may be provider-specific or planned. If a provider does not show mapping controls, do not assume custom mapping is available.

---

## Common Lead Fields

Common fields include:

- Full name
- Email
- Company
- Job title
- Phone
- Rating
- Temperature
- Follow-up date
- Notes or context

The exact required fields can vary by workflow. Include enough identifying information for each lead whenever possible.

---

## Mapping for Briefs

Briefing workspaces use mapped lead fields and added context to prepare brief drafts. If a name, company, title, or email maps incorrectly, the brief can be incomplete or misleading.

Review field mapping before approving a brief run.

---

## Mapping for Integrations

CRM and webhook integrations support specific payload fields. For example, CRM sync can use lead profile fields such as name, email, company, and title. Webhook payloads can include lead core profile fields and, depending on the selected payload mode, AI insight or conversation summary fields.

If a destination field is required by the external system, make sure the lead data contains that value before syncing.

---

## Troubleshooting Mapping Issues

**Fields are blank after import.**
Check whether the source column was mapped to the expected lead field.

**A brief looks generic.**
Confirm the mapped lead fields and add more context in the briefing workspace.

**CRM sync fails.**
Check required destination fields. Salesforce upsert/update by email requires a lead email. HubSpot contact sync also needs an email.

**Webhook payloads are missing data.**
Confirm the payload mode and whether the lead has the data selected for that mode.

---

## Product Questions

- Confirm whether custom field mapping controls are planned for every live provider.
- Confirm which provider-specific fields should be documented for each CRM destination beyond the current lead profile fields.

---

## Related Articles

- [Lead Import](../leads-briefs/lead-import.md)
- [Pre-Sales Briefs](../leads-briefs/pre-sales-briefs.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
