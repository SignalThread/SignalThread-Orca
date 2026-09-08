# Zapier Integration

The Zapier integration sends webhook payloads to a Zapier workflow.

Status: live webhook setup and test payload are implemented in the Admin integrations area.

---

## What It Does

Zapier can receive lead and conversation-event payloads through a configured webhook URL.

The setup page supports trigger event selection and payload field selection. Available payload fields include lead profile fields, rating, priority score, follow-up date, notes, AI summary, transcript, event name, and owner name.

---

## Who Can Configure It

Platform Admins and Exhibitor Admins with company access can configure Zapier where the integration page is available.

---

## Where to Configure It

Open **Admin Portal → Integrations → Zapier**.

Add the Zapier webhook URL, choose trigger events, choose payload fields, and save.

---

## Testing

The Zapier page can send a sample payload to the saved webhook URL. Use this before relying on a live event workflow.

---

## Common Issues

**Missing webhook.**
Save a webhook URL before sending a test payload.

**Test payload failed.**
Check the Zapier webhook URL and whether the Zap is turned on.

**Payload is missing fields.**
Review the selected payload fields.

---

## Related Articles

- [Integrations Overview](integrations.md)
- [Configure an Integration](configure-an-integration.md)
- [Sync Troubleshooting](sync-troubleshooting.md)
