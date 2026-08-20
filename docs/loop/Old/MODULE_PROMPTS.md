# Speaker Module Implementation Prompt Chain

## Prompt 0 — Clean Up Module Plan Doc

Model: GPT-5.5
Reasoning: Medium

We are working in Planner Dash on the Speaker module. Start by cleaning up the module planning doc before implementation.

Context:

* The current module plan file is `MODULE_PLAN.md`.
* It currently has duplicate `Purpose` / `Phased Implementation` headings and still contains `[paste the phased plan here]`.
* It starts at Phase 1 but needs a Phase 0 foundation section.

Task:

1. Clean up `MODULE_PLAN.md` so it has a clear reusable structure:

   * `# Module Plan`
   * `## Module`
   * `## Purpose`
   * `## Scope`
   * `## Principles`
   * `## Phase 0 — Foundation / Data Model / Access Rules`
   * `## Phase 1 — Speaker Invite, Login, and Profile Basics`
   * Continue existing phases through final readiness.
2. Add Phase 0 covering:

   * Event-scoped speaker data model
   * Speaker access model
   * OTP invite model
   * Portal activity log
   * Audit trail
   * Integration boundaries with Matrix, Docs Hub, and Deadlines
   * Admin preview/impersonation foundation
3. Do not change application code in this pass.
4. Do not change schema in this pass.

Output:

* Files changed
* Summary of doc cleanup
* Any questions or risks found

Run:

* No test run required unless there is an existing docs lint command.

---

## Prompt 1 — Speaker Schema Proposal Only

Model: GPT-5.5
Reasoning: High

We are implementing the Speaker module for Planner Dash. Do not directly change the Prisma schema yet. First create a formal schema proposal.

Context:

* Planner Dash uses Organization → Client → Event tenancy.
* Schema is locked. No schema changes without proposal + migration review.
* No JSON blobs for core relational entities.
* All speaker data must be event-scoped.
* Matrix remains source of truth for sessions, rooms, and schedule.
* Docs Hub remains source of truth for formal documents and file approval.
* Deadlines remains source of truth for due dates.
* All important actions must be auditable.

Task:
Create a schema proposal doc for the Speaker module.

Include proposed models for:

1. Speaker
2. SpeakerInvite or SpeakerPortalInvite
3. SpeakerPortalSession or portal auth/session tracking if needed
4. SpeakerSessionAssignment if existing session-speaker relation is not enough
5. SpeakerProfileChangeRequest or SpeakerSessionContentReview
6. SpeakerTask
7. SpeakerTaskCompletion or SpeakerTaskResponse
8. SpeakerRequirementResponse for travel/hotel/dietary/accessibility/AV if needed
9. SpeakerFile or SpeakerPresentationAsset
10. SpeakerFileVersion
11. SpeakerMessage
12. SpeakerInternalNote
13. SpeakerEmailLog
14. SpeakerActivity / SpeakerAuditLog

For each model, document:

* Purpose
* Fields
* Foreign keys
* Tenant/event scope
* Whether speaker can write it
* Whether planner can write it
* Audit requirements
* Whether it integrates with Matrix, Docs Hub, or Deadlines
* Migration risk
* Alternatives considered

Rules:

* Do not implement schema yet.
* Do not create migrations.
* Do not alter runtime code.
* Keep this as a reviewable doc.

Output:

* New schema proposal file path
* Summary of proposed models
* Open decisions
* Risks

---

## Prompt 2 — Implement Approved Speaker Schema + Migration

Model: GPT-5.5
Reasoning: High

Implement the approved Speaker module schema from the schema proposal.

Context:

* Only proceed using the approved proposal.
* Keep the migration production-safe.
* Do not use JSON blobs for core speaker objects.
* All foreign keys must reference UUID columns.
* Speaker data must be event-scoped.
* Avoid destructive assumptions.
* Add indexes for common event-scoped queries.

Task:

1. Update Prisma schema with approved Speaker module models.
2. Add migration.
3. Add seed-safe or fixture-safe test helpers if this repo has patterns for that.
4. Add basic database/service-level tests for:

   * speaker belongs to event
   * invite belongs to speaker/event
   * tasks are event/speaker scoped
   * files are event/speaker scoped
   * audit rows can be written
