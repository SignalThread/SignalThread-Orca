# SignalThread Voice for Events — Visual Cleanup Prompt Pack v2

Use this with the existing loop controller.

This prompt pack is for the **second visual cleanup pass** after the first Events redesign implementation. The first pass got functionally close, but the UI is not aligned tightly enough with the mockups. This pass is a **visual/product polish pass**, not a new product build.

The goal is to move the implemented Events UI much closer to the provided mockups while preserving the working functionality.

---

## Reference Images

### Target mockups / desired direction

Use these existing mockups in the repo as the target visual/product direction:

```text
docs/Loop/01-events-home.png
docs/Loop/02-create-event-conference.png
docs/Loop/03-create-event-expo.png
docs/Loop/04-create-event-workshop.png
docs/Loop/05-create-event-brand-activation.png
docs/Loop/06-create-event-blank.png
docs/Loop/07-event-workspace-overview.png
docs/Loop/08-event-workspace-areas.png
docs/Loop/09-event-workspace-surveys.png
docs/Loop/10-event-command-center.png
```

### Current implemented screenshots / actual UI to improve

Use these current implementation screenshots as the “before” state:

```text
docs/Loop/Event voice product landing page.png
docs/Loop/Event page 1.png
docs/Loop/Event page 2 .png
```

Map them like this:

```text
docs/Loop/Event voice product landing page.png
- Current Events Home / product landing page implementation.
- Compare against docs/Loop/01-events-home.png.

docs/Loop/Event page 1.png
- Current Event Workspace / Event Areas implementation.
- Compare against docs/Loop/07-event-workspace-overview.png and docs/Loop/08-event-workspace-areas.png.

docs/Loop/Event page 2 .png
- Current Event Workspace / Surveys implementation.
- Compare against docs/Loop/07-event-workspace-overview.png and docs/Loop/09-event-workspace-surveys.png.
```

If a current Command Center screenshot is present, use it too:

```text
docs/Loop/Event Summit 2026 Dashboard (1).png
docs/Loop/14-current-command-center.png
```

Compare any current Command Center screenshot against:

```text
docs/Loop/10-event-command-center.png
```

The mockups are not pixel-perfect specs, but the implemented UI should move much closer to their visual language, density, spacing, hierarchy, component polish, and interaction model.

---

## Visual Diff Summary

From comparing the mockups to the current implementation screenshots, the main gaps are:

1. **Overall product polish**
   - Current UI still carries old admin styling: large bordered white boxes, big generic action buttons, and heavier visual weight.
   - Mockups feel lighter, cleaner, more compact, and more product-designed.
   - The implementation needs stronger design consistency across home, create event, workspace, surveys, and command center.

2. **Header / page chrome**
   - Current implementation mixes old SignalThread header treatment with newer event UI.
   - Mockups use a calmer, compact admin header and more consistent page background.
   - Header/page shell should be event-only and should not affect SMB or retail.

3. **Pills, badges, and status labels**
   - Current pills are too chunky and inconsistent.
   - Mockups use smaller rounded pills with subtle backgrounds, lighter borders, tighter text, and consistent color meaning.
   - Tab count badges and filter counts should feel embedded, not bolted on.

4. **Tabs**
   - Current Event Workspace tabs still look like old underline nav tabs.
   - Mockups use soft segmented tabs with pill-like active states and small integrated count badges.
   - This is one of the biggest visible mismatches.

5. **Event hero / metric strip**
   - Current event hero is too plain and too admin-box-like.
   - Mockups use a compact rounded hero with top metadata, strong title, event description, right-side action stack, and integrated metric strip.
   - Buttons should be refined and properly stacked, not oversized generic admin buttons.

6. **Events Home**
   - Current home is cleaner than before, but it still feels like a generic admin command card and workspace table.
   - Mockup direction is a polished event operations home where the active event is the hero object.
   - The workspace/event list should avoid dense button clusters and old-style admin actions.

7. **Create Event flow**
   - The create screen is close, but needs tighter visual alignment:
     - quieter page background
     - centered title/subtitle block
     - cleaner form card radius/shadow
     - better input proportions
     - better template selected states
     - cleaner preview strip
     - footer CTA alignment and disabled/enabled styling

8. **Event Areas tab**
   - Current Event Areas rows are too tall and action-heavy.
   - Mockup uses compact grouped rows, small filter chips, subtle status badges, and small inline actions.
   - “Attach survey” should be visible but not oversized.
   - Edit/archive should not dominate every row.

