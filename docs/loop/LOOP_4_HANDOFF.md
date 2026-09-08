# Loop 4 handoff — production exhibitor dashboard aggregate hard stop

Date: 2026-09-08
Branch: `feat/demo-seeding-framework`
Worktree: `/Users/ali/Documents/orca-clean-event-overview`

## Exact resume point

Loop 3 is complete; see LOOP_3_HANDOFF.md. Loop 4 implementation and its direct DEMO pass are preserved. Organizer SHOWCASE rows are persisted and independently counted, but the required production workspace verification fails. Loops 5 and 6 have NOT started. Do not restart Loops 1–3 or recreate the SHOWCASE world.

Recovery ownership journal: `/private/tmp/st-lr-showcase-loop4-20260914.json.lr-67041-505.json`.
Read-only blocked-state report: `/private/tmp/st-lr-showcase-loop4-readback.json`.
The original requested final SHOWCASE manifest was not emitted because verification failed. Checkpoint receipts remain the exact mutation/ownership evidence.

Once the production aggregate is corrected and verified, resume with:

```sh
npm run seed:demo -- --product lr --lr-mode organizer --lr-companies 20 --richness showcase --seed 20260914 --operation rerun --manifest /private/tmp/st-lr-showcase-loop4-20260914.json.lr-67041-505.json --json
```

Supply the approved Platform and LR environment variables explicitly, as documented in the framework README. `/private/tmp/demo-loop3/run-approved.mjs` is a local convenience runner that loads only the required values from the existing approved environment files, verifies the target refs, and never prints credentials. Dependency toolchains are in the existing main and LR integration worktrees; temporary verification symlinks were removed at the stop.

## New hard stop: actual product SQL excludes participating exhibitors

This is independent of the previously resolved Platform integration blocker. The imported integration remains untouched and the LR mapping fields exist live.

`apps/lead-retrieval/supabase/migrations/20260907120000_lead_retrieval_clean_baseline.sql:251` defines `dashboard_event_lead_metrics` with:

```sql
left join public.leads l on l.event_id = e.id and l.company_id = p_company_id
where e.company_id = p_company_id
  and e.id = any(p_event_ids)
```

The owner predicate excludes an exhibitor participating in an organizer-owned event. LR's real exhibitor dashboard at `apps/lead-retrieval/app/(app)/exhibitor/dashboard/page.tsx:295` calls `loadEventWorkspaceCompletedData`; that calls `loadDashboardEventLeadMetrics`, which depends on this RPC. An empty result becomes unavailable metrics, not a successful count.

Live read-only reproduction on approved LR `wsbdyemyzixkyvuiyesm`:

```json
{
  "rpc": "dashboard_event_lead_metrics",
  "p_company_id": "23c08f39-cf80-5ac7-9da4-61948b72cd76",
  "p_event_ids": ["d36da609-b892-5af3-8f78-aad65c4fee4a"],
  "p_now": "2026-09-07T12:00:00.000Z"
}
```

Response: HTTP 200, `[]`.
That participating company has **135 persisted leads and 67 hot leads**. Event owner company is `28097022-18ec-5698-a527-e59a5851e4f3`; canonical Platform event is `c9ba5ee7-46fc-59c6-ab55-6d902ccbfefc`. The organizer/participant distinction is required by the plan, not a seed error to repair by re-parenting the event.

Fixing the RPC requires a production SQL function change and database deployment outside the authorized demo adapter scope. No migration was authored or run, no integration code was rewritten, and the verifier was not weakened. Applicable controller hard stops: “The prompt expands beyond the named allowed scope” and “You need to run a migration, reset a database, or alter live data to continue.” Approval to write framework-owned demo rows does not silently authorize changing the imported product's SQL authorization/scoping contract.

Required human review: approve a scoped production fix to `dashboard_event_lead_metrics` for properly related participating exhibitor companies, including the required database function migration, or supply the approved deployed fix. Preserve company-scoped lead filtering and the real organizer/participant model. Then rerun verification from the checkpoint above.

## Persisted evidence

Direct DEMO, existing seed 20260911: 1 account, 3 events, 5 staff, 198 leads; **112 conversations, 71 lead briefs, 3 workflow templates, 24 workflow runs/step runs, 18 drafts**. Production completed-workspace metrics and conversation intelligence passed. New immutable completion journal: `/private/tmp/st-lr-direct-loop3-20260911.json.verified-66992.json`. Original Loop 3 journal remains unchanged.

