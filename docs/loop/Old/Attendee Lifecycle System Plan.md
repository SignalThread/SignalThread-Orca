# Planner OS Attendee Lifecycle System Plan

## Purpose

The Attendee system should not be treated as a single “Attendees” page or a standalone people module.

Attendee is the event participant lifecycle layer. It connects Directory, registration, marketing, sessions, seating, communications, integrations, and the future attendee portal.

The core product idea is:

- **Event Directory** answers: Who is this person?
- **Attendee** answers: How is this person participating in this event?
- **Registration** answers: Where did their attendance state come from, and can we sync/write back?
- **Marketing** answers: How did this person enter the audience funnel, and did they convert?
- **Portal** answers: What can this attendee self-serve?

This system must be built on top of Event Directory, not beside it.

---

## Core Product Rules

### 1. Event Directory is the canonical people layer

Event Directory owns the person identity.

It should own or centralize:

- Name
- Email
- Phone
- Company
- Title
- Core contact details
- Event-level roles
- Dedupe and merge behavior
- Module links
- Source/usage visibility

No Attendee work should create a separate canonical person identity table.

---

### 2. Attendee is event participation, not identity

An attendee record means the Directory person is participating in the event in an attendance/registration capacity.

Attendee should own:

- Attendance status
- Registration status
- Registration type/category
- Badge/pass/ticket type
- Check-in state later
- Portal eligibility later
- Source/sync state
- Registration ownership
- Session enrollment readiness

---

### 3. Registration is separate from Attendee

A person can be an attendee without having an external registration record.

Examples:

- Manual attendee added by planner
- CSV-uploaded expected attendee
- Speaker expected to attend but not yet in registration
- Sponsor rep added before registering

A person should have a registration record only when there is actual registration, badge, order, or source data.

Registration records should track provider/external state, not become the person or role model.

---

### 4. Roles are separate from attendance

Speaker, exhibitor, sponsor, VIP, press, staff, and attendee are not mutually exclusive.

A person can be:

- Speaker + Attendee
- Exhibitor + Attendee
- Sponsor + Attendee
- VIP + Attendee
- Press + Attendee
- Staff + Attendee

A speaker or exhibitor should appear in the Attendee system if they are attending, need a badge, need registration state, need portal access, or need session/seating/comms participation.

The speaker module still owns speaker-specific operational data.

The exhibitor module should later own exhibitor company/booth/package data.

The attendee layer owns event participation state.

---

### 5. Contact is pre-registration

Contact means an event-tied marketing/audience lead who has not registered yet.

A registrant should not remain just “Contact.”

Once the person registers or is added as expected to attend, they should have attendee participation state.

---

## Clean Entity Split

### EventDirectoryPerson

Canonical human/person record for the event.

Used by:

- Attendees
- Speakers
- Exhibitors
- Sponsors
- Staff
- VIP/Press
- Seating
- Marketing audiences
- Future attendee portal

---

### EventAttendee

The event participation record.

One attendee participation record should exist per Directory person per event when that person is attending, expected to attend, invited to attend, registered, waitlisted, cancelled, checked in, or otherwise managed as an attendee.

Conceptual fields:

- `eventId`
- `directoryPersonId`
- `attendanceStatus`
- `registrationStatus`
- `registrationType`
- `badgeType`
- `ticketType`
- `source`
- `portalAccessStatus`
- `checkedInAt` later
- `cancelledAt`
- `waitlistedAt`
- `createdBy` / `importedBy` / `syncedBy`
- `lastUpdatedAt`

This is the main record behind:

```txt
/events/:eventId/attendees
```

---

### EventRegistrationRecord

The registration-specific record.

This should exist when the attendee has a registration, order, badge, or provider record from a registration source.

Conceptual fields:

- `eventId`
- `attendeeId`
- `directoryPersonId`
- `provider`
- `externalRegistrationId`
- `externalPersonId`
- `externalOrderId`
- `registrationStatus`
- `registrationType`
- `ticketType`
- `badgeType`
- `paymentStatus` optional later
- `registeredAt`
- `cancelledAt`
- `lastSyncedAt`
- `syncStatus`
- `writebackStatus`
- `providerUpdatedAt`