9. **Surveys tab**
   - Current survey cards are bulky and still old-styled.
   - Mockup uses a cleaner two-column card:
     - left: survey identity, target/category, counts, questions
     - right: launchable state, QR panel, public link, launch kiosk, edit/archive
   - QR panel should be compact and polished.
   - Launch Kiosk should be the dominant action.

10. **Command Center**
   - The current dashboard screenshot provided earlier looked like the old stacked report layout.
   - Mockup direction is a tighter command center:
     - issue list and selected issue detail are the main experience
     - top summary is compact
     - sponsor value is separate
     - intelligence layer is secondary
     - QR/share is footer-level secondary

---

## Global Rules for Every Prompt

```text
Hard scope guardrail:
This work is for the EVENTS / Voice for Events admin experience only.

Do not touch the SMB product, SMB marketing site, SMB signup/Stripe flows, SMB dashboard behavior, retail voice survey flows, Google review/reputation flows, or any VITE_SITE_MODE=smb behavior.

Do not change shared components in a way that visually or behaviorally affects SMB/retail pages unless the change is fully isolated behind event-specific components or event-only routes.

If a shared component must be touched, first identify every non-event usage and preserve existing SMB/retail behavior exactly.

This is a visual cleanup pass:
- Preserve the implemented functionality.
- Do not add fake data.
- Do not create new product systems.
- Do not rewrite working backend flows.
- Do not change schema unless a previous implementation introduced a broken persistence requirement that cannot be fixed otherwise.

Product UX standard:
Do not build mechanical/database-shaped UI. Think like a strong product designer. The final UI should have clear hierarchy, obvious primary actions, polished spacing, responsive behavior, useful empty states, and workflows that feel intentionally designed.
```

---

# Prompt 1 — Audit Visual Gaps Against Mockups and Current Screenshots

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Audit only. Do not change files.

Task:
Compare the current implemented Events UI screenshots against the mockup/reference images in docs/Loop and produce an exact visual cleanup map before making code changes.

Target mockups:
- docs/Loop/01-events-home.png
- docs/Loop/02-create-event-conference.png
- docs/Loop/03-create-event-expo.png
- docs/Loop/04-create-event-workshop.png
- docs/Loop/05-create-event-brand-activation.png
- docs/Loop/06-create-event-blank.png
- docs/Loop/07-event-workspace-overview.png
- docs/Loop/08-event-workspace-areas.png
- docs/Loop/09-event-workspace-surveys.png
- docs/Loop/10-event-command-center.png

Current implementation screenshots:
- docs/Loop/Event voice product landing page.png
- docs/Loop/Event page 1.png
- docs/Loop/Event page 2 .png

Optional current Command Center screenshot if present:
- docs/Loop/Event Summit 2026 Dashboard (1).png
- docs/Loop/14-current-command-center.png

Scope:
Events / Voice for Events admin experience only.

Out of scope:
Do not touch the SMB product, SMB marketing site, SMB signup/Stripe flows, SMB dashboard behavior, retail voice survey flows, Google review/reputation flows, or VITE_SITE_MODE=smb behavior.

Audit goals:
1. Identify where the current UI diverges from the mockups by page:
   - Events Home / product landing page
   - Create Event
   - Event Workspace Overview
   - Event Areas tab
   - Surveys tab
   - Command Center
2. Identify shared visual problems:
   - page background
   - max-width/container
   - typography scale
   - card radius/shadows/borders
   - button styling
   - pill/badge styling
   - tab styling
   - row/card density
   - action hierarchy
   - responsive behavior
3. Identify exact files/components likely responsible for each mismatch.
4. Identify event-only shared components that should be adjusted first.
5. Identify any shared components that are risky because they may affect SMB/retail.
6. Recommend the smallest safe implementation order for the cleanup.

Important:
This is a visual polish pass. Do not propose product expansion. Do not add fake data. Do not create new backend systems. Schema is open globally, but this prompt should not need schema changes.

