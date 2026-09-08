# Google Workspace Integration Loop Brief

**Project:** SignalThread Lead Retrieval  
**Repo:** `~/Documents/lead retrieval app`  
**Current branch:** `feat/google-workspace-oauth-foundation`  
**Date:** 2026-07-31

---

## Current Status

Google Workspace Stage 1 is complete and live verified.

The app currently supports:

- User-level Google Workspace connection
- Secure OAuth with PKCE and signed single-use state
- Encrypted token storage
- Gmail Send capability detection
- Calendar Events Owned capability detection
- Calendar Free/Busy capability detection
- Canonical token refresh and reconnect handling
- Safe disconnect and revocation
- Correct localhost redirect behavior

Migration already applied:

```text
0091_google_workspace_connections.sql
```

Google Workspace Stage 2 has also been implemented.

The app now supports:

- One-to-one Gmail sending from lead detail
- One visible `Email lead` action
- Google send flow when Gmail Send is granted
- Existing `mailto:` fallback when Google is unavailable
- Locked sender and recipient
- Explicit review and confirmation
- Idempotency protection
- Safe email activity metadata only
- Sent, failed, pending, and unknown states
- Lead-level email activity history

Migration already applied:

```text
0092_google_email_activities.sql
```

The live Gmail composer is opening correctly from the lead detail page.

---

## Product Rule

The connected Google account is for one-to-one lead communication owned by the current LR user.

Use Google Workspace for:

- Emailing one lead
- Sending one document to one lead
- Scheduling one meeting with one lead
- Creating a Calendar invite
- Optionally creating a Google Meet link

Do not use the connected personal Google account for:

- Bulk campaigns
- System notifications
- User invitations
- Internal action alerts
- Organizer announcements
- Shared mailbox workflows

Campaigns remain separate and should use the campaign delivery system rather than a user’s personal Gmail account.

---

# Continuous Implementation Loop

Run this as one continuous loop.

Do not stop for approval between phases.

Only stop for a real external blocker such as:

- Missing Google credentials
- Missing Google API access
- Required manual consent
- Database connection failure
- Provider-side outage
- A destructive decision that cannot be resolved safely from the existing product architecture

For normal code, UI, test, or integration failures:

1. Diagnose the issue.
2. Fix it.
3. Rerun the relevant validation.
4. Continue to the next phase.

Do not commit or push during the loop.

---

## Phase 1 — Finish Live Verification of Email Lead

Treat the Stage 2 Gmail implementation as already built.

### Verify

- `Email lead` opens the Google review-and-send dialog when Gmail Send is granted.
- Sender is the connected Google user.
- Recipient is loaded from the company-scoped lead.
- Sender and recipient cannot be changed.
- Subject and body remain editable before confirmation.
- The email sends through Gmail.
- The email appears in the connected user’s Gmail Sent folder.
- The lead activity shows the correct sent state.
- No subject, body, MIME, access token, authorization header, or raw provider response is persisted.
- Double-clicking or retrying does not send duplicates.
- Unknown outcomes are not automatically retried.
- Disconnected or reconnect-required states fall back safely.

### Fix

Fix any functional, visual, idempotency, scoping, activity-history, or error-state issue found during verification.

Do not add a second email action.

Keep the visible toolbar action labeled:

```text
Email lead
```

---

## Phase 2 — Send Document Through the Same Google Email Flow

Audit the existing LR document-sharing and document-send behavior before changing anything.

### Goal

When a user sends one document to one lead and Gmail Send is available, reuse the existing Google one-to-one email flow.

### Requirements

- One user
- One lead
- One document
- One explicit review-and-confirm action
- Sender is the connected Google user
- Recipient is always the company-scoped lead email
- Use the canonical Google token manager
- Reuse canonical connection and capability checks
- Reuse the MIME builder and email-send service
- Reuse idempotency and activity conventions
- Do not duplicate Gmail logic
- Do not build bulk document sending
- Preserve the current fallback when Google is unavailable

### Document delivery

Prefer a secure document link.

Do not store or embed document content inside Google activity metadata.

If the current document system already has a secure delivery or signed-link pattern, reuse it rather than creating a parallel document-access model.

### UX

The document-send action should clearly show:

- Document being sent
- Sender
- Locked recipient
- Editable subject
- Editable message
- Explicit confirmation
- Sent, failed, and unknown outcomes

Do not create a second unrelated email composer.

---

## Phase 3 — Google Calendar and Meeting Scheduling