5. Ensure existing tests still pass.

Rules:

* Do not build UI in this pass.
* Do not build portal auth in this pass.
* Do not implement email sending yet.
* Keep changes focused on schema + lowest-level data access.

Output:

* Files changed
* Migration name
* Models added
* Tests added
* Commands run
* Any migration risks

Run:

* Prisma generate
* Relevant migration validation
* Relevant test suite

---

## Prompt 3 — Speaker Access Guard + Canonical Service Layer

Model: GPT-5.5
Reasoning: High

Build the canonical server-side access and service layer for the Speaker module.

Context:

* UI checks are not enough.
* All planner writes must validate event access server-side.
* All portal writes must validate speaker invite/session access server-side.
* Speaker portal users are not normal Planner Dash users unless existing auth already supports that pattern.
* Speakers should only see and edit their own event-scoped portal data.
* Business rules must live in shared service functions, not duplicated route logic.

Task:

1. Create a canonical Speaker service layer.
2. Add access helpers for:

   * resolving planner access to event speaker admin
   * resolving speaker portal access from OTP/session
   * validating speaker belongs to event
   * validating speaker can access a session/file/task/message
3. Add structured error responses for:

   * unauthorized
   * forbidden
   * speaker not found
   * invite expired
   * invite already used
   * invalid event scope
4. Add audit helper for speaker actions.
5. Add tests proving server-side enforcement.

Rules:

* Do not build UI.
* Do not build OTP email sending yet.
* Do not duplicate access checks across routes.
* Route handlers should stay thin.

Output:

* Files changed
* Service functions added
* Access rules implemented
* Tests added
* Commands run
* Remaining gaps

---

## Prompt 4 — Planner-Side Speaker Admin Shell

Model: GPT-5.5
Reasoning: Medium

Build the planner-side Speaker admin shell inside the event workspace.

Context:

* This is for authenticated Planner Dash users, not external speakers.
* It should live under the event context.
* It should follow existing shell/right-panel/detail patterns.
* Keep this pass UI-only plus read endpoints if needed.
* Speaker admin should become the control center for speaker readiness later.

Task:

1. Add event-level Speaker module navigation/entry point if not already present.
2. Create Speaker admin page with:

   * speaker list
   * status/completeness column
   * assigned sessions count
   * invite status
   * missing items count
   * last activity
   * basic empty state
3. Add right-panel/detail pattern for selected speaker placeholder.
4. Add API route/service call for listing speakers by event.
5. Add loading, empty, and error states.
6. Add stable test hooks only where useful.

Rules:

* No invite sending yet.
* No profile editing yet.
* No portal UI yet.
* Server must enforce event access.
* Keep Matrix/Docs/Deadlines integration as placeholders only.

Output:

* Files changed
* UI added
* API/service added
* Tests added
* Commands run
* Screens/flows to manually check

---

## Prompt 5 — Planner Speaker CRUD + Basic Detail Drawer

Model: GPT-5.5
Reasoning: Medium

Add planner-side speaker creation/editing and a useful speaker detail drawer.

Context:

* Planner users need to create speaker records before inviting them.
* This is internal admin management only.
* Speaker profile fields should map to real schema columns.
* All writes must go through the canonical service layer.

Task:

1. Add create speaker flow.
2. Add edit speaker flow.
3. Add archive/deactivate speaker if supported by schema.
4. Detail drawer should show:

   * name
   * email
   * phone
   * company
   * title
   * bio status
   * headshot status
   * invite status
   * assigned sessions
   * task/completeness placeholder
   * recent activity placeholder
5. Add API routes for create/update/archive.
6. Add validation for required fields.
7. Add activity logging for create/update/archive.

Rules:

* Do not allow duplicate active speaker email within same event unless the schema proposal explicitly allows it.
* Do not send invites yet.
* Do not add session assignment editing yet.
* Do not build portal profile editing yet.

Output:

* Files changed
* Routes/services added
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 6 — Speaker Invite + Secure OTP Backend

Model: GPT-5.5
Reasoning: High

Build the backend for speaker invites and secure OTP access.

