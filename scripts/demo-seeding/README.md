# SignalThread reusable demo seeding

Loop 1 established the typed, deterministic foundation. Loop 2 adds canonical Platform Core + Orca persistence and a customer-demo-quality operational world. LR and Pulse persistence remain assigned to later loops.

Requires Node 22.18+ (native TypeScript stripping) and the monorepo development dependencies for typecheck/lint. No database or environment file is loaded for planning.

```sh
npm run seed:demo -- --help
npm run seed:demo -- --dry-run
npm run seed:demo -- --product orca --richness smoke --dry-run
npm run seed:demo -- --product pulse --lifecycle post --dry-run
npm run seed:demo -- --product lr --lr-mode direct --events 3 --dry-run
npm run seed:demo -- --product all --richness showcase --lr-mode organizer --lr-companies 20 --dry-run --json
npm run seed:demo -- --product pulse --existing-event <uuid> --organization-id <uuid> --dry-run
npm run test:demo-seeding
npm run typecheck:demo-seeding
npm run lint:demo-seeding
```

For a persisted Orca run, explicitly load the approved Platform Core and Orca environment, then use a new immutable manifest path:

```sh
npm run seed:demo -- --product orca --richness smoke --manifest /private/tmp/orca-smoke.json
npm run seed:demo -- --product orca --richness demo --seed 20260908 --manifest /private/tmp/orca-demo.json
npm run seed:demo -- --product orca --richness demo --seed 20260908 --operation rerun --manifest /private/tmp/orca-demo.json
```

Each adapter verifies its exact project ref immediately before mutations. Platform Core creates/reuses the canonical Auth identity, organization, owner membership, event, event membership, Orca entitlement, and derived authorization claim. Orca adopts the Platform organization/event UUIDs directly and links its local user through `User.platformUserId`. The Orca world includes rooms and room-set notes, official Run of Show sessions, speakers, staffing, deadlines, roadmap/timeline dependencies, budget lines, Docs Hub metadata, seating, and narrative activity.

Scenario → deterministic event world → canonical Platform provisioning → enabled product adapters → derived intelligence → validation/reporting. Root orchestration belongs under `scripts/` rather than a package importing product apps. Each later adapter must run within its owning app's Prisma/client and service environment; no cross-app runtime imports or mixed Prisma clients.

Configuration precedence: CLI, scenario defaults, richness defaults, framework defaults. LR-only defaults to one direct account over all events; all-product defaults to organizer mode. `--lr-companies` always means per event in organizer mode. Direct mode rejects that flag. Event count is 1–24; organizer companies/event 1–100. These explicit practical limits keep accidental runs bounded.

A fixed ISO `--anchor` determines lifecycle dates independently of the wall clock. Default anchor is `2026-09-07T12:00:00.000Z`. Same scenario version, seed and configuration reproduce the same logical world. Random forks isolate products/generators. Proposed logical UUIDs do **not** prove canonical identities. Returned canonical records and product mappings must be independently verified. Attach needs one product, a canonical event and an explicit organization; canonical metadata wins and conflicting create flags are rejected.

Ownership journals are versioned, private, immutable files containing exact created/borrowed row receipts and fingerprints of database readback. They are operational metadata, not an identity or authorization source. Reset/rerun requires `--operation reset|rerun --manifest <file>` and the original config. IDs, names and seed prefixes alone are never sufficient. Reset planning additionally requires live scope/content equality and confirmation that no unowned dependent data would be changed through FKs. Borrowed records are never deletion candidates. Adapters must validate deletion order and re-check transactionally; the foundation does not execute deletion.

The approved Orca target was reconciled through the repository's active additive migration chain before Loop 2 persistence. The adapters recognize only the explicitly approved Platform Core and Orca project refs; legacy and sibling projects are rejected. The framework does not send invitations, email, call AI services, reset databases or load secrets implicitly. Reset remains fail-closed until every non-cascading Orca dependent can be transactionally proven owned; rerun converges on deterministic IDs without overwriting the original manifest.

Add scenarios by supplying versioned `Scenario` definitions to the parser/world generator. Add generators using namespaced random forks and logical keys, not `Math.random` or the current clock. Product adapters must implement the declared preflight, canonical provisioning/mapping and receipt contracts. Missing adapters fail before writes rather than becoming no-op implementations.
