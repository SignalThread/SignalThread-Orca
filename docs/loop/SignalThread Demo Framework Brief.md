# SignalThread Reusable Demo Seeding Framework — Product & Engineering Brief

## Purpose

Build a reusable demo-data seeding framework for SignalThread that can create rich, coherent, production-realistic demo worlds across:

- Platform Core
- Orca
- Lead Retrieval (LR)
- Pulse

This is not a one-time seed script.

The finished capability should be a reusable framework that supports:

- seeding all products together
- seeding a single product by itself
- attaching a product to an existing event
- reseeding/resetting deterministic demo data
- multiple demo scenarios
- multiple richness levels
- configurable event/account/company counts
- realistic cross-product narratives
- rich AI/demo intelligence
- repeatable use for demos, screenshots, QA, development, and sales

The framework must create data that looks and behaves like a real event operation, not generic Faker output.

---

# Core Product Principle

## One event world, multiple product adapters

Do not build three independent seeders that invent unrelated data.

The framework should create a canonical **event world** first, then adapt that world into the data models required by each enabled product.

Conceptually:

```text
Scenario Definition
        ↓
Canonical Event World
        ↓
Platform Core / Identity / Product Entitlements
        ↓
┌────────────┬────────────┬────────────┐
│    Orca    │     LR     │   Pulse    │
└────────────┴────────────┴────────────┘
        ↓
Cross-Product Intelligence
        ↓
Validation + Seed Report
```

Shared entities should remain coherent wherever possible:

- organization
- organizer
- canonical event
- event dates
- venue
- rooms
- sessions
- speakers
- attendee population
- exhibitor population
- timeline
- lifecycle
- event themes
- narrative incidents

Example:

If the keynote is moved from Room 204 to Ballroom B because registration exceeded forecast:

- Orca should reflect the room/timeline/operational change
- Pulse should reflect attendee response to the moved/high-demand session
- LR may reflect booth traffic or lead spikes associated with that session/theme

The goal is a demo world with causal relationships, not isolated fake records.

---

# Reusability Requirement

The completed framework must be callable repeatedly from the CLI.

Illustrative interface:

```bash
npm run seed:demo
```

Seeds the default full cross-product demo scenario.

Single product:

```bash
npm run seed:demo -- --product orca
npm run seed:demo -- --product pulse
npm run seed:demo -- --product lr
```

Configured full scenario:

```bash
npm run seed:demo -- \
  --scenario enterprise-conference \
  --events 1 \
  --lr-mode organizer \
  --lr-companies 20 \
  --lifecycle post \
  --richness showcase
```

The exact command names may change to fit the repository, but the capabilities may not be lost.

---

# Required Seed Modes

## 1. All Products

Seed one coherent event world into:

- Platform Core
- Orca
- LR
- Pulse

Example:

```bash
npm run seed:demo -- --product all
```

This is the flagship SignalThread demo mode.

---

## 2. Orca Only

Seed an Orca-centric demo event without requiring LR or Pulse.

The framework must create whatever shared Platform Core entities are minimally required for the event to function correctly.

Example:

```bash
npm run seed:demo -- --product orca
```

---

## 3. Pulse Only

Seed Pulse without requiring Orca or LR.

Pulse should still receive a coherent event, sessions, speakers, assignments, lifecycle data, signals, responses, actions, and intelligence.

Where possible, reuse/adapt the current proven Pulse demo seeding logic instead of replacing working richness.

Example:

```bash
npm run seed:demo -- --product pulse
```

---

# Lead Retrieval Modes

LR requires two first-class seed modes.

## LR Mode A — Direct Account

Represents the standard exhibitor/customer LR use case.

Structure:

```text
LR Account
 ├── Event 1
 ├── Event 2
 ├── Event 3
 └── Event N
```

Requirements:

- one LR customer/account by default
- configurable 1..N events
- realistic staff per event
- leads/scans
- qualifiers
- notes
- tags
- lead scoring/priority
- follow-up activity
- workflows
- CRM/export state if supported
- AI/post-show intelligence
- event-to-event historical variation