Context:

* Speaker portal access should be secure, event-scoped, and speaker-scoped.
* OTP should expire.
* Invites should have clear states.
* Email sending can be stubbed if SendGrid/config is not ready, but the API contract should be correct.
* All invite actions must be audited.

Task:

1. Add invite creation service.
2. Add invite resend service.
3. Add OTP issue/verify flow.
4. Add portal session/token creation after successful OTP.
5. Add invite status handling:

   * draft/not sent
   * sent
   * opened if trackable
   * verified
   * expired
   * revoked
6. Add API routes:

   * planner sends invite
   * planner resends invite
   * planner revokes invite
   * speaker requests/verifies OTP
7. Add email log entry creation even if actual sending is stubbed.
8. Add tests for:

   * expired OTP rejected
   * wrong OTP rejected
   * revoked invite rejected
   * speaker cannot access another speaker invite
   * planner access enforced server-side

Rules:

* Do not expose raw OTP in logs.
* Do not store plain OTP if avoidable; hash it.
* Do not build final email templates yet.
* Do not build full portal UI yet beyond whatever is needed for endpoint testing.

Output:

* Files changed
* Routes/services added
* Security decisions
* Tests added
* Commands run
* Remaining email provider config needed

---

## Prompt 7 — Speaker Portal Shell + Auth Flow

Model: GPT-5.5
Reasoning: Medium

Build the external Speaker Portal shell and OTP login flow.

Context:

* Speaker Portal is an external-facing extension of the Speaker module.
* It should not expose internal Planner Dash navigation.
* It should only show the authenticated speaker’s own event-scoped data.
* Portal should fail soft with clear expired/revoked invite states.

Task:

1. Add external portal route structure.
2. Add invite landing page.
3. Add OTP input/verification screen.
4. Add portal authenticated shell.
5. Add speaker dashboard placeholder with:

   * profile status
   * session assignments placeholder
   * tasks placeholder
   * files placeholder
   * messages placeholder
6. Add logout/end session behavior if applicable.
7. Add error states for:

   * invalid link
   * expired invite
   * revoked invite
   * already completed or already verified, depending on flow
8. Add tests for route/access behavior.

Rules:

* Do not show internal admin UI.
* Do not let speaker choose an event.
* Do not fetch data without portal access guard.
* Keep visual design clean but do not over-polish.

Output:

* Files changed
* Routes/pages added
* Auth flow implemented
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 8 — Speaker Profile Editing + Completeness Engine

Model: GPT-5.5
Reasoning: Medium

Implement speaker portal profile editing and the profile completeness engine.

Context:

* Speaker can edit only their own profile.
* Planner can see completion status.
* Profile completeness should be computed consistently server-side.
* Missing info alerts should be derived from required fields/tasks.

Task:

1. Add profile edit form in portal:

   * name
   * preferred name if supported
   * email display, editable only if allowed
   * phone
   * company
   * title
   * bio
2. Add backend update route using speaker portal access guard.
3. Add completeness calculation service.
4. Add missing profile fields list.
5. Surface completion on:

   * portal dashboard
   * planner speaker list
   * planner detail drawer
6. Add activity/audit entries for profile edits.
7. Add tests for:

   * speaker can edit own profile
   * speaker cannot edit another speaker
   * planner sees updated completeness
   * required field changes affect completeness

Rules:

* Do not build headshot upload in this pass unless already trivial.
* Do not implement approval/review for bio yet.
* Do not directly trust client completeness calculation.

Output:

* Files changed
* Completion rules
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 9 — Headshot Upload

Model: GPT-5.5
Reasoning: Medium

Add speaker headshot upload.

Context:

* Existing document storage uses R2/S3-compatible storage for document binaries.
* Reuse existing storage patterns where appropriate.
* Headshot is speaker-scoped and event-scoped.
* Upload must validate type and size.
* Every upload/change must be audited.

Task:

1. Add headshot upload UI in speaker portal.
2. Add planner-side headshot preview/status.
3. Add presign/finalize route or reuse existing upload pattern safely.
4. Validate allowed file types:

   * jpg
   * png
   * webp if supported
