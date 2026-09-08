# SignalThread Lead Retrieval — Decision and Incident History

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence for decisions tied to current code, tests, user requirements, and named commits. Dates identify repository/task chronology, not necessarily public release dates. Production symptoms supplied during recent work are preserved without exposing tenant secrets.

## Why this file exists

Many current invariants were established by production failures. Future changes should preserve the reason behind the fix, not merely its final shape.

## Timeline

### Offline mobile became an implemented architecture

**Trigger:** Event connectivity cannot be assumed, and capture must survive app restarts and retries.

**Decision:** Mobile owns SQLite persistence and a durable outbox; web/backend remains canonical cloud authority. Stable identities and idempotent mutations reconcile local work.

**Guardrails:** Scope local rows to user/company/event, retain pending work, test kill/relaunch and reconnect, and avoid duplicate primary records when secondary uploads retry.

**Documentation debt:** Older web summaries still describe this as planned.

### Company/event access was centralized

**Trigger:** Historical role literals, licenses, memberships, event assignments, and access modes created inconsistent authorization risks.

**Decision:** Normalize roles and use canonical company/event and exhibitor-permission services. Treat app entitlement, membership, event access, and admin ability as distinct checks.

**Guardrails:** No ad hoc role string checks; service-role queries retain explicit tenant predicates; test cross-company/event denial.

### Conversation intelligence required a canonical read model

**Trigger:** Multiple conversation artifacts and fallback summaries made it easy for screens to return inconsistent richness.

**Decision:** Assemble transcript/summary/briefing/evidence/themes and related intelligence through a scoped canonical read model.

**Guardrails:** Trace DB → read model → payload → UI. Do not reprocess or overwrite data before proving it is missing.

### Lifecycle event workspace replaced fragmented navigation (`0a64fe2`)

**Trigger:** Event work was spread across surfaces without a coherent portfolio/workspace view.

**Decision:** Introduce lifecycle/event workspace navigation and connected operational/intelligence panels.

**Guardrails:** Preserve event/company scope and do not treat dashboard presence as proof every underlying metric is mature.

### Workflow automation was separated from personal actions

**Trigger:** Campaign agents, signals, waits/approvals, and integrations need durable orchestration, while a rep's email/follow-up remains a direct action.

**Decision:** Keep canonical workflow execution distinct from one-to-one Gmail, meeting scheduling, and lead follow-up.

**Guardrails:** Do not add tracking/bulk behavior to personal Gmail or turn follow-up into a general task system.

### Google Workspace foundation (`e19db84`)

**Trigger:** Reps needed acting-user Gmail and Calendar capabilities.

**Decision:** Store encrypted user-owned Google connections and reuse canonical token, Gmail, and Calendar clients.

**Guardrails:** Never duplicate OAuth/token logic, never expose tokens, and preserve ownership scope.

### Secure provider-neutral mobile OAuth bridge (`026c235`)

**Trigger:** Mobile needs provider consent in a browser without placing its bearer in a browser URL.

**Decision:** Authenticated mobile POST issues a signed, expiring, single-use launch ticket bound to user/company/provider. Browser launch validates/consumes it and redirects to the provider. Contracts are provider-neutral; Google is the active adapter.

**Guardrails:** No bearer in URL, validate expiry/signature/binding/one-time use, and callback exposes only safe Expo status.

### Gmail body and retry reliability (`304bf2e`)

**Production symptom:** Gmail Sent showed only a sparse greeting and retries risked ambiguous provider state.

**Root concern:** The complete path—editable composer default through canonical MIME serialization and final provider payload—had to be audited; presentation fixes could not mask serialization defects.

**Decision:** Generate a complete editable follow-up from real available context, preserve text line breaks/minimal HTML through the canonical MIME architecture, and retain idempotent retry protection.

**Guardrails:** No duplicate composer/send service, no fabricated conversation content, no tracking pixels/bulk behavior, inspect actual Gmail Sent in manual QA.

### Meeting scheduler UX and canonical slot boundaries

**Symptoms:** Mint availability styling remained after success; availability ignored an afternoon start; native date/time controls overflowed the modal.

**Decisions:**

- availability slots start no earlier than selected RFC3339 date/time;
- time/date changes clear stale results;
- no remaining slots produces an empty state, not morning fallback;
- day navigation preserves valid time-of-day;
- use product date/time popovers with accessible dismissal/collision behavior;
- post-create scheduler body becomes a clean confirmation state.

