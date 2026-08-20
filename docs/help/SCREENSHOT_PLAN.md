# Orca Help Center Screenshot Plan

This plan consolidates 50 purposeful captures. Capture each Screenshot ID once and reuse it in every listed article. Do not include real portal tokens, intake tokens, personal email addresses, confidential financial data, or production-only administrative identifiers.

## Capture Standards

- Use seeded demonstration data that makes the documented state legible.
- Capture the full browser viewport unless the entry names a modal or drawer; crop only in Help Center presentation.
- Use the exact role and viewport listed below.
- Keep annotation numbers outside important text and use the listed visible labels as targets.
- Recheck the route and labels immediately before capture.

## /dashboard

### HC-01

- **Articles:** [Welcome to Orca](getting-started/welcome-to-orca.md), [Navigate Orca](getting-started/navigate-orca.md), [Use the Account Command Center](portfolio/use-the-account-command-center.md)
- **Route:** `/dashboard`
- **Required role:** Organization Member
- **Required event/data state:** Portfolio with multiple events, mixed health states, deadlines, and budget data.
- **Viewport:** 1440 x 1000
- **Required UI state:** Portfolio with multiple events, mixed health states, deadlines, and budget data.
- **Annotation targets:** 1. Create Event; 2. Portfolio KPI row; 3. Event Snapshot
- **May be reused:** Yes
- **Suggested filename:** `hc-01-use-the-account-command-center.png`
- **Priority:** critical

### HC-09

- **Articles:** [Understand Notifications](getting-started/understand-notifications.md), [Use Notifications](collaboration/use-notifications.md), [Missing Notifications](troubleshooting/missing-notifications.md)
- **Route:** `/dashboard`
- **Required role:** Organization Member
- **Required event/data state:** Notifications menu open with unread and read rows.
- **Viewport:** 1280 x 900
- **Required UI state:** Notifications menu open with unread and read rows.
- **Annotation targets:** 1. Notifications; 2. Unread count; 3. Linked notification row
- **May be reused:** Yes
- **Suggested filename:** `hc-09-use-notifications.png`
- **Priority:** useful

## /dashboard/action-center?view=risks

### HC-02

- **Articles:** [Use the Action Center](portfolio/use-the-action-center.md), [Conduct a Weekly Event Health Review](workflows/conduct-a-weekly-event-health-review.md)
- **Route:** `/dashboard/action-center?view=risks`
- **Required role:** Organization Member
- **Required event/data state:** Risks selected with rows from more than one event.
- **Viewport:** 1440 x 1000
- **Required UI state:** Risks selected with rows from more than one event.
- **Annotation targets:** 1. Risks; 2. Queue row event name; 3. Source-record link
- **May be reused:** Yes
- **Suggested filename:** `hc-02-use-the-action-center.png`
- **Priority:** critical

## /dashboard/action-center?view=approvals

### HC-03

- **Articles:** [Use the Action Center](portfolio/use-the-action-center.md), [Understand Approvals in Orca](collaboration/understand-approvals-in-orca.md)
- **Route:** `/dashboard/action-center?view=approvals`
- **Required role:** Organization Member
- **Required event/data state:** Approvals selected with Budget and document work represented.
- **Viewport:** 1440 x 1000
- **Required UI state:** Approvals selected with Budget and document work represented.
- **Annotation targets:** 1. Approvals; 2. Source type; 3. Event name
- **May be reused:** Yes
- **Suggested filename:** `hc-03-understand-approvals-in-orca.png`
- **Priority:** useful

## /events/new

### HC-04

- **Articles:** [Create Your First Event](getting-started/create-your-first-event.md)
- **Route:** `/events/new`
- **Required role:** Event Editor
- **Required event/data state:** Event details step with valid name, dates, and timezone entered.
- **Viewport:** 1440 x 1000
- **Required UI state:** Event details step with valid name, dates, and timezone entered.
- **Annotation targets:** 1. Event details; 2. Timezone; 3. Continue
- **May be reused:** Yes
- **Suggested filename:** `hc-04-create-your-first-event.png`
- **Priority:** critical

### HC-05

- **Articles:** [Choose an Event Builder Starting Point](getting-started/choose-an-event-builder-starting-point.md), [Build a New Event from a Rough Agenda](workflows/build-a-new-event-from-a-rough-agenda.md)
- **Route:** `/events/new`
- **Required role:** Event Editor
- **Required event/data state:** Choose a starting point step with all four method cards visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Choose a starting point step with all four method cards visible.
- **Annotation targets:** 1. Upload Spreadsheet; 2. Paste Agenda; 3. Start Blank
- **May be reused:** Yes
- **Suggested filename:** `hc-05-choose-an-event-builder-starting-point.png`
- **Priority:** critical

### HC-06