This lets Planner OS support Aura, Bizzabo, CSV, manual import, and future providers without hardcoding one provider into the attendee model.

---

### EventIntegrationConnection

Event-level registration/integration connection.

Conceptual fields:

- `eventId`
- `provider`
- `externalEventId`
- `connectionStatus`
- `syncMode`
- `lastSyncAt`
- capability flags

Capability flags should drive UI behavior.

Examples:

- `canPullAttendees`
- `canCreateAttendees`
- `canUpdateAttendees`
- `canCancelAttendees`
- `canPullSessions`
- `canPushSessions`
- `canPullSessionRegistrations`
- `canPushSessionRegistrations`
- `supportsWebhooks`
- `supportsOrders`
- `supportsBadgeTypes`

The UI should never assume writeback exists.

---

### EventExternalIdentity

Generic external identity mapping.

Purpose: avoid polluting every core table with provider-specific IDs.

Conceptual fields:

- `eventId`
- `directoryPersonId`
- `attendeeId` optional
- `provider`
- `externalObjectType`
- `externalObjectId`
- `lastSeenAt`

Useful for:

- Bizzabo attendee ID
- Aura registrant ID
- External order ID
- External speaker ID
- External exhibitor rep ID
- Future provider identities

---

### EventMarketingAudienceMember

Marketing lifecycle membership.

This may not be part of the first implementation pass, but the Attendee model must account for it.

Conceptual fields:

- `eventId`
- `directoryPersonId`
- `audienceId`
- `campaignId` optional
- `audienceStatus`
- `source`
- `convertedAttendeeId` optional
- `convertedAt`

This supports:

- Contact imports
- Campaign segmentation
- Invite status
- Contact-to-attendee conversion
- Re-engagement
- Suppression/cancelled segments

---

### EventAttendeeSessionEnrollment

Future session registration/agenda layer.

Conceptual fields:

- `eventId`
- `attendeeId`
- `matrixRowId` / `sessionId`
- `enrollmentStatus`
- `source`
- `externalSessionRegistrationId`
- `waitlistedAt`
- `cancelledAt`
- `checkedInAt` later

This connects Attendees to Run of Show / Matrix sessions without confusing session enrollment with speaker assignment.

Speaker assignment means: this person is presenting.

Session enrollment means: this person is attending this session.

Those are separate concepts.

---

### AttendeePortalAccess

Future attendee portal layer.

Conceptual fields:

- `eventId`
- `attendeeId`
- `directoryPersonId`
- token/user binding
- `inviteStatus`
- `lastLoginAt`
- `profileCompletionStatus`
- `agendaVisibility`
- `canEditProfile`
- `canSelectSessions`
- `canUploadDocs`
- `canMessagePlanner`

Portal access should bind to attendee/person records, not create another identity source of truth.

---

## Lifecycle States

Keep these separate.

### Person roles

- Contact
- Attendee
- Speaker
- Exhibitor
- Sponsor
- Staff
- VIP
- Press

### Registration status

- Not registered
- Invited
- Registered
- Pending approval
- Waitlisted
- Cancelled
- Transferred
- Checked in
- No-show

### Source

- Manual
- CSV upload
- Registration integration
- Marketing campaign
- Speaker intake
- Exhibitor portal
- Sponsor upload
- Backfilled
- Portal self-update

### Sync state

- Local only
- Synced
- Pending writeback
- Writeback failed
- Conflict
- Read-only external
- Stale

---

## Product Surfaces

## 1. Attendees Command Center

Route:

```txt
/events/:eventId/attendees
```

This should be the operational attendee view, not just a static list.

Top cards/filters:

- Total attendees
- Registered
- Pending / waitlisted
- Cancelled
- Checked in later
- VIP / Press
- Missing email
- Needs review
- Sync conflicts
- Portal invited later
- Portal active later

Table columns:

- Name
- Email
- Company
- Title
- Role(s)
- Registration status
- Registration type/category
- Source
- Sync status
- Portal status later
- Sessions count later
- Used in modules
- Last updated
- Actions

Actions:

- View
- Edit
- Cancel/remove
- Resolve conflict
- Sync/writeback later
- Resend portal invite later

---

## 2. Attendee Detail

The attendee detail should be a 360 view.

Sections:

- Profile
- Registration
- Roles
- Sessions later
- Seating
- Marketing history
- Portal later
- Communications later
- Activity
- Source/sync

Editing rules:

- Core profile edits update Event Directory person fields.
- Attendance/registration edits update attendee/registration records.
- Integration-owned fields should reflect writeback capability.
- Read-only external records should not pretend local edits were pushed externally.

---

## 3. CSV Attendee Import

CSV import should:

- Map columns
- Normalize identity
- Match against existing Directory people
- Merge/update existing people where appropriate
- Create EventAttendee records
- Create EventRegistrationRecord records if registration data exists
- Preserve provider/source metadata
- Flag duplicates/conflicts for review
- Avoid creating duplicate people if someone already exists as Speaker, Staff, Sponsor, Exhibitor, VIP, or Press

Example:

A speaker exists in Directory from the Speaker module.

A CSV attendee import includes the same email.

Correct result:

- Same Directory person
- Existing Speaker role remains
- New Attendee participation record added
- Registration/import source recorded
- No duplicate person created

---

## 4. Registration Integration Area

There should eventually be an event-level Registration/Integrations settings surface.

It should show:

- Provider
- Connection status
- External event mapping
- Last sync
- Capabilities
- Pull attendees
- Pull sessions
- Pull session registrations
- Writeback settings
- Conflict queue

The core model must be provider-agnostic.

Do not hardcode Bizzabo-specific or Aura-specific assumptions into the Attendee core.

---

## 5. Marketing Interlock

Marketing must feed the attendee lifecycle.

Flow example:

1. CSV marketing list import
2. Directory person created with role Contact
3. Person added to marketing audience
4. Invite campaign sent
5. Person registers through registration integration
6. Directory person gets Attendee participation
7. Campaign member marked converted
8. Contact-to-attendee lifecycle is visible

Another flow:

1. Attendee cancels
2. Registration status becomes Cancelled
3. Person enters cancelled attendee segment
4. Optional re-engagement campaign later

Marketing should not own the attendee record.

Marketing owns audience membership, campaigns, segmentation, and conversion history.

---

## 6. Other Module Integration

### Seating

Seating should select from Directory/Attendee people.

Seating should not own canonical guest identity.

Seating is usage, not source.

### Sessions / Matrix

Attendee should eventually support:

- Session rosters
- Session capacity
- Session enrollment
- Session waitlists
- Session check-in later
- VIP/Press attending a session
- Speaker also attending other sessions

Speaker assignment and attendee session enrollment must remain separate.

### Speakers

Speaker module owns:

- Bio
- Headshot
- Files
- Documents
- Session assignments
- Onsite notes
- Readiness
- Speaker portal flows

Attendee owns:

- Registration status
- Badge/pass type
- Check-in later
- Attendance participation
- Session enrollment as an attendee
- Attendee portal access later

A speaker can and often should be an attendee too.

### Exhibitors / Sponsors

Exhibitor company/booth/package records should not be registration records.

Exhibitor and sponsor people/reps should be Directory people.

If those reps are attending, they should have Attendee records.

If they are registered through a provider, they should also have RegistrationRecord records.

### Budget

Future attendee counts may support:

- F&B estimates
- Ticket/pass revenue forecasting
- VIP hospitality budgets
- Attendance-driven planning assumptions

### Timeline

Future timeline items may be generated or linked around:

- Registration open
- Registration close
- Badge cutoff
- Portal launch
- Session selection deadline
- Housing cutoff
- Check-in opens

---

## Attendee Portal Future

The attendee portal should be planned now but not built first.

Portal should eventually support:

### MVP Portal

- Magic-link/token access
- View profile
- Update profile fields
- Dietary/accessibility fields
- View agenda
- Select sessions if enabled
- View registration status
- View announcements/messages

