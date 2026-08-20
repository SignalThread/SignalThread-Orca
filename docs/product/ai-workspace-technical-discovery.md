# Orca AI Workspace: Technical Discovery

Date: 2026-07-27  
Scope: read-only repository discovery. No application behavior, database schema, routes, UI, or migrations were changed.

## Executive finding

Orca already has most deterministic inputs for a useful event-level “What needs attention?” workflow: a Command Center aggregation service, task service, speaker conflict/readiness services, budget and document approvals, and a Copilot proposal/approval pipeline. The missing foundation is an event-scoped analysis domain: versioned findings, evidence snapshots, analysis runs, proposed actions, and safe idempotent execution.

The largest implementation risk is schema authority: `prisma/schema.prisma` and `web/prisma/schema.prisma` differ. `web/prisma.config.ts` points at the web-local schema and migrations, while root `prisma/migrations/` has the fuller visible history. Resolve this before designing a migration.

## Current architecture and reusable components

### Event-level navigation

The current event App Router subtree is rooted at `web/app/(shell)/events/[eventId]`. Its `layout.tsx` loads the event header and wraps pages in `EventWorkspaceShell`.

The actual current sidebar is `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx`:

| Area | Routes |
| --- | --- |
| Default | Command Center: `/events/[eventId]` |
| Planning | Roadmap `/timeline`, Budget `/budget`, Run of Show `/matrix` |
| Event Directory | `/directory`, child Speakers `/speakers`, Attendees `/attendees`; Staffing/Exhibitors disabled |
| Operations | Marketing `/marketing`, optional Voice `/voice`, Documents `/docs`, Activity `/activity`, Settings `/settings` |
| Direct/secondary | `/fnb-catalog`, `/seating`, `/reports`, `/matrix-2`, `/edit` |

`web/components/event/event-nav.tsx` is an older horizontal navigation component, not the active workspace shell. Do not use it for new primary navigation.

### Existing health and readiness calculation

`web/src/server/services/event-command-center.ts` is the closest reusable event-level health layer. It authorizes access, runs bounded event-scoped queries in parallel, and powers both the event page and `GET /api/events/[eventId]/command-center`.

It already calculates:

- overdue, upcoming, at-risk, and critical Roadmap work;
- upcoming deadlines and their status;
- documents in review and submitted budget approvals;
- aggregate/category forecast vs. actual budget variance;
- sessions missing valid times, rooms, speakers, AV coverage, F&B coverage, or staff coverage;
- F&B demand based on real non-`NONE` meal periods;
- speaker counts, operational readiness, planner-focus candidates, and deep links.

`web/src/server/services/command-center-dashboard.ts` contains portfolio equivalents and useful bounded aggregate patterns for pending budget approvals and line items where `actualCents > forecastCents`; it should inform implementation but not become the event workspace dependency.

### Existing task workflow and permission checks

The task authority is `web/src/server/services/tasks.ts`, exposed by `web/app/api/events/[eventId]/tasks/*`. The shared creation UI is `web/components/tasks/task-create-modal.tsx`.

`createManualTask` server-checks event write access, gets authoritative event/org/client scope, validates assignees/watchers as event users and linked targets as same-event records, then writes the task, assignments, watchers, links, task activity, and notifications in one transaction. Tasks support due dates, priority, status, owners/contributors, comments, watchers, and object links.

The canonical authorization helper is `web/lib/event-access.ts`. It enforces active-org scope, event membership for non-org-wide roles, and read-only behavior for `EVENT_VIEWER`. AI writes must call canonical domain services (for example `createManualTask`), never write their tables directly.

Constraint: `TaskSource` currently has only `MANUAL`; future AI-created tasks need an intentional new source or provenance field, not silent reuse of manual provenance.

### Existing AI/model integrations and safe action pattern

Copilot exists now:

- APIs: `web/app/api/copilot/chat/route.ts`, `web/app/api/copilot/execute/route.ts`
- orchestrator/audit/permission: `web/lib/copilot/orchestrator.ts`, `audit.ts`, `permissions.ts`
- provider/parser/actions: `web/lib/copilot/provider.ts`, `parse-do.ts`, `actions.ts`, `registry.ts`
- context/capabilities: `web/src/copilot/context/`, `web/src/copilot/capabilities/capability-registry.ts`
- persistence: `CopilotAuditLog`

Copilot is proposal-first: chat returns answer, clarification, or structured proposal; a separate approval request triggers execution; execution rechecks permission. Existing actions delegate to domain services.

