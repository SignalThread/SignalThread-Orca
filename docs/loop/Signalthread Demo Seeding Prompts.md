# SignalThread Reusable Demo Seeding Framework — Implementation Prompt Pack

Use these prompts sequentially.

The project brief is the source of truth:

`SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md`

Each loop must inspect the existing code before changing it. Do not invent schemas, APIs, data models, or current seeding behavior.

Preserve working product behavior unless the loop explicitly requires a change.

---

# Loop 1 — Framework, Repo Audit, Scenario Contract, CLI

**Model:** Opus  
**Strength:** Max

```text
You are implementing Loop 1 of the SignalThread reusable demo seeding framework.

Read the full brief first:

SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md

Your job in this loop is to establish the reusable architecture and contract. Do NOT attempt to fully seed Orca, LR, and Pulse yet.

FIRST: inspect the repository inside and out for all existing seed/demo/test-data infrastructure.

Specifically locate and understand:

1. current Pulse demo seed scripts and helpers
2. current Orca seed/demo scripts
3. current LR seed/demo scripts
4. Platform Core organization/event/user/product mapping creation paths
5. product entitlement model
6. canonical user/account/event mapping implementation
7. existing CLI conventions
8. existing database clients and environment safety checks
9. current reset/cleanup tooling
10. test factories that may be reusable
11. monorepo package boundaries and package scripts
12. current event/session/speaker identity relationships across products

Do not assume the brief's conceptual directory structure is correct. Adapt to the real repo.

Then implement the reusable framework foundation.

REQUIRED CAPABILITIES TO ESTABLISH IN LOOP 1

A. Scenario contract

Create typed scenario/config structures capable of expressing:

- product selection:
  - all
  - orca
  - pulse
  - lr

- event count

- lifecycle:
  - PRE
  - DURING
  - POST

- richness:
  - SMOKE
  - DEMO
  - SHOWCASE

- deterministic random seed

- LR mode:
  - direct
  - organizer

- LR direct scenario:
  - one primary LR account
  - 1..N events

- LR organizer scenario:
  - one organizer
  - 1..N events
  - configurable companies per event

- attach-to-existing-event mode

- dry run

- reset/rerun metadata

CLI values should be able to override scenario defaults.

B. CLI

Implement a reusable CLI entry point consistent with repository conventions.

The final user experience should support the equivalent of:

npm run seed:demo

npm run seed:demo -- --product all

npm run seed:demo -- --product orca

npm run seed:demo -- --product pulse

npm run seed:demo -- \
  --product lr \
  --lr-mode direct \
  --events 3

npm run seed:demo -- \
  --product lr \
  --lr-mode organizer \
  --events 1 \
  --lr-companies 20

npm run seed:demo -- \
  --product all \
  --scenario enterprise-conference \
  --richness showcase \
  --lifecycle post \
  --lr-mode organizer \
  --lr-companies 20

Exact flag spelling may adapt to existing conventions, but capability cannot be lost.

C. Validation

Reject incompatible config instead of silently guessing.

Examples:

- invalid richness
- invalid lifecycle
- invalid LR mode
- impossible event/company counts
- attach mode with conflicting create-new-event args
- LR-specific flags when LR is not selected, if that would be ambiguous
- destructive reset without provable seed scope

D. Deterministic seeded randomness

Implement a central seeded-random utility.

Do not use unseeded Math.random() for meaningful generated world data.

The same scenario + seed + config must produce the same logical generated world.

E. Event-world model

Create the typed canonical event-world model that later product adapters will consume.

It must be able to represent at minimum:

- organization
- organizer
- event
- event dates
- venue
- rooms
- sessions
- speakers
- attendees/population assumptions
- exhibitors/companies
- lifecycle
- narrative threads
- scenario metadata

Do not over-model unsupported product specifics yet.

F. Seeder metadata / ownership

Design and implement a safe way to identify data belonging to a demo seed run.

We need to be able to:

- rerun deterministically
- reset only seeded demo data
- avoid touching unrelated production/customer data
- identify scenario + seed + run

Use existing schema support if available.
If schema changes are truly required, inspect carefully and keep them minimal.

G. Product adapter interfaces

Create clear interfaces/contracts for:

- Platform adapter
- Orca adapter
- LR adapter
- Pulse adapter

Do not fill them with fake no-op complexity.
The purpose is to let the world generator feed enabled products independently.

H. Dry run / plan

Implement dry-run output showing what the requested scenario intends to create without mutating data, where practical.

I. Tests

Add focused tests for:

- config parsing
- invalid config rejection
- deterministic random generation
- scenario override behavior
- LR direct config
- LR organizer config
- event/company count handling
- product selection
- attach-mode validation
- seed ownership/reset safety primitives

IMPORTANT

Do not build giant amounts of demo content in this loop.

Do not replace the existing Pulse seed script yet.

Do not invent LR intelligence tables.

Do not bypass Platform Core canonical identity.

Do not delete or rewrite working seeding paths until you understand them.

DELIVERABLE

At the end:

1. run relevant tests/typecheck/lint
2. show exact files changed
3. show the implemented CLI examples
4. explain how scenario config flows into the canonical event-world contract
5. identify existing seed infrastructure that will be reused in later loops
6. list any real blockers discovered from the actual schemas
7. write/update a LOOP_1_HANDOFF.md containing exact implementation state for Loop 2

Do the work. Do not merely propose the architecture.
```