- **Articles:** [Import Planning Spreadsheets](getting-started/import-planning-spreadsheets.md), [Build a New Event from Existing Spreadsheets](workflows/build-a-new-event-from-existing-spreadsheets.md), [Spreadsheet Import Problems](troubleshooting/spreadsheet-import-problems.md)
- **Route:** `/events/new`
- **Required role:** Event Editor
- **Required event/data state:** Map spreadsheets step with one workbook, a target module, required mappings, and one mapping warning.
- **Viewport:** 1440 x 1000
- **Required UI state:** Map spreadsheets step with one workbook, a target module, required mappings, and one mapping warning.
- **Annotation targets:** 1. Map spreadsheets; 2. Planner field; 3. Needs mapping
- **May be reused:** Yes
- **Suggested filename:** `hc-06-import-planning-spreadsheets.png`
- **Priority:** critical

### HC-07

- **Articles:** [Import Planning Spreadsheets](getting-started/import-planning-spreadsheets.md), [Build a New Event from Existing Spreadsheets](workflows/build-a-new-event-from-existing-spreadsheets.md)
- **Route:** `/events/new`
- **Required role:** Event Editor
- **Required event/data state:** Review & create with Preview records and Issues available and nonzero Will create totals.
- **Viewport:** 1440 x 1000
- **Required UI state:** Review & create with Preview records and Issues available and nonzero Will create totals.
- **Annotation targets:** 1. Review & create; 2. Issues; 3. Will create
- **May be reused:** Yes
- **Suggested filename:** `hc-07-import-planning-spreadsheets.png`
- **Priority:** critical

## /events/{eventId}

### HC-08

- **Articles:** [Navigate Orca](getting-started/navigate-orca.md), [Understand Event Workspace Navigation](getting-started/understand-event-workspace-navigation.md)
- **Route:** `/events/{eventId}`
- **Required role:** Event Viewer
- **Required event/data state:** Expanded event sidebar with Event Directory children visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Expanded event sidebar with Event Directory children visible.
- **Annotation targets:** 1. Planning; 2. Management; 3. Event Directory
- **May be reused:** Yes
- **Suggested filename:** `hc-08-understand-event-workspace-navigation.png`
- **Priority:** critical

### HC-10

- **Articles:** [Use the Event Command Center](event-planning/use-the-event-command-center.md), [Prepare for a Client Status Meeting](workflows/prepare-for-a-client-status-meeting.md)
- **Route:** `/events/{eventId}`
- **Required role:** Event Viewer
- **Required event/data state:** Event with mixed readiness, a pending approval, and at least one blocker.
- **Viewport:** 1440 x 1000
- **Required UI state:** Event with mixed readiness, a pending approval, and at least one blocker.
- **Annotation targets:** 1. Event health metrics; 2. Readiness Dashboard; 3. Financial Exposure
- **May be reused:** Yes
- **Suggested filename:** `hc-10-use-the-event-command-center.png`
- **Priority:** critical

### HC-11

- **Articles:** [Customize the Event Command Center](event-planning/customize-the-event-command-center.md)
- **Route:** `/events/{eventId}`
- **Required role:** Event Editor
- **Required event/data state:** Customize dashboard open with available sections and layout controls visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Customize dashboard open with available sections and layout controls visible.
- **Annotation targets:** 1. Customize dashboard; 2. Reset to Default; 3. Done
- **May be reused:** Yes
- **Suggested filename:** `hc-11-customize-the-event-command-center.png`
- **Priority:** useful

## /events/{eventId}/timeline

### HC-12

- **Articles:** [Use the Roadmap](event-planning/use-the-roadmap.md), [Conduct a Weekly Event Health Review](workflows/conduct-a-weekly-event-health-review.md)
- **Route:** `/events/{eventId}/timeline`
- **Required role:** Event Viewer
- **Required event/data state:** Dashboard selected with total, at-risk, overdue, and workstream data.
- **Viewport:** 1440 x 1000
- **Required UI state:** Dashboard selected with total, at-risk, overdue, and workstream data.
- **Annotation targets:** 1. Dashboard; 2. At risk; 3. Add
- **May be reused:** Yes
- **Suggested filename:** `hc-12-use-the-roadmap.png`
- **Priority:** critical

### HC-13

- **Articles:** [Use the Roadmap](event-planning/use-the-roadmap.md)
- **Route:** `/events/{eventId}/timeline`
- **Required role:** Event Editor
- **Required event/data state:** Matrix selected with filters open and editable rows.
- **Viewport:** 1440 x 1000
- **Required UI state:** Matrix selected with filters open and editable rows.
- **Annotation targets:** 1. Matrix; 2. All Workstreams; 3. Status
- **May be reused:** Yes
- **Suggested filename:** `hc-13-use-the-roadmap.png`
- **Priority:** critical

### HC-14

- **Articles:** [Use the Roadmap](event-planning/use-the-roadmap.md), [Prepare for the Final 30 Days](workflows/prepare-for-the-final-30-days.md)
- **Route:** `/events/{eventId}/timeline`
- **Required role:** Event Editor
- **Required event/data state:** Workstream selected with parent workstreams, dated items, and a dependency.
- **Viewport:** 1440 x 1000
- **Required UI state:** Workstream selected with parent workstreams, dated items, and a dependency.
- **Annotation targets:** 1. Workstream; 2. Date scale; 3. Critical Path indicator
- **May be reused:** Yes
- **Suggested filename:** `hc-14-use-the-roadmap.png`
- **Priority:** useful