### Later Portal

- Personal agenda
- Session waitlists
- Document uploads
- QR code / badge
- Check-in info
- Travel/hotel fields if needed
- Speaker/exhibitor/sponsor-specific portal views

Portal write behavior must respect source ownership.

Rules:

- If provider supports writeback, attendee edits can sync back.
- If provider is read-only, block edits or store proposed local changes for planner review.
- If attendee is local/CSV/manual, Planner OS owns edits.
- Portal auth should be token-scoped or attendee-scoped, not planner-session auth.

---

## Recommended Build Phases

## Phase 1: Attendee Foundation

Goal: create the real attendee participation layer.

Build:

- EventAttendee model
- EventRegistrationRecord model
- Attendee service layer
- Attendee list route
- Attendee detail drawer/page
- Manual add attendee
- CSV attendee import
- Directory merge/link behavior
- Basic status filters
- Source/sync display

This phase creates the foundation everything else depends on.

---

## Phase 2: Registration Integration Foundation

Goal: make registration sync provider-agnostic.

Build:

- EventIntegrationConnection model
- EventExternalIdentity model
- Provider capability model
- Sync state model
- Manual sync action
- Conflict detection/review basics
- Read-only vs writeback UI behavior

Do not start by hardcoding one provider into the attendee core.

---

## Phase 3: Marketing Interlock

Goal: connect Contact-to-Attendee lifecycle.

Build:

- Marketing audience membership model
- Contact import/list support
- Segment builder basics
- Conversion tracking
- Audience filters using attendee/registration status
- Campaign eligibility states

---

## Phase 4: Module Wiring

Goal: make attendees available everywhere they need to be used.

Wire:

- Seating attendee selection to Directory/Attendee
- Sessions to attendee rosters/enrollment
- Speaker-attendee overlap
- Exhibitor/sponsor rep overlap
- VIP/Press surfacing in seating/session contexts
- Timeline/budget attendee-count hooks later

---

## Phase 5: Attendee Portal

Goal: attendee self-service.

Build:

- Portal access records
- Invite/send portal link
- Token-scoped portal auth
- Profile update flow
- Agenda view
- Session selection
- Planner approval/writeback rules
- Portal activity history

---

## First Implementation Recommendation

Start with Phase 1 only.

Do not start with:

- Attendee portal
- Bizzabo-specific implementation
- Marketing campaigns
- Session enrollment
- Check-in

The first implementation should establish:

- Attendee participation model
- Registration record model
- Directory linkage
- CSV/manual intake
- Operational attendee list/detail

Everything else depends on that foundation.

---

## Schema Change Process Required

The schema is locked.

Before implementation, produce a Schema Change Proposal covering:

- Rationale
- Proposed models/enums/relations
- Migration plan
- Data/backfill plan
- Rollback/remediation notes
- Prisma generate/update plan
- Service/API plan
- Test plan

Do not edit Prisma schema or create migrations until the proposal is reviewed.

---

## Definition of Done for Phase 1

Phase 1 is done when:

- `/events/:eventId/attendees` exists
- Attendee records are linked to EventDirectoryPerson
- Manual add creates/links Directory person correctly
- CSV import matches/merges against existing Directory people
- Existing Speaker/Staff/Sponsor/Exhibitor/VIP/Press people are not duplicated
- Attendee list shows registration/source/status clearly
- Detail view separates profile, attendance, registration, source, and usage
- Server-side services enforce event access
- API routes stay thin
- Tests cover service behavior, import/dedupe, update/delete, source/status rules, and UI basics
- TypeScript passes
- Prisma schema copies stay in sync after reviewed migration
- No provider-specific assumptions are hardcoded into core attendee logic

---

## Key Principle

The clean model is:

```txt
Speaker / Exhibitor / Sponsor / VIP / Press = role or designation
Attendee = participation in the event
RegistrationRecord = registration/badge/order/source state
Marketing = acquisition and conversion lifecycle
Portal = attendee self-service access
Directory = canonical person identity
```

Do not blur these layers.
