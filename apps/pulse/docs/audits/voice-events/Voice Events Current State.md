# SignalThread Voice for Events — Current Product Surface & Functionality Map

_Last updated: 2026-07-01_

## Purpose of this document

This is a current-state product map for the SignalThread Voice for Events experience that has been built so far. It defines the visible product surfaces, what each screen does, how the core flows connect, and which functionality appears to be present based on the current UI/screenshots and implementation work discussed.

This is **not** a gap audit yet. It is the baseline we should use before asking Fable or another agent to compare the product against target designs, code, and desired event workflows.

## Product positioning

SignalThread Voice for Events is an event intelligence product.

The core promise is:

> Live attendee voice → event signals → operational attention items → action while the event is still happening.

The event experience should feel like an operator command product, not a generic survey database, SMB review dashboard, or retail feedback tool.

## Current product hierarchy

The current Events mode appears to organize the product like this:

```text
Events Home
  → Event Workspace / Venue
    → Event Container
      → Event Areas / Touchpoints
        → Surveys / Listening Points
          → Public Link / QR Code / Kiosk Launch
            → Attendee Responses
              → Answers
                → Transcript + Analysis
                  → Command Center / Live Event Intelligence
```

User-facing terms currently used:

| Term | Meaning |
| --- | --- |
| Event | The top-level live or scheduled event container, such as “Live Experience Summit 2026.” |
| Event Workspace | The operational workspace/venue that holds the event. Example: “SignalThread Live Venue.” |
| Event Area / Touchpoint | A place, session, area, sponsor activation, or custom feedback collection point inside an event. |
| Survey | A listening point attached to an event or event area. It has questions, a public link, QR code, and kiosk launch path. |
| Public Launch URL | A shareable/token-based link for a specific survey/listening point. |
| Kiosk | The attendee-facing voice capture surface launched from a survey link/QR. |
| Response | One attendee submission session. |
| Answer | One voice/text answer inside a response. |
| Live Event Intelligence / Command Center | The operator dashboard that turns analyzed attendee answers into attention items, evidence, recommendations, and summaries. |
| Attention Item / Issue | A detected operational signal requiring review, triage, or action. |
| Evidence | The attendee quotes/transcripts, sentiment, source, and metadata supporting an attention item. |

## Source screenshots used for this map

The current visual baseline is represented by these screenshots:

1. `event homepage.png` — Events home / “Your events”
2. `Event 1.png` — Event Workspace Overview tab
3. `Event 2.png` — Event Workspace Event Areas tab
4. `Event 3.png` — Event Workspace Surveys tab
5. `Event Dashboard (Command Center).png` — Live Event Intelligence / Command Center

A previous screenshot also showed the Create New Event page. That surface is included below because it is part of the current built flow even though it is not one of the five final screenshots listed above.

---

# 1. Events Home

## Screen name

**Voice for Events / Your events**

## Purpose

The Events Home is the operator’s starting point. It summarizes live, upcoming, and past event activity and routes the user into the active event workspace, live dashboard, kiosk, or event creation flow.

## Current visible elements

- Eyebrow: `VOICE FOR EVENTS`
- Page title: `Your events`
- Subtitle: `Everything you're listening to — live, scheduled, and wrapped.`
- Primary CTA: `+ New event`
- Summary cards:
  - Live right now
  - Responses today
  - Need action
- Event sections:
  - `LIVE NOW`
  - `UPCOMING`
  - `PAST EVENTS`

## Live event card

The live event card is the main operational entry point.

Visible content:

- Live/day badge, such as `LIVE · DAY 1`
- Date range
- Venue/location
- Event name
- Metrics:
  - Responses
  - Surveys
  - Satisfaction
  - Attention
- Attention alert strip, such as `2 immediate items`
- Primary action: `Open workspace`
- Secondary action: `Live dashboard`
- Secondary action: `Launch kiosk`

## Current actions