Return:
1. Visual gap summary by page.
2. Exact components/files likely to change.
3. Shared event-only components to fix first.
4. Risky shared components to avoid or isolate.
5. Recommended implementation order.
6. Tests/verification to run after cleanup.
```

---

# Prompt 2 — Event Visual System Polish Pass

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Implement the event-only visual system polish needed to make the Events UI match the mockup language more closely.

Use the Prompt 1 audit results before editing.

Reference mockups:
- docs/Loop/01-events-home.png
- docs/Loop/02-create-event-conference.png
- docs/Loop/07-event-workspace-overview.png
- docs/Loop/08-event-workspace-areas.png
- docs/Loop/09-event-workspace-surveys.png
- docs/Loop/10-event-command-center.png

Current implementation screenshots:
- docs/Loop/Event voice product landing page.png
- docs/Loop/Event page 1.png
- docs/Loop/Event page 2 .png

Task:
Clean up shared event-only UI primitives/styles so all Events pages stop looking like the old admin UI and move toward the mockups.

Focus areas:
1. Page shell:
   - light cool-gray background
   - consistent max-width
   - consistent vertical rhythm
   - less boxy/admin feel

2. Header/brand treatment:
   - compact SignalThread/Admin header
   - consistent across Events Home, Create Event, Event Workspace, and Command Center
   - do not affect SMB/retail headers

3. Cards:
   - softer radius
   - lighter border
   - subtle shadow
   - less bulky padding where rows should be compact
   - cleaner separation between major panels and nested panels

4. Pills/badges:
   - compact rounded pills
   - consistent colors for live/active/ready/needs survey/launchable/immediate/soon/watch/positive/negative
   - small integrated count badges
   - avoid oversized uppercase chunky admin badges

5. Buttons/actions:
   - primary dark/navy or brand-blue action hierarchy as shown in mockups
   - secondary buttons lighter and calmer
   - critical actions have text labels
   - destructive actions separated and visually distinct
   - avoid giant buttons inside dense rows

6. Tabs:
   - soft segmented tab container
   - pill-like active tab
   - integrated count badges
   - remove old underline tab styling from Event Workspace

7. Filter chips and object rows:
   - smaller, cleaner chips
   - compact event object rows
   - hover/click states where rows are clickable

Before editing:
1. Identify exact event-only shared components/styles to change.
2. Identify whether any shared non-event component would be touched.
3. If a shared non-event component must be touched, stop and explain before changing it.

Scope:
- Event-only shared visual primitives and styles.
- Do not rewrite individual pages fully in this prompt.
- Do not touch SMB/retail.
- Do not change backend behavior.
- Do not add fake data.

Acceptance checks:
- Event shared visual primitives are cleaner and closer to mockups.
- Pills/badges/tabs/buttons have consistent event-only styling.
- No SMB/retail shared UI regression risk.
- Existing Events pages still render.
- `npm run typecheck` passes.
- Run targeted tests for changed components if available.

Return:
- Files changed.
- Visual system changes made.
- Any shared component touched and why.
- Confirmation that SMB/retail were not touched.
- Verification results.
- Remaining page-level polish still needed.
```

---

# Prompt 3 — Polish Events Home and Create Event Flow

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Polish the Events Home and Create Event flow to match the mockups more closely.

Use the Prompt 1 audit and Prompt 2 visual system changes before editing.

Reference mockups:
- docs/Loop/01-events-home.png
- docs/Loop/02-create-event-conference.png
- docs/Loop/03-create-event-expo.png
- docs/Loop/04-create-event-workshop.png
- docs/Loop/05-create-event-brand-activation.png
- docs/Loop/06-create-event-blank.png

Current screenshot:
- docs/Loop/Event voice product landing page.png

Task:
Bring the Events Home and Create Event pages much closer to the mockup direction without changing the core product behavior.

Events Home cleanup:
1. Make it feel like a polished account/event command hub, not an old admin menu.
2. Clean up the hero/active-event treatment.
3. Make Open Workspace and View Command Center visually clear.
4. Keep Create Event available but not visually overpowering.
5. Remove or reduce old-style icon/action clutter.
6. Make event/workspace rows clean, clickable, and readable.
7. Use softer cards, cleaner stats, better spacing, and consistent event pills.
8. Preserve existing actions:
   - open workspace
   - view command center/dashboard
   - create event
   - edit/copy/pause/kiosk/QR/delete if currently available

Create Event cleanup:
1. Match the centered title/subtitle direction.
2. Match the large rounded form card direction.
3. Clean up input sizing, spacing, border radius, and placeholder styling.
4. Make starting-point cards cleaner and closer to mockups.
5. Make selected template state match the mockup: clear blue border, check indicator, soft icon block.
6. Make the preview strip cleaner.
7. Make footer actions match the mockup:
   - Start blank secondary
   - Create event disabled/enabled styling
8. Preserve template behavior and event creation behavior.

Before editing:
1. Identify exact page/components to change.
2. Identify current actions/routes to preserve.
3. Check whether the event-only visual primitives from Prompt 2 can be reused.
4. Re-check branch and dirty state.

Scope:
- Events Home.
- Create Event flow.
- Event-only components needed by these pages.
- Do not touch Event Workspace tabs or Command Center except shared event-only primitives.
- Do not touch SMB/retail.
- Do not change schema unless an existing UI field cannot persist correctly and this is already covered by the plan.

