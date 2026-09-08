# Sync Troubleshooting

Use this guide when an integration is connected but data is not moving as expected.

---

## First Checks

Confirm:

- You are in the correct company or event workspace.
- The integration is connected, configured, and enabled.
- The lead has required fields for the destination.
- The external account still has permission to accept data.
- The provider-specific setup page does not show an error.

---

## Common Failure States

**Missing account or company context**
The Admin user must be linked to the company workspace before most exhibitor integrations can save or sync.

**Invalid credentials**
API keys, bearer tokens, and OAuth tokens can expire or be revoked. Reconnect or replace credentials.

**Missing required lead data**
Some sync paths require email, name, company, or title. Add the missing lead data and try again.

**Webhook URL is invalid**
Make.com, n8n, and Zapier require a valid webhook URL. Re-save the webhook URL and send a test payload when available.

**External provider rejected the request**
Check permissions, plan access, destination object settings, and required fields in the external system.

---

## Provider-Specific Notes

- HubSpot contact sync needs a connected HubSpot account and a lead email.
- Salesforce test sync currently supports Salesforce Lead sync and requires Salesforce setup settings.
- Apollo can accept a stored API key while People Search may still require a master key or plan access.
- ZoomInfo requires a valid GTM API bearer token.
- People Data Labs requires an API key.
- Make.com and n8n can be configured but disabled; disabled integrations should not deliver new webhook payloads.

---

## When to Reconnect

Reconnect or replace credentials when:

- A validation or test request fails
- The provider reports unauthorized access
- Your external admin rotated credentials
- The wrong external account was connected

---

## Product Questions

- Confirm where customer-visible sync history should appear for each provider.
- Confirm whether webhook delivery retries are visible to customers or only available in logs.
- Confirm final customer wording for automatic versus manual CRM sync outside test/manual sync flows.

---

## Related Articles

- [Configure an Integration](configure-an-integration.md)
- [HubSpot Integration](hubspot-integration.md)
- [Salesforce Integration](salesforce-integration.md)
- [Make.com Integration](make-integration.md)
- [n8n Integration](n8n-integration.md)
