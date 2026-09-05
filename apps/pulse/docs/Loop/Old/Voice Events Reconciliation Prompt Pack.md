# Voice Events Visual Reconciliation Prompt Pack

Use this prompt pack with:

```text
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md
```

## Loop Inputs

```text
Plan document:
docs/Loop/Voice Survey Redesign Brief.md

Prompt document:
docs/Loop/Voice Events Visual Reconciliation Prompts.md

Approved visual reference:
docs/Loop/Event Workspace Redesign Voice Events (1).html

Expected branch:
feat/voice-events-total-redesign

Schema mode:
LOCKED

Allowed scope:
Visual and structural reconciliation of the lifecycle-aware Voice Events workspace: In-event Overview, Intelligence, Sessions, Speakers, Actions, the Pre-event experience, the Post-event experience, and final cross-lifecycle QA.

Out of scope:
Schema or migration changes, new APIs, duplicate event/intelligence/action systems, hard-coded demo data, kiosk changes, auth changes, unrelated Setup/Agenda redesigns, or product expansion beyond the approved HTML.

Canonical behavior to preserve:
- real persisted event, survey, response, evidence, session, speaker, and action data
- existing account/event scoping
- lifecycle URL override behavior
- loading, error, and Retry behavior
- working navigation, filters, evidence drilldowns, assignments, and action mutations
```

## Rules Applied to Every Prompt

1. Use the approved HTML as the visual and interaction source of truth. Use the live app as the data and production-behavior source of truth.
2. Work on only the active page or lifecycle state. Finish and verify it before moving to the next prompt.
3. Structural replacement is allowed. Do not preserve legacy modules merely because they already exist.
4. Do not hard-code the HTML’s sample values. Map real seeded data into the approved composition.
5. Use the authenticated seeded event and the correct lifecycle URL. Compare the HTML and live app at the same desktop viewport.
6. Run an internal visual loop: inspect → implement → browser-compare → correct → repeat. Do not stop at “closer.” Stop when the structure, hierarchy, density, spacing, typography, and interactions match closely.
7. Preserve completed shared-shell and lifecycle behavior. A shared primitive may be corrected when necessary, but verify that previously completed pages do not regress.
8. Keep changes focused. Max files per prompt: 14. Stop if a broader architectural change is genuinely required.
9. Add or update targeted tests for behavior touched. Run typecheck and the relevant browser journey before completing each prompt.
10. Report exact remaining visual differences. Do not claim parity when obvious differences remain.

---

# Prompt 1 — In-event Overview

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the In-event Overview page to the approved HTML.

Target state:
- Open the seeded event with lifecycle=in-event.
- Use the approved HTML’s In-event Overview as the exact reference.

Implement:
- Replace the page-specific composition where needed; this is not a CSS-only cleanup.
- Match the approved information hierarchy, column structure, card composition, typography, spacing, and density.
- Map real data into the approved Overview modules, including the review/attention area, working signals, coverage/confidence, open follow-up, and leadership brief where shown.
- Remove legacy KPI, rating, donut, issue-rail, or summary modules that are absent from the approved Overview.
- Preserve real evidence, follow-up, filtering, loading, error, Retry, and navigation behavior.

Verify:
- Compare HTML and live Overview at the same viewport and keep correcting until they closely match.
- Test populated, empty, loading, and error states affected by the change.
- Confirm the page remains responsive and does not reintroduce the prior browser freeze.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, removed legacy composition, real-data mapping, visual verification result, and any difference that could not be closed.
```

---

# Prompt 2 — In-event Intelligence

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the In-event Intelligence page to the approved HTML.

Target state:
- Use lifecycle=in-event and open the Intelligence tab.
- Use the approved HTML’s Intelligence state as the exact reference.

Implement:
- Replace the page-specific structure where the current legacy composition conflicts with the reference.
- Match the approved filter density, section order, card hierarchy, evidence presentation, typography, spacing, and responsive layout.
- Map real persisted themes, signals, opportunities, evidence, confidence, and counts into the approved composition.
- Preserve existing filter semantics, evidence drilldowns, selected state, URL context, loading, error, and Retry behavior.
- Remove modules or duplicate summaries that do not exist in the approved HTML.

Verify:
- Browser-compare the HTML and live page at the same viewport and keep correcting until parity is close.
- Exercise filters and every visible evidence interaction.
- Confirm completed Overview styling did not regress.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, structural changes, data mapping, interaction verification, and any unresolved visual difference.
```

