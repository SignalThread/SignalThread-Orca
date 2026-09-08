# n8n Integration

The n8n integration sends outbound webhook payloads to an n8n workflow.

Status: live webhook setup, disable, and lead update dispatch are implemented.

---

## What It Does

n8n can receive webhook payloads for selected trigger events.

Supported trigger events include:

- Lead Created
- Lead Updated
- Lead Scored
- Conversation Completed

Supported payload modes include:

- Lead core profile
- Lead core profile plus AI insights
- Lead core profile plus AI insights and conversation snapshot

---

## Who Can Configure It

Exhibitor Admins with company access can configure n8n.

---

## Where to Configure It

Open **Admin Portal → Integrations → n8n**.

Add the n8n webhook URL, choose a payload mode, choose trigger events, and save.

---

## Sync Behavior

When enabled and configured, the system can send webhook payloads using the saved n8n configuration. Lead update dispatch is wired from the exhibitor lead update route.

Product question: confirm which trigger events beyond lead update are currently emitted in production.

---

## Common Issues

**Invalid webhook URL.**
Use a valid HTTP or HTTPS webhook URL from n8n.

**No payload is delivered.**
Confirm the integration is configured and enabled, and confirm the trigger event is selected.

**Workflow receives less data than expected.**
Review the selected payload mode.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
