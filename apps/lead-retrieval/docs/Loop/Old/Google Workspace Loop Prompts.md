# Google Workspace Integration Loop Prompts

## Prompt Count

**1 prompt**

This should run as one continuous implementation loop covering:

1. Email lead verification and fixes
2. Send document through the same Gmail flow
3. Calendar availability, meeting scheduling, and optional Google Meet

The agent should not pause between phases unless it hits a true external blocker.

---

**Model: Opus 5**  
**Strength: High**

```text
Use the Google Workspace Integration Loop Brief as the source of truth and complete the entire loop without stopping for approval between phases.

Work in this order:

1. Finish live verification and cleanup of the existing Email lead Gmail flow.
2. Audit and wire one-to-one Send document through the same canonical Gmail composer and send service.
3. Build Google Calendar free/busy, meeting scheduling, optional Google Meet creation, meeting update, and cancellation.

Loop rules:
- Diagnose, fix, test, and continue automatically.
- Do not stop for normal implementation, UI, test, or integration issues.
- Only stop for a true external blocker such as missing credentials, missing provider access, required manual Google consent, database connectivity failure, or a destructive decision that cannot be resolved safely.
- Reuse the canonical Google token manager, connection ownership, capability checks, auth, company scoping, lead scoping, MIME builder, idempotency, and activity conventions.
- Keep route handlers thin and business logic in canonical services.
- Use the connected user’s Google account only for one-to-one lead communication.
- Do not use personal Gmail for campaigns, system notifications, user invitations, internal alerts, or bulk sends.
- Do not touch HubSpot or Salesforce.
- Do not add inbox-reading, Contacts, broad Calendar, or domain-wide delegation scopes.
- Do not store subject, body, MIME, tokens, authorization headers, raw Google responses, or free/busy results.
- Do not commit or push.

For Email lead:
- Verify the existing real Gmail send flow end to end.
- Preserve one visible toolbar action labeled “Email lead.”
- Confirm sender and recipient are locked.
- Confirm explicit review and confirmation.
- Confirm the email appears in Gmail Sent.
- Confirm safe activity metadata only.
- Confirm duplicate protection, unknown handling, reconnect handling, and fallback behavior.
- Fix all visual, functional, scoping, idempotency, activity-history, and error-state issues found.

For Send document:
- Audit the existing LR document-sharing flow before editing.
- When one user sends one document to one lead and Gmail Send is available, reuse the existing Google email composer and send service.
- Prefer a secure document link.
- Preserve the current fallback when Google is unavailable.
- Do not build bulk document sending.
- Do not duplicate Google connection, token, capability, MIME, email-send, or idempotency logic.
- Show the document, locked sender and recipient, editable subject and message, explicit confirmation, and clear sent/failed/unknown states.

For Calendar and Meet:
- Create the next available migration after 0092 for Google calendar meeting activities.
- Build free/busy lookup, normalized availability, suggested times, manual time selection where appropriate, owned-calendar event creation, lead invitation, optional Google Meet creation, meeting update, and cancellation.
- Use explicit IANA timezones.
- Never persist free/busy results.
- Use deterministic provider IDs and safe retry behavior.
- Prevent duplicate meetings.
- Persist only safe provider and activity metadata needed for display, update, and cancellation.
- Reuse the existing Google foundation and lead/company permission model.
- Add the meeting workflow to the lead-detail experience without creating duplicate or cluttered toolbar actions.

Validation:
- After each phase, run targeted tests, typecheck, production build, relevant browser tests, and visual inspection.
- Fix failures immediately and rerun validation before continuing.
- At the end, run the full Node suite, all targeted Google tests, typecheck, production build, diff whitespace validation, and relevant browser tests.

At completion, report:
- Work completed for each of the three workflows
- Files changed
- Migrations created and applied
- Data persisted
- Tests and validation results
- Live verification completed
- Manual production verification still required
- Any unresolved external blocker
```