5. Validate max file size.
6. Store metadata on speaker/profile.
7. Add replacement behavior that keeps audit history.
8. Add tests for:

   * upload route access
   * invalid file type rejected
   * invalid event/speaker scope rejected
   * planner sees updated status

Rules:

* Do not use local upload route if it is disabled.
* Do not expose private file URLs without access controls.
* Do not delete old assets unless the approved storage policy says so.

Output:

* Files changed
* Upload flow
* Tests added
* Commands run
* Storage/security notes

---

## Prompt 10 — Matrix Session Assignment Integration

Model: GPT-5.5
Reasoning: High

Integrate speakers with Matrix sessions.

Context:

* Matrix remains the source of truth for sessions, rooms, and schedule.
* Speaker Portal should display assigned sessions from Matrix/session data.
* Avoid duplicating canonical session fields into speaker portal tables unless they are snapshot/audit fields.
* Planner needs to assign speakers to sessions.

Task:

1. Add planner-side session assignment UI in speaker detail.
2. Add service functions to assign/unassign speakers to Matrix sessions.
3. Add portal session assignment view.
4. Speaker session cards should show:

   * title
   * description
   * date/time
   * room
   * format/type if available
   * co-speakers
5. Add access rules:

   * planner can assign within event
   * speaker can only view assigned sessions
6. Add tests:

   * assignment is event-scoped
   * speaker sees assigned sessions
   * speaker cannot see unassigned sessions
   * unassign removes portal visibility
   * Matrix canonical data displays correctly

Rules:

* Do not let speaker edit session data in this pass.
* Do not duplicate Matrix session records.
* Do not create session schedule fields in speaker models if Matrix already owns them.

Output:

* Files changed
* Integration behavior
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 11 — Session Title / Description Review Workflow

Model: GPT-5.5
Reasoning: High

Build the speaker session content review workflow.

Context:

* Speakers should review title and description.
* Speaker suggestions must not directly overwrite canonical Matrix session data.
* Planner must accept, reject, or apply edits.
* Every action must be audited.

Task:

1. Add portal review actions for each assigned session:

   * confirm title/description
   * request change
   * suggest edited title
   * suggest edited description
2. Add planner-side review queue in speaker admin.
3. Add accept/reject/apply workflow.
4. If accepted/applied, update canonical Matrix session fields through the correct service path.
5. Add review statuses:

   * not reviewed
   * confirmed
   * changes requested
   * suggested edits pending
   * accepted/applied
   * rejected
6. Add comments/feedback on review items.
7. Add tests for:

   * speaker cannot directly mutate Matrix session
   * planner can apply suggestion
   * rejected suggestion does not change Matrix session
   * audit entries are created
   * review is scoped to assigned speaker/session/event

Rules:

* Keep Matrix as source of truth.
* Avoid duplicate route-level business logic.
* Keep the route handlers thin.

Output:

* Files changed
* Workflow states
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 12 — Speaker Task Checklist Foundation

Model: GPT-5.5
Reasoning: Medium

Build the speaker task checklist foundation.

Context:

* Tasks are the portal-facing mechanism for getting speakers to complete operational requirements.
* Tasks may later link to Deadlines, Docs Hub, files, or requirements.
* Speaker Portal dashboard should show what is complete/missing.
* Planner admin should show per-speaker task status.

Task:

1. Add task template/event-level task creation if supported by schema.
2. Add speaker-specific task assignment.
3. Add portal task checklist UI.
4. Add planner-side task status view.
5. Add task statuses:

   * not started
   * in progress
   * submitted
   * complete
   * needs changes
   * waived if supported
6. Add required/optional flag.
7. Add due date.
8. Add completion logic for manually completed tasks.
9. Add tests for:

   * task visibility by speaker
   * task completion updates status
   * required incomplete task affects missing info
   * event scoping enforced

Rules:

* Do not build all intake forms yet.
* Do not build reminders yet.
* Keep task engine generic enough to reuse for files/docs/requirements.

Output:

* Files changed
* Task model behavior
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 13 — Requirements Intake Forms

Model: GPT-5.5
Reasoning: Medium

Build speaker logistics and requirements intake.

Context:

* Requirements should feed speaker readiness.
* Sensitive fields must be permissioned carefully.
* Avoid dumping everything into one JSON blob if these fields are operationally important.
* Requirements should connect to checklist tasks where appropriate.

Task:

1. Add portal intake sections:

   * travel required
   * arrival date/time
   * departure date/time
   * hotel/housing request
   * dietary restrictions
   * accessibility needs
   * AV requirements
   * onsite notes / special instructions from speaker
2. Add backend save routes with speaker portal access guard.
3. Add planner-side read view.
4. Add missing info/completeness integration.
5. Add activity/audit logging.
6. Add tests for:

   * speaker can save own requirements
   * speaker cannot access another speaker’s requirements
   * planner can view requirements
   * sensitive fields are not exposed broadly
   * AV requirements can be surfaced for ops/Matrix later

Rules:

* Do not build Matrix AV rollup yet unless already straightforward.
* Do not build hotel vendor integration.
* Do not build travel booking.
* Keep fields normalized according to approved schema.

Output:

* Files changed
* Intake sections added
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 14 — Deadlines Integration

Model: GPT-5.5
Reasoning: High

Connect Speaker tasks to the existing Deadlines module.

Context:

* Deadlines remains the source of truth for due dates where event-level deadline management is needed.
* Speaker tasks may reference deadlines.
* Completion status should be clear without duplicating canonical deadline behavior.

Task:

1. Review existing Deadlines model/service/UI patterns.
2. Add ability to link speaker tasks to Deadlines.
3. Show linked deadline due date in portal task checklist.
4. Show speaker task completion status in planner view.
5. If appropriate, update deadline progress/status from aggregate task completion using a safe service path.
6. Add tests for:

   * task linked to deadline
   * deadline due date appears in speaker portal
   * task completion does not corrupt canonical deadline
   * event scoping enforced
   * missing info updates when deadline-linked task is completed

Rules:

* Do not make Speaker module the source of truth for Deadlines.
* Do not duplicate deadline records.
* Do not update deadlines from the client directly.

Output:

* Files changed
* Integration behavior
* Tests added
* Commands run
* Risks/open decisions

---

## Prompt 15 — Presentation Upload + Deck Versioning

Model: GPT-5.5
Reasoning: High

Build presentation upload and deck versioning.

Context:

* Speakers need to upload presentations.
* Never overwrite old decks silently.
* Each deck upload should create a version.
* Planner should be able to mark review status.
* Files are event/speaker/session scoped where relevant.
* Storage should reuse existing R2/S3-compatible patterns.

Task:

1. Add portal upload flow for presentation files.
2. Allow upload to be tied to a speaker and optionally a session.
3. Add deck version history.
4. Add planner-side file review panel.
5. Add review statuses:

   * received
   * needs changes
   * approved
   * final
6. Add speaker-visible planner feedback.
7. Add tests:

   * upload creates new version
   * latest version is shown correctly
   * old versions remain accessible to authorized planners
   * speaker can only access own files
   * planner can review/update status
   * audit entries are created

Rules:

* Do not delete/overwrite old versions.
* Do not expose private files publicly.
* Do not put file version history in JSON blobs.
* Do not build full Docs Hub integration in this pass.

Output:

* Files changed
* Upload/version behavior
* Tests added
* Commands run
* Storage/security notes

---

## Prompt 16 — Docs Hub Integration for Speaker Documents

Model: GPT-5.5
Reasoning: High

Integrate speaker document collection with Docs Hub.

Context:

* Docs Hub remains source of truth for formal documents and file approval.
* Speaker Portal can collect documents, but formal approval/versioning should connect to Docs Hub where applicable.
* Speaker documents may include agreements, release forms, W-9/payment docs if later enabled, or other required uploads.
* Signature integration can be a placeholder unless a signature provider exists.

Task:

1. Review Docs Hub document/version/linking patterns.
2. Add speaker document assignment UI for planners.
3. Add portal upload/complete flow for assigned documents.
4. Link submitted speaker documents to Docs Hub records where appropriate.
5. Add speaker document statuses:

   * assigned
   * submitted
   * in review
   * approved
   * rejected/needs changes
