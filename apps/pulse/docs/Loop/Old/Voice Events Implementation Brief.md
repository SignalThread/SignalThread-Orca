# Opus P0 Implementation Brief — Voice Events Truth Layer

## Purpose

Implement the P0 fixes from the Voice Events product-excellence audit.

This is a focused implementation loop. The goal is to make the Events Home trustworthy and consistent with the Command Center by fixing the front-door metrics, live status labeling, attention items, and satisfaction definition.

Do not expand into P1/P2 work in this pass.

---

## Operating Mode

**Implementation mode:** P0 loop only  
**Expected agent:** Claude Opus / coding agent  
**Reasoning:** High  
**Repo:** `Booth Audio` / SignalThread Voice App  
**Primary product area:** Events mode  

Start by reading the audit package if present:

- `docs/audits/voice-events/Voice Events Current State.md`
- `docs/audits/voice-events/Voice Survey Event Audit Brief.md`
- `docs/audits/voice-events/screenshots/*`

Also inspect the current code paths directly. Do not rely only on the audit summary.

---

## Current Product Context

SignalThread Events is a voice intelligence product for live events.

The core product promise is:

> attendee voice → event signals → attention items → recommended actions → event/session/sponsor value

The current foundation is real and should be preserved:

- Token-based public survey links are real.
- QR and kiosk launch are real.
- Response creation is real.
- Audio upload, transcription, analysis, and event-intelligence dual-write are real.
- Command Center attention items are backed by real persisted issue clusters.
- Survey and event-area filters in Command Center are real.
- Issue status persistence is real.

The P0 issue is not that the engine is fake. The issue is that the **Events Home page does not accurately represent the same truth as the Command Center**.

---

## P0 Scope

Fix only these four P0 issues:

1. **Events Home metrics are mis-scoped / mislabeled.**
2. **The live day badge is hardcoded as `DAY 1`.**
3. **Events Home attention / immediate items are not connected to real issue clusters.**
4. **Satisfaction uses inconsistent formulas between Events Home and Command Center.**

Do not work on P1/P2 items in this loop.

---

## Hard Stops

Stop and report before continuing if any of these become necessary:

- A schema migration appears required.
- Kiosk capture needs to change.
- Token resolution needs to change.
- Answer upload, transcription, or analysis code needs to change.
- Existing legacy `/kiosk?eventId=...` behavior would need to be removed or broken.
- You need to rewrite the Command Center aggregation layer instead of reusing it.
- Tests fail in a way that appears unrelated to this P0 work.
- Current data returned by the account/events API cannot support event-scoped metrics without a broader API design decision.

---

## Protected Flows

Do not modify these unless there is no other safe path and you stop first:

- `app/kiosk/page.tsx`
- `app/api/response/create/route.ts`
- `app/api/answer/presign/*`
- `app/api/answer/complete/*`
- `app/api/answer/confirm/*`
- transcription pipeline
- analysis pipeline
- token launch context resolution
- event intelligence dual-write pipeline
- Prisma schema

The audit found these flows to be working and production-relevant. Keep this pass focused on surfacing correct data on Events Home and sharing metric definitions.

---

## Likely Files

Start by identifying the actual files before editing. Expected files include:

- `app/app/page.tsx`
- `app/app/page.test.ts`
- `app/app/events/events-experience.test.ts`
- `app/api/app/account/route.ts`
- `app/api/app/account/route.test.ts` if present, or create/update focused API tests
- `components/admin/Dashboard2.tsx`
- a new shared helper such as `lib/analytics/satisfaction.ts` if needed
- corresponding helper tests if a helper is added

Do not touch unrelated surfaces.

---

## Required Changes

### 1. Fix Events Home metrics truth

The Events Home page currently presents account-wide or legacy values as if they are live-event scoped.

Fix the home metrics so the displayed values mean exactly what their labels say.

#### Required behavior

For the featured live event card:

- **Responses** must be scoped to that featured event.
- **Responses today** must mean responses from today, not all-time account responses.
- **Surveys** must count real active event voice surveys / Survey rows, not legacy `questionsJson` length.
- **Attention** must come from real event intelligence issue clusters or attention queue data, not paused-event state.

For top summary cards:

- **Live right now** can continue to count live events.
- **Responses today** must count only responses from today across the relevant events/account.
- **Need action** must be derived from real open attention items / issue clusters across live events, not inactive event flags.

#### Implementation notes

Prefer a server/API solution over ad hoc client-side inference.

If the current `/api/app/account?account=<slug>` response is the source for Events Home, extend it in a focused way so the page can render truthful event-scoped metrics without duplicating heavy logic in the client.

Keep route handlers thin. Put reusable derivation logic in a helper if needed.

---

### 2. Replace hardcoded `LIVE · DAY 1`

The live badge must not always say Day 1.

#### Required behavior

- Compute the current event day from event start/end dates.
- If the event has a start date and the current date is within the event window, show the correct day number.
- Example: if today is the second calendar day of the event, show `DAY 2`.
- If a day number cannot be safely computed, avoid showing a misleading day value.
- Preserve the `LIVE` visual treatment.

#### Important

Be careful with timezones. Use existing event/location timezone fields if available. If the current code does not have enough timezone context, implement the safest non-misleading fallback and document the assumption.

---

### 3. Wire Events Home attention to real issue clusters

The Events Home immediate-items strip should reflect actual Command Center attention items.

#### Required behavior

