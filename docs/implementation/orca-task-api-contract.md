# Orca internal task API contract

Contract version: `2026-08-06`

The existing event task API at `/api/events/:eventId/tasks` is the internal seam for possible future integrations. It remains separate from Roadmap `TimelineItem` records: Roadmap children are checklist/subtask rows in the Roadmap hierarchy, while generic Tasks are manual internal work linked to event objects.

The contract supports event-scoped list, create, update, complete, reopen, block, assign, comment, link, and watch operations. Every operation resolves the authenticated user, authorizes access against the owning event and organization, and validates linked objects and assignees within that event scope. Responses use the `TaskRecord` transport shape exported by `web/components/tasks/task-api.ts`.

Only `MANUAL` source and `INTERNAL` visibility are supported. This contract does not include provider identifiers, webhooks, OAuth, polling, synchronization jobs, conflict resolution, or any external connector. Those remain future work and must not be inferred from this seam.