6. Add optional signature placeholder:

   * mark as signature required
   * upload signed document
   * future e-sign provider hook
7. Add tests:

   * speaker document links to speaker/event
   * Docs Hub link created correctly
   * speaker cannot see another speaker’s docs
   * planner review status updates correctly
   * audit entries created

Rules:

* Do not fork Docs Hub approval logic.
* Do not reinvent document versioning if Docs Hub already owns it.
* Do not build real e-sign integration unless credentials/provider exist.

Output:

* Files changed
* Docs Hub integration behavior
* Tests added
* Commands run
* Open decisions for e-signature

---

## Prompt 17 — Speaker-Facing Messages + Internal Planner Notes

Model: GPT-5.5
Reasoning: Medium

Build messaging and notes.

Context:

* Speaker-facing messages are visible to the speaker.
* Internal planner notes are never visible to the speaker.
* Messages/notes can attach to speaker, session, file, task, or review item.
* This must be very clear in UI to avoid leaking internal notes.

Task:

1. Add speaker-facing message thread in portal.
2. Add planner message composer.
3. Add internal notes panel in planner speaker detail.
4. Allow messages/notes to be attached to:

   * speaker profile
   * session assignment
   * deck/file
   * task
   * requirement
   * review item
5. Add visibility labels in UI:

   * visible to speaker
   * internal only
6. Add tests:

   * speaker sees speaker-facing messages
   * speaker never sees internal notes
   * planner can create both
   * event/speaker scoping enforced
   * audit entries created

Rules:

* Keep internal notes entirely separate from speaker messages.
* Do not add email sending yet unless already part of message service.
* Do not expose planner-only metadata in portal.

Output:

* Files changed
* Messaging behavior
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 18 — Automated Reminders + Email History

Model: GPT-5.5
Reasoning: High

Build automated speaker reminders and email history.

Context:

* Reminder rules should be event-configurable.
* Email history should show what was sent, when, to whom, and why.
* The app may not have background workers; if not, implement reminder generation in a safe manual/triggered way first.
* Do not promise background cron unless infrastructure exists.

Task:

1. Add reminder rule model/service if approved by schema.
2. Add planner UI to view/configure basic reminder rules:

   * incomplete profile
   * missing deck
   * upcoming task deadline
   * unconfirmed session content
   * required document missing
3. Add reminder preview before sending.
4. Add send reminder action.
5. Add email log/history panel.
6. If email provider config exists, send real email; otherwise create a stubbed provider interface and log pending/not sent states clearly.
7. Add tests:

   * reminders select correct speakers
   * reminders do not include complete speakers
   * email logs are written
   * failed sends are visible
   * event scoping enforced

Rules:

* Do not create hidden background behavior unless queue/cron exists.
* Do not send real emails in tests.
* Do not expose OTP/secrets in logs.
* Keep provider interface swappable.

Output:

* Files changed
* Reminder behavior
* Email provider status
* Tests added
* Commands run
* Remaining infrastructure needs

---

## Prompt 19 — Onsite Instructions + Speaker Readiness Dashboard

Model: GPT-5.5
Reasoning: Medium

Build onsite instructions and speaker readiness dashboard.

Context:

* This is the operational final-readiness layer.
* Matrix remains source of truth for rooms/schedule.
* Speaker module should summarize readiness, not fork source data.
* Speaker should see an onsite packet.

Task:

1. Add speaker portal onsite packet:

   * schedule
   * room assignments
   * green room location
   * arrival instructions
   * badge/pass pickup info
   * onsite contact
   * AV/rehearsal instructions
2. Add planner readiness dashboard:

   * profile complete
   * session confirmed
   * travel complete
   * hotel complete
   * AV complete
   * deck approved/final
   * docs signed/approved
   * badge/pass ready
3. Add readiness calculation service.
4. Add missing readiness reasons.
5. Add tests:

   * readiness reflects source statuses
   * Matrix schedule changes reflect in portal
   * missing items are accurate
   * speaker only sees own packet
   * planner sees event-wide readiness

Rules:

* Do not duplicate Matrix schedule as speaker source of truth.
* Do not duplicate Docs Hub approval state.
* Readiness should be derived, not manually faked.

