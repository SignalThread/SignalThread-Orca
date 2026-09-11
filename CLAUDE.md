# SignalThread Repository Guide for Claude

This document establishes authoritative conventions, constraints, and decision points for work on the SignalThread platform monorepo.

---

## 1. Foundational Architecture Rule

> **A failure of one product application's deployment or operational database must not require another product application to fail.**

This is the governing constraint for all system design. It is audited and verified against live code:

- Each application is its own Vercel project, deployed independently.
- Each application owns its own runtime environment variables; there is no shared product-secret namespace.
- Each application owns its own operational database; no application reads another's operational tables directly.
- Sharing happens through **published contracts** — Platform Core auth claims, versioned HTTP APIs — never through direct imports or shared runtime state.
- Living in one repository is a *source-control* convenience. It must never become a *runtime* dependency.

**Evidence:** See `docs/DEPLOYMENT_BOUNDARIES.md` (verified 2026-09-10 against live code and outage scenarios).

---

## 2. Import Boundaries (Enforced)

```
apps/*     MAY import packages/*
apps/*     MUST NOT import another apps/*
packages/* MUST NOT import apps/*
```

Enforced by `npm run boundaries` — walks every `.ts/.tsx/.js/.jsx` file, checks both relative imports (must stay inside the member) and bare specifiers (must not name another app's package). Runs as `node scripts/check-import-boundaries.mjs`.

**Why:** If Housing could import Lead Retrieval, a build failure in Lead Retrieval becomes a failure in Housing — exactly the coupling the rule forbids.

---

## 3. Housing Integration

### 3.1 Before Starting Housing Work

**Read these files in order:**

1. `docs/housing-handoff/00_START_HERE.md`
2. `docs/housing-handoff/01_PLATFORM_ARCHITECTURE.md`
3. `docs/housing-handoff/02_PLATFORM_CORE_SCHEMA.md`
4. `docs/housing-handoff/03_AUTH_AND_IDENTITY.md`
5. `docs/housing-handoff/04_LAUNCH_HANDOFF_CONTRACT.md`
6. `docs/housing-handoff/05_HOUSING_INTEGRATION_CHECKLIST.md`
7. `docs/housing-handoff/06_HOUSING_DATA_MODEL_GUIDANCE.md`
8. `docs/housing-handoff/07_LOCAL_DEV_AND_ENVIRONMENT.md`
9. `docs/housing-handoff/08_STANDARDS_AND_TESTING.md`
10. `docs/housing-handoff/09_OPEN_QUESTIONS.md`

These 10 documents are the **canonical Housing handoff pack**, verified against live code on 2026-09-10.

**Also read:** `docs/HOUSING_ONBOARDING_REPORT.md` — the complete onboarding analysis.

### 3.2 Authentication: The `own` Authority Model (UNRESOLVED)

**⚠️ This decision is not yet finalized.**

The recommended default for Housing is to authenticate against **its own Supabase Auth project** (never Platform Core Auth). This is called "own authority."

Rationale for recommendation:
- Housing would run `signalthread-housing` (provisioned by Ali)
- Housing must never hold a Platform Core session
- Housing can have non-Platform users (hotel contacts, sub-block coordinators) with no Platform Core identity
- Cross-subdomain SSO happens through a one-time, single-use handoff token, never a shared auth cookie

**Reference implementations:** Lead Retrieval and Pulse (both `own`-authority products).

**Status:** This remains an unresolved decision requiring **Ali's confirmation before schema design.** Do not implement auth-dependent schema, session behavior, or other structural code that depends on auth authority until confirmed. Update `docs/housing-handoff/09_OPEN_QUESTIONS.md` §1 once decided.

### 3.3 Identity Mapping: The Three Columns Only

> **Resolution reads ONLY these three columns: `platform_user_id`, `platform_organization_id`, `platform_event_id`. Never email, name, slug, company name, domain, or "the first matching row."**

This is the entire identity contract. Platform Core returns these three canonical UUIDs when Housing claims a handoff token. Housing stores them as **opaque UUID columns** on its own rows — never as foreign keys (separate databases).

**The one rule that matters most:** A value that merely resembles a local attribute must never become authority. Email-based fallback would let anyone controlling a matching address inherit someone's workspace.

**What Lead Retrieval does:** Explicitly tests that `USER_MAPPING_NOT_FOUND` succeeds **while a user with the same email exists**, proving no email fallback. Write that test for Housing.

### 3.4 Organization Resolution (Non-Trivial)

One Platform organization may legitimately map to several Housing organizations (regional entities, per-series entities). The `platform_organization_id` column is therefore **deliberately non-unique**.

Resolution never uses the organization id alone. It must narrow:

```
1. Find all Housing orgs with this platform_organization_id
   → zero?  ORGANIZATION_MAPPING_NOT_FOUND

2. Narrow by the mapped EVENT: keep candidates that own or participate
   → zero?  EVENT_ORGANIZATION_MISMATCH
   → one?   resolved ✓

3. Still multiple? Narrow by the mapped USER's relationships
   → exactly one?  resolved ✓
   → zero or multiple?  AMBIGUOUS_ORGANIZATION_MAPPING
```

**Nothing is picked by position.** Lead Retrieval has an explicit order-independent test that shuffles candidates and asserts the same refusal. Write that for Housing.

---

## 4. Unresolved Decisions: Stop and Ask

**⚠️ All decisions listed below are UNRESOLVED.** File `docs/housing-handoff/09_OPEN_QUESTIONS.md` is the authoritative source. **Do not silently resolve them.** If a decision affects:

- Schema design (Phase 3 or later)
- Authentication or session handling
- User permissions or access rules
- Cross-product contracts (Housing ↔ Platform, Housing ↔ Registration)

**Stop and ask Sarah or Ali** before implementing. Mark the decision in the file; treat it as the decision log.

### 🔴 Critical Decisions (Before Schema) — UNRESOLVED

1. **Auth authority** — Recommended: `own` (Housing runs its own Supabase Auth). **Requires Ali's confirmation.** See §3.2 above.
2. **Hotel-side users in v1** — UNRESOLVED: Can hotel contacts log in, or planner-facing only?
3. **"Rooms held" definition** — UNRESOLVED: Contracted allotment or current pickup? Platform tile commits to this metric.
4. **Event dates and timezone** — UNRESOLVED: Housing must own dates (Platform's often NULL). Own timezone too? Or get migration applied?
5. **One Platform org → multiple Housing orgs** — UNRESOLVED: Needed for regional/per-series entities, or genuinely one-to-one?

### 🟠 Important Decisions (Before Domain Build) — UNRESOLVED

6. **Attrition and contract terms in v1** — UNRESOLVED: Cutoff dates, shrink allowances, penalty basis?
7. **Rooming-list ingest format** — UNRESOLVED: CSV, per-hotel templates, hotel API?
8. **Sub-blocks for exhibitors** — UNRESOLVED: Needed? How relate exhibitor identity?
9. **Multi-currency and tax** — UNRESOLVED: Design now or retrofit?
10. **Relationship to Registration** — UNRESOLVED: Housing reservation reference Registration attendee? (Second cross-product contract.)

---

## 5. Server-Side Authority and Fail-Closed Behavior

### Single Source of Truth

Business-critical rules have **one canonical enforcement point**, not split across:
- UI checks
- Duplicate service helpers
- Stale cached fields
- Ad hoc route logic
- Client assumptions

If a rule matters for permissions, access, or data safety, **the server owns it.**

**For Housing/Platform integration:** The launch path must use the same access resolver as every other Housing surface. A launch-only permission check is a second source of truth that will drift.

### Server-Side Enforcement

The UI may guide, warn, or disable controls. **The server must always enforce.** Never rely on:
- Hidden buttons
- Disabled UI state
- Optimistic assumptions
- Client-side role checks as the final gate

### Fail-Closed Responses

Every denial returns a sanitized JSON body with security headers and **no cookies at all**:

```json
{
  "success": false,
  "error": "...",
  "reason": "...",
  "hint": "..."
}
```

An unexpected exception becomes a deliberate `500 INTERNAL_ERROR`, never a framework error page.

---

## 6. Data Integrity

### Database Constraints First

Real invariants live in the database, not just application checks:
- Explicit uniqueness where business model requires it (e.g., `platform_user_id` UNIQUE where not null)
- Foreign keys where ownership matters, with deliberate `ON DELETE` semantics
- Check constraints for enumerated values
- RLS enabled and forced on every table; `anon` revoked; privileged writes reachable only by service-role code

### Idempotent Mutations

Write paths must be safe, predictable, and repeatable:
- Explicit and scoped
- Reversible where appropriate
- Safe to retry

**For Housing:** Rooming-list imports and room-block reconciliation are exactly where this matters. Design for retry from day one.

---

## 7. Testing and Validation

### Test Architecture: Pure Core + Injected I/O

```
Pure decision logic (testable without database)
  ↓
I/O wiring (thin, exercised through integration)
  ↓
Route handler (thin handler + exception boundary)
```

Keeping the decision free of I/O (and free of `server-only`) lets every denial be asserted directly in tests, with no database and no mocking of the rule under test.

**Example pattern from Lead Retrieval:**
- `identity-mapping.ts` — pure rules, testable
- `identity-mapping-supabase.ts` — real loaders, integration-tested
- `platform-entry-core.ts` — decision order, deps injected
- `platform-entry-server.ts` — wiring
- `app/platform-entry/route.ts` — thin handler

Copy this split. It is the difference between "tested the happy path" and "every denial branch is asserted."

### Validation Commands

```bash
npm run boundaries           # Must pass
npm run typecheck            # All workspaces
npm run lint                 # All workspaces
npm run test                 # All workspaces
npm run build                # All workspaces
npm run check                # typecheck + lint + test
```

Housing-specific:
```bash
npm run typecheck:housing
npm run lint:housing
npm run test:housing
npm run build:housing
```

### Validation Bar for Integration Changes

Lead Retrieval's Platform integration was accepted only with:

1. typecheck clean, lint clean, production build succeeds
2. full node suite run, with **name-level diff** against baseline
3. `npm run boundaries` passing
4. the Platform suite passing
5. **live** happy-path proof through real routes (JWT issuer and subject verified)
6. **live negative matrix** — every denial code reproduced, including order-independence
7. documentation updated

**That is the bar for the Housing handoff integration too.** Domain work that follows is ordinary product engineering; it does not need the same ceremony. But the auth boundary does.

---

## 8. Engineering Standards

### Correct Architecture Over Convenient Patches

1. Fix the canonical enforcement path.
2. Remove parallel logic.
3. Update the UI.
4. Add regression coverage.

Avoid one-off conditionals, route-specific copies of rules, silent fallbacks, soft workarounds.

### Performance-Aware by Default

Performance is a requirement, not cleanup for later:
- Number of queries per request
- Scope of queries
- Row-count sensitivity
- Repeated work in loops
- Unnecessary joins or broad selects

Prefer narrow selects, event/organization-scoped queries, and derived caches only where they don't control authorization.

### Low-Breakage Change Strategy

Minimize blast radius:
- Edit the fewest files necessary
- Preserve existing public contracts unless intentionally changing them
- Remove dead logic instead of leaving parallel paths
- Isolate UI work from backend enforcement

**When touching risky systems** (auth, seats, RBAC, routing):
- Assume regressions are likely
- Inspect adjacent flows before merging
- Add targeted regression coverage

---

## 9. Constraints Specific to Housing

### Never Do This

| Never | Because |
|---|---|
| Hold Platform Core's service-role key | Compromise of Housing becomes compromise of Platform Core |
| Query Platform Core's Postgres | Breaks the failure-domain rule; bypasses the audited contract |
| Trust `event_id` from a URL as authorization | It is a navigation hint; anyone can edit it. Re-validate server-side. |
| Map to local users by **email, name, slug, domain, or "first match"** | Attacker-controlled or coincidental attribute becomes authority. Use only the three mapping columns. |
| Re-point an existing mapping automatically | Silent re-pointing merges two identities. Refuse and surface it. |
| Accept a handoff without browser binding | Leaked launch URL is a login-CSRF / session-replacement vector. Implement state/correlator/nonce. |
| Introduce a parent-domain cookie for "simpler SSO" | Shared JS-readable credential turns one XSS anywhere into platform-wide session. Host-only cookies contain damage. |

### How Sessions Must Work

| Property | Value | Why |
|---|---|---|
| `Path` | `/` | Standard |
| `SameSite` | `Lax` | Standard |
| `Domain` | **none (host-only)** | Never `.signalthread.ai` |
| `Secure` | `true` when app's URL is HTTPS | From `NEXT_PUBLIC_SITE_URL`, not `NODE_ENV` |
| `HttpOnly` | **`false`** | Required by Supabase browser client (reads from `document.cookie`) |
| Lifetime | **400 days** | Supabase default, unchanged deliberately |

Set and remove use **identical scope** — sign-out clears exactly what sign-in wrote.

---

## 10. Known Platform Gaps (Don't Silently Work Around)

These are real, documented, and deliberately unmitigated:

1. **`venue` / `timezone` migration committed but unapplied** to live Platform Core. Housing must own its own dates and timezone.
2. **No product feed adapter exists** for any product. Dashboard shows registry state honestly; never fabricates.
3. **Platform Core Auth is a shared single point of failure** for new sign-ins. Deliberately unmitigated; fixing it is separate hardening phase.
4. **`HttpOnly: false` on session cookies** is deferred hardening (required by Supabase browser client).
5. **GoTrue verify rate limit** (~30 / 5 min / IP) will bite during proof runs. Wait five minutes; not a bug.
6. **Lead Retrieval has 13 inherited test failures** (documented, name-stable) from before consolidation. Not yours.
7. **Platform has no Vercel project yet** and is not deployed. Housing's production launch cannot be proved end-to-end until Platform is deployed. Local proof is interim bar.

---

## 11. Reference Implementations

### Lead Retrieval (Preferred)

- `apps/lead-retrieval/lib/platform/` — 12 files, heavily commented
- `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md`

Read in order of testability and dependencies:
1. `platform-ids.ts` — UUID validation
2. `paths.ts` — constants
3. `launch-state.ts` — nonce/correlator mechanics (testable)
4. `identity-mapping.ts` — pure mapping rules (testable)
5. `identity-mapping-supabase.ts` — real loaders
6. `platform-claim-client.ts` — HTTP call + validation
7. `establish-session.ts` — session minting (testable)
8. `lr-authorization.ts` — Lead Retrieval's own access decision
9. `existing-session.ts` — Session conflict guard
10. `platform-entry-core.ts` — decision order (testable, deps injected)
11. `platform-entry-server.ts` — wiring
12. Route handler and middleware

### Pulse (Backup Reference)

`apps/pulse/lib/platform/` follows the same pattern. Use if Lead Retrieval is unclear.

---

## 12. For Platform Changes (Housing Registration)

Housing requires exactly **3 edits to Platform**:

All in `apps/platform/lib/server/product-registry.ts`:

1. Add to `PRODUCT_APP_URL_ENV`: `housing: ["HOUSING_APP_URL", "NEXT_PUBLIC_HOUSING_APP_URL"]`
2. Add to `PRODUCT_AUTH_AUTHORITY`: `housing: "own"`
3. Add to `buildProductReturnPath`: case for `housing` returning `/platform-entry?event_id=…`

Update `apps/platform/lib/server/handoff.test.ts` with Housing cases mirroring Lead Retrieval ones.

**No new authorization or handoff code required.** `authorizeProductLaunch` is product-agnostic; a test fails if product-specific logic appears.

---

## 13. Housing-Specific Rules Apply to Housing Only

The constraints above (identity mapping, browser binding, server-side enforcement, etc.) are required **for Housing's Platform integration.** They are not blanket requirements for unrelated products unless those products have similar architecture. Judge each constraint by its reasoning, not by a "all products must" rule.

---

## 14. Onboarding and Decision Documentation

- **Onboarding analysis:** `docs/HOUSING_ONBOARDING_REPORT.md` (complete analysis, verified 2026-09-10)
- **Handoff pack:** `docs/housing-handoff/` (10 canonical documents)
- **Decision log:** `docs/housing-handoff/09_OPEN_QUESTIONS.md` — update this file as decisions are made
- **Platform integration guide:** `docs/DEPLOYMENT_BOUNDARIES.md` (audited failure-domain verification)

---

## 15. Who to Ask

- **Ali** — product decisions, infrastructure (Supabase, Vercel, DNS), entitlement provisioning
- **Repository code and comments** — architecture reasoning is written down next to the code
- **This document + handoff pack** — conventions and constraints

---

## Summary of Non-Negotiables

1. **Failure-domain rule:** Never couple products through imports, direct queries, or shared runtime state.
2. **Import boundaries:** Enforced by `npm run boundaries`; violations are build failures.
3. **Identity mapping:** Three UUID columns only; never fuzzy-match on email, name, or other attributes.
4. **Server-side authority:** Every business rule enforced server-side, fail-closed.
5. **Browser binding:** No handoff accepted without proof this browser started the launch (nonce/correlator).
6. **Idempotent mutations:** Write paths designed for retry, reconciliation from live data.
7. **Database constraints:** Real invariants in schema, not just application checks.
8. **Pure decision logic:** Rules testable without database, dependencies injected.
9. **Validation:** `npm run boundaries`, typecheck, lint, test, build before merge.
10. **Unresolved decisions:** Stop and ask; do not silently resolve questions marked in 09_OPEN_QUESTIONS.md.

---

**Last updated:** 2026-09-10  
**Verified against:** Live code as of commit `bf70872`
