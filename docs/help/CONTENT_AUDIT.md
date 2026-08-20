# Orca Help Content Audit

Reviewed: 2026-07-13

## Scope and Evidence

This pass reviewed the existing `docs/help/orca/` drafts against application routes, event and account navigation, user-facing labels, feature configuration, API-supported actions, service boundaries, and the planner browser journeys. Code is the source of truth; legacy drafts were treated as an inventory only.

## Current-State Findings

- Fully available core workflows: Account Command Center, Action Center views other than Tasks, Event Command Center, Roadmap, Budget dashboard and grid, budget import/export and approvals, Run of Show Board/List and session workspaces, Directory, Attendees, Speakers, speaker intake and portal, Docs review submission and pullback, session F&B assignments using existing approved items, Marketing email workflows, and Notifications.
- Available in event navigation: Marketing appears under **Management**.
- Preview or incomplete: F&B Catalog is a direct-access prototype; Portfolio Reports is a placeholder; Planner Copilot is disabled.
- Coming soon or unavailable: Event Activity, the account **Settings** page controls, generic Tasks, and Room Set & Seating.
- Internal: Platform Users is restricted to SUPER_ADMIN access.
- Compatibility-only: older Matrix routes remain while the active Run of Show surface uses the newer workspace.

## Corrections Made

- Separated the account-level Command Center from the Event Command Center.
- Removed any implication that Portfolio Reports, Event Activity, the account **Settings** page, Tasks, Planner Copilot, session registration, or production Room Set & Seating are complete planner workflows.
- Corrected Marketing navigation and limited the direct-access F&B Catalog article to its preview behavior.
- Kept approvals attached to their source records: Budget, Docs, Marketing, and speaker submissions.
- Distinguished canonical Directory identities from Attendee and Speaker workflow records.
- Limited Notifications to the header menu, recent list, unread state, and linked navigation currently implemented.

## Legacy-to-New Mapping

- `docs/help/orca/access-and-organization-context.md` -> `docs/help/getting-started/understand-organizations-and-access.md`
- `docs/help/orca/action-center.md` -> `docs/help/portfolio/use-the-action-center.md`
- `docs/help/orca/attendees.md` -> `docs/help/people-and-program/manage-attendees.md`
- `docs/help/orca/budget.md` -> `docs/help/event-planning/use-the-budget-dashboard.md plus three detailed Budget articles`
- `docs/help/orca/command-center.md` -> `docs/help/portfolio/use-the-account-command-center.md`
- `docs/help/orca/directory.md` -> `docs/help/people-and-program/use-the-directory.md`
- `docs/help/orca/docs-hub.md` -> `docs/help/event-planning/use-the-docs-hub.md`
- `docs/help/orca/event-builder.md` -> `docs/help/getting-started/create-your-first-event.md plus starting-point and import articles`
- `docs/help/orca/event-command-center.md` -> `docs/help/event-planning/use-the-event-command-center.md`
- `docs/help/orca/event-settings.md` -> `docs/help/event-planning/configure-event-settings.md`
- `docs/help/orca/event-workspace-navigation.md` -> `docs/help/getting-started/understand-event-workspace-navigation.md`
- `docs/help/orca/fnb-catalog.md` -> `docs/help/event-planning/use-the-fnb-catalog.md`
- `docs/help/orca/marketing.md` -> `docs/help/communications/use-marketing.md plus two detailed Marketing articles`
- `docs/help/orca/notifications.md` -> `docs/help/getting-started/understand-notifications.md and collaboration/use-notifications.md`
- `docs/help/orca/planner-copilot.md` -> `docs/help/collaboration/use-planner-copilot.md`
- `docs/help/orca/platform-admin.md` -> `docs/help/administration/use-platform-administration.md`
- `docs/help/orca/reports-and-activity.md` -> `docs/help/portfolio/understand-portfolio-reports-and-activity.md`
- `docs/help/orca/roadmap.md` -> `docs/help/event-planning/use-the-roadmap.md`
- `docs/help/orca/room-set-and-seating.md` -> `docs/help/event-planning/manage-room-sets-and-seating.md`
- `docs/help/orca/run-of-show.md` -> `docs/help/event-planning/use-the-run-of-show.md plus session articles`
- `docs/help/orca/session-workspace.md` -> `docs/help/event-planning/use-the-session-workspace.md`
- `docs/help/orca/speaker-portal-and-intake.md` -> `docs/help/people-and-program/use-speaker-intake.md and use-the-speaker-portal.md`
- `docs/help/orca/speakers.md` -> `docs/help/people-and-program/manage-speakers.md plus readiness and document articles`
- `docs/help/orca/tasks.md` -> `docs/help/collaboration/use-tasks.md`
- `docs/help/orca/workspace-settings.md` -> `docs/help/portfolio/use-workspace-settings.md`

## Deprecated Content

The legacy `docs/help/orca/` directory is deprecated after the mapping above. No application imports or Help Center routes reference those files in the current repository. The normalized category paths and stable slugs in `help-manifest.json` are the maintained content surface.

## Claims Requiring Product-Owner Review

- Decide when Portfolio Reports should move from `preview` to a documented reporting workflow.
- Decide whether the account **Settings** page should remain visible while it contains placeholder copy.
- Confirm the intended production release policy for Room Set & Seating.
- Define the supported process for provisioning initial approved F&B Catalog items.
- Define the supported Planner Copilot prompt and action set before enabling or publishing detailed usage guidance.
- Confirm whether generic Tasks will ship separately from Roadmap or remain disabled.

## Screenshot Audit

- Screenshot metadata now reflects the actual documentation state: `29` articles are `captured`, `1` is `partial`, `8` still intentionally show `needed`, and `28` are `none`.
- `SCREENSHOT_PLAN.md` remains the consolidated capture matrix for 50 reusable requests, with integrated captures and documented omissions tracked in its `Capture Status` section.
- Screenshot assets live under `web/public/help/screenshots/` and are referenced only where they materially improve orientation.