Build the remaining Google Calendar workflow.

### Capabilities

- Query free/busy availability
- Normalize busy windows
- Suggest available meeting times
- Allow the user to select a time
- Create an event on the connected user’s owned calendar
- Invite the company-scoped lead email
- Optionally create a Google Meet link
- Display the meeting activity on the lead
- Update an existing meeting
- Cancel an existing meeting

### Expected routes

```text
POST   /api/exhibitor/leads/[leadId]/google/availability
POST   /api/exhibitor/leads/[leadId]/google/meetings
PATCH  /api/exhibitor/leads/[leadId]/google/meetings/[activityId]
DELETE /api/exhibitor/leads/[leadId]/google/meetings/[activityId]
```

### Expected migration

Create the next available migration after `0092`.

Expected table:

```text
google_calendar_meeting_activities
```

### Calendar rules

- Query free/busy only.
- Never persist free/busy results.
- Use explicit IANA timezones.
- Invite only the company-scoped lead email.
- Use deterministic event IDs for retry safety.
- Reuse one conference request ID for one logical Meet creation.
- Prevent duplicate meetings.
- Persist enough provider identity to update or cancel the meeting.
- Persist safe metadata only.
- Reuse the canonical Google token manager.
- Reuse the same auth, permission, company, event, lead, and connection ownership rules already established.
- Keep route handlers thin.
- Put business logic in canonical services.

### UX

The lead detail experience should support:

- Schedule meeting
- Availability loading
- Suggested times
- Manual time selection where appropriate
- Timezone display
- Optional Google Meet toggle
- Review before creation
- Created meeting state
- Update meeting
- Cancel meeting
- Reconnect-required and capability-missing states

Do not overload the toolbar with duplicate actions.

---

# Validation Loop

After each phase:

1. Run the most relevant targeted tests.
2. Run typecheck.
3. Run the production build.
4. Run browser or UI tests for the changed workflow.
5. Visually inspect the affected page.
6. Fix all discovered issues.
7. Rerun validation.
8. Continue automatically.

At the end of all three phases, run:

```text
Targeted Google integration tests
Full Node suite
Typecheck
Production build
Diff whitespace validation
Relevant browser tests
```

---

# Required Test Coverage

## Email lead

- MIME formatting
- Auth and company scoping
- Lead scoping
- Missing lead email
- Missing Gmail capability
- Successful send
- Provider failure
- Duplicate submission
- Unknown outcome
- No persisted message content
- Viewer rejection
- Cross-company rejection
- Connected and fallback UI states

## Send document

- Document ownership and access
- Company and lead scoping
- Secure document-link generation
- Gmail connected path
- Non-Google fallback
- Duplicate submission
- Missing lead email
- Missing document
- Expired or invalid document access
- No persisted document content
- Activity state rendering

## Calendar and Meet

- Free/busy normalization
- Explicit timezone handling
- Daylight-saving boundaries
- Successful event creation
- Optional Meet creation
- Duplicate prevention
- Deterministic retry behavior
- Missing Calendar capability
- Cross-company rejection
- Viewer rejection
- Meeting update
- Meeting cancellation
- Reconnect-required state
- No persisted free/busy results

---

# Guardrails

- Do not touch HubSpot.
- Do not touch Salesforce.
- Do not change campaign delivery.
- Do not send campaigns through personal Gmail.
- Do not add inbox-reading scopes.
- Do not add Contacts scopes.
- Do not add broad Calendar access.
- Do not introduce domain-wide delegation.
- Do not duplicate token, connection, capability, MIME, idempotency, or scoping logic.
- Do not store subject, body, MIME, free/busy results, tokens, headers, or raw Google responses.
- Do not create broad refactors outside the Google one-to-one communication workflow.
- Do not commit or push.

---

# Completion Report

At the end of the loop, report:

- Work completed for Email lead
- Work completed for Send document
- Work completed for Calendar and Meet
- Files changed
- Migrations created
- Migrations applied
- Data persisted
- Tests run
- Validation results
- Live verification completed
- Manual production verification still required
- Any unresolved external blocker

---

## Final Success State

The Google Workspace integration is complete when one LR user can:

```text
Connect Google Workspace
→ Email one lead
→ Send one document to that lead
→ Check Calendar availability
→ Schedule a meeting
→ Invite the lead
→ Optionally create a Google Meet
→ Update or cancel the meeting
→ See safe activity history on the lead
```

All three workflows must reuse the same secure Google foundation and remain separate from bulk campaigns and system email.
