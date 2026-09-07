# Opus P1 Voice Events Prompt Pack

## Purpose

This prompt pack starts the P1a loop for SignalThread Voice Events after the P0 truth-layer work is complete.

P0 fixed the Events Home trust layer: event-scoped metrics, real responses-today, real survey counts, real attention counts, computed live-day badge, and shared satisfaction logic.

P1a should improve the current built product surfaces without starting the larger redesign tracks or schema-heavy product expansions.

## Required Starting Context

Use this prompt pack with the existing loop controller.

Loop controller:

```text
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md
```

Plan document:

```text
docs/Loop/Voice Events Implementation Brief.md
```

Prompt document:

```text
docs/Loop/Opus P1 Voice Events Prompt Pack.md
```

Expected branch:

```text
feat/voice-events-p1-current-surface-polish
```

Recommended branch setup:

```bash
git switch feat/voice-events-p0-truth-layer
git pull --ff-only origin feat/voice-events-p0-truth-layer
git switch -c feat/voice-events-p1-current-surface-polish
git push -u origin feat/voice-events-p1-current-surface-polish
```

Schema mode:

```text
LOCKED
```

## Allowed Scope

P1a current-surface polish only:

1. Remove the remaining Command Center evidence drawer/overlay.
2. Clean up internal event terminology in current Events UI.
3. Make AI question generation event-native instead of business/retail framed.
4. Make Events Home Launch Kiosk / QR prefer survey token links when a launchable event-wide survey exists, while preserving legacy eventId fallback.
5. Improve mobile/narrow Command Center selected-issue detail behavior without adding a drawer.
6. Add/update targeted tests for the changed behavior.

## Out of Scope

Do not implement these in this P1a loop:

- Sponsor activation taxonomy or enum/schema changes.
- Assignee, notes, or ops log on attention items.
- Post-event recap/report/export.
- Live ops response-health board.
- Template-to-launch recommended surveys/questions/QR kits.
- Vanity `/e/[slug]` links.
- Batch signage/QR kit.
- Agenda/session CSV import.
- Slack/SMS/email alerting.
- Any Prisma schema migration.
- Any P2 hardening work unless directly required by this prompt pack.

Protected flows:

- Do not touch kiosk capture unless only changing which launch URL a current button opens.
- Do not touch token resolution internals.
- Do not touch answer upload, answer complete, answer confirm, transcription, or analysis.
- Do not touch event-intelligence dual-write.
- Do not redesign Create Event, Event Areas, Surveys, or Command Center beyond the current targeted fixes.
- Do not refactor retail/SMB surfaces.

## Known Context / Existing Issue

A stale test may already exist in `app/app/page.test.ts` around evidence-drilldown API usage. P0 reported that the assertion conflicts with the current product direction because other tests explicitly assert the drawer/drilldown endpoint is absent.

In this P1a loop, you may update or remove stale evidence-drawer assertions only if they directly conflict with the new no-drawer behavior. Do not re-add the old drawer endpoint just to satisfy a stale test.

## Canonical Product Rules

- Event remains the top-level event container.
- EventStructureItem / Event Area is the user-facing “where feedback is collected” concept.
- Survey remains the launchable questionnaire/listening artifact.
- PublicSurveyLink is the canonical launch URL source for survey-scoped kiosk capture.
- Response rows should remain scoped through existing canonical fields.
- Command Center selected issue detail should live in the right pane on desktop and an inline/non-overlay pattern on narrow screens.
- No duplicate kiosk or intelligence pipelines.

---

# Prompt 1 — Remove the remaining Command Center evidence drawer

## Task

Remove the remaining full-screen evidence drawer/overlay from the Events Command Center and use the existing selected issue/detail surface as the canonical evidence experience.

## Current problem

The product direction is that the right-side selected issue pane is the detail surface. The audit found a remaining `ThemeEvidenceDrawer` in `components/admin/Dashboard2.tsx` that renders a full-screen overlay/drawer from theme/source evidence interactions.

This creates duplicate detail patterns and contradicts the no-drawer rule already established for evidence details.

## Scope

Expected files:

- `components/admin/Dashboard2.tsx`
- `components/admin/Dashboard2.test.ts`
- possibly `app/app/page.test.ts` only if it contains stale evidence-drawer assertions that now conflict

Do not change APIs.
Do not change analytics or intelligence calculations.
Do not change the right-pane content model beyond what is needed to remove the drawer.

## Required behavior

1. Remove or disable the full-screen theme/evidence drawer surface.
2. Remove drawer-specific state and overlay/backdrop markup.
3. Clicking evidence/theme/source items should not open an overlay.
4. Evidence should remain accessible through one of these non-overlay patterns:
   - update the existing selected issue/detail pane where the click maps to an attention item, or
   - render inline evidence expansion in the section where the user clicked, or
   - use a compact in-card evidence preview if there is no direct selected-issue mapping.