| Action | Expected behavior |
| --- | --- |
| New event | Opens the Create New Event flow. |
| Open workspace | Opens the Event Workspace for the live event. |
| Live dashboard | Opens the Live Event Intelligence / Command Center for the event. |
| Launch kiosk | Opens the attendee kiosk flow for the event or primary survey. |
| Review | Routes to the live dashboard/attention items for the event. |
| View archive | Opens or implies past event archive access. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Live event summary | Present in UI |
| Live event CTA routing | Present in UI; should be verified in code/tests |
| Upcoming events | Present in target UI; current screenshot may show sample/demo upcoming events |
| Past events | Present in target UI; current screenshot may show sample/demo past events |
| Need action summary | Present in UI |
| Polished event-first language | Mostly present |

## Notes

The Events Home is now visually positioned as an event command entry point instead of a workspace/container database list. The main remaining distinction to verify is which upcoming/past rows are real data versus demo/static presentation.

---

# 2. Create New Event

## Screen name

**Create a new event**

## Purpose

The Create New Event page lets an operator create a new event container and optionally select a starting template for its event structure.

## Current visible elements from prior screenshot

- Eyebrow: `VOICE FOR EVENTS`
- Page title: `Create a new event`
- Subtitle: `Create an event container for attendee feedback, surveys, and intelligence.`
- Step 1: `Name your event`
  - Event name
  - Venue
  - Start date
  - End date
  - Description
  - Event workspace
- Step 2: `Choose a starting point`
  - Conference
  - Expo / Trade Show
  - Workshop
  - Brand Activation
  - Blank Event
- Bottom actions:
  - Cancel
  - Start/Create flow controls

## Current actions

| Action | Expected behavior |
| --- | --- |
| Enter event name | Required field for event creation. |
| Add venue/date/description | Optional event metadata. |
| Choose template | Selects a starting event structure template. |
| Blank Event | Creates an event with no predefined areas. |
| Create/Start | Creates the event container and routes to workspace or next setup step. |
| Cancel | Exits back to the Events Home or previous page. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Basic event creation form | Present |
| Event workspace assignment | Present as a visible field |
| Template selection | Present |
| Blank event path | Present |
| Visual polish pass | Recently requested/applied; should verify final screenshot/code |
| Backend behavior | Should be verified in code/tests |

## Notes

This surface is setup-oriented. It should stay focused on creating the event container and initial structure, not on creating surveys/responses/analytics directly.

---

# 3. Event Workspace Shell

## Screen name

**SignalThread Live Experience Summit 2026 / Event Workspace**

## Purpose

The Event Workspace is the central operating page for one event. It provides the event summary, global actions, metrics, and tabs for setup, areas, surveys, and operations.

## Current visible elements

- Breadcrumb:
  - Dashboard
  - SignalThread Live Venue
  - Live Experience Summit 2026
- Event status/date/location row:
  - `LIVE NOW`
  - Date range
  - Venue and city/state
- Event title
- Description
- Global actions:
  - `View Live Dashboard`
  - `Create Survey`
  - `Event Settings`
- Metrics row:
  - Surveys
  - Responses
  - Answers Captured
  - Feedback Points
- Tabs:
  - Overview
  - Event Areas
  - Surveys
  - Operations

## Current actions

| Action | Expected behavior |
| --- | --- |
| View Live Dashboard | Opens Command Center / Live Event Intelligence. |
| Create Survey | Starts survey creation within this event. |
| Event Settings | Opens settings/editing for event metadata/configuration. |
| Overview tab | Shows setup readiness and next best action. |
| Event Areas tab | Shows structure/touchpoints where feedback can be collected. |
| Surveys tab | Shows listening points, links, QR codes, and kiosk actions. |
| Operations tab | Reserved or implemented for operational controls; exact current content needs verification. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Event-level summary/header | Present |
| Event metrics | Present |
| Workspace tabs | Present |
| Dashboard routing | Present in UI |
| Survey creation routing | Present in UI |
| Event settings routing | Present in UI |
| Operations tab details | Needs definition/verification |

---

# 4. Event Workspace — Overview Tab

## Screen name

**Overview / Setup & Operations**

## Purpose

The Overview tab tells the operator whether the event is ready to collect live attendee feedback and what the next best setup/action is.

## Current visible elements

Left card: `Setup & Operations`