Illustrative command:

```bash
npm run seed:demo -- \
  --product lr \
  --lr-mode direct \
  --events 3
```

The framework should allow the count of direct LR accounts to be configurable if the current schema and product model support it cleanly, but the primary direct mode requirement is one customer account with one or multiple events.

---

## LR Mode B — Organizer

Represents an event organizer overseeing multiple participating LR companies/accounts.

Structure:

```text
Organizer
 └── Event
      ├── LR Company 1
      ├── LR Company 2
      ├── LR Company 3
      └── LR Company N
```

Requirements:

- one organizer
- 1..N events
- configurable LR companies per event
- each LR company behaves like a real exhibitor/account
- organizer can observe meaningful differences across participating companies

Illustrative command:

```bash
npm run seed:demo -- \
  --product lr \
  --lr-mode organizer \
  --events 1 \
  --lr-companies 20
```

Multi-event organizer scenario should also be supported:

```bash
npm run seed:demo -- \
  --product lr \
  --lr-mode organizer \
  --events 3 \
  --lr-companies 25
```

Clarify in implementation whether `--lr-companies` means per event or total. Prefer **per event** because it produces predictable scale.

---

# Attach Mode

The framework should be able to add a product to an already-existing canonical event without creating a duplicate event.

Examples:

- Orca event already exists → attach LR
- Orca event already exists → attach Pulse
- LR event already exists → attach Pulse where mappings permit
- seed an existing Platform event into one product

Illustrative interface:

```bash
npm run seed:demo -- \
  --product pulse \
  --existing-event <canonical-event-id>
```

The exact flag name can vary.

Attach mode must:

- verify the target event
- verify organization ownership
- reuse canonical mappings
- avoid duplicate identity/event records
- fail safely if the event cannot be verified

---

# Scenario Configuration

The framework should be configuration-driven.

Illustrative scenario:

```ts
{
  scenario: "enterprise-conference",

  products: ["orca", "lr", "pulse"],

  event: {
    count: 1,
    lifecycle: "POST"
  },

  lr: {
    mode: "organizer",
    companiesPerEvent: 20
  },

  scale: {
    attendees: 850,
    sessions: 24,
    speakers: 31,
    rooms: 8,
    pulseResponses: 650,
    pulseTranscripts: 220
  },

  richness: "SHOWCASE",

  randomSeed: 20260907
}
```

CLI values should override scenario defaults.

---

# Required Richness Levels

The framework should support three data-volume/content modes.

## SMOKE

Purpose:

- fast local development
- integration verification
- CI-compatible where appropriate

Characteristics:

- minimal but complete relationships
- small record count
- deterministic
- fast

---

## DEMO

Purpose:

- normal internal demos
- product review
- screenshots
- QA
- sales walkthroughs

Characteristics:

- realistic event
- rich enough to explore every important surface
- moderate volume
- AI/intelligence populated where supported
- meaningful variation

---

## SHOWCASE

Purpose:

- flagship sales demos
- investor/customer demonstrations
- full-platform showcase

Characteristics:

- large lived-in event
- deeper history
- richer AI outputs
- significant LR company variation
- strong Pulse lifecycle richness
- multiple intentional narrative threads
- enough data to make dashboards, trends, workflows, and intelligence feel alive

---

# Determinism

The seeder must support deterministic seeded randomness.

Given the same:

- scenario
- random seed
- event count
- company count
- richness
- relevant configuration

the framework should recreate the same logical demo world.

This matters for:

- screenshots
- reproducible QA
- expected-value tests
- demos
- debugging

Do not depend on unseeded `Math.random()` or equivalent for important generated content.

---

# Idempotency and Safety

The framework must be safe to rerun.

Required behavior:

- no accidental duplicate demo worlds
- generated records must be identifiable as belonging to a seed run/scenario
- reset/delete must target only generated demo data
- do not touch unrelated customer/user/event data
- refuse destructive operations if scope cannot be proven
- dry run mode before destructive reset if practical
- fail loudly on invalid cross-product mapping
- no silent re-parenting of existing production-like records

