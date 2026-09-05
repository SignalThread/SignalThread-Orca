# Event Mode Fabel Loop Controller

## Purpose

This file tells Fabel how to execute the EVENTS product buildout prompt queue one prompt at a time.

Use this with:

- `EVENT_MODE_BUILDOUT_SUMMARY_FOR_FABEL.md`
- `EVENT_MODE_FABEL_PROMPTS.md`

The goal is controlled execution, not a free-run rewrite.

## Core Rule

Leave retail the fuck alone.

The only valid EVENTS boundary is:

```ts
Account.accountType === "EVENTS"
```

Everything else must default retail-safe.

Do not treat `Event`, `eventId`, `/app/events`, or `/api/app/events` as proof of EVENTS product mode.

## Model And Strength Selection

Every prompt in `EVENT_MODE_FABEL_PROMPTS.md` carries an explicit header:

```txt
Model: [model]
Strength: [strength]
```

Do not use `Recommended model:`, `Reasoning:`, or `Thinking:`.

Each prompt is rated on its own complexity, risk, scope, and autonomy
requirements. Audit prompts and shared-pipeline regression work are rated
differently from bounded EVENTS-only UI implementation. Do not normalize the
queue to a single model/Strength pair, and do not escalate a prompt just because
it touches several files.

If the human questions a choice, re-verify it against the active prompt scope and
explain the result. A challenge is a request to verify, not to downgrade.

See `docs/ENGINEERING_STANDARDS.md` (**Prompt Model Selection**) and
`docs/MODEL_SELECTION.md` for the policy and current model guidance.

## Loop Overview

For each prompt:

1. Read the buildout summary.
2. Read the full prompt queue.
3. Identify the next incomplete prompt.
4. Check stop gates before doing work.
5. Execute only that prompt.
6. Run verification.
7. Review the result against the next prompt.
8. Adjust the next prompt recommendation if the result changes the plan.
9. Commit only the current prompt changes.
10. Move to the next prompt only if no stop gate is hit.

## Do Not Free-Run

Do not execute multiple implementation prompts in one pass.

Audit prompts may be followed by a recommendation for the implementation prompt, but do not implement the next prompt unless explicitly instructed by the loop and no stop gate is hit.

If a prompt discovers that the next prompt should change, report the revised next prompt recommendation before continuing.

## Preflight Before Every Prompt

Run:

```bash
git status --short
git branch --show-current
git diff --stat
```

If the worktree has unrelated changes:

- identify them
- do not stage them
- do not overwrite them
- continue only if the current prompt can be isolated safely

Never use `git add .` unless the worktree is confirmed clean except for the current prompt.

## Controlled-Change Gates

These are control points, not all hard bans.

Stop and return a decision memo before implementation if the prompt unexpectedly touches:

- response/answer pipeline
- transcription/analysis pipeline
- auth/session/account/product boundary
- retail dashboard
- retail survey create/edit
- shared analytics used by retail
- breaking public API contract changes
- legacy `/api/events/*` behavior
- `/admin/events/*` behavior

### Prisma / schema rule

Prisma schema and migrations are allowed when the current prompt explicitly says schema work is in scope.

If schema work is in scope, Fabel may proceed, but must:

- explain the schema change before editing
- keep the migration production-safe
- avoid destructive changes unless explicitly approved
- preserve existing retail behavior
- run `npx prisma validate`
- run `npx prisma generate`
- run relevant migration/test checks
- summarize migration risk clearly

Stop before implementation if Prisma changes are unexpected, destructive, require backfill/data cleanup, change kiosk/runtime behavior, or alter shared retail data contracts.

### Kiosk / runtime rule

The kiosk is shared infrastructure, but EVENTS work may need to touch kiosk launch/runtime behavior.

Kiosk changes are allowed only when the current prompt explicitly includes kiosk launch/runtime work, such as token launch, QR/link launch behavior, event survey link resolution, or kiosk regression fixes.

Do not touch recording, upload, response finalization, answer processing, transcription, or analysis unless the prompt explicitly includes that pipeline work.

Stop before implementation if kiosk work would fork the kiosk, create a second kiosk flow, change retail `/kiosk?eventId=...`, or alter the response/answer/transcription/analysis pipeline unexpectedly.

### File-count rule

