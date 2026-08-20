# Session Workspace Nav Alignment Brief

## Purpose

We need to remove the current custom dark left nav in the Run of Show session workspace / Ops view and align the session workspace with the event-level navigation model and styling.

The current session workspace looks and behaves like a separate product surface. The goal is to make it feel like part of the same event workspace as Roadmap, Budget, Run of Show, Event Directory, Documents, Activity, and Settings.

This brief captures the audit findings, the intended product direction, the guardrails, and the four-prompt implementation sequence we will use.

---

## Decision

We are not keeping the current dark `SessionCommandRail` as-is.

We will remove the separate dark ops/session rail as a distinct visual system and replace it with the event-level nav vocabulary.

Important nuance:

- We are removing the custom dark left nav experience.
- We are not deleting session workspace modules.
- We are not deleting session routes.
- We are not breaking the session tab/hash/deep-link model unless a later prompt explicitly changes it.
- The session workspace can still have module navigation, but it must use the same visual language and primitive pattern as the event-level left nav.

The safest path from the audit is staged:

1. Extract the event-level nav primitive/tokens first.
2. Replace/restyle the session nav using that shared primitive.
3. Restyle the session header/content to match Command Center surfaces.
4. Add regression coverage for deep links, gates, read-only behavior, and navigation behavior.

---

## Audit Data We Have

### Event-level nav current state

The event-level workspace uses a persistent light sidebar rendered by:

- `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx`
- `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.module.css`

Key behavior:

- Light sidebar background, currently around `bg-[#f8f8fb]`.
- Collapsible sidebar, roughly 80px collapsed / 280px expanded.
- Event nav items are route-based links.
- Active state is derived from `usePathname()` through the event shell's active-path logic.
- Active item visual language uses the event shell dark navy active pill, around `bg-[#0B1638]` with white text.
- Disabled items show as muted / coming-soon style where needed.
- The global event workspace shell is the visual system we want the session workspace to match.

Event-level nav includes items like:

- Command Center
- Roadmap
- Budget
- Run of Show
- Event Directory
- Marketing
- Documents
- Activity
- Settings

### Session workspace current state

The session workspace route is under:

- `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/page.tsx`
- `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx`

The custom dark session rail is implemented inside:

- `SessionCommandRail` in `session-detail-workspace.tsx`

Current session rail items include:

- Overview
- Speakers
- AV
- F&B
- Staffing
- Conflicts
- Notes / Activity
- Room Set
- Seating

Key current behavior:

- The session nav is not route-based like the event nav.
- It uses local session workspace state, `activeTab`, plus `?tab=` and `#hash` style deep links.
- Room Set and Seating have historically been route link-outs.
- The dark rail has its own header, back button, readiness summary, status coloring, and nav style.
- It uses a dark navy/black visual system, which clashes with the light event-level nav.

### Critical route/layout finding

The event workspace shell intentionally bypasses the event shell chrome for session workspace routes.

The audit found logic equivalent to:

```ts
if (isSessionCommandCenterRoute) {
  return <div className="h-dvh overflow-hidden bg-[#e8edf4]">{children}</div>;
}
```

That means the session workspace does not inherit the normal event-level left nav. It renders its own dark rail instead.

This is the reason the session workspace still looks separate even after event-level shell polish.

---

## Main Product Mismatch

The mismatch is not just color. It is structural:

| Area | Event Workspace | Session Workspace Today |
|---|---|---|
| Nav style | Light event sidebar | Dark local ops rail |
| State model | Route/pathname active state | Local tab/hash active state |
| Visual tokens | Event shell tokens | Custom dark session tokens |
| Active item | Event navy active pill | White/dark translucent active item |
| Disabled state | Event muted/coming-soon pattern | Separate custom dark disabled state |
| Header | Event module header surfaces | Custom session header |
| Back behavior | Event shell navigation | Custom Back to Run of Show button |

The implementation should remove the feeling that the session workspace is a different app.

---

## Target Product Direction

### What should change

- Remove the custom dark left nav in the session workspace / Ops view.
- Reuse the event-level nav primitive/tokens for any remaining session module navigation.
- Make the session workspace header/content match the event-level Command Center styling.
- Keep session module navigation behavior intact unless intentionally changed.
- Preserve deep links into session modules.
- Preserve Back to Run of Show behavior.
- Preserve Save behavior.

