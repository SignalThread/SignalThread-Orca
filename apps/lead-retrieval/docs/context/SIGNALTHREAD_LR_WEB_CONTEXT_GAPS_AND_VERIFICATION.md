# SignalThread Lead Retrieval — Context Gaps and Verification Ledger

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence in the listed repository/deployment observations and contradictions. Items marked unknown were deliberately not guessed. No destructive production operation, migration, seed, reconciliation, or reprocessing was performed.

## What this investigation verified

- Both repository identities, branches, HEADs, and clean starting state.
- Current web and mobile framework/package manifests.
- Principal UI, route, service, authorization, integration, migration, local-database, synchronization, and test structures.
- Recent incident/feature history for offline mobile, lifecycle workspace, Google Workspace, mobile OAuth, Gmail, follow-ups, connection semantics, and intelligence read paths.
- Current production web deployment source revision (`9424f11`) and successful Vercel build metadata.
- Eight documentation files were created under `WEB/docs/context/` only.

## What remains unverified

| Unknown | Why it matters | Safest verification |
|---|---|---|
| Applied production Supabase migration history | Repository schema may be ahead of production | Run read-only linked migration status and compare IDs `0091`–`0096` |
| Exact production RLS definitions | A repository policy may not be applied | Export/inspect policy metadata read-only and compare to migrations |
| Production intelligence row health | Rich data/read-path fix may still face tenant-specific data issues | Query known event/company/lead counts read-only, then compare canonical read model and UI |
| Current nine failed-processing records | Count, category, and retry safety may have changed | Read-only stage/error classification; prove idempotency before retry |
| Live Google credential/provider state | Build and tests cannot prove an account token is valid | Use an approved canary user and safe manual OAuth/email/calendar checklist |
| Mobile binary deployed to testers/stores | Git `main` does not identify installed app version | Compare Expo/EAS build metadata, runtime version, and embedded commit/version |
| Pricing and packaging | License schema is not a commercial price book | Obtain owner-approved tiers, currency, billing unit, discounts, and contract terms |
| Customer outcomes and ROI | Seeded/demo data cannot support outcome claims | Use approved customer references and measured, consented evidence |
| Data retention/consent policy | Technical storage paths do not define legal policy | Obtain approved privacy/security/retention documentation |
| Provider maturity beyond Google | Routes and settings can overstate operational completeness | Maintain a provider capability matrix with live sandbox tests |

## Important contradictions

### 1. Offline mobile: planned versus implemented

Older web summaries describe offline SQLite/sync as planned or say mobile depends on connectivity. Current mobile code contains SQLite storage, an outbox, retry/reconciliation, local ownership boundaries, and tests. Current code is authoritative: offline-first is implemented, though production/device QA remains necessary.

### 2. Role names in setup docs versus runtime normalization

Some README/setup material uses `organizer` and `exhibitor`. Runtime normalization uses `platform_admin`, `organizer_admin`, `exhibitor_admin`, `exhibitor_viewer`, and `viewer`, with selected historical aliases normalized. Never build new authorization directly from the old examples.

### 3. Mobile architecture document versus current application

`MOBILE/docs/APP_ARCHITECTURE.md` was last verified 2026-03-07 and predates the current Email & Calendar, OAuth bridge, follow-up, and later reliability work. It is historical, not a complete map.

### 4. Historical product names versus current brand

Lead Intel, Lead Retrieval, Lead Intel Admin, SignalThread LR, and SignalThread Lead Retrieval all appear. Treat SignalThread Lead Retrieval as the working package name until product ownership selects one canonical external name.

### 5. Provider-neutral interfaces versus provider availability

The mobile/server contracts are intentionally provider-neutral. That is an architectural property, not proof of multi-provider support. Google Workspace is active; Microsoft/Outlook is not implemented.

### 6. “Direct customer” versus application role

Direct-customer workflows exist as account/event portfolio behavior. There is no distinct `direct_customer` normalized application role. Access derives from company membership, role, license, and event scope.

### 7. Route/settings presence versus integration maturity

An integration card, API route, environment variable, or provider adapter does not prove production readiness. CRM/enrichment/automation surfaces have mixed maturity and require a capability matrix.

### 8. Lifecycle/ROI narrative versus proven commercial outcome

The lifecycle workspace and intelligence dashboards are implemented. Claims about renewal lift, ROI, or proven revenue outcomes are not supported by approved evidence in the repositories.

### 9. “Journey” tests versus real end-to-end evidence

Some suites are source-contract or fake-DB/provider tests. They can verify invariants while still missing browser cookies, deployed middleware, RLS, real OAuth, Gmail Sent MIME, Calendar payloads, or device deep linking.

### 10. Duplicate migration histories versus schema authority