If a task appears to require more than 8 files, pause and summarize why before continuing unless the current prompt already approved a broader multi-file change.

Decision memo format:

```text
STOP GATE HIT
Prompt: [number/title]
Gate: [which gate]
Why it matters: [short explanation]
Files involved: [list]
Recommended options:
1. [safe option]
2. [riskier option]
3. [defer]
No files changed / files changed: [state]
Verification run: [commands/results]
```

## Audit Prompt Behavior

For audit-only prompts:

- do not change files
- do not stage files
- do not commit
- return findings in the requested structure
- identify the implementation path
- identify whether the next prompt needs adjustment

If an audit reveals unexpected schema/kiosk/auth/retail/shared analytics risk, stop and return a decision memo. If the prompt explicitly asked for schema or kiosk launch/runtime work, summarize the risk and proceed only within that prompt's scope.

## Implementation Prompt Behavior

For implementation prompts:

1. Identify exact files before editing.
2. Keep changes scoped to the prompt.
3. Preserve working retail behavior.
4. Reuse existing services/helpers.
5. Keep route handlers thin.
6. Add/adjust targeted tests.
7. Run verification.
8. Report results.
9. Commit only prompt-specific files.

## Verification Rules

Always run:

```bash
npm run typecheck
```

Run targeted tests for changed files.

Run full tests when practical:

```bash
npm test
```

If Prisma is touched because the current prompt explicitly approved schema/migration work, run:

```bash
npx prisma validate
npx prisma generate
```

If Prisma is touched unexpectedly, stop and return a decision memo before implementation.

## Commit Rules

After verification passes:

1. show changed files
2. stage explicit files only
3. commit with a focused message
4. do not push unless separately instructed

Example:

```bash
git status --short
git add path/to/file1 path/to/file2 path/to/test
 git commit -m "Complete event survey management"
```

Do not include the leading space before `git commit` when actually running the command. It is shown only to prevent accidental copy/run during review.

## After Each Prompt: Review And Adjust

After completing a prompt, answer:

1. Did the prompt complete successfully?
2. Did any runtime behavior change?
3. Did retail remain protected?
4. Did tests pass?
5. Did this reveal that the next prompt should change?
6. Is the next prompt still safe to run?
7. Was a stop gate triggered?

If the next prompt should change, write the revised next prompt recommendation instead of blindly continuing.

## Suggested Execution Order

Start here:

1. Prompt 00 — Preflight / Current State Check
2. Prompt 01 — Product-Boundary Regression Tests, only if not already completed
3. Prompt 02 — Multi-Survey Management Audit
4. Prompt 03 — Multi-Survey Management Implementation
5. Prompt 04 — Public Link / QR Lifecycle Audit
6. Prompt 05 — Public Link / QR Lifecycle Implementation
7. Prompt 06 — Event Settings Audit
8. Prompt 07 — Event Settings Implementation
9. Prompt 08 — Event Operations Workflow Cleanup
10. Prompt 09 — Dashboard Live Refresh Audit
11. Prompt 10 — Dashboard Live Refresh Implementation
12. Prompt 11 — Action Briefs Audit
13. Prompt 12 — Action Briefs MVP Implementation
14. Prompt 13 — Action Brief Status Workflow
15. Prompt 14 — Export / Share Action Brief MVP
16. Prompt 15 — Sponsor Activation Value Audit
17. Prompt 16 — Sponsor Activation Value MVP
18. Prompt 17 — Kiosk Regression Suite For Token + Retail
19. Prompt 18 — Legacy Public/Admin Route Audit
20. Prompt 19 — Legacy Route Documentation / Source Guards
21. Prompt 20 — Event Help Docs Audit / Draft

## Skip Logic

Skip a prompt only if:

- it is already implemented and verified
- an audit proves it is unnecessary
- it hits a stop gate
- a previous prompt changes the plan and a revised prompt is needed

If skipping, explain why.

## Current Known State

Product-boundary regression coverage has already been implemented in the current chat context:

- 11 files changed
- no runtime files changed
- `npm run typecheck` passed
- targeted tests passed
- `npm test` passed

So Prompt 01 should usually be skipped if those changes are already committed.

Recommended next prompt:

```text
Prompt 02 — Multi-Survey Management Audit
```

Do not jump directly to implementation unless Prompt 02 has already been completed and reviewed.