### HC-15

- **Articles:** [Use the Roadmap](event-planning/use-the-roadmap.md)
- **Route:** `/events/{eventId}/timeline`
- **Required role:** Event Editor
- **Required event/data state:** Board selected with cards in multiple statuses.
- **Viewport:** 1440 x 1000
- **Required UI state:** Board selected with cards in multiple statuses.
- **Annotation targets:** 1. Board; 2. Not Started column; 3. In Progress column
- **May be reused:** Yes
- **Suggested filename:** `hc-15-use-the-roadmap.png`
- **Priority:** useful

## /events/{eventId}/budget

### HC-16

- **Articles:** [Use the Budget Dashboard](event-planning/use-the-budget-dashboard.md), [Review Event Financial Health](workflows/review-event-financial-health.md)
- **Route:** `/events/{eventId}/budget`
- **Required role:** Event Viewer
- **Required event/data state:** Budget with forecast, committed/actual, variance, category blocks, and work queue.
- **Viewport:** 1440 x 1000
- **Required UI state:** Budget with forecast, committed/actual, variance, category blocks, and work queue.
- **Annotation targets:** 1. Total Forecast; 2. Actual / Committed; 3. Budget Work Queue
- **May be reused:** Yes
- **Suggested filename:** `hc-16-use-the-budget-dashboard.png`
- **Priority:** critical

## /events/{eventId}/budget?view=grid

### HC-17

- **Articles:** [Manage the Full Budget Grid](event-planning/manage-the-full-budget-grid.md), [Review Event Financial Health](workflows/review-event-financial-health.md)
- **Route:** `/events/{eventId}/budget?view=grid`
- **Required role:** Event Editor
- **Required event/data state:** Full Budget Grid with several categories, vendors, approval states, and one linked session.
- **Viewport:** 1440 x 1000
- **Required UI state:** Full Budget Grid with several categories, vendors, approval states, and one linked session.
- **Annotation targets:** 1. Full Budget Grid; 2. Add Line Item; 3. Approval status
- **May be reused:** Yes
- **Suggested filename:** `hc-17-manage-the-full-budget-grid.png`
- **Priority:** critical

### HC-18

- **Articles:** [Manage the Full Budget Grid](event-planning/manage-the-full-budget-grid.md)
- **Route:** `/events/{eventId}/budget?view=grid`
- **Required role:** Event Editor
- **Required event/data state:** Filters panel open with two active filters.
- **Viewport:** 1440 x 1000
- **Required UI state:** Filters panel open with two active filters.
- **Annotation targets:** 1. Filters · 2; 2. Category filter; 3. Clear filters
- **May be reused:** Yes
- **Suggested filename:** `hc-18-manage-the-full-budget-grid.png`
- **Priority:** useful

### HC-19

- **Articles:** [Submit and Review Budget Approvals](event-planning/submit-and-review-budget-approvals.md), [Budget Editing and Approval Problems](troubleshooting/budget-editing-and-approval-problems.md)
- **Route:** `/events/{eventId}/budget?view=grid`
- **Required role:** Event Editor
- **Required event/data state:** Submit for approval dialog open with one reviewer selected and a message entered.
- **Viewport:** 1440 x 1000
- **Required UI state:** Submit for approval dialog open with one reviewer selected and a message entered.
- **Annotation targets:** 1. Submit for approval; 2. Message (optional); 3. Reviewer selection
- **May be reused:** Yes
- **Suggested filename:** `hc-19-submit-and-review-budget-approvals.png`
- **Priority:** critical

### HC-20

- **Articles:** [Submit and Review Budget Approvals](event-planning/submit-and-review-budget-approvals.md), [Understand Approvals in Orca](collaboration/understand-approvals-in-orca.md)
- **Route:** `/events/{eventId}/budget?view=grid`
- **Required role:** Event Editor
- **Required event/data state:** Budget Approvals drawer open on a submitted line with history and decision controls.
- **Viewport:** 1440 x 1000
- **Required UI state:** Budget Approvals drawer open on a submitted line with history and decision controls.
- **Annotation targets:** 1. Budget Approvals; 2. Submission history; 3. Approve
- **May be reused:** Yes
- **Suggested filename:** `hc-20-submit-and-review-budget-approvals.png`
- **Priority:** critical

### HC-21

- **Articles:** [Import and Export Budget Data](event-planning/import-and-export-budget-data.md), [Spreadsheet Import Problems](troubleshooting/spreadsheet-import-problems.md)
- **Route:** `/events/{eventId}/budget?view=grid`
- **Required role:** Event Editor
- **Required event/data state:** Import Budget Data modal after mapping, with valid and invalid rows visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Import Budget Data modal after mapping, with valid and invalid rows visible.
- **Annotation targets:** 1. Import Budget Data; 2. Column mapping; 3. Invalid rows
- **May be reused:** Yes
- **Suggested filename:** `hc-21-import-and-export-budget-data.png`
- **Priority:** critical

