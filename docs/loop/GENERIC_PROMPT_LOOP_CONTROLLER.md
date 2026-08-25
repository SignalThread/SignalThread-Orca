# Generic Prompt Loop Controller

Use this document when you want an agent to work through a plan document and a prompt document in sequence without drifting, skipping steps, or broadening scope.

This file is intentionally generic. Do **not** replace placeholders. The human will provide the actual plan document, prompt document, branch, schema mode, and scope in the prompt pack or in the first instruction.

## How To Use

Put this file anywhere the agent can read it, usually one of these:

```txt
docs/LOOP_CONTROLLER.md
docs/PROMPT_LOOP_CONTROLLER.md
```

Then give the agent:

```txt
Read the loop controller, then read the plan document and prompt document I named. Execute the prompts in order.
```

The loop controller does not need to know the feature name ahead of time. The plan and prompt documents define the feature.

## Required Inputs

Before implementation starts, the agent must know:

```txt
Plan document:
Prompt document:
Expected branch:
Schema mode:
Allowed scope:
Out-of-scope areas:
Canonical models/services:
```

These should normally be stated in the prompt document or in the human’s starting message.

If any required input is missing and cannot be safely inferred from the provided docs, stop and ask for human review.

## Startup Rules

Before editing code:

1. Read this loop controller.
2. Read the named plan document.
3. Read the named prompt document.
4. Identify the expected branch from the human instruction or prompt document.
5. Check current branch and dirty state.
6. Confirm the allowed scope and out-of-scope areas.
7. Identify schema mode.
8. Identify canonical models/services.
9. Start with the first prompt in the prompt document.

Do not execute outside the plan.  
Do not skip prompts.  
Do not combine prompts unless the prompt document explicitly says to do so.  
Do not invent new prompts.

## Document Discovery Rule

Use the exact plan and prompt document names provided by the human or prompt pack.


## Loop Rules

Work through the prompt document sequentially.

For each prompt:

1. Restate the active prompt scope in 3-6 bullets.
2. Identify the exact files likely to be touched before editing.
3. Re-check branch and dirty state.
4. Implement only the active prompt.
5. Review the result against the plan document.
6. Make needed corrections based on the plan.
7. Run targeted tests for the touched area.
8. Run typecheck/build/lint only where reasonable for the touched area.
9. Create a summary using the stop format below.
10. If the prompt is complete and no hard stop is hit, continue to the next prompt.
11. If a hard stop is hit, stop and ask for human review.

## Prompt Order

Execute prompts from the prompt document in order.

If the prompt document has numbered prompts, follow that numbering exactly.

If the prompt document has unnumbered prompt headings, treat each top-level prompt heading as one prompt and execute from top to bottom.

Do not create extra implementation phases unless the prompt document or human explicitly instructs you to.

## Plan Authority Rule

The plan document is the product and architecture source of truth.

Correct behavior:

- Use the plan to resolve ambiguous wording inside a prompt.
- Keep implementation aligned with the plan even if a prompt is under-specified.
- Make small corrections when implementation drifts from the plan.
- Report any plan/prompt conflict in the stop format.

Wrong behavior:

- Expanding into adjacent modules not named by the plan.
- Replacing the plan with a new product direction.
- Shipping demo-only behavior when the plan requires persisted production behavior.
- Creating duplicate state when the plan names a canonical source of truth.
- Silently skipping a plan requirement because it is inconvenient.

## Schema / Migration Mode

The schema mode must come from the human instruction, plan document, or prompt document.

Use exactly one of these modes:

```txt
LOCKED
ADDITIVE_ALLOWED
OPEN
```

### Schema / Migration Rule

The schema is open for this implementation.

Schema changes are allowed when they are required to complete the active prompt and align with the plan. Do not stop just because a prompt requires new models, fields, relations, indexes, migrations, or generated client updates.

When schema changes are needed:

- Update every schema copy used by the repo.
- Create the required migration file.
- Keep migrations production-safe.
- Preserve existing data through nullable fields, backfills, compatibility fields, or staged changes.
- Generate/update the Prisma client if that is part of the repo workflow.
- Add or update tests for the changed schema, services, APIs, and UI paths.
- Include the migration name/path in the prompt summary.
- Include any manual migration/run instructions in the prompt summary.

Allowed schema work includes:

- New tables/models.
- New nullable columns.
- New required columns only when a safe default or backfill exists.
- New relations and foreign keys.
- New indexes and uniqueness constraints.
- Backfills from provable existing data.
- Renames only when handled with a safe compatibility/backfill plan.
- Removing old schema only when the plan explicitly approves it and data safety is addressed.

Do not do unsafe database work:

- Do not reset the database.
- Do not run destructive Prisma/database commands.
- Do not drop data without explicit human approval.
- Do not infer or invent backfill data from text when the source relationship is not provable.
- Do not hide data cleanup in vague migrations.
- Do not create UI-only state to avoid proper schema work.

Hard stop only if:

- The migration would destroy data without explicit approval.
- Existing data conflicts with the target model and cannot be migrated safely.
- The prompt requires a product/schema decision not covered by the plan.
- The implementation would require live production access, database reset, or manual data alteration to continue.


## Canonical Data Rule

Use the canonical models/services named in the plan or prompt document.