- Readiness summary, such as `5 / 5 ready`
- Setup stages:
  - Event details
  - Event Areas
  - Surveys
  - Links & QR
  - Command center

Right side:

- `Next Best Action` card
- Event Structure card grouped by feedback point type:
  - Event-wide
  - Sessions
  - Areas
  - Sponsor Activations
  - Custom Touchpoints

## Current actions

| Action | Expected behavior |
| --- | --- |
| Review uncovered touchpoints | Opens Event Areas or a filtered view for areas with no survey attached. |
| Setup stage click, if clickable | May route to relevant setup area; should verify. |
| Event Structure rows | Likely summarize structure and uncovered survey gaps. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Setup readiness checklist | Present |
| Next best action | Present |
| Event structure summary | Present |
| Uncovered touchpoint count | Present |
| Routing from next action | Should be verified |

## Notes

This tab is important because it translates setup state into a clear operator workflow. It should remain action-oriented rather than just informational.

---

# 5. Event Workspace — Event Areas Tab

## Screen name

**Event Areas**

## Purpose

The Event Areas tab defines where and when attendee feedback is collected. It represents the event structure/touchpoints that can have surveys attached.

## Current visible elements

- Title: `Event Areas`
- Subtitle: `Where and when attendee feedback is collected.`
- Primary CTA: `+ Add Area / Session`
- Search field: `Search areas, sessions, touchpoints`
- Filter chips:
  - All
  - Event-wide
  - Sessions
  - Areas
  - Sponsor Activations
  - Custom Touchpoints
  - Needs survey
- Grouped area sections:
  - Event-wide
  - Sessions
  - Areas
  - Sponsor Activations
  - Custom Touchpoints
- Area rows with:
  - Title
  - Description
  - Date/time or timezone/location metadata
  - Survey status badge, such as `Survey attached` or `No survey yet`
  - Actions:
    - Attach survey
    - Edit
    - Archive/delete icon

## Current actions

| Action | Expected behavior |
| --- | --- |
| Add Area / Session | Opens a creation flow for a new feedback point/touchpoint. |
| Search | Filters event areas by text. |
| Type filters | Filters by area category/type. |
| Needs survey | Filters to touchpoints without an attached survey. |
| Attach survey | Starts or opens survey attachment/creation for that area. |
| Edit | Edits the touchpoint metadata. |
| Archive/delete icon | Archives/removes the touchpoint, subject to rules. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Event structure by category | Present |
| Touchpoint survey status | Present |
| Add/edit/attach actions | Present in UI |
| Search/filter UX | Present in UI |
| Needs survey workflow | Present in UI |
| Archive/delete rules | Needs backend/rules verification |

## Notes

This tab is the bridge between event planning structure and voice collection coverage. It should remain focused on touchpoints and survey coverage, not raw analytics.

---

# 6. Event Workspace — Surveys Tab

## Screen name

**Surveys**

## Purpose

The Surveys tab manages active listening points for the event. Each survey has questions, responses, a token-based public launch URL, QR code, and kiosk launch path.

## Current visible elements

- Title: `Surveys`
- Subtitle: `5 active listening points — each gets its own token-based kiosk link.`
- Primary CTA: `+ Create Survey`
- Survey cards/rows with:
  - Status badge, such as `ACTIVE`
  - Category badge, such as `EVENT` or `SESSION`
  - Survey/source label
  - Survey name
  - Description
  - Counts:
    - questions
    - responses
    - voice only
  - Questions list
  - Launchable status
  - QR code preview
  - QR actions:
    - View QR
    - Download PNG
    - Copy link
  - Public Launch URL field
  - Launch Kiosk button
  - Edit button
  - Archive button

## Current actions

| Action | Expected behavior |
| --- | --- |
| Create Survey | Creates a new survey/listening point for the event. |
| View QR | Opens or displays the QR code for the survey. |
| Download PNG | Downloads print/share-ready QR code image. |
| Copy link | Copies the public launch URL. |
| Launch Kiosk | Opens attendee kiosk capture for that specific survey. |
| Edit | Edits survey details/questions/settings. |
| Archive | Archives the survey/listening point. |
| Copy URL icon | Copies the public launch URL. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Survey list under event | Present |
| Survey questions visible | Present |
| Per-survey QR code | Present |
| Token/public link concept | Present in UI |
| Kiosk launch | Present in UI |
| Edit/archive actions | Present in UI |
| Token-based backend wiring | Must be verified in code |
| QR/download/copy behavior | Should be verified in tests |