### HC-22

- **Articles:** [Import and Export Budget Data](event-planning/import-and-export-budget-data.md)
- **Route:** `/events/{eventId}/budget?view=grid`
- **Required role:** Event Editor
- **Required event/data state:** Tools menu open while active filters make Export Filtered View visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Tools menu open while active filters make Export Filtered View visible.
- **Annotation targets:** 1. Tools; 2. Export Filtered View; 3. Export Summary
- **May be reused:** Yes
- **Suggested filename:** `hc-22-import-and-export-budget-data.png`
- **Priority:** useful

## /events/{eventId}/matrix

### HC-23

- **Articles:** [Use the Run of Show](event-planning/use-the-run-of-show.md), [Build and Review a Run of Show](workflows/build-and-review-a-run-of-show.md)
- **Route:** `/events/{eventId}/matrix`
- **Required role:** Event Viewer
- **Required event/data state:** Board selected in Rooms by time orientation with multiple rooms and overlapping session shapes.
- **Viewport:** 1440 x 1000
- **Required UI state:** Board selected in Rooms by time orientation with multiple rooms and overlapping session shapes.
- **Annotation targets:** 1. Board; 2. Rooms by time; 3. Add session
- **May be reused:** Yes
- **Suggested filename:** `hc-23-use-the-run-of-show.png`
- **Priority:** critical

### HC-24

- **Articles:** [Choose Board or List View](event-planning/choose-board-or-list-view.md)
- **Route:** `/events/{eventId}/matrix`
- **Required role:** Event Viewer
- **Required event/data state:** Board selected in Time by room orientation.
- **Viewport:** 1440 x 1000
- **Required UI state:** Board selected in Time by room orientation.
- **Annotation targets:** 1. Time by room; 2. Date; 3. Session block
- **May be reused:** Yes
- **Suggested filename:** `hc-24-choose-board-or-list-view.png`
- **Priority:** useful

### HC-25

- **Articles:** [Choose Board or List View](event-planning/choose-board-or-list-view.md), [Missing Sessions or Schedule Conflicts](troubleshooting/missing-sessions-or-schedule-conflicts.md)
- **Route:** `/events/{eventId}/matrix`
- **Required role:** Event Viewer
- **Required event/data state:** List selected with Filters open and Missing speakers plus Missing F&B selected.
- **Viewport:** 1440 x 1000
- **Required UI state:** List selected with Filters open and Missing speakers plus Missing F&B selected.
- **Annotation targets:** 1. List; 2. Missing speakers; 3. Missing F&B
- **May be reused:** Yes
- **Suggested filename:** `hc-25-choose-board-or-list-view.png`
- **Priority:** critical

### HC-26

- **Articles:** [Create and Edit Sessions](event-planning/create-and-edit-sessions.md), [Build and Review a Run of Show](workflows/build-and-review-a-run-of-show.md)
- **Route:** `/events/{eventId}/matrix`
- **Required role:** Event Editor
- **Required event/data state:** Add session dialog with title, date, time, room, and session type fields.
- **Viewport:** 1440 x 1000
- **Required UI state:** Add session dialog with title, date, time, room, and session type fields.
- **Annotation targets:** 1. Add session; 2. Session type; 3. Create session action
- **May be reused:** Yes
- **Suggested filename:** `hc-26-create-and-edit-sessions.png`
- **Priority:** critical

### HC-27

- **Articles:** [Assign Speakers to Sessions](people-and-program/assign-speakers-to-sessions.md), [Create and Edit Sessions](event-planning/create-and-edit-sessions.md)
- **Route:** `/events/{eventId}/matrix`
- **Required role:** Event Editor
- **Required event/data state:** Session quick drawer with Speakers panel open, one assigned speaker, and one available speaker.
- **Viewport:** 1440 x 1000
- **Required UI state:** Session quick drawer with Speakers panel open, one assigned speaker, and one available speaker.
- **Annotation targets:** 1. Speakers; 2. Add speaker action; 3. Save changes
- **May be reused:** Yes
- **Suggested filename:** `hc-27-assign-speakers-to-sessions.png`
- **Priority:** critical

### HC-50

- **Articles:** [Manage Room Sets and Seating](event-planning/manage-room-sets-and-seating.md), [Feature Not Available or Marked Coming Soon](troubleshooting/feature-not-available-or-marked-coming-soon.md)
- **Route:** `/events/{eventId}/matrix`
- **Required role:** Event Viewer
- **Required event/data state:** Event with a session that displays Room Set & Seating as Coming soon.
- **Viewport:** 1440 x 1000
- **Required UI state:** Open the session and keep the disabled **Room Set & Seating** entry visible.
- **Annotation targets:** 1. Room Set & Seating; 2. Coming soon; 3. Session title
- **May be reused:** Yes
- **Suggested filename:** `hc-50-manage-room-sets-and-seating.png`
- **Priority:** optional

