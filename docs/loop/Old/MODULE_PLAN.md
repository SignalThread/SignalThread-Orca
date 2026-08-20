# Module Plan

## Module
Speaker

## Phased Implementation

## Purpose
Build a full speaker operations module for Planner Dash, including planner-side speaker management and external speaker portal workflows.

## Scope
This module covers speaker profiles, invitations, session assignments, requirements intake, files, documents, deadlines, messaging, reminders, onsite readiness, and audit logging.

## Principles
- Matrix remains the source of truth for sessions, rooms, and schedule.
- Docs Hub remains the source of truth for formal documents and file approval.
- Deadlines remains the source of truth for due dates.
- Speaker Portal is an external-facing extension of the Speaker Module.
- All speaker actions must be event-scoped, access-controlled, and auditable.

Phase 0 — Foundation / Data Model / Access Rules

Phase 1 — Speaker Invite, Login, and Profile Basics

Goal: Let planners invite speakers and let speakers complete their core profile.

Functions covered:

Speaker invite + secure OTP
Speaker profile management
Bio submission
Headshot upload
Contact info management
Company/title management
Profile completeness status
Missing info alerts, basic version

How it should work:

Planner sends invite from the event speaker admin.
Speaker receives email with secure link.
Link opens OTP flow.
OTP should expire and be single-use or session-bound.
Speaker lands on a profile checklist.
Speaker can update:
Name
Email
Phone
Company
Title
Bio
Headshot
Profile completeness is calculated from required fields.
Missing info appears as clear checklist items.
Planner can see completion state from speaker admin.

Behavior rules:

Speaker edits only their own profile.
Planner can mark fields required or optional later.
Headshot upload should have file type/size validation.
Every profile update is logged.
Some fields may be auto-approved; others can require planner review later.

Deliverable:

Speaker Portal MVP shell
Invite/OTP access
Profile form
Completeness meter
Planner-side speaker list with status
Phase 2 — Session Assignment and Session Review

Goal: Let speakers see what they are assigned to and review session-facing content.

Functions covered:

Session assignment view
Session details view
Session description review
Session title review
Co-speaker visibility
Venue/room assignment details
Speaker schedule view
Calendar invite / add-to-calendar

How it should work:

Speaker sees all sessions they are assigned to.
Session data should come from Matrix/session records, not duplicated portal data.
Speaker sees:
Session title
Description
Date/time
Room
Format/type
Co-speakers
Planner notes visible to speaker
Add-to-calendar button
Speaker can review title/description and either:
Confirm as accurate
Request changes
Suggest edits

Behavior rules:

Speaker suggestions should not directly overwrite the canonical session title/description.
Suggested edits should create a pending review item for planners.
Planner accepts/rejects/edit-applies suggestions.
Co-speaker visibility should respect privacy settings.
Schedule should be read-only for speakers unless planners open change requests later.

Deliverable:

Speaker session dashboard
Session detail page/drawer
Title/description review workflow
Co-speaker list
Add-to-calendar support
Matrix session integration
Phase 3 — Requirements Intake and Speaker Tasks

Goal: Collect all logistics and operational requirements from speakers.

Functions covered:

Travel info collection
Hotel/housing request collection
Arrival/departure details
Dietary restrictions
Accessibility needs
AV requirements
Task checklist
Deadline tracking
Missing info alerts
Green room / onsite instructions, basic version

How it should work:

Planner defines required speaker tasks for the event.
Speaker sees a task checklist.
Each task has:
Status
Due date
Required/optional flag
Completion requirements
Intake sections include:
Travel needed?
Arrival/departure date/time
Hotel needed?
Dietary needs
Accessibility needs
AV needs
Special onsite notes
Missing info alerts are generated from incomplete required tasks.
Deadlines connect to the existing Deadlines module where appropriate.

Behavior rules:

Requirements can be event-level defaults with speaker-specific overrides.
Sensitive info should be visible only to authorized planner roles.
AV requirements should roll up to Matrix/session ops views.
Dietary/accessibility should be carefully permissioned.
Deadline status should update automatically when tasks are completed.

Deliverable:

Speaker checklist
Logistics intake forms
Requirements status per speaker
Deadline integration
Planner dashboard for missing items
Phase 4 — Files, Presentations, Documents, and Signatures

Goal: Handle speaker-submitted files properly with versions and review.

Functions covered:

Presentation upload
Slide deck versioning
Supporting file uploads
Document uploader/signature
Integration hooks to Docs Hub

How it should work:

Speaker can upload presentation files.
Each upload creates a version.
Planner can view latest version and version history.
Supporting files can include:
Handouts
PDFs
Images
Technical riders
Session materials
Required documents can be assigned to speakers.
Speaker can upload signed docs or complete signature workflow if integrated later.
Files that need formal approval should connect to Docs Hub.

Behavior rules:

Never overwrite old decks silently.
Latest version should be obvious.
Planner can mark deck as:
Received
Needs changes
Approved
Final
Speaker can see review feedback.
File permissions must be scoped by event and speaker.
Every file action gets logged.

Deliverable:

File upload UI
Deck version history
Planner review status
Docs Hub linking
Speaker document checklist
Phase 5 — Messaging, Notes, Notifications, and Reminders

Goal: Centralize speaker communication instead of scattering it across email.

Functions covered:

Speaker-facing comments/messages
Internal planner notes
Automated reminders
Email notification history
Missing info alerts, mature version

How it should work:

Speaker-facing messages appear in the portal and can also email the speaker.
Internal notes are planner-only.
Messages can attach to:
Speaker profile
Session
File/deck
Requirement/task
Automated reminders are triggered by:
Incomplete profile
Missing files
Upcoming deadlines
Requested changes
Unconfirmed session details
Email history shows what was sent and when.

Behavior rules:

Clearly separate internal notes from speaker-visible messages.
Never expose internal planner notes in speaker portal.
Reminder rules should be event-configurable.
Email history should be read-only audit evidence.
Failed email sends should be visible to planners.

Deliverable:

Speaker message thread
Internal notes panel
Reminder engine/rules
Email log
Notification status indicators
Phase 6 — Onsite Operations and Final Readiness

Goal: Turn the portal into the source of speaker readiness before and during the event.

Functions covered:

Green room / onsite instructions
Venue/room assignment details
Speaker schedule view, mature version
Badge/pass info
Admin impersonation / preview mode
Integration hooks to Matrix sessions
Integration hooks to Deadlines
Portal activity log
Audit trail for every change

How it should work:

Speaker sees final onsite packet:
Schedule
Room assignments
Green room location
Arrival instructions
Badge/pass pickup
Contact person
AV/rehearsal instructions
Planner sees readiness dashboard:
Profile complete
Session confirmed
Travel complete
Hotel complete
AV complete
Deck approved
Docs signed
Badge/pass ready
Admin preview lets planners view what a speaker sees.
Ideally preview is read-only first.
Any true impersonation should be heavily logged.

Behavior rules:

Matrix remains source of truth for sessions, rooms, schedule.
Docs Hub remains source of truth for formal documents/files.
Deadlines remains source of truth for due dates.
Speaker portal displays and contributes data, but should not fork core event operations.
Every change is auditable.

Deliverable:

Final speaker readiness view
Onsite instruction page
Badge/pass info display
Admin preview mode
Matrix/Docs/Deadlines operational hooks
Proposed Build Order
Foundation + schema proposal
Invite/OTP + speaker profile
Session assignment/read-only session view
Profile completeness + missing info
Session title/description review
Requirements intake + checklist
Deadlines integration
Presentation upload + versioning
Docs Hub integration
Messaging/internal notes
Automated reminders + email history
Onsite packet + readiness dashboard
Admin preview/impersonation
Full audit/reporting polish