Mobile contains historical Supabase migration material, while web/backend contains the current canonical cloud migration series. On-device SQLite lives in mobile. Do not independently evolve cloud schema from both repositories.

## The ten facts a future agent is most likely to get wrong

1. **Offline capture is already implemented.** It is not merely a roadmap item.
2. **Web/backend owns canonical cloud business logic and schema.** Mobile owns the device cache/outbox and consumes server contracts.
3. **Google connections are user-owned.** They are not a single shared company credential.
4. **The mobile OAuth browser launch must work without cookies or Authorization.** Its signed, expiring, single-use ticket is the authentication mechanism.
5. **Provider-neutral does not mean Outlook exists.** Google is the only active Email & Calendar provider.
6. **A direct customer is not a normalized role.** Authorization still composes membership, role, license, event access mode, and resource scope.
7. **Follow-up Calendar reminders are private.** They do not invite the lead or create conferencing, and LR persistence survives provider failure.
8. **Migration files do not prove production schema.** Applied migration history must be checked separately.
9. **Rich conversation intelligence has a canonical read model.** A thin legacy summary is a fallback symptom, not an equivalent source.
10. **Repository demos, seeds, audits, and license fields are not pricing or customer proof.** Do not convert them into external claims.

## Verification matrix for future changes

| Area | Automated minimum | Manual/live minimum |
|---|---|---|
| Auth/RBAC | scoped allow/deny tests, historical-role normalization, RLS/service-role predicates | test two tenants and event access modes with safe users |
| Mobile offline | local DB/outbox/retry/idempotency tests | offline capture, kill/relaunch, reconnect, duplicate avoidance |
| OAuth bridge | issue/launch/callback, expiry, mismatch, consume-once, middleware parity | device Safari/Chrome consent and Expo return |
| Gmail | complete body generation, MIME preservation, idempotency, reconnect suppression | inspect actual Gmail Sent body and formatting |
| Calendar meeting | slot boundaries, timezone, provider payload, idempotency | schedule afternoon slot and inspect event/confirmation |
| Follow-up | create/update/complete/clear, partial failure, reminder create/update/delete | exercise UI with and without reminder; inspect private event |
| Intelligence | DB fixture → read model → route/page aggregation | compare known production rows, payload, and rendered cards read-only |
| Import/publish | parsing, ownership, approval, idempotent publish | sanitized representative file through full flow |
| Workflows | trigger/step/wait/approval/retry tests | controlled workflow with safe integration sandbox |
| Migration | SQL/schema/type/RLS tests, drift check | read-only remote status before approved apply |

## Safe production verification order

1. Record deployed commit and relevant feature flags/config names without exposing values.
2. Confirm the user's company, event, role, license, and membership scope.
3. Read underlying rows/counts without mutation.
4. Invoke the canonical service/read model in the same scope.
5. Inspect the API/server-component payload.
6. Inspect rendered UI or device state.
7. Classify the first layer where correct data changes or disappears.
8. Add a deterministic regression test.
9. Fix the canonical path.
10. Reprocess or mutate production data only if independently proven necessary, safe, authorized, and idempotent.

## Documentation maintenance triggers

Update this package when any of the following changes:

- canonical product name or approved commercial model;
- role vocabulary, access-mode semantics, license/seat behavior, or RLS architecture;
- cloud schema authority or repository split;
- mobile local schema/outbox behavior;
- active provider list or OAuth architecture;
- canonical conversation intelligence model;
- deployment platform or production host;
- a material production incident establishes a new guardrail.

At minimum, refresh the status date, current commits/deployment, contradiction ledger, migration uncertainty, and next-work priorities.

## Package validation checklist

- [x] All eight required Markdown files exist.
- [x] Every file contains a dated source-confidence note.
- [x] Relative Markdown links resolve.
- [x] Repository paths referenced as sources exist or are explicitly described as patterns.
- [x] No secret values, access tokens, refresh tokens, cookies, or authorization codes are included.
- [x] Only documentation files changed.
- [x] `git diff --check` passes.
- [x] Final repository status is reported without committing or pushing.

## Related package files

- [Master project context](./MASTER_PROJECT_CONTEXT.md)
- [Product and commercial context](./PRODUCT_AND_COMMERCIAL_CONTEXT.md)
- [System architecture and data](./SYSTEM_ARCHITECTURE_AND_DATA.md)
- [Decision and incident history](./DECISION_AND_INCIDENT_HISTORY.md)
- [Current state and next work](./CURRENT_STATE_AND_NEXT_WORK.md)
- [Agent operating rules](./AGENT_OPERATING_RULES.md)
- [Context source index](./CONTEXT_SOURCE_INDEX.md)
