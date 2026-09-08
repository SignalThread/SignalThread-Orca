# Make.com Integration

The Make.com integration sends outbound webhook payloads to a Make.com scenario.

Status: live webhook setup, disable, and lead update dispatch are implemented.

---

## What It Does

Make.com can receive webhook payloads for selected trigger events.

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

Exhibitor Admins with company access can configure Make.com.

---

## Where to Configure It

Open **Admin Portal → Integrations → Make.com**.

Add the Make.com webhook URL, choose a payload mode, choose trigger events, and save.

---

## Sync Behavior

When enabled and configured, the system can send webhook payloads using the saved Make.com configuration. Lead update dispatch is wired from the exhibitor lead update route.

Product question: confirm which trigger events beyond lead update are currently emitted in production.

---

## Common Issues

**Invalid webhook URL.**
Use a valid HTTP or HTTPS webhook URL from Make.com.

**Payload data is missing.**
Check the selected payload mode and whether the lead has the data needed for that mode.

**No payload is delivered.**
Confirm the integration is configured and enabled, and confirm the trigger event is selected.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
