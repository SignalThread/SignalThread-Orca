# 09 — Open Questions and Decisions

Things that are **not** decided. Settle the 🔴 ones with Ali before writing schema; the rest can wait but should not be discovered late.

---

## 🔴 Decide before Phase 3 (schema)

### 1. Auth authority — confirm `own`
File 03 §1 argues for `own` (Housing runs its own Supabase Auth). Everything in this pack assumes it. If Housing were to be `platform-core` instead, the integration is *different and simpler* but Housing could never have non-Platform users (hotel contacts, sub-block owners).
**Recommendation:** `own`. **Needs:** Ali's confirmation.

### 2. Are hotel-side users in scope for v1?
Does a hotel contact ever log into Housing — to confirm pickup, upload a rooming list, respond to a cutoff? Or is v1 planner-facing only, with hotels handled by file exchange?
This decides whether you need an external-user identity model, invitations, and scoped permissions on day one, or can defer all of it.
**Impact:** large — it shapes RBAC and the entire auth surface.

### 3. "Rooms held" — contracted or picked up?
Platform's tile already commits Housing to a headline fact of **"Rooms held"** and metrics **"Rooms held" / "Committed"** (`apps/platform/lib/event-overview/product-catalog.ts`). Those are ambiguous. Pick precise definitions, name the columns to match, and update the catalog if the honest metrics differ.
**Impact:** small code, but it is a public product promise.

### 4. Event dates and timezone ownership
Platform Core's `events.starts_at` / `ends_at` are **frequently NULL** and `events.timezone` **is not applied to the live project** (file 02 §3). A room block has a hard date range and hotel nights are local-date concepts.
**Recommendation:** Housing owns its own event dates and timezone, treating Platform's as an optional hint. **Alternative:** get the venue/timezone migration applied and require dates at the Platform level — a bigger, cross-product change.

### 5. One Platform org → several Housing orgs?
The schema permits it (file 06 §3) and Lead Retrieval implements full narrowing logic because it needed it. If Housing will genuinely be one-to-one, you still need the non-unique column and the refusal path, but the narrowing can be simpler.
**Ask:** is there a real customer shape (regional housing entities, per-series entities) that needs it?

---

## 🟠 Decide before Phase 7 (domain build)

### 6. Attrition and contract terms in v1?
Cutoff dates, allowable shrink, penalty basis — this is the financial risk a housing product manages. Including it makes v1 meaningfully more valuable and meaningfully bigger.

### 7. Rooming-list ingest format
CSV? Per-hotel templates? A hotel API? This drives the import/validation subsystem, which is typically a large chunk of a housing product.

### 8. Sub-blocks for exhibitors/sponsors
Allocating part of a block to an exhibitor is common, and Lead Retrieval already models exhibitor companies per event. If Housing needs this, decide whether exhibitor identity is duplicated in Housing or referenced some other way — **remembering that Housing may not read Lead Retrieval's database.**

### 9. Multi-currency and tax
Cheap to design in now, painful to retrofit.

### 10. Relationship to Registration
Registration ("knows who is coming") and Housing ("knows where they stay") are adjacent, and Registration is also unbuilt. Does a Housing reservation reference a Registration attendee? If so, that is a **second** cross-product contract that does not exist yet, and it should be designed once — not improvised twice.
**Flag:** this is the most likely source of future architectural pain. Raise it early.

---

## 🟡 Infrastructure decisions (Ali)

### 11. Production domain
Proposed `housing.signalthread.ai`. Confirm.

### 12. Supabase project name and region
Proposed `signalthread-housing`. Lead Retrieval's is `us-east-2`, PG 17.6. Match unless there is a reason not to.

### 13. Local port
Proposed **3004**. Confirm nothing else on the machine claims it.

### 14. Which organizations get the `housing` entitlement for pilot?
Entitlement granting is service-role provisioning; there is no self-serve path.

### 15. CI
None exists. Worth adding for Housing?

---

## ⚪ Known platform-level gaps (context, not your problem to fix)

These are real and documented; be aware of them, do not work around them silently.

1. **`venue` / `timezone` migration is committed but unapplied** to live Platform Core.
2. **No product feed adapter exists** for any product. Platform's event dashboard shows registry state only and says so honestly rather than fabricating numbers (file 06 §7).
3. **Platform Core Auth is a shared single point of failure** for new sign-ins across all products. Deliberately unmitigated; fixing it is a separate hardening phase (file 01 §5).
4. **`HttpOnly: false` on session cookies** is deferred hardening required by the current Supabase browser client (file 03 §4).
5. **GoTrue verify rate limit** (~30 / 5 min / IP) will bite during proof runs (file 07 §5).
6. **`docs/local-dev.md` is stale** — describes the pre-monorepo layout. File 07 supersedes it.
7. **Lead Retrieval has 13 inherited test failures**, documented and name-stable.
8. **`apps/platform` has no Vercel project yet** and Platform is not deployed. Housing's production launch path cannot be proved end-to-end until Platform is deployed — local proof is the interim bar.

---

## How to raise these

Most of 1–5 are 20-minute conversations that prevent weeks of rework. Get them answered in your first week, write the answers into this file, and treat it as the decision log.