## Notes

This is one of the most important event-specific surfaces because it proves the model is not just one generic event survey. Each event listening point can have its own link and QR.

---

# 7. Live Event Intelligence / Command Center

## Screen name

**Live Event Intelligence**

## Purpose

The Command Center turns processed attendee answers into operational intelligence. It shows what needs attention now, why it matters, what evidence supports it, and what the event team should do next.

## Current visible elements

Top bar:

- Back to Workspace
- Command Center label
- Last updated timestamp
- Refresh button
- Auto-refresh status

Header:

- Event eyebrow/name
- Title: `Live Event Intelligence`
- Subtitle: `Operator-ready patterns, attention items, and evidence from live attendee answers.`
- Filters:
  - Survey dropdown
  - Event Area dropdown

Top intelligence cards:

- AI summary card
  - Analyzed answer/response count
  - High-urgency issue summary
  - Inferred satisfaction score
  - Satisfaction distribution bar
- Priority Mix card
  - Donut chart
  - Immediate/Soon/Watch/Informational counts
- Metrics:
  - Responses
  - Answers Analyzed
  - Active Attention
  - Affected Areas
  - Event Status

Main triage area:

- `Needs Attention Now`
- Copy summary button
- Issue cards sorted by priority/evidence/recency/signal strength
- Selected Issue Detail pane on the right

Lower intelligence areas:

- Sponsor Activation Value section
- Intelligence Layer cards:
  - Patterns & Opportunities
  - Feedback Sources
  - Positive Signals

## Attention item card content

Each issue card currently shows:

- Priority badge, such as Immediate/Soon/Watch
- Sentiment badge, such as Negative/Positive/Neutral
- Category/source badge, such as Wayfinding, Access/Check-in, Sponsor/Exhibitor
- Evidence count
- Last seen timestamp/date
- Title
- Survey/question source
- Confidence indicator
- Summary text
- Recommended action
- Actions:
  - View evidence
  - Copy brief
  - Status dropdown

## Selected Issue Detail pane

The right-side pane shows the currently selected issue and supporting evidence.

Visible content:

- Priority and sentiment badges
- Issue title
- Source survey/question context
- Question asked
- Attendee evidence/transcript snippets
- Sentiment/date/source metadata
- Recommended action
- Status dropdown
- Copy brief button

## Current actions

| Action | Expected behavior |
| --- | --- |
| Refresh | Re-fetches latest command center data. |
| Auto-refresh | Indicates or controls automatic polling. |
| Survey filter | Filters intelligence by survey. |
| Event Area filter | Filters intelligence by area/touchpoint. |
| Click issue card | Selects the issue and updates the right-side detail pane. |
| View evidence | Should select/update the right pane, not open a drawer. |
| Copy brief | Copies a concise issue/action summary. |
| Copy summary | Copies the overall command center summary. |
| Status dropdown | Updates or stages issue triage status. |
| Back to Workspace | Returns to the event workspace. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Command center layout | Present |
| Summary/satisfaction/priority metrics | Present |
| Issue list | Present |
| Selected issue pane | Present |
| Evidence display | Present |
| Drawer removal requested/applied | Should be verified in code/tests |
| Copy summary/brief | Present in UI; behavior should be verified |
| Filters | Present in UI; backend scoping should be verified |
| Auto-refresh | Present in UI; behavior should be verified |
| Status updates | Present in UI; persistence should be verified |
| Sponsor activation intelligence | Present |
| Intelligence layer | Present |

## Notes

The Command Center is the strongest expression of the event-intelligence product promise. It should remain the operational triage surface, not a generic analytics report.

---

# 8. Evidence Detail Behavior

## Current intended behavior

The selected issue detail pane should be the canonical evidence view.

Current intended interaction:

