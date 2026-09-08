# SignalThread Lead Retrieval — Current State and Next Work

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence for local branch/commit/code state and the inspected production web revision. Applied migrations, production data quality, provider credentials, feature configuration values, and deployed mobile binary remain explicitly unverified.

## Repository state at investigation start

| Repo | Branch | HEAD/origin | Initial state |
|---|---|---|---|
| Web/backend | `main` | `9424f11` — Fix mobile Google OAuth browser handoff | Clean |
| Mobile | `main` | `7ad37f1` — Test mobile Google OAuth browser handoff | Clean |

This task adds documentation only under `WEB/docs/context/`; it does not modify mobile.

## Verified deployment state

- Production: `https://lr.signalthread.ai`.
- Vercel source: GitHub `akamyab12/LR_Admin`, branch `main`.
- Inspected deployed commit: `9424f11`.
- Build completed successfully and reported 208 routes/pages.

This proves source/build parity at inspection time, not database/provider/authenticated-flow health.

## Current implemented state

### Web/backend

- Platform/organizer/exhibitor role surfaces and company/event authorization.
- Event workspaces, leads/detail, imports, enrichment, priority, briefings, conversation intelligence, dashboards.
- Team, invite, license, seat, event-access, integration, and settings administration.
- Campaign agents, campaigns, documents, templates, and workflows.
- Conversation/voice-note processing/readiness/failure/reconciliation paths.
- User-owned Google Workspace connection, Gmail send, availability, meetings.
- Secure mobile OAuth bridge.
- Canonical lead follow-up and optional private Calendar reminder.

### Mobile

- Supabase auth and active company/event context.
- QR/card/manual lead capture.
- SQLite/outbox offline persistence, retry, reconciliation, ownership controls.
- Leads/detail/priority and conversation/briefing status.
- Google connection, email, meetings, and follow-up through server contracts.
- Vitest/unit and Maestro test infrastructure.

## Migration position

- Web repository migrations extend through `0096_lead_follow_up_idempotency.sql`.
- Relevant Google/follow-up cluster is `0091`–`0096`.
- Mobile contains historical cloud migrations through `0014` and current on-device SQLite code.
- Exact applied production migration history is **unknown**.

Before a schema-dependent release: run read-only remote status, compare IDs, inspect generated types, use the approved apply workflow, regenerate types, and test schema/RLS.

## Recently resolved issues requiring live confirmation

| Issue | Code fix | Manual confirmation still valuable |
|---|---|---|
| Browser OAuth launch returned Unauthorized after successful 201 | `9424f11` / mobile `7ad37f1` | Device disconnect/connect, Google consent, Expo return, one-time ticket reuse denial |
| Invalid Google credentials returned generic 502; disconnect depended on revocation | `a934450` | 409 `reconnect_required`, Gmail suppression, local disconnect with revocation pending |
| Rich intelligence disappeared while counts remained | `e4f422c` | Known production record DB → read model → payload → UI comparison |
| Gmail body sparse/truncated and retry ambiguous | `304bf2e` | Send canary message and inspect actual Gmail Sent MIME/body |
| Meeting date/time/availability/popover/success UX | current scheduler code/tests | 2:30 PM check, no earlier slots, create and inspect confirmation/event |
| Unified follow-up/private reminder | `0718e71` | Create/edit/complete/clear with and without provider reminder |

## Known open risks and debt

### Documentation drift

- Older web summaries call offline mobile planned or connectivity-dependent.
- README role examples use historical names.
- Mobile architecture doc predates Google Email & Calendar/follow-up work.
- Product naming is inconsistent.

### Test confidence gaps

- Some web tests inspect source contracts or use fake databases/providers.
- Live browser middleware, RLS, Google consent, Gmail Sent, Calendar, and device deep links need separate evidence.
- Route presence can overstate provider maturity.

### Middleware deprecation

Next.js 16 warns about moving from `middleware.ts` to the proxy convention. It is not a current build failure. A migration must preserve exact bearer/session/public/OAuth/health/static policy.

### Authorization complexity

