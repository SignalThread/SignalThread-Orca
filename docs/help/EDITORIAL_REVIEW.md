# Orca Help Center Editorial Review

Reviewed July 13, 2026 against the current application routes, visible product labels, source implementation, feature flags, and tested journeys. This is a contributor record, not a planner-facing article.

## Review Scope

- Reviewed 66 articles: 46 feature guides, 12 lifecycle workflows, and 8 troubleshooting guides.
- Checked account, event, external speaker, and platform-administration navigation separately.
- Replaced repeated feature inventories and generic planning advice with concrete actions, decision points, source-module guidance, and lifecycle-specific completion criteria.
- Rechecked related slugs, relative links, article status, route metadata, and screenshot placeholder syntax through the documentation validator.

## Major Accuracy Corrections

- Corrected Roadmap views to **Dashboard**, **Matrix**, **Workstream**, and **Board**. Removed the unsupported Gantt and List terminology.
- Documented Marketing under **Management** in event navigation. It is no longer described as a hidden or direct-only route.
- Corrected Docs Hub review behavior to the planner-facing **Submit for Review** and eligible **Pull back** actions. Production does not expose the development-only simulated Approve or Reject controls.
- Changed F&B Catalog from `published` to `preview`. Existing approved items can be assigned to sessions, but menu upload, parser progress, parsed-item approval, and amendment application are not durable production workflows on the catalog screen.
- Limited Event Settings to **Session Types**, **AV Requirements**, **Staffing**, **Status options**, and **Workspace actions**. It does not edit event details, timezone, organization settings, or integrations; Session Types are currently read-only defaults.
- Removed the planner-facing Directory merge procedure. The application has import, search, role, status, and record correction controls, but no merge control in the current planner UI.
- Distinguished the Account Command Center, Event Command Center, Action Center queues, and their source modules. Dashboard cards and queues summarize records; they do not replace those records.
- Clarified that the notifications menu shows up to 20 recent items, marks an opened item read, and returns the planner to its linked source. It is not a complete activity log.
- Corrected exact labels and paths for Event Builder, Budget, Run of Show, Docs Hub, Speaker Intake, Speaker Portal, Marketing, and Platform Administration.

## Unsupported Claims Removed

- Roadmap Gantt and List views.
- Production Docs Hub Approve, Reject, Reopen, and simulated reviewer decision controls.
- Durable F&B menu parsing, source-menu storage, parsed-row approval, and amendment processing from the preview route.
- Planner-facing Directory record merging.
- Event Settings controls for event name, dates, timezone, organization settings, or integrations.
- Claims that Marketing is absent from event navigation.
- Claims that the account **Settings** page, Event Activity, Tasks, Planner Copilot, or Room Set and Seating are generally available planner workflows.

## Terminology Standardized

- **Account Command Center** for the organization portfolio and **Event Command Center** for one event.
- **Roadmap** for event work and milestones; **Run of Show** for scheduled sessions.
- **Event Directory** for canonical people identities; **Attendees** and **Speakers** for role-specific workflows.
- **Documents** for the sidebar destination and **Docs Hub** for the page.
- **F&B Catalog** for reusable approved items and **F&B Planner** or **Session F&B Plan** for session assignments.
- **Event Settings**, **Workspace Settings**, and **Platform Administration** as separate scopes with separate access rules.
- Visible product capitalization for labels such as **Submit for approval**, **Budget Approvals**, **Upload Document**, and **Import people**.

## Articles Merged or Split

No second-pass merge or split was needed. Broad guides remain distinct from focused task articles where they answer different planner questions. Examples include Run of Show versus session editing, Budget Dashboard versus Full Budget Grid, Directory versus attendee and speaker workflows, and Marketing overview versus campaign and compliance procedures.

Cross-links were retained or corrected so each broad guide points to focused procedures, workflow guides point back to authoritative feature guides, and every article has at least one related article.

## Screenshots Consolidated

- Replaced one generic request per feature article with 50 purposeful captures documented in [SCREENSHOT_PLAN.md](SCREENSHOT_PLAN.md).
- Assigned each capture to one owner article and listed every approved reuse destination.
- Consolidated repeated account, event navigation, source-module, modal, drawer, filter, and external-speaker states.
- Kept token-bearing external pages separate and prohibited real portal tokens, intake tokens, personal email addresses, and confidential financial data.
- Marked each capture `critical`, `useful`, or `optional` and specified route, role, data state, viewport, UI state, visible annotation labels, and filename.
- Integrated the completed captures into the library and left remaining omissions explicitly documented for unstable, restricted, preview, or coming-soon flows.

## Remaining Product Ambiguities

- The planner-facing process that provisions initial approved F&B catalog items is not represented in the current catalog UI.
- Docs Hub records review state, recipients, and activity, but the production planner-facing reviewer decision path is not exposed in the inspected route.
- Directory has backend merge capability without a current planner-facing merge control or documented administrative process.
- The event details edit route is a placeholder, while Event Settings intentionally covers reusable Run of Show options instead.
- Portfolio Reports is labeled **Preview**, the account **Settings** page is a placeholder, and Event Activity is **Coming soon**.
- Tasks and Planner Copilot are disabled by feature flags. Room Set and Seating is production-gated and documented as coming soon.

## Product-Owner Decisions

1. Define who creates or approves the first durable F&B catalog items and where planners should perform that work.
2. Confirm the intended production reviewer decision surface for Docs Hub, including who can approve or reject and whether pullback should remain submitter-only.
3. Decide whether Directory record merge will receive a planner UI or remain an administrative operation, then document the supported escalation path.
4. Decide where event name, dates, and timezone should be edited after creation and whether the placeholder edit route will become that surface.
5. Confirm release language and access expectations before changing Portfolio Reports, the account **Settings** page, Event Activity, Tasks, Planner Copilot, or Room Set and Seating from their current statuses.