Output:

* Files changed
* Readiness rules
* Tests added
* Commands run
* Manual QA checklist

---

## Prompt 20 — Admin Preview / Impersonation Mode

Model: GPT-5.5
Reasoning: High

Build admin preview mode for the Speaker Portal.

Context:

* Planners need to see what a speaker sees.
* Start with read-only preview.
* True impersonation should be avoided unless necessary and must be heavily audited.
* Preview must never grant accidental write access as the speaker.

Task:

1. Add planner-side “Preview Portal” action.
2. Open a read-only portal preview for selected speaker.
3. Clearly label preview mode.
4. Disable or block speaker write actions during preview.
5. Add audit entry when planner opens preview.
6. If implementing true impersonation, add:

   * explicit confirmation
   * limited session duration
   * audit log
   * visible banner
   * reason capture
7. Add tests:

   * planner can preview speaker portal
   * preview is scoped to event/speaker
   * preview cannot write speaker updates
   * unauthorized planner cannot preview
   * audit entry created

Rules:

* Prefer read-only preview first.
* Do not silently impersonate.
* Do not reuse speaker OTP flow for planner preview.

Output:

* Files changed
* Preview behavior
* Tests added
* Commands run
* Security notes

---

## Prompt 21 — Full Audit Trail + Activity Timeline Polish

Model: GPT-5.5
Reasoning: Medium

Polish and verify the Speaker module audit/activity layer.

Context:

* Every important speaker action should be auditable.
* Activity should be visible to planners.
* Audit should support troubleshooting and compliance.
* Speaker portal activity should not expose internal-only events to speakers unless intentionally visible.

Task:

1. Review all Speaker module actions and confirm audit coverage:

   * speaker created
   * speaker updated
   * invite sent
   * OTP verified
   * profile updated
   * headshot uploaded
   * session assigned/unassigned
   * content review submitted
   * content suggestion accepted/rejected
   * task completed
   * requirement submitted
   * file uploaded
   * file reviewed
   * document submitted
   * message sent
   * internal note added
   * reminder sent
   * preview opened
2. Add missing audit calls.
3. Add planner activity timeline in speaker detail.
4. Add event-level speaker activity feed if straightforward.
5. Add tests for key audit entries.
6. Verify audit entries include:

   * eventId
   * speakerId where relevant
   * actor type
   * actor id if available
   * action
   * timestamp
   * target object
   * safe metadata only

Rules:

* Do not log secrets, OTPs, private tokens, or raw sensitive fields.
* Do not expose internal audit metadata to portal users.
* Keep audit writes centralized.

Output:

* Files changed
* Audit coverage list
* Tests added
* Commands run
* Remaining gaps

---

## Prompt 22 — Regression Suite + Hardening Pass

Model: GPT-5.5
Reasoning: High

Run a hardening pass across the Speaker module.

Context:

* The module now includes planner admin, portal auth, profile, sessions, tasks, files, docs, messaging, reminders, readiness, preview, and audit.
* We need regression coverage and drift cleanup before merge.
* Project standard is production-quality, scoped, low-breakage, tested before merge.

Task:

1. Audit code for duplicated business logic.
2. Confirm all write paths use canonical service/access helpers.
3. Confirm route handlers stay thin.
4. Confirm server-side enforcement exists for:

   * planner event access
   * speaker portal access
   * event/speaker scope
   * file/document scope
   * preview mode read-only behavior
5. Add missing regression tests.
6. Add source-level tests for:

   * no internal notes exposed in portal
   * speaker cannot see other speaker data
   * Matrix remains source of truth for sessions/schedule
   * Docs Hub remains source of truth for formal docs
   * Deadlines remains source of truth for due dates
   * audit entries on critical writes
7. Remove dead code/placeholders that are no longer needed.
8. Run relevant test suite.

Rules:

* Do not broaden scope into unrelated modules.
* Do not refactor unrelated app shell code.
* Do not hide failing tests.
* Stop at first confirmed serious behavior failure and report it clearly.

Output:

* Files changed
* Tests added
* Commands run
* Pass/fail results
* Confirmed gaps
* Recommended next prompt if needed