## /events/{eventId}/matrix/sessions/{sessionId}

### HC-28

- **Articles:** [Use the Session Workspace](event-planning/use-the-session-workspace.md), [Coordinate Session Logistics](workflows/coordinate-session-logistics.md)
- **Route:** `/events/{eventId}/matrix/sessions/{sessionId}`
- **Required role:** Event Editor
- **Required event/data state:** Full session workspace with section navigation and a session containing several requirements.
- **Viewport:** 1440 x 1000
- **Required UI state:** Full session workspace with section navigation and a session containing several requirements.
- **Annotation targets:** 1. Session title and time; 2. Section navigation; 3. Readiness or conflict area
- **May be reused:** Yes
- **Suggested filename:** `hc-28-use-the-session-workspace.png`
- **Priority:** critical

### HC-29

- **Articles:** [Assign F&B to Sessions](event-planning/assign-fnb-to-sessions.md), [Coordinate Session Logistics](workflows/coordinate-session-logistics.md), [Review Event Financial Health](workflows/review-event-financial-health.md)
- **Route:** `/events/{eventId}/matrix/sessions/{sessionId}`
- **Required role:** Event Editor
- **Required event/data state:** F&B Planner open with an approved catalog assignment, tax/service charge, estimate, and linked budget line.
- **Viewport:** 1440 x 1000
- **Required UI state:** F&B Planner open with an approved catalog assignment, tax/service charge, estimate, and linked budget line.
- **Annotation targets:** 1. F&B Planner; 2. Session F&B Plan; 3. Variance to budget
- **May be reused:** Yes
- **Suggested filename:** `hc-29-assign-fnb-to-sessions.png`
- **Priority:** critical

## /events/{eventId}/docs

### HC-30

- **Articles:** [Use the Docs Hub](event-planning/use-the-docs-hub.md)
- **Route:** `/events/{eventId}/docs`
- **Required role:** Event Viewer
- **Required event/data state:** Docs Hub with Draft, In Review, and Approved cards across categories.
- **Viewport:** 1440 x 1000
- **Required UI state:** Docs Hub with Draft, In Review, and Approved cards across categories.
- **Annotation targets:** 1. Upload Document; 2. Category filters; 3. Document status
- **May be reused:** Yes
- **Suggested filename:** `hc-30-use-the-docs-hub.png`
- **Priority:** critical

### HC-31

- **Articles:** [Use the Docs Hub](event-planning/use-the-docs-hub.md)
- **Route:** `/events/{eventId}/docs`
- **Required role:** Event Editor
- **Required event/data state:** Upload Document open with Category, Link to, visibility, and Send for Review After Upload visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Upload Document open with Category, Link to, visibility, and Send for Review After Upload visible.
- **Annotation targets:** 1. Category; 2. Link to; 3. Send for Review After Upload
- **May be reused:** Yes
- **Suggested filename:** `hc-31-use-the-docs-hub.png`
- **Priority:** critical

### HC-32

- **Articles:** [Use the Docs Hub](event-planning/use-the-docs-hub.md), [Understand Approvals in Orca](collaboration/understand-approvals-in-orca.md)
- **Route:** `/events/{eventId}/docs`
- **Required role:** Event Editor
- **Required event/data state:** Document Details open on an In Review document with recipients and Pull back visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Document Details open on an In Review document with recipients and Pull back visible.
- **Annotation targets:** 1. Document Details; 2. Recipients; 3. Pull back
- **May be reused:** Yes
- **Suggested filename:** `hc-32-use-the-docs-hub.png`
- **Priority:** critical

## /events/{eventId}/settings

### HC-33

- **Articles:** [Configure Event Settings](event-planning/configure-event-settings.md)
- **Route:** `/events/{eventId}/settings`
- **Required role:** Event Editor
- **Required event/data state:** Event settings overview showing all Run of Show and workspace cards.
- **Viewport:** 1440 x 1000
- **Required UI state:** Event settings overview showing all Run of Show and workspace cards.
- **Annotation targets:** 1. Session Types; 2. AV Requirements; 3. Workspace actions
- **May be reused:** Yes
- **Suggested filename:** `hc-33-configure-event-settings.png`
- **Priority:** critical

### HC-34

- **Articles:** [Configure Event Settings](event-planning/configure-event-settings.md), [Use the Session Workspace](event-planning/use-the-session-workspace.md)
- **Route:** `/events/{eventId}/settings`
- **Required role:** Event Editor
- **Required event/data state:** AV Requirements detail with reusable sections and items.
- **Viewport:** 1440 x 1000
- **Required UI state:** AV Requirements detail with reusable sections and items.
- **Annotation targets:** 1. AV Requirements; 2. Add section or item control; 3. Save control
- **May be reused:** Yes
- **Suggested filename:** `hc-34-configure-event-settings.png`
- **Priority:** useful