This is reusable conceptually, but not a durable analysis store: `CopilotAuditLog` has raw prompt/proposed JSON/status but no structured findings, source citations, analysis snapshot, rule/model version, or explicit idempotency key. Repeated execution is not visibly short-circuited after `EXECUTED`, so it must not be considered sufficient idempotency for AI Workspace writes.

### Activity/audit history reliability

`EventActivity` plus `web/src/server/services/event-activity.ts` is the canonical event activity feed. It has server-built primitive field diffs, historical actor/entity labels, transaction-client support, and event-scoped source-key deduplication. `web/src/server/services/timeline-activity-audit.ts` and `budget-activity-audit.ts` build changed-only before/after diffs. `docs/EVENT_ACTIVITY_AUDIT_LOG.md` documents its guarantees and limitations.

It is reliable for current instrumented writers, but **not a complete reliable before-and-after historical record**:

- legacy taxonomy/action fields are nullable and backfill is optional;
- the documented backfill never invents actors or diffs;
- TaskActivity is message/type history, not before/after field history;
- Room Set layout is browser local storage and cannot be server-audited;
- some multi-service writes are logged after mutation instead of atomically;
- not every historical writer/module is proven migrated.

Use activity as evidence, never as a complete temporal source of truth.

## Existing data available immediately

| Area | Models / data |
| --- | --- |
| Event and access | `Event` (dates, timezone, venue, status), `EventMember`, `User` |
| Tasks | `Task`, `TaskAssignment`, `TaskLink`, `TaskComment`, `TaskActivity`, `TaskWatcher` |
| Deadlines/Roadmap | `Deadline`, `TimelineItem`, `TimelineDependency` |
| Sessions | `MatrixRow` (current session model), `Room`, `SessionSpeakerAssignment`, `SessionStaffAssignment`, `SessionAVRequirement`, `SessionFoodService`, `SessionFnbCatalogAssignment`, requirement-template tables |
| Speakers | `Speaker`, files, document requests, profile submissions, intake tokens, speaker-session assignment |
| Budget/approvals | `BudgetLineItem` (forecast/actual/approval), targets/groups/versions/submissions/approvals/activity; `Document` and approval records; marketing approval state represented by linked tasks |
| Audit/AI | `EventActivity`, `CopilotAuditLog` |

No generic `Conflict`, `Approval`, `Session`, `AIRun`, `Finding`, `SourceReference`, or `ActionProposal` record exists. A session is a `MatrixRow`; speaker conflicts are calculated rather than persisted.

## “What needs attention?” mapping

Deterministic findings must be calculated before model reasoning. The model receives the resulting findings and bounded evidence, not broad database access.

| Check | Deterministic calculation | Availability / constraint | AI role |
| --- | --- | --- | --- |
| Open conflicts | Reuse `getSpeakerConflicts`: same speaker in overlapping MatrixRow date/time slots | Available only for speaker scheduling; no generic persisted conflict/resolution state; null times cannot be evaluated | Explain impact and priority |
| Overdue tasks | Active Task status (`OPEN`, `IN_PROGRESS`, `BLOCKED`) and `dueAt <` event-local now | Data exists; decide severity policy for BLOCKED | Group and suggest next step |
| Missing task owner | Active task with no `TaskAssignment.role = OWNER` | Available | Suggest candidate only |
| Missing session owner | No session `ownerUserId` exists | Unsupported; do not infer from speaker/staff | State insufficiency |
| Critical upcoming deadlines | Non-complete/non-canceled Deadline within configured horizon; include critical/critical-path incomplete TimelineItem | Available; threshold must be configured/versioned | Rank/contextualize |
| Pending approvals | Document `IN_REVIEW`; BudgetSubmission `SUBMITTED`; optional pending line approvals; marketing task convention | Docs/budget strong; no unified approval model | Explain age/escalation |
| Incomplete session details | MatrixRow missing time/valid room/speaker/AV/F&B/staff per Command Center selectors | Available but universal requirements/waivers are not defined | Prioritize and flag ambiguity |
| Missing room-set | Missing roomId/valid room relation | Available for room assignment; not browser-local room-set layout | Explain affected sessions |
| Missing AV | No structured AV requirement and no inline AV notes/needs | Presence only; absence may mean not required | Ask/flag uncertainty |
| Missing F&B | Non-NONE meal period with neither catalog assignment nor food-service record | Available; existing demand rule | Explain timing |
| Missing speaker information | `getSpeakerReadinessOverview` flags profile/deck/document gaps | Available | Prioritize speakers tied to imminent sessions |
| Material budget variance | Aggregate or line actual > forecast with absolute and percent thresholds | Raw data exists; materiality policy absent; handle zero forecast | Explain trends |
| Unapproved budget changes | Submitted budget approvals / pending line approvals; compare to approved baseline later | Pending state exists; approved-change baseline policy absent | Recommend review, not accuse |