5. On desktop, the right pane remains the primary detail surface.
6. On mobile/narrow screens, do not introduce a drawer. The selected detail must render inline or be scrolled into view.

## Tests

Add or update tests to assert:

- no full-screen evidence drawer/backdrop exists in Events Command Center source/components.
- old evidence drawer endpoint/interaction is not required.
- selected issue/right-pane evidence remains visible.
- theme/source evidence remains reachable without overlay, if applicable.

## Acceptance checks

- No `fixed inset-0` evidence overlay/drawer remains for Events Command Center evidence detail.
- No modal/drawer close button is required for evidence detail.
- Existing issue selection still works.
- Existing status controls and copy brief still work.
- Tests for Dashboard2 pass.
- `npm run typecheck` passes after this prompt or at the loop end.

## Stop conditions

Stop if removing the drawer would require a new API, schema change, or redesign of the Command Center information architecture.

---

# Prompt 2 — Clean up internal event terminology

## Task

Remove internal model language from current Events UI and replace it with event-operator language.

## Current problem

The Create Survey flow and related workspace copy expose internal model terms such as:

- “survey target”
- “collection target”
- “This creates a survey target, survey, questions, and token-based kiosk link...”

These are accurate internally but make the product feel database-shaped instead of event-native.

## Scope

Expected files:

- `app/app/events/[eventId]/page.tsx`
- `app/app/events/[eventId]/page.test.ts`
- `app/app/events/events-experience.test.ts`
- possibly `app/app/page.tsx` if “Event Containers” or similar stale language still exists on Events Home

Do not change backend request shapes.
Do not rename Prisma models.
Do not change API contracts.
Do not redesign the flow.

## Preferred language

Use event/operator-facing language:

- “Event Area”
- “Touchpoint”
- “Listening point” where helpful for the launchable survey experience
- “Where should this collect feedback?”
- “Attach this survey to”
- “Create a new event area”
- “Event-wide”
- “Session”
- “Area / Location”
- “Sponsor activation”
- “Custom touchpoint”

Avoid customer-facing usage of:

- “survey target”
- “collection target”
- “Event container” on polished event surfaces
- “database”, “model”, “row”, or other internal concepts

## Required behavior

1. Rewrite Create Survey explanatory copy so it describes the user outcome, not internal records.
2. Rename “New collection target” to a clearer label, such as “Create a new event area” or “New listening point,” depending on surrounding context.
3. Replace field labels like “Survey target category/name/description” with event-native labels.
4. Preserve the same form fields and submitted payloads.
5. Preserve existing tests for functionality; update copy assertions.
6. Add/extend regression tests banning internal terms in Events-mode UI source.

## Acceptance checks

- Events UI no longer exposes “survey target” or “collection target” to the user.
- Existing Survey creation still sends the same payload to the same API.
- Existing Attach Survey behavior still pre-fills the form.
- No retail/SMB language is introduced.
- Relevant tests pass.

## Stop conditions

Stop if the copy cleanup would require changing DB model names, API request bodies, or a larger Create Survey redesign.

---

# Prompt 3 — Make AI question generation event-native

## Task

Make AI question generation in Events mode use event-native prompt context instead of generic business/retail framing.

## Current problem

The AI question generation endpoint is functional but still uses generic “business” language and older goal framing like reviews/NPS. Events mode needs question generation that understands event context, event area type, sessions, sponsor activations, and live event operations.

## Scope

Expected files:

- `app/api/ai/generate-questions/route.ts`
- `app/api/ai/generate-questions/route.test.ts` if missing, create it
- `components/surveys/QuestionBuilder.tsx` or the caller in `app/app/events/[eventId]/page.tsx` if event context needs to be passed
- relevant event page tests if source assertions change

Do not change OpenAI provider setup beyond prompt/request shape.
Do not introduce a new AI route.
Do not change survey creation API.
Do not change kiosk behavior.

## Required behavior

1. Detect or accept an Events-mode generation context.
2. For Events mode, generate questions using event-native framing:
   - event name
   - survey/listening point name
   - event area/touchpoint type when available
   - target category/kind such as event-wide, session, area, sponsor activation, custom touchpoint
   - goal such as live feedback, session quality, event operations, attendee satisfaction, sponsor activation value
3. Avoid “business,” “store,” “reviews,” “NPS,” or SMB/local review language in Events-mode prompts.
4. Keep retail/SMB question generation behavior intact outside Events mode.
5. Keep generated question output compatible with the existing QuestionBuilder.
6. Add tests for Events-mode prompt construction and output validation.

## Suggested Events-mode goals

Use or support event-native goals such as:

- live_event_feedback
- attendee_satisfaction
- session_quality
- event_operations
- wayfinding_and_check_in
- sponsor_activation_value
- networking_quality
- food_and_beverage
- accessibility_and_comfort

## Acceptance checks