## /events/{eventId}/directory

### HC-35

- **Articles:** [Use the Directory](people-and-program/use-the-directory.md), [Understand Attendee and Directory Records](people-and-program/understand-attendee-and-directory-records.md)
- **Route:** `/events/{eventId}/directory`
- **Required role:** Event Viewer
- **Required event/data state:** Event Directory with mixed roles, a missing-email record, and selection toolbar visible.
- **Viewport:** 1440 x 1000
- **Required UI state:** Event Directory with mixed roles, a missing-email record, and selection toolbar visible.
- **Annotation targets:** 1. Total people; 2. All roles; 3. Email selected
- **May be reused:** Yes
- **Suggested filename:** `hc-35-use-the-directory.png`
- **Priority:** critical

### HC-36

- **Articles:** [Import and Clean Directory Records](people-and-program/import-and-clean-directory-records.md), [Missing or Duplicate People](troubleshooting/missing-or-duplicate-people.md)
- **Route:** `/events/{eventId}/directory`
- **Required role:** Event Editor
- **Required event/data state:** Import people modal with source label, mapping, and a row missing identity.
- **Viewport:** 1440 x 1000
- **Required UI state:** Import people modal with source label, mapping, and a row missing identity.
- **Annotation targets:** 1. Import people; 2. Source label; 3. Preview
- **May be reused:** Yes
- **Suggested filename:** `hc-36-import-and-clean-directory-records.png`
- **Priority:** critical

## /events/{eventId}/attendees

### HC-37

- **Articles:** [Manage Attendees](people-and-program/manage-attendees.md), [Understand Attendee and Directory Records](people-and-program/understand-attendee-and-directory-records.md)
- **Route:** `/events/{eventId}/attendees`
- **Required role:** Event Viewer
- **Required event/data state:** Attendees with Registered, Pending / waitlisted, Missing email, Needs review, and Sync conflicts represented.
- **Viewport:** 1440 x 1000
- **Required UI state:** Attendees with Registered, Pending / waitlisted, Missing email, Needs review, and Sync conflicts represented.
- **Annotation targets:** 1. Registered; 2. Pending / waitlisted; 3. Sync conflicts
- **May be reused:** Yes
- **Suggested filename:** `hc-37-manage-attendees.png`
- **Priority:** critical

## /events/{eventId}/speakers

### HC-38

- **Articles:** [Manage Speakers](people-and-program/manage-speakers.md), [Track Speaker Readiness](people-and-program/track-speaker-readiness.md), [Prepare Speakers for an Event](workflows/prepare-speakers-for-an-event.md)
- **Route:** `/events/{eventId}/speakers`
- **Required role:** Event Viewer
- **Required event/data state:** Speakers directory with readiness tiles and Missing deck selected.
- **Viewport:** 1440 x 1000
- **Required UI state:** Speakers directory with readiness tiles and Missing deck selected.
- **Annotation targets:** 1. Missing deck; 2. Requests pending; 3. Conflicts
- **May be reused:** Yes
- **Suggested filename:** `hc-38-track-speaker-readiness.png`
- **Priority:** critical

## /events/{eventId}/speakers/{speakerId}

### HC-39

- **Articles:** [Manage Speakers](people-and-program/manage-speakers.md), [Track Speaker Readiness](people-and-program/track-speaker-readiness.md)
- **Route:** `/events/{eventId}/speakers/{speakerId}`
- **Required role:** Event Viewer
- **Required event/data state:** Speaker Overview with readiness, pending update, and Speaker Portal card.
- **Viewport:** 1440 x 1000
- **Required UI state:** Speaker Overview with readiness, pending update, and Speaker Portal card.
- **Annotation targets:** 1. Overview; 2. Readiness; 3. Speaker Portal
- **May be reused:** Yes
- **Suggested filename:** `hc-39-manage-speakers.png`
- **Priority:** critical

### HC-42

- **Articles:** [Request and Review Speaker Documents](people-and-program/request-and-review-speaker-documents.md), [Prepare Speakers for an Event](workflows/prepare-speakers-for-an-event.md)
- **Route:** `/events/{eventId}/speakers/{speakerId}`
- **Required role:** Event Editor
- **Required event/data state:** Speaker Documents section with one signature-required request and one submitted file awaiting review.
- **Viewport:** 1440 x 1000
- **Required UI state:** Speaker Documents section with one signature-required request and one submitted file awaiting review.
- **Annotation targets:** 1. Documents; 2. Signature required; 3. Submitted file
- **May be reused:** Yes
- **Suggested filename:** `hc-42-request-and-review-speaker-documents.png`
- **Priority:** critical

## /speaker-intake/{token}

### HC-40