Support:

```text
create
rerun
reset
attach
dry-run
```

Exact CLI syntax can vary.

---

# Platform Core Requirements

The canonical seed path should establish, as required:

- organization
- organizer identity
- organization membership
- platform permissions
- event
- event ownership
- product entitlements
- product mappings
- cross-product canonical IDs
- any claims/session/auth metadata required for actual product launch behavior

Do not bypass product identity assumptions just to make seed rows appear.

If normal Platform → Product launch relies on canonical mappings, seeded demos should use those mappings.

---

# Orca Demo World

Orca establishes much of the operational event truth.

The seeded event should include realistic data across the supported Orca modules, including as applicable:

- event details
- organizers
- event team
- venue
- rooms
- sessions
- speakers
- run of show
- room set
- seating
- budget
- docs hub
- roadmap/timeline
- deadlines
- activity
- assignments
- notes
- dependencies
- completed work
- upcoming work
- overdue work
- operational changes
- issues needing attention

Do not create every possible row solely to inflate counts.

The goal is a believable event with meaningful density.

---

# Orca Narrative Requirements

The Orca event should have intentional operational stories, such as:

- room change due to demand
- late speaker asset
- sponsor deliverable due
- AV concern
- room-set change
- production dependency
- budget variance
- timeline risk
- completed critical deadline
- unresolved upcoming issue

These stories should propagate to other products where appropriate.

---

# LR Data Requirements

Each LR company/account should contain granular, varied, realistic data.

Where supported by the current product, seed:

- account/company
- event assignments
- booth staff
- staff roles
- leads
- scans
- timestamps
- scan sources
- notes
- tags
- custom qualifiers
- qualification values
- products/services of interest
- buying timeframe
- lead priority
- lead score
- hot/warm/cold classification
- owners
- follow-up state
- workflow state
- email/activity state
- CRM/export state
- post-show status
- AI summaries
- AI briefs
- recommended next actions

Use the real schema and current product capabilities. Do not invent unsupported features just because they are listed conceptually here.

---

# LR Company Variation

Companies must not all have the same distribution with different names.

Create differentiated profiles such as:

- high-volume / high-quality
- high-volume / low-quality
- low-volume / high-quality
- average
- understaffed booth
- excellent follow-up discipline
- poor follow-up discipline
- strong executive engagement
- mostly early-stage prospects
- concentrated product interest
- strong post-session traffic spike

Example company archetypes can include:

- SaaS
- enterprise technology
- consulting
- healthcare
- hardware
- recruiting
- analytics
- security
- services

The actual generated company names should feel plausible and polished.

---

# LR Organizer Intelligence

In organizer mode, underlying company data should produce meaningful organizer-level patterns.

Examples:

- highest lead volume
- highest qualified lead rate
- strongest decision-maker concentration
- weakest follow-up completion
- strongest staffing efficiency
- busiest scan windows
- most engaged booths
- company-level performance distribution

Do not hard-code organizer dashboard statements that contradict seeded rows.

---

# LR AI and Post-Show Briefs

AI-style demo content must be grounded in the seeded facts.

Bad:

> Acme had a successful event and generated lots of interest.

Good:

> Acme captured 114 leads, including 27 high-intent prospects. Interest peaked after the AI Infrastructure panel, with security and workflow automation appearing in 41% of qualified conversations. Eleven priority leads still have no assigned follow-up.

If the system stores generated intelligence, seed it from deterministic calculations over the generated data.

If the system normally derives intelligence at runtime, decide whether to:

- run the real derivation pipeline, or
- seed equivalent derived records

Choose the path that best matches production behavior.

---

# Pulse Requirements

Review the existing Pulse demo seeding implementation before replacing anything.

The desired outcome is to preserve or reuse the proven richness already present while moving it into the shared scenario framework.