Each rule must return `finding`, `not_applicable`, or `insufficient_data`, rather than treating optional/unavailable data as a failure.

## Deterministic checks vs AI reasoning

### Deterministic, authoritative layer

Create server-only `getEventAttentionFindings(eventId, user, options)`. It must use `assertEventAccessForUser`, event-scoped queries, event timezone, versioned rules, and minimal source snapshots. It is authoritative for facts, counts, severity floor, and deep links.

### AI, non-authoritative interpretation

The model may consolidate findings, explain relationships, rank within deterministic constraints, write a concise summary, and draft action proposals. Every AI narrative claim should point to finding/source IDs. It must not invent owners, counts, approval states, or causal claims.

V1 should have no data-changing AI actions. Later execution must be separately approved, reauthorized, preconditioned, idempotent, routed through existing domain services, and written to EventActivity with a source key.

## Recommended V1 architecture

1. Build a read-only deterministic event-attention service, extracting small selectors from Command Center/services where helpful.
2. Expose a read-only authorized event API returning stable typed findings and citations.
3. Add a read-only event workspace UI that renders deterministic facts first.
4. Add persisted analysis/model explanation only after the data model and schema authority are resolved.
5. Add approved actions only after proposal idempotency and canonical execution paths are in place.

For the first model-enabled version, adapt Copilot behind a distinct `event-workspace` surface and validate structured output against the deterministic findings. Degrade to deterministic results on model failure.

## Proposed route and navigation placement

Proposed route: `/events/[eventId]/ai-workspace`.

Place **AI Workspace** first in the **Operations** sidebar section of `event-workspace-shell.tsx`, immediately before Marketing. It is cross-functional operational work, not a replacement for Command Center or Planning. Keep Command Center as the default landing route.

When the route is added, update `buildEventSwitchHref`’s safe-module set so event switching preserves it. Do not change legacy `EventNav` unless that component is explicitly revived.

## Proposed database additions

After schema authority is resolved, add event-scoped UUID/timestamped records:

- `AIRun`: event/org/requester, workflow key, status, rule/prompt/model version, snapshot metadata/hash, lifecycle/error, request idempotency key.
- `AIFinding`: run, rule key/version, severity/state, target, deterministic payload, summary, lifecycle/resolution.
- `AISourceReference`: finding/run, source identity, field values seen, observed timestamp, href; snapshot evidence prevents drift.
- `AIActionProposal`: run/findings, action/payload/preconditions, approval/execution status, actor/times, execution idempotency key, result/error, optional Copilot audit link.

Do not overload `CopilotAuditLog` as the run/finding store.

## Proposed TypeScript contracts

```ts
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingState = "open" | "not_applicable" | "insufficient_data" | "resolved" | "dismissed";

export type SourceReference = {
  id: string;
  sourceType: string;
  sourceId: string;
  label: string;
  href: string;
  observedAt: string;
  fields: Array<{ path: string; value: string | number | boolean | null }>;
};

export type Finding = {
  id: string;
  runId: string;
  ruleKey: string;
  ruleVersion: string;
  state: FindingState;
  severity: FindingSeverity;
  title: string;
  deterministicSummary: string;
  aiSummary?: string;
  target?: { type: string; id: string; href: string };
  sourceReferences: SourceReference[];
  deterministicPayload: Record<string, unknown>;
  createdAt: string;
};

export type ActionProposal = {
  id: string;
  runId: string;
  findingIds: string[];
  actionType: "task.create" | "task.assign" | "navigate" | "request_information";
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  preconditions: Array<{ type: string; expected: unknown }>;
  status: "proposed" | "approved" | "rejected" | "executed" | "failed" | "superseded";
  idempotencyKey: string;
  approvedByUserId?: string;
  approvedAt?: string;
  executedAt?: string;
  result?: { entityType?: string; entityId?: string; summary: string };
};

export type AIRun = {
  id: string;
  eventId: string;
  orgId: string;
  requestedByUserId: string;
  workflow: "WHAT_NEEDS_ATTENTION";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  ruleSetVersion: string;
  promptTemplateVersion?: string;
  model?: { provider: string; model: string; responseId?: string };
  snapshotHash: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  findings: Finding[];
  actionProposals: ActionProposal[];
};
```