- The home attention count must match open/current attention items for the event.
- The immediate-items strip should show a real top issue title or a concise summary derived from real event intelligence data.
- The `Review` action should route to the Command Center.
- If practical in this pass, deep-link to the relevant issue/cluster so the Command Center can preselect it.
- If deep-linking requires a broader dashboard state change, stop and report before implementing that portion.

#### Status rules

Treat these statuses as not open:

- `RESOLVED`
- `DISMISSED`

Treat these statuses as open:

- `NEW`
- `INVESTIGATING`
- `MONITORING`

If the code has a canonical status helper, use it.

---

### 4. Unify satisfaction definition

Events Home and Command Center must not use different formulas for the same concept.

#### Required behavior

- Create or reuse one shared satisfaction helper.
- Events Home and Command Center must use the same satisfaction definition.
- Prefer the Command Center’s inferred satisfaction approach if it is already product-approved and better represents analyzed sentiment.
- Add a low-sample / insufficient-data guard so the UI does not show false precision for tiny sample sizes.
- Avoid negative satisfaction percentages.
- Keep labels clear, for example:
  - `Inferred satisfaction`
  - `Not enough data`
  - `Low confidence`

#### Implementation notes

Do not leave duplicate satisfaction formulas in `app/app/page.tsx` and `components/admin/Dashboard2.tsx`.

A likely good shape is:

- `lib/analytics/satisfaction.ts`
- unit tests for thresholds, empty data, small sample sizes, and negative sentiment
- Events Home consumes this helper
- Dashboard2 consumes this helper

---

## Test Requirements

Add or update targeted tests. Do not rely only on manual QA.

### Required test coverage

1. **Events Home metrics scoping**
   - featured live event responses are event-scoped
   - account-wide responses do not leak into featured event metrics
   - `Responses today` uses a today window, not all-time

2. **Survey count**
   - active surveys count comes from Survey rows / event voice surveys
   - legacy question count does not drive the Events Home survey metric

3. **Attention count**
   - open issue clusters count as needing action
   - resolved/dismissed clusters do not count

4. **Day badge**
   - day 1 renders for first day
   - day 2 renders for second day
   - misleading day value is not shown when dates are insufficient

5. **Satisfaction helper**
   - empty data returns no score / not enough data
   - low sample count returns low-confidence state
   - positive/neutral/negative sentiment buckets behave deterministically
   - Home and Command Center use the shared helper instead of local duplicate formulas

6. **No protected-flow changes**
   - existing kiosk/token tests still pass
   - response creation tests still pass

---

## Acceptance Checks

The implementation is complete only when all of these are true:

- Events Home no longer displays account-wide values as event-level values.
- `Responses today` actually means today.
- The featured live event card metrics are scoped to that event.
- Survey count reflects real event voice surveys.
- Attention count and immediate strip are derived from real open attention items / issue clusters.
- The hardcoded `DAY 1` is gone.
- Satisfaction uses one shared helper across Events Home and Command Center.
- Tiny samples or missing sentiment do not show misleading precision.
- Command Center still renders and keeps its existing data behavior.
- Kiosk/token/answer upload/transcription/analysis behavior is unchanged.
- No schema changes unless explicitly approved after a hard stop.
- Tests are updated and passing.

---

## Verification Commands

Run focused checks first:

```bash
npm run typecheck
npx vitest run app/app/page.test.ts app/app/events/events-experience.test.ts
npx vitest run app/api/app/account/route.test.ts
npx vitest run app/api/response/create app/api/kiosk app/kiosk
```

If `app/api/app/account/route.test.ts` does not exist, create an appropriate focused test or run the closest account/events API tests that exist.

Then run the broader suite:

```bash
npm test
```

If Prisma is touched, also run:

```bash
npx prisma validate
npx prisma generate
```

Final build check when the loop is complete:

```bash
npm run build
```

If any command does not exist in this repo, report the exact command failure and the closest valid alternative you ran.

---

## Manual QA Checklist

Use an EVENTS account with a live event and seed/demo data if available.

Verify:

1. Events Home shows correct live event count.
2. Responses Today changes based on today’s responses only.
3. Featured event response count does not include responses from other events.
4. Survey count matches the surveys in the Event Workspace Surveys tab.
5. Attention count matches open Command Center attention items.
6. The immediate-items strip names a real issue when one exists.
7. Review opens the Command Center.
8. Live day badge shows the correct day or hides the day number if uncertain.
9. Satisfaction value matches the Command Center’s satisfaction logic.
10. Low-data events do not show overconfident satisfaction values.
11. Kiosk launch still opens.
12. Public token kiosk links still work.

---

## Return Format

When done, report:

1. Files changed.
2. Exact root cause of each P0 issue.
3. What API/data shape changed, if any.
4. New helper names and formulas introduced.
5. How Events Home metrics are now computed.
6. How attention items are now counted.
7. How satisfaction is now computed and shared.
8. Tests added/updated.
9. Verification command results.
10. Any assumptions, limitations, or follow-up P1/P2 items discovered.

---

## Do Not Do in This Loop

Do not implement:

- Create Listening Point wizard.
- Post-event recap.
- Operations/live health tab.
- Template-to-launch onboarding.
- Vanity `/e/[slug]` links.
- Batch signage kit.
- Agenda import.
- Alerting.
- Assignee/notes on clusters.
- Sponsor taxonomy changes.
- Broad terminology cleanup.
- Full Command Center redesign.

Those are P1/P2 and will be handled after P0 is stable.