1. Operator clicks an issue card or `View evidence`.
2. The issue becomes selected.
3. The right-side pane updates with full evidence and recommended action.
4. No drawer, modal, overlay, or backdrop should open on desktop.

## Responsive expectation

| Breakpoint | Expected behavior |
| --- | --- |
| Desktop/tablet | Use right-side selected issue pane. |
| Mobile/narrow | Render selected issue detail inline without a drawer/overlay. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Right-side evidence pane | Present |
| Drawer/modal evidence view | Should be removed/disabled |
| View evidence behavior | Should select/update pane |
| Mobile non-drawer behavior | Needs verification |

---

# 9. Sponsor Activation Value

## Screen area

Lower section inside Live Event Intelligence.

## Purpose

This section isolates sponsor/exhibitor-related attendee feedback so operators can understand sponsor value, follow-up friction, and activation performance.

## Current visible elements

- Section title: `Sponsor Activation Value`
- Description: `Sponsor ROI intelligence — mentions, sentiment, and themes for activation touchpoints.`
- Sponsor/booth card, such as `SignalThread Demo Booth`
- Metrics:
  - mentions
  - responses
- Sentiment badge
- Theme chips, such as:
  - Sponsor demo value
  - Follow-up clarity
  - Sponsor relevance
- Related issue/insight card, such as `Follow-up path is unclear`
- Evidence quote
- View evidence link

## Current actions

| Action | Expected behavior |
| --- | --- |
| View evidence | Selects/opens supporting evidence for sponsor-related insight. |

## Current functionality status

| Capability | Status |
| --- | --- |
| Sponsor/exhibitor intelligence section | Present |
| Sponsor-related themes | Present |
| Sponsor evidence preview | Present |
| Drilldown behavior | Should be verified |

---

# 10. Intelligence Layer

## Screen area

Bottom section inside Live Event Intelligence.

## Purpose

The Intelligence Layer provides secondary pattern review beyond immediate attention items. It helps operators understand recurring problems, feedback sources, and positive signals.

## Current visible cards

### Patterns & Opportunities

Shows grouped signals such as:

- Needs action
- Watch
- Issue titles
- Evidence counts
- Categories/sources

### Feedback Sources

Shows source/target/question breakdowns:

- Targets
- Questions
- Answer counts
- Urgency counts
- Bar indicators

### Positive Signals

Shows:

- Inferred satisfaction
- Sentiment distribution
- What’s working themes
- Mention counts

## Current functionality status

| Capability | Status |
| --- | --- |
| Secondary intelligence summary | Present |
| Feedback source breakdown | Present |
| Positive signal analysis | Present |
| Drilldown behavior | Needs verification |

---

# 11. Attendee Kiosk / Public Link Flow

## Purpose

The public link/QR/kiosk flow is how attendees submit voice feedback for a specific event survey/listening point.

## Current flow implied by UI

```text
Survey QR / Public Launch URL
  → Kiosk launch
    → Attendee answers survey questions by voice
      → Response and answers are created
        → Audio is uploaded
          → Transcription and analysis run
            → Command Center receives updated intelligence
```

## Current visible launch points

- Events Home: `Launch kiosk`
- Event Workspace Surveys tab: `Launch Kiosk`
- Survey QR code
- Public Launch URL
- Copy link

## Current functionality status

| Capability | Status |
| --- | --- |
| Kiosk launch from event/survey UI | Present in UI |
| Per-survey QR/link | Present in UI |
| Token-based survey-specific launch | Must be verified in backend/code |
| Existing eventId kiosk behavior | Should remain preserved |
| Response capture/transcription/analysis | Existing product baseline, should not be broken |

## Important preservation rule

Do not create a second kiosk pipeline. Events mode should reuse the existing working response/answer/audio upload/transcription/analysis system.

---

# 12. Current end-to-end operator flows

## Flow A — Monitor a live event

```text
Events Home
  → Live event card
    → Live dashboard
      → Live Event Intelligence
        → Review immediate attention items
          → Select issue
            → Read evidence + recommended action
              → Copy brief or update status
```

## Flow B — Open and manage event workspace

