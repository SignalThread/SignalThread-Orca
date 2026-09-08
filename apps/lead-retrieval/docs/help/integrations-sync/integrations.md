# Integrations Overview

Integrations connect the Admin Portal with approved external systems so lead data, enrichment context, or workflow events can move through your team's process.

Only integrations that appear as available or configurable in your Admin Portal should be treated as live for your workspace. Connectors marked **Coming Soon**, **Planned**, or disabled are future functionality.

---

## Live Integration Areas

The current Admin Portal includes live setup surfaces for these integration areas:

- **CRM sync:** HubSpot and Salesforce
- **Sales and enrichment providers:** Apollo, ZoomInfo, and People Data Labs
- **Workflow webhooks:** Make.com, n8n, and Zapier
- **Email delivery:** SendGrid is used by platform email features such as invites and campaign sending when configured for the environment

Some integrations are available to Exhibitor Admins from the exhibitor Integrations page. Others require broader admin access or environment configuration.

---

## Planned and Future Integrations

The integrations catalog includes planned connectors that may appear as coming soon. Planned/future providers include Microsoft Dynamics 365, Marketo, Pardot, Mailchimp, Slack, Microsoft Teams, Gmail, and Outlook.

Do not rely on a planned connector until it is enabled in your workspace.

---

## What Data Can Move

The data that moves depends on the provider:

- CRM sync can send selected lead profile fields such as name, email, company, and title.
- Enrichment providers can add or support company/person context used by lead enrichment and briefing workflows.
- Webhook integrations can send lead and conversation-event payloads to automation tools.
Field support is provider-specific. Review the provider article before enabling a workflow.

---

## Who Can Configure Integrations

Most exhibitor-facing integrations require an Exhibitor Admin with company access. Some setup screens require Platform Admin access or environment configuration.

If you can view an integration but cannot configure it, check your role and company/event access.

---

## Campaign Agents Are Separate

Campaign Agents help shape campaign and follow-up email drafts. They do not connect external systems and do not send data to integrations by themselves.

Use integrations for data movement and sync. Use Campaign Agents for campaign-writing guidance.

---

## Related Articles

- [Configure an Integration](configure-an-integration.md)
- [Field Mapping](field-mapping.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
- [HubSpot Integration](hubspot-integration.md)
- [Salesforce Integration](salesforce-integration.md)
- [Pre-Sales Briefs](../leads-briefs/pre-sales-briefs.md)
