# Event Workspace demo seed

## Purpose

`demo:event-workspace` loads deterministic, connected demo records into one existing event so the lifecycle-aware Event Workspace can show meaningful Live or Post-Event data. It writes canonical source records only:

- `leads` for lead totals, priority/temperature, owners, lifecycle status, and follow-up dates;
- `lead_conversations` for analyzed conversation summaries, topics, objections, competitors, buying signals, rep patterns, and evidence drill-down;
- `lead_briefings` for generated and approved brief counts.

It does not change the event, create auth users, alter memberships/roles/licenses/invitations, run migrations, call AI or enrichment services, or insert dashboard aggregates.

## Supported scenarios

- `live`: 30 leads created on the current UTC day, with 38 analyzed conversations and 12 briefs (eight approved). The canonical conversation records populate five varied attendee needs, four objections, four competitors (Cvent, Bizzabo, Whova, and Swapcard), and four evidence-backed buying-signal messaging rows. It also includes eight hot leads awaiting follow-up, three due today, and three overdue open follow-ups.
- `post`: the original 24 leads and 26 conversations, reconciled into a completed-event-style timestamp and follow-up distribution, with final themes, buying signals, objections, competitors, coaching/messaging patterns, and campaign-ready hot cohorts.

The Live scenario extends the shared deterministic identity range with six Live-only leads and 12 Live-only conversations. Reset always covers the full owned identity range. To change a demo event between Live and Post datasets, reset it first; this preserves the seed's conservative dependency-safe deletion policy. An Upcoming scenario can be added as another scenario builder without changing cleanup.

## Prerequisites

- An existing event UUID and its canonical company relationship.
- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`, supplied by the environment or `.env.local`.
- Existing active `event_users` relationships for realistic lead owners. The script never creates users; with fewer than four valid reps it reuses those available and prints a warning. With none, owner IDs remain null.
- Event dates/status should match the requested scenario. Dates are never changed. Apply mode requires `--allow-lifecycle-mismatch` when the mismatch is intentional.

The Event Workspace uses UTC calendar-day boundaries because `events` has no timezone column. Live records are anchored to the current UTC day; Post records use the event end date when available.

## Local usage

Preview without writes:

```bash
npm run demo:event-workspace -- \
  --event-id <event-uuid> \
  --scenario live \
  --dry-run
```

Apply Live data to a verified local Supabase instance:

```bash
npm run demo:event-workspace -- \
  --event-id <event-uuid> \
  --scenario live \
  --apply
```

Apply Post-Event data:

```bash
npm run demo:event-workspace -- \
  --event-id <event-uuid> \
  --scenario post \
  --apply
```

Remove only this script's records:

```bash
npm run demo:event-workspace -- \
  --event-id <event-uuid> \
  --reset \
  --apply
```

Dry-run also works with `--reset` to show what would be deleted.

## Remote demo-account safeguards

Non-local writes are disabled unless every safeguard is present:

- `--allow-remote`
- `--apply`
- `--company-id <expected-company-uuid>`
- `--confirm-event "<exact event name>"`
- `DEMO_SEED_ALLOWED_COMPANY_IDS`, a comma-separated allowlist containing that company UUID
- valid Supabase URL and service-role credentials

The script loads the event first, verifies event/company scope and the exact case-sensitive event name, verifies the allowlist, and prints the Supabase host, company, event, and scenario before writing.

Future approved remote-demo template:

```bash
DEMO_SEED_ALLOWED_COMPANY_IDS=<company-uuid> \
npm run demo:event-workspace -- \
  --event-id <event-uuid> \
  --scenario live \
  --apply \
  --allow-remote \
  --company-id <company-uuid> \
  --confirm-event "<exact event name>"
```

Add `--allow-lifecycle-mismatch` only when the loaded event lifecycle intentionally differs from the scenario. Remote dry-runs perform reads but no writes and do not bypass missing credentials.

## Idempotency and reset safety

Lead, conversation, and brief UUIDs are deterministic per event. Seeded leads also carry a private `metadata.demo_seed` marker containing the seed system, version, event, company, scenario, and logical key.

Before apply or reset, the script loads every deterministic ID and refuses to proceed if:

- a lead at that ID lacks the expected marker;
- the marker's event/company scope differs;
- a deterministic conversation or brief points outside the expected seeded lead set.

Apply compares the controlled canonical fields and reports created, updated, and unchanged rows. Partial runs reconcile on retry. Reset deletes briefs, then conversations, then verified seeded leads. Records outside the deterministic IDs are never selected or deleted.

Before reset, the script also checks canonical lead-dependent tables (campaign recipients, workflows/drafts, enrichment, document sends, readiness, voice notes, cumulative insights, and import linkage). It refuses reset if deleting a seeded lead would cascade-delete or null a record the seed did not create.

## Seeded content

The fixtures exercise recurring, evidence-backed examples around:

- SSO/SAML provisioning;
- migration planning and implementation risk;
- lead-retrieval accuracy;
- enterprise deployment pricing;
- onsite badge printing and reliability;
- buying-signal messaging around ROI/pipeline attribution, migration support and speed, lead-capture accuracy, and native lead retrieval;
- competitive evaluation against Cvent, Bizzabo, Whova, and Swapcard;
- concrete positive buying signals and supported follow-up actions;
- two recurring rep patterns based on persisted `rep_behavior_patterns`.

Evidence is not a separate table: the Event Workspace derives each evidence item from the exact supporting `lead_conversations` row and its lead relationship.

## Limitations

- There is no canonical meeting, revenue, pipeline-attribution, coaching-score, or contacted/uncontacted field, so the script does not fabricate them.
- Closed lead status is used only as the existing completed lifecycle state; the workspace does not expose a separate completed-follow-up metric.
- Live “Messaging appearing in buying signals” is represented honestly as recurring persisted `buying_signals`, not a score, benchmark, or inferred sentiment.
- Pending workflow drafts are not seeded because canonical `generated_drafts` require real workflow runs and step runs.
- Placeholder `storage_path` values identify text fixtures; no audio object is uploaded and no processing pipeline is invoked.

## Verify the Event Workspace

After apply, open:

```text
/exhibitor/dashboard?eventId=<event-uuid>
```

For Live, verify today's KPIs, the follow-up-status summary, recurring attendee needs, objections, competitors, buying-signal messaging, and evidence drawers. For Post, verify final lead distribution, follow-up readiness, final themes/buying signals/objections/competitors, team patterns, executive snapshot, and lead/campaign actions.

The command summary reports event, company, environment, scenario, lifecycle, planned record counts, reused reps, created/updated/unchanged/deleted totals, warnings, and the canonical route.