- Events mode AI prompt does not say “business” or use retail/review framing.
- Events mode can pass event/area/survey context into the AI route.
- Retail create survey flow remains intact.
- New route tests pass.
- `npm run typecheck` passes after this prompt or at loop end.

## Stop conditions

Stop if this requires a new AI provider, schema changes, or changing the QuestionBuilder architecture broadly.

---

# Prompt 4 — Prefer survey token links for Events Home kiosk/QR actions

## Task

Make Events Home kiosk/QR actions prefer a launchable survey token link when the live event has an active event-wide survey, while preserving legacy `/kiosk?eventId=` fallback.

## Current problem

The audit found Events Home launch actions can use the legacy eventId kiosk path. That path creates event-level responses without surveyId/surveyTargetId/publicSurveyLinkId. For Events mode, when an event-wide survey exists, home launch should prefer the tokenized survey link so responses are survey-scoped and Command Center filters stay accurate.

## Scope

Expected files:

- `app/api/app/account/route.ts` or existing account/event summary helper if eventMetrics now includes launch data
- `app/app/page.tsx`
- `app/app/page.test.ts`
- `app/api/app/account/route.test.ts`

Do not change token resolution internals.
Do not change kiosk route behavior.
Do not remove `/kiosk?eventId=` fallback.
Do not change survey creation.
Do not introduce vanity `/e/[slug]` links in this prompt.

## Required behavior

1. For EVENTS accounts, include enough data for the Events Home to identify a preferred launchable event-wide survey link for each event.
2. Preferred link criteria:
   - active PublicSurveyLink
   - active Survey
   - survey target/category represents event-wide feedback where available
   - belongs to the same event/account
3. Events Home “Launch kiosk” should use `/kiosk?token=<token>` when such a link exists.
4. If no launchable event-wide survey link exists, keep existing `/kiosk?eventId=<eventId>` fallback.
5. Any QR link/action on Events Home should follow the same preference if present on that surface.
6. Do not affect retail/SMB surfaces.

## Acceptance checks

- Live event with active event-wide survey opens tokenized kiosk path.
- Live event without launchable event-wide survey still opens legacy eventId kiosk path.
- Existing token kiosk launch tests remain passing.
- No changes to `/api/response/create` behavior.
- Relevant account route/page tests pass.

## Stop conditions

Stop if identifying the correct event-wide survey requires a schema change or ambiguous product decision.

---

# Prompt 5 — Improve mobile Command Center selected-detail behavior without drawer

## Task

Make selected issue detail usable on mobile/narrow screens without reintroducing a drawer or modal.

## Current problem

The selected issue detail pane is correct on desktop, but on narrow screens it can stack below the full attention list. That means a mobile operator may tap an issue and not see the selected evidence/detail without scrolling far down.

## Scope

Expected files:

- `components/admin/Dashboard2.tsx`
- `components/admin/Dashboard2.test.ts`

Do not change APIs.
Do not add drawer/modal/overlay.
Do not redesign the Command Center.
Do not change evidence calculations or issue clustering.

## Required behavior

Choose the smallest non-drawer improvement that makes mobile usable:

Option A:
- Render selected issue detail inline beneath the selected issue card on narrow screens.
- Keep the right-pane layout on desktop.

Option B:
- Scroll selected detail into view when an issue is selected on narrow screens.
- Keep the detail block below the list but make selection behavior obvious and usable.

Option C:
- Add a compact expanded-detail section inside the selected card on narrow screens.

Pick the safest option based on existing component structure.

## Acceptance checks

- No drawer/modal/overlay is introduced.
- Desktop right-pane behavior remains unchanged.
- On narrow screens, selecting an issue makes its detail/evidence immediately reachable.
- Selected card remains visually obvious.
- Tests/static checks assert the no-drawer rule remains true.

## Stop conditions

Stop if this requires a larger responsive redesign or a new detail surface that conflicts with Prompt 1.

---

# Final Verification Prompt

After completing Prompts 1–5, run the final checks.

## Required commands

Run targeted tests first:

```bash
npx vitest run components/admin/Dashboard2.test.ts app/app/page.test.ts app/app/events app/api/app/account/route.test.ts app/api/ai/generate-questions/route.test.ts
```

Run protected capture tests:

```bash
npx vitest run app/api/response/create app/api/kiosk app/kiosk
```

Run typecheck:

```bash
npm run typecheck
```

Run build if feasible:

```bash
npm run build
```

If full suite is feasible, run:

```bash
npm test
```

## Final report required

Return the loop controller final stop format, plus this P1a-specific summary:

- Drawer/overlay removed or avoided.
- Terminology removed/replaced.
- AI question generation now event-native.
- Home kiosk/QR token preference behavior.
- Mobile selected-detail behavior.
- Tests added/updated.
- Protected flows verified.
- Any known pre-existing test failure separated from this work.

