# Timeline Dashboard Loop Controller

You are working in Planner Dash on the Timeline Dashboard redesign.

Expected branch:

```txt
feat/timeline-dashboard-redesign
```

Before doing anything, read:

```txt
docs/TIMELINE_DASHBOARD_LOOP_CONTROLLER.md
docs/TIMELINE_DASHBOARD_PLAN.md
docs/TIMELINE_DASHBOARD_PROMPTS.md
```

Use those documents as the roadmap and execute the prompts in order.

Do not execute outside the Timeline Dashboard plan.

## Loop Rules

Work through the Timeline Dashboard prompts sequentially.

For each prompt:

1. Restate the active prompt scope in 3-6 bullets.
2. Identify the exact files likely to be touched.
3. Implement the active prompt.
4. Review the result against `docs/TIMELINE_DASHBOARD_PLAN.md`.
5. Make any needed corrections based on the plan.
6. Run targeted tests for the touched area.
7. Run typecheck if reasonable for the touched area.
8. Create a summary using the stop format below.
9. If the prompt is complete and no hard stop is hit, continue to the next prompt.
10. If a hard stop is hit, stop and ask for human review.

## Prompt Order

Execute prompts from `docs/TIMELINE_DASHBOARD_PROMPTS.md` in this order:

1. Audit Current Timeline Implementation.
2. Rename Task Language To Timeline Item Language.
3. Workstream And Planning Stage Taxonomy + Additive Prisma If Needed.
4. Canonical Timeline Dashboard Payload / Service.
5. Add Dashboard View Shell And View Routing.
6. Dashboard Cards, Workstream Detail, And Right Rail.
7. Refactor Timeline, Board, And List Views Around Hierarchy.
8. Rebuild Add/Edit Timeline Item Flow.
9. Regression Tests, Final Polish, And QA Checklist.

## Schema / Migration Rule

Prisma changes are allowed when needed for the active prompt.

If schema changes are needed:

- Update `prisma/schema.prisma` if present.
- Update `web/prisma/schema.prisma` if present.
- Create the migration file.
- Do not run the migration.
- Do not apply the migration to the database.
- Do not reset the database.
- Do not run destructive Prisma commands.
- Run Prisma generate only if the repo workflow supports it without database mutation.
- Include the migration path in the summary.
- Include manual migration/run instructions in the summary.

Schema work must stay additive unless a human explicitly approves otherwise.

Avoid destructive changes:

- No dropping existing columns.
- No renaming existing columns.
- No deleting existing data.
- No replacing canonical TimelineItem/TimelineDependency data with duplicated dashboard-only state.
- No JSON blobs for core roadmap taxonomy when normalized/additive fields are warranted.

## Canonical Timeline Rule

TimelineItem is the canonical item in this module.

TimelineDependency is the canonical dependency relationship in this module.

Correct:

- Add Timeline Item creates a TimelineItem.
- Dashboard reads TimelineItem and TimelineDependency data.
- Board/List/Timeline/Dashboard share the same canonical timeline data.
- Workstreams are categories on or derived from TimelineItem.
- Planning stages are subcategories on or derived from TimelineItem.

Wrong:

- Creating records in the separate Task system from the Timeline module add flow.
- Calling Task APIs from Add Timeline Item.
- Creating a separate dashboard-only timeline table.
- Storing workstream/stage only in local UI state.
- Hardcoding demo roadmap metrics.
- Duplicating Run of Show, Matrix, speaker, F&B, or budget data into TimelineItem without an explicit plan.

## Architecture Rules

- Keep routes thin.
- Put business logic in services/helpers.
- Enforce authorization server-side.
- Validate event scope on every timeline read/write.
- Keep dashboard rollups in one canonical server-side path.
- UI can guide behavior, but cannot be the only enforcement layer.
- Preserve existing Timeline, Board, and List behavior unless the active prompt intentionally changes it.
- Do not broaden scope into global dashboards, Run of Show, budget, docs, speakers, seating, marketing, or task system work unless the active prompt explicitly says to.

## Tests

For each prompt, run the most targeted useful tests.

Prefer:

- timeline service tests
- timeline route tests
- dashboard payload tests
- event-scope regression tests
- create/edit timeline item tests
- component render tests for view tabs and dashboard states
- typecheck if reasonable

If a full test suite is too broad, run targeted tests first and explain what was not run.

## Hard Stops

Stop immediately and ask for review if:

- A migration would require dropping, renaming, or destructive data changes.
- The active prompt requires product judgment not covered by `docs/TIMELINE_DASHBOARD_PLAN.md`.
- Existing TimelineItem/TimelineDependency data conflicts with the target model in a way that cannot be solved additively.
- The add flow currently writes to the separate Task system and changing it would break unrelated modules.
- Tests fail and the fix is not obvious.
- Typecheck fails for reasons outside the touched scope.
- More than 14 files need changes for a prompt that should be narrow.
- A security/access pattern is unclear.
- You cannot verify event-scoped authorization.
- You would need to run a migration, reset the database, or alter live data to continue.
- The implementation would require broad refactors outside the Timeline module.

## Stop Format After Each Prompt

After each prompt, report:

- Prompt completed
- Files changed
- Migration files created, if any
- Tests run
- Test results
- Typecheck result, if run
- Behavior changed
- Any corrections made after reviewing against `docs/TIMELINE_DASHBOARD_PLAN.md`
- Risks or follow-up needed
- Next prompt started or reason for stopping

## Final Stop

After completing all planned Timeline Dashboard prompts, stop and report:

- Overall implementation summary
- All files changed
- All migration files created
- Tests run
- Passing/failing status
- Typecheck status
- Manual migration steps required
- Manual QA checklist
- Known risks
- Whether the branch is ready for human review