Pulse data should include as supported:

- PRE signals
- DURING signals
- POST signals
- surveys
- survey assignments
- session ratings
- speaker ratings
- attendee comments
- voice responses
- transcripts
- text responses
- attendee questions
- topic clusters
- sentiment
- evidence
- actions
- follow-ups
- editorial intelligence
- lifecycle-aware analysis

Pulse must feel active and imperfect, not uniformly positive.

---

# Pulse Content Quality

Include believable attendee feedback and signal diversity, for example:

- highly rated keynote
- divisive panel
- crowded breakout
- AV issue
- room temperature complaint
- registration friction
- lunch line complaint
- sponsor praise
- requests for recordings
- repeated product/theme interest
- speaker-specific praise
- speaker-specific criticism
- recurring attendee questions

The derived Pulse intelligence must match the underlying seeded feedback.

---

# Lifecycle Integrity

The framework must understand event lifecycle.

Supported event lifecycle options should include at least:

- PRE
- DURING
- POST

Timestamps and generated content must make temporal sense.

Examples:

- PRE responses must not occur after the event begins
- DURING signals should align to event dates/times
- POST summaries should not predate event completion
- post-show LR workflows should occur after relevant lead capture
- deadlines and run-of-show items should align with event schedule

---

# Cross-Product Narratives

SHOWCASE scenarios should include intentional cross-product narrative threads.

Target approximately 8–12 strong threads for the flagship event.

Examples:

## Narrative 1 — High-demand AI session

Orca:
- session moved to larger room
- room-set task updated
- production dependency adjusted

Pulse:
- session becomes highly rated
- attendee questions cluster around AI governance

LR:
- AI/security exhibitors see a lead spike following the session

## Narrative 2 — Operational friction

Orca:
- registration staffing issue logged

Pulse:
- PRE/DURING attendee comments mention check-in delays

LR:
- morning booth traffic starts later than expected

Narratives should arise from the same event-world facts wherever possible.

---

# Suggested Repository Structure

Adapt to the actual monorepo/repository structure after inspection.

Preferred conceptual organization:

```text
demo-seeding/
  scenarios/
    enterprise-conference.ts
    association-meeting.ts
    product-launch.ts

  world/
    event-world.ts
    types.ts
    random.ts

  generators/
    people.ts
    companies.ts
    venues.ts
    sessions.ts
    speakers.ts
    attendees.ts
    narratives.ts
    content.ts

  products/
    platform.ts
    orca.ts
    lead-retrieval.ts
    pulse.ts

  intelligence/
    lr-briefs.ts
    pulse-signals.ts
    cross-product.ts

  validation/
    platform.ts
    orca.ts
    lead-retrieval.ts
    pulse.ts
    cross-product.ts

  cli/
    args.ts
    commands.ts

  cli.ts
```

Do not force this exact path if the existing repository has a better established convention.

---

# CLI Capability Matrix

The final implementation should support the equivalent of:

| Mode | Expected Result |
|---|---|
| all | Platform + Orca + LR + Pulse |
| orca | Orca event |
| pulse | Pulse event |
| lr direct | one LR account, 1..N events |
| lr organizer | one organizer, 1..N events, N LR companies/event |
| attach | attach one selected product to existing event |
| reset | safely remove seeded scenario |
| rerun | deterministically recreate seeded scenario |
| dry-run | show intended scope without mutation |

---

# Configuration Priority

Recommended precedence:

```text
CLI overrides
    ↓
Scenario configuration
    ↓
Richness defaults
    ↓
Framework defaults
```

Reject incompatible combinations instead of guessing.

Examples:

- `--lr-companies` with `--lr-mode direct` may be invalid depending on final semantics
- `--existing-event` plus `--events 4` may be invalid
- attaching Orca to an event belonging to another organization should fail

---

# Data Quality Bar

Do not ship demo data with:

- Lorem ipsum
- `Test User 1`
- `Demo Company 4`
- `Session 12`
- repeated identical notes
- generic AI summaries
- impossible timestamps
- orphaned records
- identical company performance curves
- uniformly positive feedback
- random IDs that break canonical mapping
- duplicate events after reruns

Names, descriptions, notes, sessions, companies, and AI copy should be polished enough for customer-facing demos.

---

# Validation

At the end of every run, verify as applicable:

## Platform

- organization exists
- organizer exists
- membership is correct
- event exists
- ownership is correct
- product entitlements exist
- canonical product mappings exist

## Orca

- expected modules seeded
- sessions/speakers/rooms reference valid event data
- no orphan rows
- operational dates/times make sense

## LR

- correct mode
- expected event count
- expected company/account count
- staff linked correctly
- leads linked correctly
- qualifiers/notes/workflows consistent
- AI briefs grounded in generated facts

## Pulse

- lifecycle counts valid
- assignments valid
- session/speaker targets valid
- transcript/response timing valid
- signal/intelligence content grounded in generated inputs

## Cross Product

- canonical event IDs line up
- organizer identity lines up
- shared sessions/speakers line up where integration requires them
- scenario narrative references are internally consistent

---

# Seed Completion Report

Every run should finish with a readable report.

Example:

```text
SignalThread Future of Events Summit 2026
Scenario: enterprise-conference
Richness: SHOWCASE
Seed: 20260907

Platform
✓ organization
✓ organizer
✓ event
✓ product entitlements
✓ product mappings

Orca
✓ 24 sessions
✓ 31 speakers
✓ 8 rooms
✓ 67 run-of-show items
✓ 94 deadlines
✓ 22 roadmap items
...

Lead Retrieval
Mode: organizer
✓ 18 LR companies
✓ 73 booth staff
✓ 1,487 leads
✓ 462 qualified leads
✓ 18 post-show briefs
✓ 74 active/completed workflows
...

Pulse
✓ 658 responses
✓ 221 transcripts
✓ PRE / DURING / POST signal coverage
✓ 24 session assignments
✓ 19 actions
...

Validation
✓ no orphaned records
✓ canonical mappings valid
✓ lifecycle timestamps valid
✓ AI brief source metrics valid
```

A JSON output option is also desirable for automation/tests.

---

# Testing Expectations

The framework should have real tests around critical guarantees.

At minimum:

- deterministic generation
- CLI parsing/validation
- LR direct mode
- LR organizer mode
- configurable company count
- configurable event count
- single-product generation
- all-product generation
- attach behavior
- reset safety
- idempotent rerun
- lifecycle timestamp boundaries
- canonical mapping validation
- derived LR brief math
- cross-product validation

Prefer focused unit/integration tests over enormous snapshot fixtures.

---

# Implementation Strategy

Build in six loops:

1. framework + scenario contract
2. Orca event-world adapter
3. LR direct + organizer adapters
4. LR intelligence/post-show richness
5. Pulse adaptation and lifecycle richness
6. cross-product narratives, verification, reporting, hardening

Do not begin by writing large amounts of seed content before Loop 1 establishes the reusable contract.

---

# Definition of Done

The project is complete when:

1. A developer can seed all enabled SignalThread products in one command.
2. A developer can seed Orca, Pulse, or LR independently.
3. LR supports:
   - direct account mode
   - 1 account with 1..N events
   - organizer mode
   - 1 organizer with 1..N events
   - configurable LR companies per event
4. The same framework can attach a product to an existing canonical event.
5. Runs are deterministic and safe to repeat/reset.
6. Pulse retains or improves the richness of the current demo seeding behavior.
7. LR contains granular leads, staff, qualifiers, workflows, follow-up state, AI briefs, and post-show intelligence where supported.
8. Orca contains a believable operational event.
9. Cross-product demos tell coherent stories.
10. Generated intelligence is grounded in underlying seeded facts.
11. Demo data is polished enough for live customer-facing use.
12. The framework is documented and covered by meaningful validation/tests.

This should become the canonical SignalThread demo-data platform, not another temporary seed script.