### What should not change

- Do not delete session workspace modules.
- Do not delete or break session workspace routes.
- Do not change Prisma schema.
- Do not create migrations.
- Do not change generated client files.
- Do not delete Room Set, Seating, attendee/session registration, speaker, AV, F&B, or staffing routes/services/APIs.
- Do not break the Run of Show quick drawer.
- Do not break Matrix 2 snapshot shape.
- Do not break EVENT_VIEWER server-side write denial.

---

## Product Gates That Must Be Preserved

These are important because prior work intended them, but UI screenshots showed they were not fully applied everywhere.

### Room Set and Seating

In production:

- Room Set and Seating should not appear as two separate active workflow entry points in the session workspace.
- They should be combined where appropriate as:
  - `Room Set & Seating`
- Copy:
  - `Room Set and Seating are coming soon.`
- The combined surface should be muted, disabled, and not clickable.

In dev/test/non-production:

- Existing Room Set and Seating behavior can remain active unless a test is explicitly simulating production gating.

### Session registration / Attendee Roster

In production:

- Per-session registration must be disabled/coming soon.
- This includes:
  - Session workspace `Attendee Roster`
  - Quick drawer `Attendee registration`
  - Attendee detail `Sessions / Agenda` if it can enroll attendees into sessions
- Search/select/Add attendee controls should not be active.
- Copy should include:
  - `Coming soon`
  - `Session registration is coming soon.`

In dev/test/non-production:

- Existing per-session registration controls should remain active unless explicitly testing production-gated mode.

---

## Session Module Mapping

| Current Module | Recommended Label | Current Behavior | Target Behavior | Gate |
|---|---|---|---|---|
| Overview | Overview | Tab / hash state | Keep behavior, event-nav visual style | None |
| Speakers | Speakers | Tab / hash state | Keep behavior, event-nav visual style | None |
| AV | AV | Tab / hash state | Keep behavior, event-nav visual style | None |
| F&B | F&B | Tab / hash state | Keep behavior, event-nav visual style | None |
| Staffing | Staffing | Tab / hash state | Keep behavior, event-nav visual style | None |
| Conflicts | Conflicts | Tab / hash state | Keep behavior, event-nav visual style | None |
| Notes / Activity | Notes / Activity | Tab / hash state | Keep behavior, event-nav visual style | None |
| Room Set | Room Set & Seating | Route link-out today | Combined disabled production surface; active only in non-prod if existing behavior remains | Production coming soon |
| Seating | Room Set & Seating | Route link-out today | Combined disabled production surface; active only in non-prod if existing behavior remains | Production coming soon |
| Attendee Roster | Attendee Roster | Embedded session registration panel | Disabled coming-soon in production; active in non-prod | Production coming soon |

---

## Recommended Architecture Approach

Use the staged hybrid approach from the audit.

We should not immediately re-parent the session workspace into the full event shell because that is riskier:

- The session workspace currently uses local tab/hash state, not route-based active state.
- Deep links such as `?tab=` and `#speakers` need to remain stable.
- Room Set/Seating link-outs need to preserve existing behavior and production gating.
- The shell bypass exists intentionally and may be covered by tests.

The safer approach:

1. Extract event nav primitives from the event shell.
2. Use those primitives to replace/restyle the session nav.
3. Keep behavior stable while aligning appearance.
4. Only later decide whether session modules should become true event-level routes.

---

## Implementation Prompt Sequence

We will use four prompts.

### Prompt 1 — Extract shared event-nav primitive

Goal:

Extract the event-level nav item renderer/tokens from `event-workspace-shell.tsx` into a shared primitive.

Scope:

- Create something like:
  - `web/app/(shell)/events/[eventId]/_components/shell-nav-primitives.tsx`
- Export:
  - `isPathActive`
  - `SidebarNavItem`
- Refactor event shell to consume the primitive.
- No session workspace changes yet.

Must preserve:

- Event nav appearance.
- Event nav active state.
- Collapsed/expanded behavior.
- Disabled/coming-soon behavior.
- Event Directory grouped behavior.

Why first:

This creates the shared visual vocabulary before touching the more fragile session workspace.