---

# Loop 2 — Orca Event World and Operational Richness

**Model:** Opus  
**Strength:** Max

```text
You are implementing Loop 2 of the SignalThread reusable demo seeding framework.

Read:

1. SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md
2. LOOP_1_HANDOFF.md
3. the Loop 1 implementation

Do not redesign Loop 1 unless you discover a concrete flaw.

Your goal is to implement the Orca product adapter and build the first genuinely rich canonical event world.

FIRST inspect the current Orca schema, services, seed scripts, module relationships, event membership model, and Platform→Orca canonical mappings.

Confirm what Orca actually supports before generating anything.

REQUIRED OUTCOME

Running the reusable seeder with:

npm run seed:demo -- --product orca --richness demo

must create a believable Orca event without requiring LR or Pulse.

The all-product world must also be able to reuse this same Orca event data later.

A. Platform prerequisites

Use the Loop 1 Platform adapter to create/reuse the minimum valid:

- organization
- organizer
- membership
- event
- ownership
- Orca entitlement
- canonical mapping

Do not bypass real launch/mapping assumptions.

B. Canonical event world richness

Implement high-quality deterministic generation for:

- event identity
- event theme
- event description
- event dates
- venue
- rooms
- sessions
- speakers
- organizer/team
- realistic schedule

Names and descriptions must be customer-demo quality.

No:

- Test User 1
- Session 12
- Demo Company 4
- Lorem ipsum

C. Orca modules

Seed realistic supported data across the actual Orca modules.

Inspect the schema and use only real capabilities.

Where supported, include:

- Run of Show
- Room Set
- Seating
- Budget
- Docs Hub
- Roadmap / Timeline
- Deadlines
- Activity
- assignments
- notes
- dependencies
- event team/member data

The event should feel lived in, not uniformly complete.

Include a realistic mix of:

- complete
- upcoming
- overdue
- blocked
- at-risk
- resolved

D. Intentional event narratives

Create deterministic narrative threads in the canonical event world.

Examples may include:

- room changed due to registration demand
- speaker materials delivered late
- sponsor asset deadline
- production/AV issue
- room-set change
- budget variance
- timeline dependency
- VIP requirement

The narrative model should be reusable by LR/Pulse later.

Do not hard-code every downstream product output yet.

E. Richness levels

Implement Orca scale differences for:

SMOKE
DEMO
SHOWCASE

SMOKE must remain fast.

SHOWCASE should feel substantial, but do not inflate rows without demo value.

F. Existing-event attach support

If Loop 1 attach mode exists, validate that Orca can attach to a valid canonical event without duplicating it.

G. Idempotency

Rerunning the same Orca seed must not duplicate the event world.

Reset must remain scoped to generated demo data.

H. Tests / validation

Add tests around:

- Orca-only generation
- deterministic event/session/speaker generation
- valid event relationships
- module counts by richness
- no orphan session/speaker/room references
- lifecycle/date coherence
- idempotent rerun
- safe reset

QUALITY BAR

This is demo content, not Faker filler.

Session titles, speaker biographies, operational notes, deadlines, room assignments, budget items, roadmap items, and issues should read like a real enterprise conference.

The generated world should be strong enough that Orca alone can be used in a sales demo.

DELIVERABLE

At the end:

1. run tests/typecheck/lint relevant to the touched code
2. run at least one Orca SMOKE seed
3. run at least one Orca DEMO seed
4. report actual generated counts
5. show a sample of the generated event narrative
6. verify Platform↔Orca mapping
7. write/update LOOP_2_HANDOFF.md with exact state for Loop 3

Do the implementation, not just a plan.
```