- **Articles:** [Use Speaker Intake](people-and-program/use-speaker-intake.md)
- **Route:** `/speaker-intake/{token}`
- **Required role:** Speaker token holder
- **Required event/data state:** Valid intake link with profile fields and headshot controls, before submission.
- **Viewport:** 1280 x 900
- **Required UI state:** Valid intake link with profile fields and headshot controls, before submission.
- **Annotation targets:** 1. Update your speaker profile; 2. Upload headshot; 3. Submit Profile Update
- **May be reused:** No
- **Suggested filename:** `hc-40-use-speaker-intake.png`
- **Priority:** critical

## /speaker-portal/{token}

### HC-41

- **Articles:** [Use the Speaker Portal](people-and-program/use-the-speaker-portal.md), [Speaker Portal Link Problems](troubleshooting/speaker-portal-link-problems.md)
- **Route:** `/speaker-portal/{token}`
- **Required role:** Speaker token holder
- **Required event/data state:** Valid speaker portal Overview with readiness and section navigation.
- **Viewport:** 1280 x 900
- **Required UI state:** Valid speaker portal Overview with readiness and section navigation.
- **Annotation targets:** 1. Readiness; 2. Presentations; 3. Required Documents
- **May be reused:** No
- **Suggested filename:** `hc-41-use-the-speaker-portal.png`
- **Priority:** critical

## /events/{eventId}/marketing

### HC-43

- **Articles:** [Use Marketing](communications/use-marketing.md)
- **Route:** `/events/{eventId}/marketing`
- **Required role:** Event Viewer
- **Required event/data state:** Marketing Overview with campaigns, planned sends, performance snapshot, and tab navigation.
- **Viewport:** 1440 x 1000
- **Required UI state:** Marketing Overview with campaigns, planned sends, performance snapshot, and tab navigation.
- **Annotation targets:** 1. Overview; 2. Campaigns; 3. Performance
- **May be reused:** Yes
- **Suggested filename:** `hc-43-use-marketing.png`
- **Priority:** critical

### HC-44

- **Articles:** [Create Campaigns, Audiences, and Sends](communications/create-campaigns-audiences-and-sends.md), [Use Marketing](communications/use-marketing.md)
- **Route:** `/events/{eventId}/marketing`
- **Required role:** Event Editor
- **Required event/data state:** New campaign form with Campaign identity, Email channel, campaign window, and status.
- **Viewport:** 1440 x 1000
- **Required UI state:** New campaign form with Campaign identity, Email channel, campaign window, and status.
- **Annotation targets:** 1. Campaign identity; 2. Active channel; 3. Campaign window
- **May be reused:** Yes
- **Suggested filename:** `hc-44-create-campaigns-audiences-and-sends.png`
- **Priority:** critical

### HC-45

- **Articles:** [Create Campaigns, Audiences, and Sends](communications/create-campaigns-audiences-and-sends.md), [Review Marketing Approvals and Compliance](communications/review-marketing-approvals-and-compliance.md)
- **Route:** `/events/{eventId}/marketing`
- **Required role:** Event Editor
- **Required event/data state:** Email editor with audience selected and Preview as recipient open.
- **Viewport:** 1440 x 1000
- **Required UI state:** Email editor with audience selected and Preview as recipient open.
- **Annotation targets:** 1. Audience; 2. Preview as recipient; 3. Sender settings
- **May be reused:** Yes
- **Suggested filename:** `hc-45-create-campaigns-audiences-and-sends.png`
- **Priority:** critical

### HC-46

- **Articles:** [Review Marketing Approvals and Compliance](communications/review-marketing-approvals-and-compliance.md), [Use Marketing](communications/use-marketing.md)
- **Route:** `/events/{eventId}/marketing`
- **Required role:** Event Editor
- **Required event/data state:** Compliance selected with one event suppression and Resubscribe available.
- **Viewport:** 1440 x 1000
- **Required UI state:** Compliance selected with one event suppression and Resubscribe available.
- **Annotation targets:** 1. Compliance; 2. Reason; 3. Resubscribe
- **May be reused:** Yes
- **Suggested filename:** `hc-46-review-marketing-approvals-and-compliance.png`
- **Priority:** useful

## /events/{eventId}/fnb-catalog

### HC-47

- **Articles:** [Use the F&B Catalog](event-planning/use-the-fnb-catalog.md), [Feature Not Available or Marked Coming Soon](troubleshooting/feature-not-available-or-marked-coming-soon.md)
- **Route:** `/events/{eventId}/fnb-catalog`
- **Required role:** Event Editor
- **Required event/data state:** Preview route with existing Approved Catalog Items and prototype notice visible; do not open Upload Menu.
- **Viewport:** 1440 x 1000
- **Required UI state:** Preview route with existing Approved Catalog Items and prototype notice visible; do not open Upload Menu.
- **Annotation targets:** 1. Approved Catalog Items; 2. Review & Amendments; 3. Prototype notice
- **May be reused:** Yes
- **Suggested filename:** `hc-47-use-the-fnb-catalog.png`
- **Priority:** useful

## /admin/platform/users

### HC-48