## Missing data/infrastructure and risks

1. **Schema divergence:** two unequal Prisma schemas/migration locations are the largest blocker. Establish one source of truth first.
2. **Ownership/conflict semantics:** no canonical session owner, generic conflict lifecycle, or conflict resolution record.
3. **Completeness semantics:** AV/speaker/staff needs are not universally required; explicit requirements/waivers are needed before hard alerts.
4. **Budget policy:** materiality threshold and approved baseline for “unapproved change” do not exist.
5. **Approval aggregation:** workflows differ across documents, budget, and task-backed marketing approvals.
6. **AI infrastructure:** no run/finding/source/proposal storage, analysis queue/retry/cancel behavior, model observability/rate limits, or retention policy.
7. **Evidence/privacy:** snapshot citations and context filtering are required; do not send notes, document/email bodies, tokens, keys, or provider payloads.
8. **Authorization:** new server reads/writes must use canonical event access; UI visibility is never sufficient.

## Phased plan

### Phase 0 — foundation

Resolve schema/migration authority; define event-local clock and versioned thresholds; add deterministic fixtures.

### Phase 1 — deterministic API

Add read-only attention service/API with speaker overlaps, overdue/unowned tasks, urgent deadlines/Roadmap work, pending document/budget review, and existing session readiness gaps. Add unit and route authorization tests.

### Phase 2 — read-only workspace

Add route, sidebar item, finding cards, evidence links, filters, loading/empty/error states. No writes.

### Phase 3 — persisted run and AI explanation

Add run/finding/source persistence. Adapt Copilot/model provider to validated evidence-bound summaries; persist metadata and fall back to deterministic data.

### Phase 4 — semantics/policy

Add explicit session owners/requirements/waivers, materiality configuration, and approved-budget baseline.

### Phase 5 — approved actions

Add ActionProposal persistence and begin only with `task.create`, executed through canonical task service with preconditions, reauthorization, idempotency, and EventActivity auditing.

## Relevant paths

- Navigation: `web/app/(shell)/events/[eventId]/layout.tsx`, `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx`
- Event health: `web/src/server/services/event-command-center.ts`, `web/src/server/services/command-center-dashboard.ts`
- Tasks: `web/src/server/services/tasks.ts`, `web/components/tasks/task-create-modal.tsx`
- Auth: `web/lib/event-access.ts`
- Conflicts/readiness: `web/src/server/services/speaker-conflicts.ts`, `web/src/server/services/speaker-readiness.ts`
- AI: `web/lib/copilot/`, `web/src/copilot/`, `web/app/api/copilot/`
- Audit: `web/src/server/services/event-activity.ts`, `docs/EVENT_ACTIVITY_AUDIT_LOG.md`
- Schemas: `web/prisma/schema.prisma`, `web/prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/`

## Required closing summary

### What already exists

Event-scoped navigation and RBAC; transactional task creation; Command Center event-health/readiness logic; speaker conflicts/readiness; budget/document approvals; EventActivity with partial before/after diffs; and Copilot proposal/approval/execution all already exist.

### Largest blockers

Schema/migration divergence; no session owner/generic conflict/generic approval semantics; no universal session requirements/waivers; missing budget materiality/approved-baseline policy; and incomplete historic before/after activity coverage.

### Recommended first implementation increment

Build a read-only, authorized deterministic `What needs attention?` service/API: speaker overlaps, overdue/unowned tasks, urgent/overdue deadlines and Roadmap work, pending document/budget submissions, and existing session readiness gaps. Do not call a model, persist AI data, create tasks, or change schema in that increment.

### Exact files likely to be modified in that increment

- `web/src/server/services/event-attention.ts` (new)
- `web/app/api/events/[eventId]/ai-workspace/attention/route.ts` (new)
- `web/src/server/services/event-attention.test.ts` (new)
- `web/app/api/events/[eventId]/ai-workspace/attention/route.test.ts` (new, or established API-test location)
- `web/src/server/services/event-command-center.ts` only if extracting a small shared readiness selector
- `web/src/server/services/tasks.ts` only if exporting a narrow read-only selector

No schema, migration, navigation, or UI file is required for that API-only increment.

