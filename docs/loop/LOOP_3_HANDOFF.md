# Loop 3 handoff — Lead Retrieval direct and organizer adapters

Prompt completed: Loop 3, 2026-09-08. Previous integration blocker resolved by imported commit `7d54af7e`; Loop 1/2 implementation from `ce65c7be` preserved. Branch `feat/demo-seeding-framework` started clean.

Files changed (9): `package.json`; `scripts/demo-seeding/cli.ts`; `scripts/demo-seeding/platform.ts`; `scripts/demo-seeding/lead-retrieval.ts`; `scripts/demo-seeding/lr-world.ts`; `scripts/demo-seeding/lr-world.test.ts`; `scripts/demo-seeding/README.md`; `apps/lead-retrieval/scripts/demo/verify-framework-mapping.ts`; this handoff. Temporary dependency symlinks connect the existing main/root and LR app toolchains; they are not source changes.
Migration files created: none.
Schema/client generation: none. Used the approved existing LR baseline and mapping fields; no imported integration files modified.
Tests run: 21 framework tests; 23 imported mapping/entry tests; scoped TypeScript and ESLint; LR package `npm run typecheck`; import boundaries; whitespace checks.
Test results: all above passed. The LR package initially lacked `@xyflow/react` in the root toolchain; using the imported LR app's existing dependencies resolved that without product changes.
Typecheck/build result: framework and LR typechecks pass; scoped lint passes. App build not run because only an LR verification script was added, with no runtime app changes.

## Persisted runs

Approved targets positively checked before access: Platform Core `wtbnpeluwhjjqccdofxd`; LR `wsbdyemyzixkyvuiyesm`. Read-only LR probes confirmed all three live mapping columns before adapter implementation. Prior authorization to write framework-owned demo data was used. No Orca, Pulse, or legacy database was contacted in this loop.

- Direct DEMO, seed 20260911: **1 account, 3 events, 5 staff, 198 leads**, one company-scoped license. Manifest `/private/tmp/st-lr-direct-loop3-20260911.json`.
- Organizer DEMO, seed 20260912: **20 participating accounts plus 1 organizer company, 1 event, 72 staff, 1,110 leads**, 20 event-scoped licenses. Exactly 20 participating companies verified from persisted exhibitors. Manifest `/private/tmp/st-lr-organizer-loop3-20260912.json.lr-65706-1454.json.verified-66425.json`.
- Attach SMOKE, seed 20260913: **1 account, 1 event, 2 staff, 12 leads**. Reused Platform event `eba495c2-e93b-5773-b2e4-a6de43b94220` and organization `45736f0b-960a-5321-b2c4-f1935173677e`, originally seeded with Orca. Manifest `/private/tmp/st-lr-attach-loop3-20260913.json`. No new canonical event or organizer was created.

The first organizer run persisted its rows but validation saw the default 1,000-row API page. Added ordered pagination and a regression test, then resumed from the complete immutable checkpoint. The subsequent rerun verified every row against its original receipt, performed no LR updates, found exactly 1,110 leads, and passed canonical mapping/access validation. Interim progress counts were estimates and are superseded by these verified totals.

Every seeded event passed the imported production mapping loaders, organization ambiguity rules, and `resolveAccessibleEventIdsForUser`, followed by the canonical LR launch access decision. This proves database mapping and product authorization; it does not claim a browser handoff/session end-to-end test.

Company archetypes (two companies each in organizer demo): high-volume/high-quality; high-volume/low-quality; low-volume/high-quality; balanced; understaffed; excellent follow-up; poor follow-up; executive engagement; early-stage; session traffic spike. Per-company lead counts range 31–82; quality and follow-up distributions differ deterministically. Source metrics come from real lead score, temperature, ownership, intent, timestamp, and follow-up fields. Metadata supplies supported contextual facts without inventing qualifier/tag tables.

Behavior changed: LR is a selectable persistent adapter. Direct portfolios share one account; organizer counts are per event. Exact receipt/fingerprint checks reject unowned or changed LR rows. Checkpoints are immutable and durable after each verified row. Recovery completion preserves old receipts in a new journal. Existing Platform attach was corrected to reuse verified canonical organization/event/organizer records and leave their data unchanged; optional venue/timezone columns are handled consistently with preflight.
Plan alignment review: reused the imported integration as authority; no alternative identity/event mapping, no entitlement bypass, no email, invitation, AI, CRM, or workflow dispatch. Product auth users are explicitly created and mapped, never inferred from matching emails.
Corrections made after plan review: canonical attach reuse; paginated readback; immutable recovery completion journal; collision and pagination regression tests.
Risks / follow-up needed: full reset is still fail-closed pending transactional proof of every dependent; existing Loop 1 reset safety tests pass. Attaching into an LR event already mapped under another local ID is refused rather than duplicated or re-parented; final hardening must address verified no-op reuse. Deep LR intelligence and workflow state are Loop 4. Pulse is still unavailable until Loop 5. The final all-product verification matrix and reset proof remain Loop 6.
Next prompt started: Loop 4 — LR AI briefs, post-show intelligence, workflows. Continue in order; do not rerun Loops 1–2.