Organizer SHOWCASE, seed 20260914: **20 participating companies, 2,082 leads, 1,221 conversations, 796 lead briefs, 20 workflow templates, 157 workflow runs and step runs, 118 drafts**. Independent paginated/COUNT readback confirmed these totals after the failed product aggregate check. Workflow distribution: **59 completed, 59 awaiting approval, 39 failed**. Templates are disabled; no queued/running workflow or external sending was introduced. This dataset is persisted, but the SHOWCASE run is NOT marked passed.

Company summaries are deterministic reports derived from the persisted rows; LR has no dedicated company-summary table. The product's lead briefs use its real `BriefingStoredContent` structure. Conversations follow the existing seed's text-transcript pattern (`text/plain`); no real audio recording/blob is claimed. Workspace intelligence uses the production completed-data loader and derivation. Workflow scope/parameters are checked using production draft-builder and parameter-parser helpers.

Sample persisted-fact company briefs:

> LatticeNorth captured 126 leads (126 unique contacts), including 67 hot prospects (53.2%). AI governance appeared in 126 lead records. 52 follow-ups are complete; 59 are overdue and 6 hot leads have no owner. The busiest capture hour was 2026-08-31T23:00 UTC with 75 leads.

> Vector Cloud Europe captured 135 leads (135 unique contacts), including 75 hot prospects (55.6%). Workflow automation appeared in 135 lead records. 91 follow-ups are complete; 23 are overdue and 8 hot leads have no owner. The busiest capture hour was 2026-09-01T03:00 UTC with 9 leads.

> BeaconWorks Europe captured 153 leads (153 unique contacts), including 21 hot prospects (13.7%). Attendee engagement appeared in 153 lead records. 52 follow-ups are complete; 79 are overdue and 3 hot leads have no owner. The busiest capture hour was 2026-09-01T11:00 UTC with 11 leads.

Organizer report: 10 of 20 companies exceeded the median hot-lead rate of 45.85%. BeaconWorks led capture volume with 153 leads. 894 follow-ups are overdue across the event.

## Controller stop report

Prompt completed: Loop 4 NOT complete; direct verification passed, organizer production dashboard verification blocked as above.
Files changed in Loop 4 (7): `scripts/demo-seeding/lead-retrieval.ts`; `scripts/demo-seeding/lr-intelligence.ts`; `scripts/demo-seeding/lr-intelligence.test.ts`; `scripts/demo-seeding/adapters.ts`; `apps/lead-retrieval/scripts/demo/verify-framework-intelligence.ts`; `scripts/demo-seeding/README.md`; this handoff. Loop 3 changes remain intact.
Migration files created: none.
Schema/client generation: none.
Tests run: framework suite 24/24; imported mapping/entry 23/23 during Loop 3; reused completed-workspace and draft-parser suite 36/36; framework TypeScript/ESLint; LR TypeScript; import boundaries; whitespace check.
Test results: all listed local tests pass. Live direct DEMO passes; live organizer SHOWCASE fails the production aggregate check (`null !== 135`). Scoped helper inference errors were corrected with explicit query/result types. A cached LR typecheck attempted to write outside the sandbox; final `tsc --noEmit --incremental false` passed without writing cache files.
Typecheck/build result: scoped framework and LR TypeScript pass; scoped ESLint and import boundaries pass. No full app builds run; no runtime application code changed.
Behavior changed: persisted-fact LR summaries, lead briefs and conversations, review/history workflow records, production intelligence validation, and batched collision-checked inserts with durable immutable checkpoints.
Plan alignment review: source-grounded intelligence, preserved imported integration, canonical product readback, no invented company intelligence table, no duplicate event truth, no external AI/CRM/email calls.
Corrections made after plan review: report wording ties interest counts to lead records rather than claiming all were conversations; batch writes preserve dependency order and ownership checks; explicit helper types fix scoped inference failures.
Risks / follow-up needed: required organizer product metrics fix; Loop 4 completion/rerun proof; Pulse Loop 5; cross-product Loop 6 and final matrix; complete transactional reset safety. Reset remains fail-closed. No commit/push/merge performed.
Next prompt started or reason for stopping: stop at this new Loop 4 hard stop; do not skip to Loop 5 or restart earlier loops.
