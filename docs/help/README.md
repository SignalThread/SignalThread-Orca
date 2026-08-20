# Orca Help Center Content Library

This directory is the source-of-truth content library for the Orca Help Center. Articles explain both the current product workflow and the event-planning practice around it. The Help Center application should render these files rather than hardcoding article content into UI components.

## Content Architecture

- `getting-started/`: orientation, access, event creation, imports, and navigation.
- `portfolio/`: account-level Command Center, Action Center, reports, and settings.
- `event-planning/`: event command center, Roadmap, Budget, Run of Show, sessions, Docs, settings, and F&B.
- `people-and-program/`: Directory, Attendees, Speakers, intake, portal, and documents.
- `communications/`: Marketing campaigns, audiences, sends, approvals, and compliance.
- `collaboration/`: Tasks, notifications, approvals, and Planner Copilot availability.
- `administration/`: restricted platform administration.
- `workflows/`: cross-module planner operating guides.
- `troubleshooting/`: concise issue-resolution guides.
- `SCREENSHOT_PLAN.md`: contributor-only capture matrix and image reuse plan.
- `EDITORIAL_REVIEW.md`: contributor-only record of verified corrections and open product decisions.

## Writing Standards

- Write directly to the planner using “you,” exact UI labels, short paragraphs, and numbered procedures.
- Explain the planner problem, product behavior, planning context, practical tips, and realistic troubleshooting.
- Treat current application code, feature flags, tested journeys, and visible labels as primary evidence.
- Do not mention implementation details in user-facing copy or claim that hidden, gated, preview, placeholder, or Coming soon behavior is shipped.
- Use “Run of Show,” “F&B,” and “Command Center” consistently. Distinguish Account Command Center from Event Command Center.

## Status Definitions

- `published`: available planner workflow documented from the current application.
- `preview`: implementation or surface exists but is gated or not ready to be treated as final.
- `coming-soon`: visible placeholder, disabled workflow, or production-gated feature.
- `internal`: restricted content intended for an administrative audience.

## Screenshot Placeholders

Add a placeholder only when a complex view, import, grid, configuration screen, drawer, or modal materially benefits from visual orientation. Use this exact shape:

```html
<!-- SCREENSHOT NEEDED
Route: /actual/route
State: Describe the event, filters, modal, drawer, or tab that should be visible.
Purpose: Explain what the screenshot teaches.
Annotation targets:
1. Exact element
2. Exact element
3. Exact element
-->
```

## Article Index

### Getting Started

- [Welcome to Orca](getting-started/welcome-to-orca.md) - published
- [Navigate Orca](getting-started/navigate-orca.md) - published
- [Understand Organizations and Access](getting-started/understand-organizations-and-access.md) - published
- [Create Your First Event](getting-started/create-your-first-event.md) - published
- [Choose an Event Builder Starting Point](getting-started/choose-an-event-builder-starting-point.md) - published
- [Import Planning Spreadsheets](getting-started/import-planning-spreadsheets.md) - published
- [Understand Event Workspace Navigation](getting-started/understand-event-workspace-navigation.md) - published
- [Understand Notifications](getting-started/understand-notifications.md) - published

### Portfolio

- [Use the Account Command Center](portfolio/use-the-account-command-center.md) - published
- [Use the Action Center](portfolio/use-the-action-center.md) - published
- [Understand Portfolio Reports and Activity](portfolio/understand-portfolio-reports-and-activity.md) - preview
- [Use Workspace Settings](portfolio/use-workspace-settings.md) - coming-soon

### Event Planning

- [Use the Event Command Center](event-planning/use-the-event-command-center.md) - published
- [Customize the Event Command Center](event-planning/customize-the-event-command-center.md) - published
- [Use the Roadmap](event-planning/use-the-roadmap.md) - published
- [Use the Budget Dashboard](event-planning/use-the-budget-dashboard.md) - published
- [Manage the Full Budget Grid](event-planning/manage-the-full-budget-grid.md) - published
- [Import and Export Budget Data](event-planning/import-and-export-budget-data.md) - published
- [Submit and Review Budget Approvals](event-planning/submit-and-review-budget-approvals.md) - published
- [Use the Run of Show](event-planning/use-the-run-of-show.md) - published
- [Choose Board or List View](event-planning/choose-board-or-list-view.md) - published
- [Create and Edit Sessions](event-planning/create-and-edit-sessions.md) - published
- [Use the Session Workspace](event-planning/use-the-session-workspace.md) - published
- [Manage Room Sets and Seating](event-planning/manage-room-sets-and-seating.md) - coming-soon
- [Use the Docs Hub](event-planning/use-the-docs-hub.md) - published
- [Configure Event Settings](event-planning/configure-event-settings.md) - published
- [Use the F&B Catalog](event-planning/use-the-fnb-catalog.md) - preview
- [Assign F&B to Sessions](event-planning/assign-fnb-to-sessions.md) - published

### People and Program