---

# Prompt 3 — In-event Sessions

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the In-event Sessions page to the approved HTML.

Target state:
- Use lifecycle=in-event and open the Sessions tab.
- Use the approved HTML’s Sessions state as the exact reference.

Implement:
- Match the approved page structure, session list/table/cards, hierarchy, spacing, status treatment, filters, selected state, and evidence/details behavior.
- Structural replacement is allowed when the current component tree cannot match the reference.
- Use real seeded sessions, response coverage, sentiment/intelligence, speakers, and evidence.
- Preserve session navigation, filters, drilldowns, loading, empty, error, and Retry states.
- Remove legacy session modules that are not present in the approved HTML.

Verify:
- Compare at the same viewport and repeat corrections until the live page closely matches.
- Test selection, filtering, evidence/detail opening, empty results, and URL lifecycle preservation.
- Confirm Overview and Intelligence do not regress.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, structure replaced, real-data mapping, verified interactions, and remaining differences.
```

---

# Prompt 4 — In-event Speakers

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the In-event Speakers page to the approved HTML.

Target state:
- Use lifecycle=in-event and open the Speakers tab.
- Use the approved HTML’s Speakers state as the exact reference.

Implement:
- Match the approved speaker composition, hierarchy, density, metrics, status treatment, filters, detail/evidence behavior, typography, and spacing.
- Replace the existing page structure where needed instead of layering page-specific CSS over the wrong composition.
- Use real persisted speaker assignments, sessions, coverage, feedback, sentiment/intelligence, and evidence.
- Preserve navigation, filters, drilldowns, loading, empty, error, and Retry behavior.
- Remove legacy modules absent from the approved HTML.

Verify:
- Compare the live page and HTML at the same viewport and continue correcting until parity is close.
- Exercise speaker selection, filtering, session links, and evidence interactions.
- Confirm the three previously completed pages remain visually stable.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, structural changes, data mapping, interaction results, and unresolved differences.
```

---

# Prompt 5 — In-event Actions

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the In-event Actions page to the approved HTML.

Target state:
- Use lifecycle=in-event and open the Actions tab.
- Use the approved HTML’s Actions state as the exact reference.

Implement:
- Match the approved action-center structure, status hierarchy, assignment controls, filters, evidence context, activity/history treatment, density, typography, and spacing.
- Replace the legacy page composition where required.
- Use the canonical persisted action workflow and real seeded actions; do not create UI-only action state.
- Preserve assignment, status transitions, notes/voice note behavior, notification state, mobile visibility behavior, evidence links, loading, empty, error, and Retry states.
- Remove duplicate or legacy modules absent from the approved HTML.

Verify:
- Compare HTML and live Actions at the same viewport and loop until parity is close.
- Exercise the real action workflow without sending unintended external notifications.
- Confirm all completed In-event tabs remain visually stable.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, structural changes, canonical data/actions preserved, verified interactions, and remaining differences.
```

---

# Prompt 6 — Pre-event Experience

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the complete Pre-event workspace experience to the approved HTML.

Target state:
- Open the seeded future event with lifecycle=pre-event or the date-derived default.
- Use only the Pre-event states actually defined in the approved HTML.

Implement:
- Match the approved readiness experience, hierarchy, columns, setup gaps, agenda/listening-plan/survey/deployment readiness, speaker collection, calls to action, typography, spacing, and density.
- Replace the current Pre-event composition where needed; do not merely restyle legacy readiness cards.
- Use real persisted event setup and readiness data.
- Preserve Setup/Signals navigation, lifecycle switching, readiness links, loading, empty, error, and Retry behavior.
- Do not change event dates, status, readiness rules, or database state to force the view.
- Do not alter the completed In-event page compositions except for necessary shared fixes that are verified across all five tabs.

Verify:
- Compare every Pre-event state shown in the HTML against the live app at the same viewport.
- Test the date-derived default and explicit lifecycle override.
- Verify every readiness CTA routes to the correct real setup surface.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, Pre-event structure replaced, real readiness mapping, navigation verification, and remaining differences.
```

