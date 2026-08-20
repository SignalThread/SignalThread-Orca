# Fable Loop Controller — Speaker Module / Portal

You are working in Planner Dash on branch:

feat/speaker-module-portal

Before doing anything, read:


docs/FABLE_LOOP_CONTROLLER.md, 
docs/MODULE_PLAN.md
docs/MODULE_PROMPTS.md


Use those documents as the roadmap and execute the prompts in order.

Do not execute outside the Speaker Module / Speaker Portal plan.

## Loop Rules

Work through the Speaker Module prompts sequentially.

For each prompt:

1. Restate the active prompt scope in 3–6 bullets.
2. Identify the exact files likely to be touched.
3. Implement the active prompt, then increment to the next prompt when the current prompt is complete.
4. Create migration files for needed schema changes, but do not run migrations against the database.
5. Do not create duplicate speaker data in Matrix, Run of Show, sessions, or any other module.
6. Keep routes thin.
7. Keep business rules server-side.
8. Run targeted tests for the touched area.
9. Run typecheck if reasonable for the touched area.
10. Create a summary.
11. Review the summary against docs/MODULE_PLAN.md.
12. Make any needed corrections based on the Speaker Module plan.
13. Continue to the next prompt.

## Schema / Migration Rule

Schema changes are allowed when needed for the active prompt.

If schema changes are needed:

* Update prisma/schema.prisma.
* Create the migration file.
* Do not run the migration.
* Do not apply the migration to the database.
* Do not reset the database.
* Do not run destructive Prisma commands.
* Include the migration path in the summary.
* Include any manual migration/run instructions in the summary.

The schema work must stay additive unless the Speaker Module plan explicitly requires otherwise.

Avoid destructive changes:

* No dropping existing columns.
* No renaming existing columns.
* No deleting existing data.
* No replacing canonical Speaker IDs with duplicated text fields.

## Canonical Speaker Rule

Speaker is the canonical person/profile.

Session, Matrix, Run of Show, and Portal must reference Speaker by ID.

Correct:

* Speaker profile exists once.
* SessionSpeakerAssignment links Speaker to MatrixRow/session.
* Portal submissions update or draft against the canonical Speaker flow.

Wrong:

* Copying speaker name/title/bio/headshot into Matrix.
* Creating separate Run of Show speaker records.
* Creating portal-only duplicate speaker profiles.
* Storing assignment data as free-text speaker strings.

## Architecture Rules

* Keep routes thin.
* Put business logic in services/helpers.
* Enforce authorization server-side.
* Validate event scope on every read/write.
* Validate speaker/event/session relationships server-side.
* UI can guide behavior, but cannot be the only enforcement layer.
* Preserve existing public intake behavior unless the active prompt intentionally replaces it with the new safe portal flow.
* Do not broaden scope into CFP, email automation, or Phase 3+ unless the plan prompt explicitly says to.

## Tests

For each prompt, run the most targeted useful tests.

Prefer:

* speaker route tests
* speaker service tests
* portal/token tests
* event-scope regression tests
* assignment regression tests
* typecheck if reasonable

If a full test suite is too broad, run targeted tests first and explain what was not run.

## Hard Stops

Stop immediately and ask for review if:

* A migration would require dropping, renaming, or destructive data changes.
* The active prompt requires product judgment not covered by docs/MODULE_PLAN.md.
* You find existing duplicated speaker data that conflicts with the canonical Speaker rule.
* Tests fail and the fix is not obvious.
* Typecheck fails for reasons outside the touched scope.
* More than 12 files need changes for a prompt that should be narrow.
* A security/access pattern is unclear.
* You cannot verify event-scoped authorization.
* You would need to run a migration, reset the DB, or alter live data to continue.

## Stop Format After Each Prompt

After each prompt, report:

* Prompt completed
* Files changed
* Migration files created, if any
* Tests run
* Test results
* Typecheck result, if run
* Behavior changed
* Any corrections made after reviewing against docs/MODULE_PLAN.md
* Risks or follow-up needed
* Next prompt started or reason for stopping

## Final Stop

After completing the planned Speaker Module / Speaker Portal prompts, stop and report:

* Overall implementation summary
* All files changed
* All migration files created
* Tests run
* Passing/failing status
* Manual steps required
* Manual QA checklist
* Known risks
* Whether the branch is ready for human review