---

# Loop 3 — Lead Retrieval Direct + Organizer Modes

**Model:** Opus  
**Strength:** Max

```text
You are implementing Loop 3 of the SignalThread reusable demo seeding framework.

Read:

1. SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md
2. LOOP_1_HANDOFF.md
3. LOOP_2_HANDOFF.md
4. the current framework implementation

Your goal is to implement Lead Retrieval as a first-class adapter with TWO distinct reusable modes:

1. direct account
2. organizer

FIRST audit the real LR repository/schema inside and out.

Locate and understand:

- account/company model
- event model
- user/staff permissions
- exhibitor/company assignment model
- leads
- scans
- qualifiers
- notes
- tags
- lead status/priority/scoring
- workflows
- follow-up state
- integrations/export state
- AI/post-show data models
- Platform Core canonical mappings
- organizer-facing capabilities
- existing seed scripts/factories
- mobile/web assumptions that seeded data must satisfy

Do not invent unsupported tables or features.

PART A — LR DIRECT MODE

Required shape:

LR Account
 ├── Event 1
 ├── Event 2
 └── Event N

Support the equivalent of:

npm run seed:demo -- \
  --product lr \
  --lr-mode direct \
  --events 3 \
  --richness demo

The primary requirement is one LR account with 1..N events.

Seed each event with realistic, event-specific variation.

Each event should have, where supported:

- LR account/company
- event assignment
- staff
- staff roles
- leads
- scans
- scan timestamps
- qualifiers
- notes
- tags
- products/services of interest
- buying timeframe
- priority/score
- hot/warm/cold
- ownership
- follow-up state
- workflow state
- email/activity state
- CRM/export state if supported

Events must not all be statistical clones.

Create historical variation so a multi-event account demo feels real.

PART B — LR ORGANIZER MODE

Required shape:

Organizer
 └── Event
      ├── LR Company 1
      ├── LR Company 2
      ├── ...
      └── LR Company N

Support:

npm run seed:demo -- \
  --product lr \
  --lr-mode organizer \
  --events 1 \
  --lr-companies 20 \
  --richness showcase

Also support multiple organizer events.

Interpret `--lr-companies` as companies PER EVENT unless the existing CLI contract already established another explicit, documented meaning.

Each company must be a real LR account/company according to the actual schema.

Each must receive realistic:

- users/staff
- lead volume
- lead quality
- qualifiers
- notes
- workflows/follow-up state
- engagement patterns

PART C — COMPANY ARCHETYPES

Create deterministic company behavior profiles so participating companies are meaningfully different.

Examples:

- high-volume / high-quality
- high-volume / low-quality
- low-volume / high-quality
- average
- understaffed
- excellent follow-up
- poor follow-up
- executive-heavy leads
- early-stage leads
- concentrated product interest
- session-driven traffic spike

Company names and profiles must be polished and believable.

PART D — ORGANIZER-LEVEL DISTRIBUTIONS

Underlying seed data should naturally produce organizer-visible distinctions:

- top scan volume
- top qualified-lead rate
- strongest executive concentration
- weakest follow-up completion
- best staffing efficiency
- busiest windows
- strongest booth engagement

Do not seed unsupported organizer dashboards.
Seed the facts the real product uses.

PART E — CROSS-PRODUCT EVENT WORLD

When LR is seeded as part of `--product all`, reuse the canonical event world created by the framework.

When LR is seeded alone, create the minimum valid Platform/event world it needs.

When organizer mode is used alongside Orca, the organizer/event should represent the same canonical event.

PART F — ATTACH MODE

Validate attaching LR to an existing canonical event.

Do not create a duplicate event if a valid mapping exists.

PART G — RICHNESS

Support SMOKE, DEMO, SHOWCASE.

SHOWCASE should contain enough companies/leads/activity to make organizer and account dashboards lively.

PART H — TESTS

Add tests for:

- LR direct mode
- one direct account with one event
- one direct account with multiple events
- organizer mode
- configurable companies per event
- organizer with multiple events
- deterministic company archetypes
- lead distributions
- staff/company/event ownership
- no orphan leads
- attach mode
- rerun/idempotency/reset

IMPORTANT

Do not implement fake AI briefs yet unless needed to satisfy current required DB constraints.

Loop 4 owns the deep LR intelligence work.

But Loop 3 must create all underlying granular facts required for that intelligence.

DELIVERABLE

At the end:

1. run tests/typecheck/lint
2. run a direct LR DEMO seed
3. run an organizer LR DEMO/SHOWCASE seed
4. report actual account/event/company/staff/lead counts
5. show the company archetype distribution
6. prove the requested `--lr-companies` value was honored
7. verify canonical event/organization ownership
8. write/update LOOP_3_HANDOFF.md for Loop 4

Do the work, not just a proposal.
```