Correct behavior:

- Writes go through the canonical service or mutation path.
- Reads and rollups derive from canonical records.
- UI state is temporary unless the plan explicitly says it should persist.
- Derived fields are clearly non-authoritative.
- Backfills reconcile from the true source of truth.

Wrong behavior:

- Creating dashboard-only tables when canonical records already exist.
- Storing important product state only in local UI state.
- Duplicating records without reconciliation.
- Making route-specific copies of core business logic.
- Treating cached/derived counters as write authority.

## Architecture Rules

- Keep route handlers thin.
- Put business logic in services/helpers.
- Enforce authorization server-side.
- Validate tenancy/event/account scope on every read/write.
- Keep rollups and derived payloads in one canonical server-side path.
- UI may guide or warn, but it must not be the only enforcement layer.
- Avoid broad refactors unless the active prompt explicitly calls for them.
- Preserve existing behavior outside the active prompt scope.
- Remove dead or parallel logic when replacing a canonical path.
- Keep changes low-breakage and easy to review.

## UI / UX Rules

- Preserve editability of existing tables/forms unless the prompt intentionally changes it.
- Do not turn normal editable cells into navigation traps.
- Use clear empty, loading, and error states.
- Do not show fake success before the server confirms a write.
- Do not hide destructive actions behind ambiguous copy.
- If adding navigation links inside dense tables, keep them explicit and compact.
- Keep responsive behavior in scope for every changed surface.

## Testing Rules

For each prompt, run the most targeted useful tests.

Prefer:

- service tests for canonical business logic
- route/API tests for authorization and validation
- migration/backfill tests when schema changes occur
- component tests for changed UI states
- regression tests for bugs or risky behavior
- typecheck/build for touched package when feasible

If a full test suite is too broad, run targeted tests first and explain what was not run.

Do not claim tests passed unless they actually ran and passed.

## Command Safety Rules

- Do not run commands that may open an interactive editor.
- For git commits, use non-interactive flags like `-m` or `--no-edit`.
- Do not run destructive database commands.
- Do not reset the repo or discard changes unless explicitly told to.
- If there are unrelated dirty files, do not modify them; report them.
- If a command requires secrets, credentials, or live production access, stop and ask for review.

## Hard Stops

Stop immediately and ask for human review if:

- The active prompt conflicts with the plan.
- Required product behavior is not covered by the plan.
- The plan document and prompt document disagree in a material way.
- A migration would require dropping, renaming, or destructive data changes.
- Existing production data shape conflicts with the target model and cannot be fixed additively.
- Authorization, tenancy, or event/account scoping is unclear.
- Tests fail and the fix is not obvious.
- Typecheck/build fails for reasons outside the touched scope.
- The prompt expands beyond the named allowed scope.
- The implementation requires broad refactors outside the named module/surface.
- You need to run a migration, reset a database, or alter live data to continue.
- You discover unrelated dirty work that could be overwritten.
- The prompt requires external service access that is not available.
- The plan would create duplicate canonical state or hidden UI-only state.

## File Count Guardrail

Use the file-count limit stated by the human, plan, or prompt document.

If no limit is stated, use this default:

```txt
Max files per prompt: 14
```

If the active prompt needs more files than the limit, stop and report why before continuing.

## Stop Format After Each Prompt

After each prompt, report:

```txt
Prompt completed:
Files changed:
Migration files created:
Schema/client generation:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

## Final Stop Format

After completing all planned prompts, stop and report:

```txt
Overall implementation summary:
All files changed:
All migration files created:
Schema/client generation:
Tests run:
Passing/failing status:
Typecheck/build status:
Manual migration steps required:
Manual QA checklist:
Known risks:
Out-of-scope items not touched:
Branch ready for human review: yes/no
```

## Manual QA Checklist Template

At the final stop, include a checklist tailored to the feature:

```txt
[ ] Existing page/view still loads
[ ] New view/state loads with real persisted data
[ ] Create flow works
[ ] Edit flow works
[ ] Delete/remove flow works, if in scope
[ ] Filters/search/sort work, if in scope
[ ] Empty state is understandable
[ ] Error state is understandable
[ ] Loading state is not broken
[ ] Permission/read-only behavior is correct
[ ] Mobile/narrow viewport behavior is acceptable
[ ] Generated/derived records reconcile correctly
[ ] Import/export/reporting still work, if in scope
[ ] No unrelated module behavior changed
```

## Recommended Three-Doc Structure

Use this structure for looped implementation work:

```txt
PLAN.md
PROMPTS.md
LOOP_CONTROLLER.md
```

Specific projects can use more descriptive names, but the loop controller does not need those names hardcoded.

The plan doc explains what and why.

The prompts doc explains the implementation sequence.

The loop controller explains how the agent should move through the prompts safely.

## Starting Message Template

Use this when starting a new agent session:

```txt
Read the loop controller first, then read the plan and prompt docs listed below.

Loop controller:
[exact path]

Plan document:
[exact path]

Prompt document:
[exact path]

Expected branch:
[exact branch]

Schema mode:
[LOCKED / ADDITIVE_ALLOWED / OPEN]

Allowed scope:
[short scope]

Out of scope:
[short scope]

Execute the prompts in order. Stop only on the hard stops in the loop controller.
```