**Guardrails:** Fix canonical slot generation, not filtered UI; preserve FreeBusy, timezone, invitation, meeting, loading, error, and persistence behavior.

### Canonical lead follow-up and private reminder (`0718e71`)

**Trigger:** Separate “Follow-up” and “Set date” controls fragmented one workflow, and mobile needed the same backend contract.

**Decision:** Store follow-up fields on `leads`, derive compatibility date from intended timezone, and centralize create/update/complete/clear in one server service. Optionally synchronize a private Google Calendar reminder.

**Guardrails:** LR mutation first; Calendar failure returns partial success; no lead attendee; no Meet; update existing event; complete/clear attempts delete; idempotent retries; no separate task table.

### Production disconnect and credential semantics (`a934450`)

**Production evidence:** Disconnect and Gmail returned generic 502 behavior while status could still report connected.

**Root cause class:** Remote revocation/token-acquisition failure was being treated as a blocker or generic provider outage rather than lifecycle state.

**Decision:** Local disconnect succeeds even when Google revocation is unconfirmed, returning disconnected plus revocation-pending semantics. Invalid/revoked refresh credentials become `reconnect_required`, and Gmail is not called.

**Guardrails:** Preserve encrypted storage and audit-safe errors; never return provider tokens/raw failures.

### Intelligence dashboards lost rich data (`e4f422c`)

**Production symptom:** Counts remained, intelligence panels were empty, processing attention showed failures, and lead detail used a thin legacy summary.

**Root cause class:** Valid rich data disappeared at the read/aggregation path rather than being proven deleted.

**Decision:** Restore the canonical scoped conversation-intelligence read path and regression coverage instead of reseeding/reprocessing.

**Guardrails:** Compare direct rows, service output, payload, and UI; classify failed records before retry. The previously observed nine failures were not automatically reprocessed.

### Mobile auth/session hardening

**Trigger:** Mobile bearer resolution, company/event changes, device persistence, and sign-out can race with local state and protected requests.

**Decision:** Centralize session/context resolution, serialize sensitive transitions, and scope caches/outbox to the active identity.

**Guardrails:** Do not hide lock/session problems with blind retries; prevent cross-user cache visibility; test expired sessions and user switching.

### Browser-launch handoff production failure (`9424f11`, mobile `7ad37f1`)

**Production sequence:** Mobile disconnect returned 200; status became disconnected; authenticated OAuth POST returned 201; iPhone opened the URL; browser displayed `{"error":"Unauthorized"}`.

**Exact failure boundary:** Ticket creation succeeded. Generic API authentication policy intercepted the browser launch, which intentionally had no cookie/bearer.

**Decision:** Exclude only the launch path from generic auth interception, then make possession of a valid bound ticket the route authentication mechanism. Mobile opens the exact returned URL.

**Tests/guardrails:** 201 contract; cookie/header-free GET redirects; missing/expired/malformed/consumed/mismatched tickets fail; middleware policy test; safe callback status; no bearer in launch URL.

### Provider canaries and production parity

**Trigger:** Unit/source-contract tests and successful builds do not establish real provider or deployment behavior.

**Decision:** Pair deterministic tests with safe sandbox/manual canaries and record deployed commit.

**Guardrails:** No customer-data destructive probes, no raw provider output in logs, no persistent dev server as a validation result, and no claim of completion without stating what was live-tested.

## Repeated architectural lessons

1. The first visible failure is often not the first failing layer.
2. Canonical LR persistence and optional provider side effects need explicit partial-success contracts.
3. Middleware is part of OAuth architecture.
4. Repository intent, deployed code, applied schema, stored data, and live provider state are five different facts.
5. Compatibility fallbacks can conceal regression and should not silently replace richer sources.
6. Idempotency must cover response loss, not just button double-clicks.
7. User-owned provider operations require acting-user ownership at create, update, delete, and status.
8. Historical documentation can remain valuable while being wrong about current status.

## Related context

- [System architecture and data](./SYSTEM_ARCHITECTURE_AND_DATA.md)
- [Current state and next work](./CURRENT_STATE_AND_NEXT_WORK.md)
- [Agent operating rules](./AGENT_OPERATING_RULES.md)
- [Context source index](./CONTEXT_SOURCE_INDEX.md)