---

# Loop 4 — LR AI Briefs, Post-Show Intelligence, Workflows

**Model:** Opus  
**Strength:** Max

```text
You are implementing Loop 4 of the SignalThread reusable demo seeding framework.

Read:

1. SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md
2. LOOP_1_HANDOFF.md
3. LOOP_2_HANDOFF.md
4. LOOP_3_HANDOFF.md
5. current LR seed implementation

Your goal is to make LR demo data feel genuinely alive after the show.

This loop owns:

- AI briefs
- post-show summaries
- company summaries
- lead intelligence
- workflows
- follow-up state
- suggested/recommended next actions
- organizer-level rollups
- any existing LR intelligence surfaces backed by real schemas

FIRST audit the real current implementation.

Determine for every requested intelligence surface whether production:

A. stores generated/derived records
B. derives dynamically at runtime
C. calls an AI pipeline
D. computes via SQL/service logic
E. does not actually support it yet

Do not invent unsupported product capabilities.

Where the product already has real calculation/generation logic, prefer reusing the production path over duplicating it in the seed script.

CORE RULE

Every seeded/generated intelligence statement must be grounded in underlying seeded facts.

Never create generic disconnected AI copy.

Example acceptable output:

“Acme captured 114 leads, including 27 high-intent prospects. Interest peaked after the AI Infrastructure panel, with security and workflow automation appearing in 41% of qualified conversations. Eleven priority leads still have no assigned follow-up.”

Those numbers/themes must be true in the generated rows.

PART A — FACT DERIVATION LAYER

Create reusable deterministic analytics over seeded LR data.

Where supported, calculate:

- total leads
- unique leads
- qualified leads
- high-intent leads
- lead-quality distribution
- decision-maker concentration
- product-interest distribution
- buying-timeframe distribution
- scan volume by time
- lead volume by staff member
- staffing efficiency
- follow-up completion
- unassigned priority leads
- workflow completion
- strongest lead segments
- weak spots

Keep formulas centralized/testable.

PART B — DIRECT ACCOUNT INTELLIGENCE

For direct mode, create/use production-supported intelligence for each event.

The same account across multiple events should show believable historical differences.

Examples:

- improved follow-up vs prior event
- higher lead quality but lower volume
- different top interest category
- stronger/slower team response
- event-specific post-show recommendations

PART C — ORGANIZER INTELLIGENCE

For organizer mode, create/use actual supported organizer-level intelligence across participating companies.

Underlying company data should support insights such as:

- 7 of 18 exhibitors exceeded median qualified-lead rate
- Company X had highest volume
- Company Y had highest decision-maker concentration
- Company Z has poor follow-up completion

Do not hard-code contradictions.

PART D — WORKFLOWS + FOLLOW-UP

Seed rich workflow/follow-up states using real LR models.

Create realistic variation:

- complete
- active
- overdue
- unassigned
- blocked/needs review if supported

Priority leads should correlate with follow-up urgency.

PART E — POST-SHOW BRIEFS

Where supported, every SHOWCASE company/event should have polished post-show intelligence.

Organizer mode should have company-level briefs and organizer-level rollups if the product supports both.

Avoid repetitive templating.

Use deterministic content assembly driven by each company's actual archetype and metrics.

PART F — TESTS

Add tests proving:

- AI/brief metrics match underlying seeded data
- percentages are correct
- top company ranking is correct
- follow-up counts are correct
- organizer medians/rankings are correct
- deterministic text facts remain stable for same seed
- direct multi-event history differs meaningfully
- no intelligence references non-existent leads/products/staff

PART G — OUTPUT VALIDATION

Add validation that detects obvious contradictions such as:

- brief says 27 hot leads but database has 18
- summary names a top product never selected
- workflow summary counts completed tasks incorrectly
- organizer ranking references company outside event

DELIVERABLE

At the end:

1. run tests/typecheck/lint
2. seed at least one LR direct DEMO
3. seed at least one LR organizer SHOWCASE
4. show 2–3 real generated company briefs
5. show one organizer-level summary if supported
6. prove brief metrics against underlying rows
7. report workflows/follow-up distribution
8. write/update LOOP_4_HANDOFF.md for Pulse work

Do the implementation.
```