Data rules:
- Use real data only.
- Do not add fake stats, fake events, fake responses, or fake sentiment.
- If a metric is unavailable, omit it or show a truthful empty state.

Acceptance checks:
- Events Home looks significantly closer to the mockup direction.
- Create Event looks significantly closer to the mockup direction.
- Template cards visually match selected/unselected/blank states better.
- Existing event creation still works.
- Existing home actions still work.
- Empty states still work.
- No fake data introduced.
- SMB/retail untouched.
- `npm run typecheck` passes.
- Run targeted tests for Events Home/Create Event.

Return:
- Files changed.
- Visual cleanup completed.
- Behavior preserved/changed.
- Tests run.
- Verification results.
- Remaining risks.
```

---

# Prompt 4 — Polish Event Workspace Overview, Areas, and Surveys

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Polish the Event Workspace pages/tabs to match the mockups more closely.

Use the Prompt 1 audit and Prompt 2 visual system changes before editing.

Reference mockups:
- docs/Loop/07-event-workspace-overview.png
- docs/Loop/08-event-workspace-areas.png
- docs/Loop/09-event-workspace-surveys.png

Current screenshots:
- docs/Loop/Event page 1.png
- docs/Loop/Event page 2 .png

Task:
Bring the Event Workspace shell, Overview tab, Event Areas tab, and Surveys tab closer to the mockup direction.

Workspace shell cleanup:
1. Hero should match mockup structure:
   - breadcrumb/context
   - live/status/date/location metadata
   - strong title
   - description
   - right-side action stack
   - integrated metric strip
2. Tabs should be soft segmented tabs with integrated count badges.
3. Page spacing should be tighter and less old-admin.

Overview tab cleanup:
1. Launch Readiness should match mockup density and style.
2. Next Best Action should be visually important but not oversized.
3. Event Structure summary should use compact rows and clean pills.
4. Command Center and Settings cards should match the mockup hierarchy.

Event Areas tab cleanup:
1. Make rows compact like the mockup, not giant cards.
2. Filter chips should be smaller and cleaner.
3. Group headings should be subtle with category pill + description + item count.
4. Status badges should be compact:
   - Survey attached
   - No survey yet
5. Attach survey should be visible but not oversized.
6. Edit/archive should be secondary and not dominate the row.
7. Rows should remain clickable where appropriate.
8. Search/filter behavior must keep working.

Surveys tab cleanup:
1. Cards should match the two-column mockup:
   - left: survey status, category/target, name, description, counts, question preview
   - right: launchable pill, QR panel, public URL, launch kiosk, edit/archive
2. QR panel should be compact and polished.
3. Launch Kiosk should be the dominant per-survey action.
4. Edit/Archive should be secondary.
5. Public launch URL should be compact and copyable.
6. Preserve QR/link/kiosk behavior.

Before editing:
1. Identify exact files/components to change.
2. Identify shared event-only components used by Workspace.
3. Identify current search/filter/tab logic to preserve.
4. Identify current QR/link/kiosk behavior to preserve.

Scope:
- Event Workspace shell.
- Overview tab.
- Event Areas tab.
- Surveys tab.
- Event-only components needed by these pages.
- Do not touch Command Center except shared event-only primitives.
- Do not touch SMB/retail.
- Do not change backend behavior unless fixing a clear UI wiring bug.

Data rules:
- Use real data only.
- Do not add fake counts, fake surveys, fake links, fake responses, or fake readiness states.
- If data is missing, show a truthful empty state.

Acceptance checks:
- Workspace shell looks much closer to mockup.
- Tabs look like mockup segmented tabs, not old underline tabs.
- Event Areas rows are compact and scannable.
- Surveys cards are cleaner and closer to the mockup.
- Search/filter/tabs still work.
- QR/link/kiosk actions still work.
- Create Survey, Event Settings, View Live Dashboard still work.
- No fake data introduced.
- SMB/retail untouched.
- `npm run typecheck` passes.
- Run targeted tests for Event Workspace pages/tabs.

Return:
- Files changed.
- Visual cleanup completed.
- Behavior preserved/changed.
- Tests run.
- Verification results.
- Remaining risks.
```

---

# Prompt 5 — Polish Command Center and Final Responsive QA

