# Loop 1 handoff — demo seeding framework

Prompt completed: Loop 1 — Framework, Repo Audit, Scenario Contract, CLI.

Files changed (14, including this handoff):
1. `package.json`
2. `scripts/demo-seeding/package.json`
3. `scripts/demo-seeding/config.ts`
4. `scripts/demo-seeding/random.ts`
5. `scripts/demo-seeding/world.ts`
6. `scripts/demo-seeding/ownership.ts`
7. `scripts/demo-seeding/adapters.ts`
8. `scripts/demo-seeding/cli.ts`
9. `scripts/demo-seeding/framework.test.ts`
10. `scripts/demo-seeding/tsconfig.json`
11. `scripts/demo-seeding/eslint.config.mjs`
12. `scripts/demo-seeding/README.md`
13. `docs/loop/DEMO_SEEDING_REPO_AUDIT.md`
14. `docs/loop/LOOP_1_HANDOFF.md`

Migration files created: none.

Schema/client generation: none. Platform Core schema unchanged; Orca, LR and Pulse schemas unchanged and locked. No database was mutated or reset.

Tests run:
- `npm run test:demo-seeding`
- `node /Users/ali/Documents/orca-clean/node_modules/typescript/bin/tsc -p scripts/demo-seeding/tsconfig.json --typeRoots /Users/ali/Documents/orca-clean/node_modules/@types`
- `NODE_PATH=/Users/ali/Documents/orca-clean/node_modules node /Users/ali/Documents/orca-clean/node_modules/eslint/bin/eslint.js --config scripts/demo-seeding/eslint.config.mjs scripts/demo-seeding/*.ts`
- `node scripts/check-import-boundaries.mjs`
- `git diff --check`
- CLI dry runs: full SHOWCASE, LR direct with three events, organizer SHOWCASE with two events and 20 companies per event.

Test results: 15 tests passed, 0 failed. Determinism, CLI/config precedence, product selection, direct/organizer counts, attach ownership, canonical metadata binding, ownership journal persistence, changed-row/unowned-dependent reset refusal and missing-adapter fail-closed behavior are covered. CLI reported one shared LR account over three direct events; organizer plan reported exactly 20 companies/event and 40 total across two events. These are PLANNED counts, not persisted row counts.

Typecheck/build result: scoped TypeScript and ESLint pass; import boundaries pass for four apps and one package; whitespace check passes. There is no build artifact for Node-native TypeScript tooling. Product builds were not run because no product app code changed. This worktree has no installed node_modules, so static checks used the existing main checkout's toolchain without editing it.

Behavior changed:
- `npm run seed:demo -- --dry-run` now emits a truthful reusable plan; `--json` emits structured data.
- Supports configuration for all/Orca/Pulse/LR, PRE/DURING/POST, SMOKE/DEMO/SHOWCASE, deterministic seed/anchor, event count and LR direct/organizer modes.
- CLI overrides scenario defaults; scenario scale overrides richness defaults. `--lr-companies` is explicitly per event, organizer only.
- Stable world keys span product selection. Logical IDs are not represented as provisioned Platform IDs. Actual canonical IDs remain null until verified.
- Typed event world represents shared organization/organizer, event dates/venue, rooms, sessions, speakers, people, companies and narrative facts. Operational arrays remain empty until Loop 2 generation; no fake completion counts.
- Attach requires canonical event and organization scope, rejects conflicting create flags, and can bind a verified canonical snapshot without re-parenting it.
- Immutable ownership manifests persist exact created/borrowed receipts. Reset planning refuses missing readback, changed scope/content or unowned dependent rows; borrowed records are never deleted. Fingerprints are change-detection metadata, not identity/auth proof.
- Platform and product adapter contracts declare preflight/provisioning/mapping/receipt boundaries. CLI mutation requests fail before writes because persistence adapters are not installed yet; that is deliberate Loop 1 state, not a completed seeder.

Plan alignment review: reviewed against the complete brief and all six prompts. This loop establishes the required foundation without prematurely implementing operational richness or replacing Pulse. No product schemas, unrelated app features or production behavior changed. Metadata stays outside canonical identity tables and cannot confer authorization. Canonical service and legacy-path exclusions are documented in the audit.

Corrections made after plan review: added scenario-level default product selection; bounded/validated date and scale inputs; kept canonical IDs distinct from logical world keys; made ownership receipts immutable; corrected an assertion overload for the available Node typings; scoped ESM configuration locally instead of changing the root module mode.

Risks / follow-up needed:
- No verified non-production Platform Core or Orca persistence target has been supplied. Read-only checks outside the sandbox found PostgreSQL accepting connections on 127.0.0.1:5432, no Supabase database response on :54322, and no Supabase Auth HTTP response on :54321/auth/v1/health. Initial sandbox-only readiness checks were inconclusive and are superseded by these results. A PostgreSQL listener alone does not establish a correctly scoped Platform Core Auth/registry target or an Orca demo database.
- Loop 2 requires actual persisted Orca SMOKE and DEMO runs with verified Platform↔Orca mapping. The controller requires review before secret/credential-backed commands or database initialization/migrations. No environment secrets were read or remote project contacted.
- LR in this branch has no discovered Platform identity/event mapping or secure handoff implementation. Existing LR account/organizer scope is product-local. Do not invent seed-only mappings or modify its locked schema. This must be resolved against production contracts before Loop 3 can claim launch-valid canonical mapping.
- Orca's current `createEventWithinTransaction` creates its own event ID. Loop 2 must reconcile canonical Platform ID creation through that production path, not bypass its membership/timeline/template/activity initialization or run the older adoption script blindly.
- Product adapters must persist receipts after verified writes, reject collisions without ownership, validate FK effects and deletion order, re-check transactionally and refuse partial-run rows without durable proof. No actual reset implementation is claimed in Loop 1.

Next prompt started or reason for stopping: Loop 2 is next in sequence. Its startup review is blocked on establishing an approved non-production persistence environment. Applicable controller hard stops: “If a command requires secrets, credentials, or live production access, stop and ask for review”; “You need to run a migration, reset a database, or alter live data to continue”; and “The prompt requires external service access that is not available.” Do not skip to Loop 3 or report in-memory/dry-run counts as real seed runs. Human review must identify approved pre-provisioned local/non-production Platform Core and Orca targets, or explicitly authorize isolated test-environment initialization from existing schemas, before persistence execution can continue.

Branch: `feat/demo-seeding-framework` in `/Users/ali/Documents/orca-clean-event-overview`. No commit, push, merge or PR made. Startup was clean; all current changes belong to Loop 1.
