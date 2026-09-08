# Lead Import

Lead import lets Admin users upload lead data into an event workspace so the team can review, enrich, brief, and follow up from one place.

---

## What You Can Upload

Use a lead file with columns for contact and company details. CSV-style files are the safest format when you are unsure what the workspace supports. If your workspace also accepts spreadsheet files, the import flow will show those supported formats.

The verified import path is an uploaded lead file. Other source options should be treated as planned unless they are enabled and documented for your workspace.

---

## Required and Optional Fields

The exact required fields can depend on your workspace configuration. In general, include enough information to identify each lead, such as:

- Name
- Company
- Email
- Phone
- Job title

Optional fields may include notes, tags, ratings, follow-up context, or custom fields if your workspace supports them.

---

## Map Fields

Field mapping connects your file columns to SignalThread lead fields.

Review each detected column before continuing. If a column is not needed, leave it unmapped. If an important column is missing, update the lead file and upload again.

---

## Fix Failed Rows

Some rows may fail validation if required information is missing or formatted incorrectly.

Common fixes include:

- Add a missing name, company, email, or phone value.
- Correct invalid email formatting.
- Remove blank rows.
- Split combined values into separate columns.
- Confirm the import is using the correct event.

---

## Duplicates

Duplicate handling can vary by workspace and import flow. Before importing a large file, confirm whether your workspace updates existing leads, skips duplicates, or creates new records.

Product question: final customer-facing duplicate behavior should be confirmed before publishing stronger guidance.

---

## After Upload

After a successful upload, imported leads should appear in the selected event's lead list. Depending on enabled features, they may also be available for AI brief preparation, campaigns, enrichment, exports, or workflow automation.

---

## Troubleshooting

**Uploaded leads are missing.**
Check the selected event, active filters, and search terms. Confirm the import finished successfully.

**Headers were not detected.**
Make sure the first row contains column names.

**Rows failed validation.**
Review the failed row messages, fix the source file, and retry the import.

---

## Related Articles

- [Users and Roles](../admin-portal/users-and-roles.md)
- [Field Mapping](../integrations-sync/field-mapping.md)
- [Pre-Sales Briefs](pre-sales-briefs.md)
- [Campaign Builder](../campaigns-follow-up/campaign-builder.md)
- [Campaign Troubleshooting FAQ](../campaigns-follow-up/troubleshooting-faq.md)