```text
Model: Claude Opus
Reasoning: High

Admin / Voice App

Polish the Command Center and run a final responsive/visual QA pass across the Events redesign.

Use the Prompt 1 audit and Prompt 2 visual system changes before editing.

Reference mockup:
- docs/Loop/10-event-command-center.png

Optional current Command Center screenshot if present:
- docs/Loop/Event Summit 2026 Dashboard (1).png
- docs/Loop/14-current-command-center.png

Task:
Bring the Command Center closer to the mockup direction, then do a final cross-page cleanup pass for consistency.

Command Center cleanup:
1. Header should match the mockup:
   - Back to Workspace
   - Command Center label
   - updated timestamp
   - refresh
   - auto-refresh pill
2. Top summary should be cleaner and less heavy.
3. Survey/Event Area filters should match the mockup size and visual style.
4. Priority mix card should match the mockup density and hierarchy.
5. Metric cards should be compact and consistent.
6. Needs Attention Now cards should match the mockup:
   - compact priority/sentiment/category/evidence row
   - issue title
   - source/context
   - summary
   - recommended action box
   - View evidence
   - Copy brief
   - status selector
7. Selected Issue Detail should align visually with the issue list and feel like a real evidence review panel.
8. Sponsor Activation Value should be a clean separate module.
9. Intelligence Layer cards should be compact and secondary.
10. Share/Kiosk/QR footer should stay visually secondary.

Final cross-page QA:
1. Confirm Events Home, Create Event, Event Workspace, and Command Center feel like one product.
2. Confirm pills/badges/tabs/buttons are consistent.
3. Confirm major pages have matching background, max-width, spacing, and card style.
4. Confirm responsive behavior is acceptable.
5. Confirm empty/loading states are not broken.
6. Confirm no SMB/retail files or behavior were touched.

Before editing:
1. Identify exact Command Center files/components to change.
2. Identify issue selection/evidence/status/copy/refresh/filter behavior to preserve.
3. Identify whether any shared component change could affect non-event pages.
4. Re-check branch and dirty state.

Scope:
- Command Center page.
- Event-only components needed by Command Center.
- Final cross-page event-only polish.
- Do not touch SMB/retail.
- Do not change analytics/backend behavior unless fixing a clear UI wiring bug.

Data rules:
- Use real data only.
- Do not add fake satisfaction, fake urgency, fake priority mix, fake evidence, fake sponsor signals, or fake positive signals.
- If a metric is unavailable, show a truthful empty state.

Acceptance checks:
- Command Center looks much closer to the mockup.
- Issue selection/evidence panel still works.
- Refresh/filter/status/copy actions still work.
- Sponsor module and intelligence layer are visually cleaner.
- Share/kiosk footer is secondary and still works.
- Events pages feel visually consistent.
- Responsive behavior is acceptable.
- Empty states are intentional.
- No fake data introduced.
- SMB/retail untouched.
- `npm run typecheck` passes.
- Run targeted tests for Command Center.
- Run broader Events tests if reasonable.

Return:
- Files changed.
- Visual cleanup completed.
- Behavior preserved/changed.
- Tests run.
- Typecheck/build result.
- Confirmation SMB/retail were not touched.
- Remaining risks or follow-up.
```

---

## Suggested Loop Starting Message

Use this with the generic loop controller:

```text
Read the loop controller first, then read the plan and prompt docs listed below.

Loop controller:
docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
docs/Loop/Events Redesign Implementation Plan.md

Prompt document:
docs/Loop/Events Redesign Visual Cleanup Prompts.md

Expected branch:
feat/events-redesign-loop

Schema mode:
OPEN

Allowed scope:
Only the SignalThread Voice for Events admin experience:
- Events Home / Account Command Hub
- Create Event flow and event templates
- Event Workspace / Event Detail
- Event Areas tab
- Surveys tab
- Command Center / Live Dashboard
- Event-only shared UI primitives needed by those pages

Out of scope:
Do not touch the SMB product, SMB marketing site, SMB signup or Stripe flows, SMB dashboard behavior, retail voice survey flows, Google review/reputation flows, or any VITE_SITE_MODE=smb behavior.

Canonical models/services:
Use the existing event voice product architecture as canonical:
- Event as the top-level event container
- current canonical event structure/event areas model
- current event voice survey model
- PublicSurveyLink / token-based survey links
- Response, Answer, AnswerTranscript, AnswerAnalysis
- existing kiosk, QR/link, transcription, analysis, and dashboard insight flows

Execution instructions:
Execute the prompts in the prompt document in order. Do not skip prompts. Do not combine prompts. Do not invent extra prompts.

This is a visual cleanup pass. Preserve the implemented functionality. Move the UI closer to the mockups and use the current screenshots as before-state references. Stop only on the hard stops in the loop controller.

Start now with Prompt 1.
```