```text
Events Home
  → Open workspace
    → Event Workspace Overview
      → Review setup readiness
      → Review next best action
      → Move to Event Areas or Surveys tab
```

## Flow C — Fill event coverage gaps

```text
Event Workspace Overview
  → Next Best Action: uncovered touchpoints
    → Event Areas tab
      → Filter Needs survey
        → Attach survey to uncovered area/session/touchpoint
```

## Flow D — Launch attendee feedback collection

```text
Event Workspace Surveys tab
  → Select survey/listening point
    → View QR / Download PNG / Copy link
      → Share or print QR/link
        → Attendee opens kiosk
          → Response flows into command center
```

## Flow E — Create a new event

```text
Events Home
  → New event
    → Create New Event
      → Add metadata
      → Choose starting template
      → Create event
        → Event Workspace
```

---

# 13. Current known built surfaces

| Surface | Current role | Status |
| --- | --- | --- |
| Events Home | Entry point for live/upcoming/past events | Built visually |
| Create New Event | Creates event container and template start | Built visually/functionally; verify backend/tests |
| Event Workspace Header | Event overview and global actions | Built |
| Overview Tab | Setup readiness and next best action | Built |
| Event Areas Tab | Touchpoint/structure management | Built |
| Surveys Tab | Survey/listening point, QR, link, kiosk management | Built |
| Command Center | Live event intelligence and issue triage | Built |
| Selected Issue Detail Pane | Evidence and recommended action review | Built |
| Sponsor Activation Value | Sponsor/exhibitor ROI signals | Built |
| Intelligence Layer | Secondary patterns/source/positive signals | Built |
| Kiosk/Public Link Flow | Attendee capture path | Existing baseline; event-specific token path must be verified |

---

# 14. Current functionality that needs code verification before audit

These are not necessarily gaps. They are items that should be verified in code before deciding what to fix.

| Area | Verification question |
| --- | --- |
| Upcoming/past events | Are these backed by real event records or demo/static fixtures? |
| Event Home actions | Do all CTAs route correctly in production and test environments? |
| Create Event | Does template selection create actual event areas/touchpoints? |
| Event Areas filters | Are search/filter chips functional or presentation-only? |
| Attach Survey | Does this create/attach a real Survey to SurveyTarget/EventArea? |
| Survey QR | Does each QR encode the correct token-based survey URL? |
| Copy link | Does it copy the correct public launch URL? |
| Launch Kiosk | Does it launch the survey-specific kiosk, not only event-level kiosk? |
| Token response creation | Does public link capture write eventId, surveyId, surveyTargetId, and publicSurveyLinkId? |
| Dashboard filters | Do Survey and Event Area filters scope analytics correctly? |
| Issue status | Does status dropdown persist, or is it UI-only? |
| Copy brief/summary | Does copied content match the selected issue/current filters? |
| Auto-refresh | Does it actually poll/reload data? |
| Drawer removal | Is evidence drawer fully removed across breakpoints? |
| Mobile layouts | Do all event surfaces avoid overflow and maintain usable actions? |

---

# 15. Do-not-touch baseline

The following working or foundational flows should not be changed casually during future implementation prompts:

- Existing kiosk capture flow
- Existing audio upload flow
- Existing transcription flow
- Existing analysis pipeline
- Existing response/answer persistence model
- Existing eventId kiosk behavior, unless intentionally extended while preserving compatibility
- Existing account/event scoping rules unless the prompt specifically targets auth/scoping hardening
- Event as the top-level container
- SurveyTarget/Survey/PublicSurveyLink as the event-specific listening-point model
- Right-side selected issue pane as the canonical command center detail surface

---

# 16. Recommended next planning step

Before asking Fable to audit gaps or before starting long implementation loops, use this document as the baseline and add two things:

1. **Claude target design map**
   - Which screenshots are the target for each surface.
   - Which differences from the current UI are intentional.
   - Which differences are not acceptable.

2. **Code-grounded current-state validation**
   - Confirm files/components/routes for each surface.
   - Confirm real vs demo/static data.
   - Confirm which visible actions actually work.
   - Confirm test coverage for each flow.

Only after that should Fable be asked to produce a gap/improvement audit.