Historical/current roles, membership, license eligibility, seats, event assignment, and access mode coexist. This remains a high-risk refactor area.

### Conversation processing

Failed/stale states and reconciliation exist. Previously observed failed records were not reprocessed by the read-path fix. Current count and retry safety need fresh read-only inspection.

### Commercial/product uncertainty

- Provider-neutral architecture has only Google active.
- Lifecycle dashboards exist, but account-wide ROI/renewal outcomes are not proven.
- Pricing, packaging, customer results, and retention policy are not repository facts.

## Exact QA backlog

### Google mobile loop

1. Sign in as an app-entitled canary user.
2. Disconnect and confirm local disconnected status even if revocation is pending.
3. Start OAuth; inspect 201 launch URL contains a ticket and no bearer.
4. Open without browser session; reach Google consent.
5. Complete consent and return to Expo with safe status.
6. Confirm connected capabilities and reject launch-ticket reuse.
7. Send a lead email; inspect the actual Gmail Sent complete formatted body.
8. Schedule a 2:30 PM meeting; confirm suggestions are 2:30 PM or later and inspect Calendar/confirmation.
9. Create/edit/complete/clear follow-up with and without a private reminder.

### Intelligence

1. Select a known event/company/lead with rich data.
2. Record direct production counts/content read-only.
3. Run canonical read model under identical scope.
4. Compare server/API payload and rendered detail/dashboard.
5. Verify needs, messaging, objections, competitors, evidence, and briefings.
6. Classify failed processing rows before considering retry.

### Offline capture

1. Capture offline with context.
2. Kill and relaunch.
3. Confirm local detail/outbox survives.
4. Reconnect.
5. Confirm exactly one cloud lead with correct company/event/owner and secondary upload outcome.

## Prioritized next work

### P0 — Verify current production contracts

- Complete Google OAuth/email/calendar/follow-up canary against deployed `9424f11` ancestry.
- Audit applied migrations `0091`–`0096` read-only.
- Verify canonical intelligence read model on known rich production records and classify current failed-processing rows.

### P1 — Eliminate false sources of truth

- Update or point older summaries to this package.
- Select canonical product name and role vocabulary.
- Label prototypes, demo seeds, historical audits, and unverified provider surfaces unmistakably.

### P1 — Strengthen real-flow coverage

- Add authenticated runtime/browser tests where source-contract tests dominate.
- Maintain a safe Google canary checklist and provider capability matrix.
- Verify iOS and Android OAuth deep linking through Maestro/manual device tests.
- Add repeatable production read-path diagnostics without exposing customer data.

### P2 — Reduce architecture risk

- Plan middleware-to-proxy migration with policy parity tests.
- Automate migration drift reporting and generated-type refresh checks.
- Formalize processing failure categories, retry eligibility, and operator tooling.
- Review incomplete provider adapters and accurately disable/label unsupported capability.

### P3 — Resolve product/commercial unknowns

- Approve pricing/packaging and entitlement mapping.
- Approve product naming and claims.
- Establish measured pilot success criteria and customer-reference policy.
- Publish privacy, consent, retention, support, and provider-dependency positions.

## Blockers requiring authority or external state

- Production database inspection requires approved credentials and a read-only workflow.
- Real Google validation requires a safe connected canary account/device.
- Mobile deployment parity requires Expo/EAS/store metadata.
- Pricing, customer outcomes, and policy claims require product/business/legal owners.

## Definition of a safe next handoff

The next agent should record branch/HEAD/status, choose one P0 flow, inspect current code and history, use read-only production checks first, add deterministic regression coverage, fix only the first failing canonical layer, run non-watch validation, and report manual gaps without committing or deploying unless explicitly asked.

## Related context

- [Master project context](./MASTER_PROJECT_CONTEXT.md)
- [Decision and incident history](./DECISION_AND_INCIDENT_HISTORY.md)
- [Agent operating rules](./AGENT_OPERATING_RULES.md)
- [Context gaps and verification](./CONTEXT_GAPS_AND_VERIFICATION.md)