---

# Loop 5 — Pulse Reuse/Adaptation and Lifecycle-Rich Signals

**Model:** Opus  
**Strength:** Max

```text
You are implementing Loop 5 of the SignalThread reusable demo seeding framework.

Read:

1. SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md
2. LOOP_1_HANDOFF.md
3. LOOP_2_HANDOFF.md
4. LOOP_3_HANDOFF.md
5. LOOP_4_HANDOFF.md
6. the existing Pulse seed implementation

The key instruction for this loop:

DO NOT casually replace the current Pulse demo seeder.

We already have strong Pulse demo behavior. Audit it carefully and reuse/adapt as much of the proven richness as possible.

Your goal is to make Pulse a first-class adapter in the shared scenario framework while retaining or improving the current lively data.

FIRST inspect:

- current Pulse demo seed scripts
- event types
- canonical Platform mapping requirements
- sessions
- speakers
- survey targets
- survey assignments
- collection phases
- PRE/DURING/POST lifecycle handling
- voice transcripts
- text responses
- session ratings
- speaker ratings
- attendee questions
- evidence
- actions
- editorial/analyzer outputs
- existing seed validation
- current flagship demo event logic

PART A — SHARED EVENT WORLD

When Pulse is used with Orca/all-product mode:

- reuse canonical event
- reuse event dates
- reuse sessions
- reuse speakers
- reuse venue/room context where Pulse supports it

Do not invent duplicate parallel event truth.

When Pulse is seeded alone, the shared framework should create the minimum canonical world Pulse needs.

PART B — PRESERVE EXISTING RICHNESS

Identify what the current Pulse seeder already does well.

Port/reuse those generators/helpers into the framework rather than rewriting them for aesthetic reasons.

Keep compatibility with current Pulse schema and analyzer expectations.

PART C — LIFECYCLE

Support explicit:

- PRE
- DURING
- POST

Ensure timestamps satisfy real lifecycle boundaries.

PRE:
- bounded before event start

DURING:
- bounded to event dates/times

POST:
- post-event data and/or cumulative behavior consistent with product semantics

Do not generate impossible collectionPhase/time combinations.

PART D — SIGNAL RICHNESS

Seed realistic variation across supported Pulse inputs:

- surveys
- assignments
- responses
- voice transcripts
- text responses
- session ratings
- speaker ratings
- comments
- attendee questions
- evidence

Make the event feel imperfect and real.

Include deterministic stories such as:

- killer keynote
- controversial/divisive panel
- crowded breakout
- AV issue
- room temperature complaints
- registration friction
- lunch line
- sponsor praise
- repeated requests for recordings
- recurring theme interest
- speaker praise
- speaker criticism
- repeated attendee questions

PART E — INTELLIGENCE

Where current production logic supports it, generate or trigger:

- signals
- topic clusters
- sentiment
- actions
- follow-ups
- editorial insights
- lifecycle-aware analysis

Prefer the real production analyzer/derivation path when feasible.

If seed fixtures are required, they must match the source data.

PART F — CROSS-PRODUCT NARRATIVE HOOKS

Consume narrative threads created in the canonical event world.

Example:

If Orca marks an AI session as moved to a larger room because demand exceeded forecast:

Pulse should be able to show:
- high response volume
- high rating
- recurring AI governance questions
- room/crowding context if appropriate

Do not implement the final 8–12 cross-product storyline audit yet; Loop 6 owns that.

PART G — RICHNESS LEVELS

SMOKE:
- fast minimal coverage

DEMO:
- current good demo richness or better

SHOWCASE:
- dense PRE/DURING/POST world
- substantial transcripts/responses
- enough evidence/actions to make every major dashboard lively

PART H — TESTS

Add/retain tests around:

- Pulse-only seed
- all-product Pulse adapter
- event/session/speaker mapping
- null/unassigned survey target handling where valid
- lifecycle timestamp boundaries
- collectionPhase correctness
- ratings/respondent relationships
- deterministic transcripts/content
- analyzer fixture correctness
- idempotency/reset

DELIVERABLE

At the end:

1. run relevant tests/typecheck/lint
2. run Pulse-only DEMO
3. run all-product or attach-based Pulse DEMO
4. compare major counts/content richness against the prior Pulse seed
5. prove session/speaker mapping
6. prove lifecycle timestamps
7. show representative PRE/DURING/POST content
8. write/update LOOP_5_HANDOFF.md for final integration

Do the implementation, preserving the proven Pulse work.
```