---

# Prompt 7 — Post-event Experience

```text
Model: Terra
Strength: Medium

Voice Events App

Reconcile the complete Post-event workspace and closing brief to the approved HTML.

Target state:
- Open the seeded event with lifecycle=post-event.
- Use only the Post-event states actually defined in the approved HTML.

Implement:
- Match the approved closing-brief structure, final outcomes, signal/theme summaries, follow-up status, leadership/executive brief, hierarchy, typography, spacing, and density.
- Replace the current Post-event composition where it conflicts with the reference.
- Use real persisted event, response, evidence, intelligence, and action data.
- Preserve evidence access, follow-up/action links, lifecycle switching, loading, empty, error, and Retry behavior.
- Do not change the real event status or dates when previewing Post-event.
- Do not regress completed Pre-event or In-event experiences.

Verify:
- Compare every Post-event state shown in the HTML against the live app at the same viewport and keep correcting until parity is close.
- Verify closing-brief links, evidence interactions, lifecycle persistence, and real status immutability.
- Run focused tests, the relevant Playwright journey, and typecheck.

Return the changed files, Post-event structure replaced, real-data mapping, verified interactions, and remaining differences.
```

---

# Prompt 8 — Final Cross-lifecycle Visual QA

```text
Model: Sol
Strength: Medium

Voice Events App

Run the final cross-page and cross-lifecycle reconciliation pass. Fix remaining drift; do not redesign the approved experience.

Review matrix:
- Pre-event experience
- In-event Overview
- In-event Intelligence
- In-event Sessions
- In-event Speakers
- In-event Actions
- Post-event experience

Required QA:
- Compare every listed state against the approved HTML at the same desktop viewport.
- Check shared width, event header, lifecycle switch, Setup/Signals navigation, tabs, typography, spacing, card primitives, filters, buttons, pills, empty states, loading states, errors, Retry, and evidence/detail surfaces.
- Check 1440px desktop, a narrower laptop viewport, tablet, and mobile for overflow or broken hierarchy.
- Verify lifecycle selection persists across refreshes and navigation and never changes persisted event data.
- Verify bootstrap requests remain bounded and no browser main-thread freeze or Page Unresponsive state returns.
- Fix remaining inconsistencies in the correct shared or page-specific layer. Remove temporary diagnostics and duplicated styling.
- Do not reopen product scope or add modules not present in the approved HTML.

Verification:
- Run all targeted component/API tests touched by this loop.
- Run the full Voice Events Playwright journey relevant to the workspace.
- Run typecheck and production build.
- Complete five consecutive authenticated hard reloads of the seeded workspace and navigate through all lifecycle states and tabs.

Return the final parity summary, all files changed, tests/build results, responsive findings, known remaining differences, and whether the branch is ready for human review.
```

---

# Starting Message for the Loop Agent

```text
Read the loop controller first, then read the plan, prompt pack, and approved HTML listed below.

Loop controller:
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/Loop/Voice Survey Redesign Brief.md

Prompt document:
docs/Loop/Voice Events Visual Reconciliation Prompts.md

Approved visual reference:
docs/Loop/Event Workspace Redesign Voice Events (1).html

Expected branch:
feat/voice-events-total-redesign

Schema mode:
LOCKED

Allowed scope:
Visual and structural reconciliation of the lifecycle-aware Voice Events workspace across the eight prompts in the prompt document.

Out of scope:
Schema/migrations, new APIs, hard-coded demo data, kiosk/auth changes, duplicate systems, unrelated product work, or redesign beyond the approved HTML.

Execute the prompts in order. For every prompt, use the authenticated seeded workspace and an internal browser visual loop. Finish and verify the active page/state before continuing. Stop only on a hard stop defined by the loop controller.
```