- [Use the Directory](people-and-program/use-the-directory.md) - published
- [Import and Clean Directory Records](people-and-program/import-and-clean-directory-records.md) - published
- [Manage Attendees](people-and-program/manage-attendees.md) - published
- [Understand Attendee and Directory Records](people-and-program/understand-attendee-and-directory-records.md) - published
- [Manage Speakers](people-and-program/manage-speakers.md) - published
- [Track Speaker Readiness](people-and-program/track-speaker-readiness.md) - published
- [Assign Speakers to Sessions](people-and-program/assign-speakers-to-sessions.md) - published
- [Use Speaker Intake](people-and-program/use-speaker-intake.md) - published
- [Use the Speaker Portal](people-and-program/use-the-speaker-portal.md) - published
- [Request and Review Speaker Documents](people-and-program/request-and-review-speaker-documents.md) - published

### Communications

- [Use Marketing](communications/use-marketing.md) - published
- [Create Campaigns, Audiences, and Sends](communications/create-campaigns-audiences-and-sends.md) - published
- [Review Marketing Approvals and Compliance](communications/review-marketing-approvals-and-compliance.md) - published

### Collaboration

- [Use Tasks](collaboration/use-tasks.md) - coming-soon
- [Use Notifications](collaboration/use-notifications.md) - published
- [Understand Approvals in Orca](collaboration/understand-approvals-in-orca.md) - published
- [Use Planner Copilot](collaboration/use-planner-copilot.md) - preview

### Administration

- [Use Platform Administration](administration/use-platform-administration.md) - internal

### Workflows

- [Build a New Event from Existing Spreadsheets](workflows/build-a-new-event-from-existing-spreadsheets.md) - published
- [Build a New Event from a Rough Agenda](workflows/build-a-new-event-from-a-rough-agenda.md) - published
- [Move an Event from Setup into Active Planning](workflows/move-an-event-from-setup-into-active-planning.md) - published
- [Prepare for a Client Status Meeting](workflows/prepare-for-a-client-status-meeting.md) - published
- [Conduct a Weekly Event Health Review](workflows/conduct-a-weekly-event-health-review.md) - published
- [Build and Review a Run of Show](workflows/build-and-review-a-run-of-show.md) - published
- [Prepare Speakers for an Event](workflows/prepare-speakers-for-an-event.md) - published
- [Coordinate Session Logistics](workflows/coordinate-session-logistics.md) - published
- [Review Event Financial Health](workflows/review-event-financial-health.md) - published
- [Prepare for the Final 30 Days](workflows/prepare-for-the-final-30-days.md) - published
- [Prepare for Onsite Operations](workflows/prepare-for-onsite-operations.md) - published
- [Close Out an Event](workflows/close-out-an-event.md) - published

### Troubleshooting

- [Spreadsheet Import Problems](troubleshooting/spreadsheet-import-problems.md) - published
- [Missing or Duplicate People](troubleshooting/missing-or-duplicate-people.md) - published
- [Speaker Portal Link Problems](troubleshooting/speaker-portal-link-problems.md) - published
- [Read-Only Access and Permission Problems](troubleshooting/read-only-access-and-permission-problems.md) - published
- [Missing Sessions or Schedule Conflicts](troubleshooting/missing-sessions-or-schedule-conflicts.md) - published
- [Budget Editing and Approval Problems](troubleshooting/budget-editing-and-approval-problems.md) - published
- [Missing Notifications](troubleshooting/missing-notifications.md) - published
- [Feature Not Available or Marked Coming Soon](troubleshooting/feature-not-available-or-marked-coming-soon.md) - published

## Add an Article

1. Choose the category directory and a stable lowercase kebab-case filename.
2. Copy the complete frontmatter shape from a nearby article and create a unique `slug`.
3. Verify every claim against the current route, UI, permissions, feature flags, and source workflows.
4. Add planner-specific steps, helper text, tips, troubleshooting, and valid relative Related Articles links.
5. Set `lastReviewed` to the date the product behavior was checked.
6. Run `npm run help:manifest` and then `npm run help:validate` from the repository root.

## Update an Article

Update `lastReviewed` only after checking the current implementation and reviewing the whole article for stale claims. A wording-only correction does not establish that unrelated product behavior was reverified.

## Unshipped Feature Rule

Never infer availability from a route, model, service, or component alone. Confirm navigation, runtime gates, permissions, empty states, and user-visible controls. Label unavailable behavior with `preview`, `coming-soon`, or `internal`; remove unsupported steps rather than describing a planned workflow in future-perfect language.

## Documentation Review Checklist

- [ ] Frontmatter is complete and the slug is stable and unique.
- [ ] UI labels and navigation match the current application.
- [ ] Permissions, feature flags, hidden routes, and environment gates are stated accurately.
- [ ] Steps contain no invented actions, automation, exports, statuses, or integrations.
- [ ] Planner tips are specific to real event work.
- [ ] Relative links and related slugs resolve.
- [ ] Screenshot placeholders use the exact syntax and describe a useful state.
- [ ] `lastReviewed` reflects a genuine implementation review.
- [ ] `npm run help:manifest` and `npm run help:validate` pass.