- **Articles:** [Use Platform Administration](administration/use-platform-administration.md), [Read-Only Access and Permission Problems](troubleshooting/read-only-access-and-permission-problems.md)
- **Route:** `/admin/platform/users`
- **Required role:** SUPER_ADMIN
- **Required event/data state:** Invite and Provision User form with organization and role controls; no personal email entered.
- **Viewport:** 1440 x 1000
- **Required UI state:** Invite and Provision User form with organization and role controls; no personal email entered.
- **Annotation targets:** 1. Invite and Provision User; 2. Organization; 3. Role
- **May be reused:** Yes
- **Suggested filename:** `hc-48-use-platform-administration.png`
- **Priority:** optional

## /reports

### HC-49

- **Articles:** [Understand Portfolio Reports and Activity](portfolio/understand-portfolio-reports-and-activity.md), [Feature Not Available or Marked Coming Soon](troubleshooting/feature-not-available-or-marked-coming-soon.md)
- **Route:** `/reports`
- **Required role:** Organization Member
- **Required event/data state:** Portfolio Reports Preview placeholder.
- **Viewport:** 1440 x 1000
- **Required UI state:** Portfolio Reports Preview placeholder.
- **Annotation targets:** 1. Portfolio Reports; 2. Preview badge; 3. Account-Level
- **May be reused:** Yes
- **Suggested filename:** `hc-49-understand-portfolio-reports-and-activity.png`
- **Priority:** optional

## Capture Status

### Captured

- `HC-01` captured and integrated into the Help Center library.
- `HC-02` captured and integrated into the Help Center library.
- `HC-03` captured and integrated into the Help Center library.
- `HC-08` captured and integrated into the Help Center library.
- `HC-09` captured and integrated into the Help Center library.
- `HC-10` captured and integrated into the Help Center library.
- `HC-11` captured and integrated into the Help Center library.
- `HC-12` captured and integrated into the Help Center library.
- `HC-13` captured and integrated into the Help Center library.
- `HC-14` captured and integrated into the Help Center library.
- `HC-15` captured and integrated into the Help Center library.
- `HC-16` captured and integrated into the Help Center library.
- `HC-17` captured and integrated into the Help Center library.
- `HC-18` captured and integrated into the Help Center library.
- `HC-19` captured and integrated into the Help Center library.
- `HC-23` captured and integrated into the Help Center library.
- `HC-24` captured and integrated into the Help Center library.
- `HC-25` captured and integrated into the Help Center library.
- `HC-26` captured and integrated into the Help Center library.
- `HC-27` captured and integrated into the Help Center library.
- `HC-28` captured and integrated into the Help Center library.
- `HC-29` captured and integrated into the Help Center library.
- `HC-30` captured and integrated into the Help Center library.
- `HC-31` captured and integrated into the Help Center library.
- `HC-32` captured and integrated into the Help Center library.
- `HC-33` captured and integrated into the Help Center library.
- `HC-34` captured and integrated into the Help Center library.
- `HC-35` captured and integrated into the Help Center library.
- `HC-37` captured and integrated into the Help Center library.
- `HC-38` captured and integrated into the Help Center library.
- `HC-39` captured and integrated into the Help Center library.
- `HC-40` captured and integrated into the Help Center library.
- `HC-41` captured and integrated into the Help Center library.
- `HC-42` captured and integrated into the Help Center library.
- `HC-43` captured and integrated into the Help Center library.
- `HC-46` captured and integrated into the Help Center library.
- `HC-47` captured and integrated into the Help Center library.
- `HC-49` captured and integrated into the Help Center library.

### Remaining Omissions

- `HC-04`: Event Builder event-details state is not seeded into a stable, deterministic planner-facing screenshot flow yet.
- `HC-05`: Event Builder starting-point cards are available, but the guided setup flow is still better documented in prose until the capture path is stabilized.
- `HC-06`: Spreadsheet mapping requires a curated import fixture and produces fragile modal state in local development.
- `HC-07`: Spreadsheet review totals depend on the same unstabilized import fixture pipeline as HC-06.
- `HC-20`: The Budget Approvals drawer is planner-facing, but the exact reviewer-decision state remained inconsistent enough in local capture to avoid a misleading screenshot.
- `HC-21`: Budget import mapping and invalid-row preview still need a purpose-built import fixture to produce a durable screenshot.
- `HC-22`: The Tools menu is available, but the filtered-export state was deferred until the import/export capture flow is stabilized end to end.
- `HC-36`: Directory import preview needs a seeded upload artifact and row-mapping state that is not yet deterministic enough for documentation.
- `HC-44`: The New Campaign form is planner-facing, but the create/edit modal state still needs tighter automation before it belongs in the reusable library.
- `HC-45`: Email-editor preview state depends on multi-step send composition and recipient preview setup that was deferred for accuracy.
- `HC-48`: Platform Administration is intentionally excluded from customer-facing documentation.
- `HC-50`: Room Set & Seating is documented as coming soon; no screenshot was added until the disabled entry can be captured cleanly without implying release readiness.