### Prompt 2 — Remove/restyle session dark left nav using the shared nav primitive

Goal:

Remove the separate dark `SessionCommandRail` visual system and replace it with event-level nav styling/primitive usage.

Scope:

- Update `session-detail-workspace.tsx`.
- Replace dark rail styles with event-nav style.
- Use the shared `SidebarNavItem` primitive or the same extracted tokens.
- Preserve local `activeTab`, `?tab=`, and `#hash` behavior.
- Preserve Back to Run of Show.
- Preserve module selection behavior.
- Preserve production gating.

Important product requirements:

- Room Set and Seating should combine into `Room Set & Seating` in production-gated UI.
- Session registration remains disabled/coming-soon in production.
- Do not re-enable active Room Set/Seating/session registration in production.

### Prompt 3 — Align session header and content surfaces to Command Center styling

Goal:

Make the session workspace header and primary surfaces match the event-level Command Center visual language.

Scope:

- Restyle the session header.
- Reuse event module header/surface patterns where practical.
- Keep session title, type, time, room, breadcrumb, readiness, Speaker Directory, and Save behavior.
- Reduce duplicated dark rail/header language.
- Make the session workspace read as part of the same event workspace.

Must preserve:

- Save behavior.
- Session switcher behavior.
- Speaker Directory route.
- Readiness metrics.
- Back to Run of Show / breadcrumb escape path.

### Prompt 4 — Regression pass for gates, deep links, access, and nav behavior

Goal:

Add/update tests proving the nav alignment did not break behavior.

Coverage should include:

- Event nav primitive still used by event shell.
- Session nav no longer uses the old dark rail tokens.
- Session nav active state still works.
- `?tab=` and `#hash` deep links still land on the right module.
- Back to Run of Show still works.
- Save behavior unchanged.
- Room Set & Seating combined production gate works.
- Session registration production gate works.
- Non-production behavior remains active where intended.
- EVENT_VIEWER server-side write denial unchanged.
- Quick drawer behavior unaffected.

---

## Implementation Guardrails

- Schema mode: `LOCKED`
- No Prisma schema changes.
- No migrations.
- No generated client changes.
- No backend route/service/API deletion.
- Do not remove session workspace routes.
- Do not break Matrix 2 quick drawer.
- Do not break Run of Show board/list.
- Do not break F&B catalog/session assignment behavior.
- Do not break speaker assignment flows.
- Do not break Event Directory or event-level Attendees.
- Keep file count under the loop default unless a prompt explicitly stops and reports why.
- Use the generic loop controller if running as an implementation loop.

---

## Tests To Expect / Update

Audit found likely test areas:

- `web/lib/session-command-center-phase1-regression.test.ts`
- `web/lib/run-of-show-room-set-linkage-regression.test.ts`
- `web/lib/production-coming-soon-gates.test.ts`
- `web/lib/matrix2-drawer-fetch-gating-regression.test.ts`
- `web/lib/event-access-regression.test.ts`
- Relevant Playwright journeys:
  - quick drawer
  - resources
  - room-set/seating
  - session workspace navigation if present

Expect some source-regression tests to need updates because they may assert old dark rail tokens or old Room Set/Seating link-out copy.

---

## Manual QA Checklist

After implementation:

- [ ] Session workspace no longer shows the custom dark left nav.
- [ ] Session workspace navigation matches the event-level nav style.
- [ ] Overview, Speakers, AV, F&B, Staffing, Conflicts, Notes/Activity navigation still works.
- [ ] Deep links to session tabs still work.
- [ ] Back to Run of Show still works.
- [ ] Save still works.
- [ ] Speaker Directory still opens.
- [ ] Room Set & Seating are combined and disabled/Coming soon in production.
- [ ] Session registration / Attendee Roster is disabled/Coming soon in production.
- [ ] Dev/test/non-prod behavior remains active where intended.
- [ ] EVENT_VIEWER cannot mutate session data.
- [ ] Quick drawer still works.
- [ ] No backend routes/services/APIs were deleted.

---

## Exact Next Step

Start with Prompt 1:

`Extract shared event-shell nav primitive + tokens.`

Do not touch the session workspace until the shared primitive is extracted and the event shell has been refactored to consume it with no behavior/visual change.