---

# Loop 6 — Cross-Product Narratives, Validation, Reporting, Hardening

**Model:** Opus  
**Strength:** Max

```text
You are implementing the final integration/hardening loop for the SignalThread reusable demo seeding framework.

Read:

1. SIGNALTHREAD_DEMO_SEEDING_FRAMEWORK_BRIEF.md
2. LOOP_1_HANDOFF.md
3. LOOP_2_HANDOFF.md
4. LOOP_3_HANDOFF.md
5. LOOP_4_HANDOFF.md
6. LOOP_5_HANDOFF.md
7. all current framework code

Your goal is to turn the working product adapters into one canonical reusable SignalThread demo-data platform.

Do not add random extra features.

Focus on coherence, correctness, safety, usability, and demo quality.

PART A — ALL-PRODUCT RUN

Make the equivalent of:

npm run seed:demo -- \
  --product all \
  --scenario enterprise-conference \
  --richness showcase \
  --lifecycle post \
  --lr-mode organizer \
  --lr-companies 20

produce one coherent event world across:

- Platform Core
- Orca
- LR
- Pulse

No duplicate canonical event.

No mismatched organizer identity.

No conflicting dates.

No orphan mappings.

PART B — 8–12 CROSS-PRODUCT NARRATIVE THREADS

For SHOWCASE, create approximately 8–12 intentional deterministic storylines that appear coherently across the products where relevant.

Example:

Narrative: High-demand AI Infrastructure panel

Orca:
- session moved to larger room
- room-set / ROS / task implications

Pulse:
- high engagement
- strong rating
- recurring AI governance questions

LR:
- AI/security vendors receive post-session lead spike

Other storyline types may include:

- registration friction
- AV issue
- sponsor activation success
- speaker delay
- crowded room
- agenda change
- networking surge
- product-theme interest
- VIP change
- follow-up opportunity
- operational risk that gets resolved

Use only stories that map naturally to actual product capabilities.

PART C — VALIDATION SUITE

Implement strong post-seed validation.

Platform:
- organization
- organizer
- membership
- event
- ownership
- entitlements
- canonical mappings

Orca:
- valid event relationships
- sessions/speakers/rooms
- module references
- no orphan data
- sane dates

LR:
- correct mode
- correct event count
- exact requested companies per event
- staff ownership
- lead ownership
- workflow/follow-up consistency
- intelligence facts match rows

Pulse:
- event/session/speaker mapping
- lifecycle boundaries
- assignment integrity
- response/transcript integrity
- evidence/intelligence consistency

Cross product:
- canonical IDs align
- dates align
- organizer aligns
- narrative references align
- no duplicate event truth

Validation failures must be actionable.

PART D — SEED REPORT

Produce a clear human-readable completion report.

Example:

SignalThread Future of Events Summit 2026
Scenario: enterprise-conference
Richness: SHOWCASE
Seed: 20260907

Platform
✓ organization
✓ organizer
✓ event
✓ entitlements
✓ mappings

Orca
✓ 24 sessions
✓ 31 speakers
✓ 8 rooms
✓ 67 ROS items
✓ 94 deadlines
...

Lead Retrieval
Mode: organizer
✓ 20 companies
✓ 81 booth staff
✓ 1,487 leads
✓ 462 qualified leads
✓ 20 post-show briefs
✓ 74 workflows
...

Pulse
✓ 658 responses
✓ 221 transcripts
✓ PRE / DURING / POST coverage
✓ 24 session assignments
✓ 19 actions
...

Validation
✓ no orphaned records
✓ canonical mappings valid
✓ lifecycle timestamps valid
✓ AI brief source metrics valid

Also provide a machine-readable JSON report option if reasonable.

PART E — RESET / RERUN / SAFETY

Prove:

- same deterministic seed can be recreated
- rerun does not duplicate
- reset removes only owned seeded records
- unrelated events/users/accounts remain untouched
- attach mode cannot re-parent an unrelated event

Add defensive checks where needed.

PART F — CLI UX

Review the final CLI as a user.

It should be easy to remember.

Required use cases must be obvious:

1. full platform
2. Orca only
3. Pulse only
4. LR direct
5. LR organizer
6. multiple LR events
7. configurable organizer company count
8. attach existing event
9. reset
10. dry run
11. deterministic seed
12. richness

Add `--help` documentation/examples.

PART G — DOCUMENTATION

Write a concise but complete README for the framework covering:

- purpose
- architecture
- commands
- scenarios
- richness levels
- LR direct vs organizer
- event count semantics
- company count semantics
- attach mode
- reset/rerun
- deterministic seeds
- environment safety
- adding a new scenario
- adding a new generator
- adding a future product adapter

PART H — FULL VERIFICATION MATRIX

Actually run a meaningful matrix, not just one happy path.

At minimum:

1. Orca SMOKE
2. Pulse SMOKE
3. LR direct SMOKE, 1 event
4. LR direct DEMO, multiple events
5. LR organizer DEMO with explicit company count
6. all-product DEMO
7. all-product SHOWCASE
8. attach product to existing event
9. deterministic rerun
10. reset safety

Record the results.

PART I — QUALITY AUDIT

Search generated content for demo-killing garbage:

- Test User
- Demo Company
- Session 1
- Lorem ipsum
- repeated identical bios
- repeated notes
- generic AI summaries
- impossible timestamps

Fix issues discovered.

FINAL DELIVERABLE

At the end:

1. run the complete relevant test suite
2. run typecheck/lint
3. show the verification matrix results
4. show a final SHOWCASE seed report
5. show the exact reusable commands
6. summarize architecture and safety behavior
7. list any known limitations tied to actual product/schema constraints
8. write FINAL_DEMO_SEEDING_HANDOFF.md with the exact production-ready state

Do the work and fully verify it.
```

---

# Expected End State

After all six loops, the user should be able to repeatedly do the equivalent of:

```bash
# Full SignalThread demo world
npm run seed:demo -- \
  --product all \
  --richness showcase \
  --lr-mode organizer \
  --lr-companies 20
```

```bash
# Orca only
npm run seed:demo -- \
  --product orca \
  --richness demo
```

```bash
# Pulse only
npm run seed:demo -- \
  --product pulse \
  --richness demo \
  --lifecycle post
```

```bash
# LR direct account with multiple historical events
npm run seed:demo -- \
  --product lr \
  --lr-mode direct \
  --events 4 \
  --richness demo
```

```bash
# LR organizer overseeing many LR companies
npm run seed:demo -- \
  --product lr \
  --lr-mode organizer \
  --events 1 \
  --lr-companies 30 \
  --richness showcase
```

```bash
# Attach a product to an existing canonical event
npm run seed:demo -- \
  --product pulse \
  --existing-event <event-id>
```

The exact syntax may differ after repo inspection, but the final framework must preserve these capabilities.
