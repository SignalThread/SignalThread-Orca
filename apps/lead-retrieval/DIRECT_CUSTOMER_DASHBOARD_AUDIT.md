# Direct Customer Dashboard Audit — SignalThread Command Centers Prototype

**Scope:** Direct Customer persona only (account = "Northwind Events", user = Jordan Lee), across Setup / Live / Post lifecycle states.
**Prototype bundle:** `.audit-reference/lr-admin-backend/` — entry `Command Centers.html`, rendered by `cc-app.jsx`.
**Nature:** Audit only. No implementation files were modified. This document is the sole created file.

Throughout, findings are tagged **[observed]** (present in the code), **[inferred]** (intent read from the code/comments), or **[recommended]** (proposed direction).

---

## 1. Executive assessment

**Overall maturity: visually and componentially mature; architecturally and conceptually thin for this persona.**

The prototype is a well-built, internally consistent design system. It has a shared module library (`cc-modules.jsx`), a shared filterable intelligence shell with an evidence drawer (`cc-realtime.jsx`), genuinely thoughtful Setup/empty states, and a coherent visual language (`cc-styles.css`). As a *demonstration of the intelligence surfaces*, it is strong.

As a *Direct Customer operating experience*, it is a thin wrapper. The Direct Customer surface is a single file — `CustomerPage` in `cc-customer.jsx` (three lifecycle branches) — that does two things: shows a portfolio of event cards and a "what matters now" rollup, then hands the user off. Every meaningful drill-through (`leads`, `campaigns`, `coaching`, `realtime`, `executive`, `trends`, and the event itself) is the **Exhibitor's** workspace, hard-scoped to a single event ("Tech Summit 2026"). When a Direct Customer opens any of them, the entire chrome — sidebar nav, breadcrumbs, event chip, scope card — silently switches to the Exhibitor persona ([cc-app.jsx:194-195](.audit-reference/lr-admin-backend/cc-app.jsx#L194-L195)).

**Biggest strengths**
- **Setup states are the best part of the product.** `realtime`, `coaching`, and `executive` all render honest readiness screens with override bars ("no live analytics yet — this page shows readiness, not results", [cc-realtime.jsx:190](.audit-reference/lr-admin-backend/cc-realtime.jsx#L190)). This is a rare and valuable "show nothing before there's data" discipline.
- **The evidence-drawer pattern** (`EvidenceDrawer`, `RepDetailDrawer`) ties nearly every metric/insight to supporting transcripts, related leads, related reps, and a suggested next action. This is the single most reusable idea in the bundle.
- **Estimated-vs-CRM pipeline honesty** — Executive Intelligence tags modelled numbers `EST` and confirmed numbers `CRM` and explains the difference ([cc-executive.jsx:107-108](.audit-reference/lr-admin-backend/cc-executive.jsx#L107-L108)). Good credibility instinct.
- **Realistic direct-customer lead volumes** (412 over 3 days, 148/day) — not the "thousands from one booth" failure mode.

**Biggest weaknesses**
- **The persona has almost no navigation of its own.** In `NAV_ROUTE.customer`, six of seven sidebar items resolve to `null` → a "not built" toast ([cc-app.jsx:34](.audit-reference/lr-admin-backend/cc-app.jsx#L34)). Only "Command Center" works. All real navigation is via in-page card links that leave the persona's shell.
- **A single global lifecycle is imposed on an account running many events.** The `state` toggle (setup/live/post) is a global prototype control that rewrites the whole account command center, yet the account simultaneously holds a live event, an upcoming event, and a completed event ([cc-data.jsx:8-42](.audit-reference/lr-admin-backend/cc-data.jsx#L8-L42)). An account is never in one lifecycle state.
- **Account-level intelligence barely exists.** Every drill-through bottoms out in one event's data. "Emerging across your events" is labelled cross-event but renders single-event data ([cc-customer.jsx:153-155](.audit-reference/lr-admin-backend/cc-customer.jsx#L153-L155)).
- **Real data-credibility conflicts** (hot-lead count 31 vs 12 for the same event/day; coaching leaderboard leads summing to 592 against an event total of 412). Detailed in §5.
- **Config workflows the persona owns don't exist** — qualification rules, seats/licenses, integrations, device management, playbook editing are all dead nav or toasts, despite being central to the persona definition.

**Refine or restructure?** The *visual system and the drill-through dashboards* should be **refined and kept**. The *Direct Customer command center itself* should be **substantially restructured** around a real account↔event↔drill-through hierarchy with per-event lifecycle. See §7.

---

## 2. Current dashboard map

Data source for the account surface: `CC.customerEvents` ([cc-data.jsx:8](.audit-reference/lr-admin-backend/cc-data.jsx#L8)); rendering: `CustomerPage` ([cc-customer.jsx:28](.audit-reference/lr-admin-backend/cc-customer.jsx#L28)). Shared modules from `cc-modules.jsx`. Layout is a `cc-2col` main column + 344px right rail.

### 2A. SETUP state ([cc-customer.jsx:38-118](.audit-reference/lr-admin-backend/cc-customer.jsx#L38-L118))

| Element | Content | Action / destination |
|---|---|---|
| Page head | "Account command center" · lede "Two events are being configured…" | `Import leads` → toast; `Create event` → toast |
| Hero (amber) | "Tech Summit opens in 6 days — 3 setup items still need you" · stat **62%** | `Open Tech Summit setup` → `__event`; `Apply playbook to DevCon` → toast |
| KpiBand | Events **3** · Setup items open **5** · Data sources **4/6** · Team seats **7/10** | — |
| Panel "Your events" | 3 event cards (`CustomerEventCard`) | each → `__event` (all three open the *same* Tech Summit event) |
| Panel "What's left to launch" | Checklist of 5 (2 blocked, 1 active, 1 todo, 1 done) | action buttons → toasts |
| Panel "Data-source readiness" | 5 `EngagementBars` (CRM 100, scanners 40, historical 100, enrichment 100, voice 25) | — |
| Rail "Recommended next steps" | 3 `RecommendedActions` | 1 → `__event`, 2 → toasts |
| Rail "Team readiness" | 5 people (2 ready, 2 pending, 1 add) | `Manage` → toast |
| Rail "Recent activity" | 4-item `ActivityFeed` | — |

### 2B. LIVE state ([cc-customer.jsx:122-203](.audit-reference/lr-admin-backend/cc-customer.jsx#L122-L203))

| Element | Content | Action / destination |
|---|---|---|
| Page head | lede "Tech Summit is live…" | `Import leads` → toast; `Open Tech Summit` → `__event` |
| Hero (violet) | "31 hot leads from Tech Summit are waiting on a first follow-up" · stat **31** | `Review hot leads` → `leads`; `Open Tech Summit` → `__event` |
| KpiBand | Leads today **148** (+34) · Conversations **92** · Hot leads **31** · Follow-ups sent **0** | — |
| Panel "Your events" | 3 cards | → `__event` |
| Panel "Emerging across your events" | `ThemeList` = `CC.exhibitorThemesLive` top 4 (single-event data) | `Open Real-Time Intelligence` → `realtime` |
| Panel "Urgent — needs attention today" | 3 rows (31 hot uncontacted / Scanner offline 412B / Growth Expo 41 follow-ups) | → `leads`, toast, `campaigns` |
| Rail "Jump into an event" | 3 event rows | → `__event` |
| Rail "Collected today" | 5 static stats (148/92/54/148/73) | — |
| Rail "Recent activity" | 4-item feed | — |

### 2C. POST state ([cc-customer.jsx:206-288](.audit-reference/lr-admin-backend/cc-customer.jsx#L206-L288))

| Element | Content | Action / destination |
|---|---|---|
| Page head | lede "Tech Summit wrapped…" | `Export recap` → toast; `Review 82 uncontacted` → `leads` |
| Hero (teal) | "128 hot leads — 64% haven't been contacted yet" · stat **128** | `Launch follow-up campaign` → `campaigns`; `Open the event` → `__event` |
| KpiBand | Total leads **412** · Hot-lead rate **31%** (+9 pts) · Meetings booked **46** · Follow-ups sent **36%** (148 of 412) | — |
| Panel "Your events" | 3 cards | → `__event` |
| Panel "Performance across events" | Hot-lead-rate bars (Tech 31 / Growth 22 / DevCon 18) + follow-up-completion bars (Growth 92 / DevCon 78 / Tech 36) | — |
| Panel "Coaching & messaging insights" | 2 `Callout`s (what worked / what to fix) | `View Coaching Dashboard` → `coaching` |
| Rail "Recommended next actions" | 3 | → `leads`, `workflows`, `coaching` |
| Rail "Follow-up progress" | 3 per-event bars | — |
| Rail "Recent activity" | 3-item feed | — |

### 2D. Where the drill-throughs actually live

The account surface links out to pages that are **not** account-scoped:

- `leads` → `LeadsPage`, header "**Tech Summit 2026** · Leads" ([cc-deep.jsx:24-54](.audit-reference/lr-admin-backend/cc-deep.jsx#L24)).
- `campaigns` → `CampaignsPage`, "Tech Summit 2026 · Engagement" ([cc-deep.jsx:56](.audit-reference/lr-admin-backend/cc-deep.jsx#L56)).
- `workflows` → `WorkflowsPage`, "Tech Summit 2026 · Automation" ([cc-deep.jsx:85](.audit-reference/lr-admin-backend/cc-deep.jsx#L85)).
- `realtime` / `executive` / `coaching` / `trends` → the shared `IntelShell` ([cc-realtime.jsx:50](.audit-reference/lr-admin-backend/cc-realtime.jsx#L50)), all hard-headed "Tech Summit 2026".
- `__event` → `ExhibitorPage` with a banner: "the same workspace your exhibitor team uses" ([cc-app.jsx:265](.audit-reference/lr-admin-backend/cc-app.jsx#L265)).

**Chrome transformation [observed]:** opening any of these flips `navAud` to `'exhibitor'` (or `'organizer'` for org pages) at [cc-app.jsx:195](.audit-reference/lr-admin-backend/cc-app.jsx#L195). The sidebar becomes the Exhibitor nav (Briefings, Leads, Import Wizard, Campaign Agents, Campaigns, Workflows…), the header gains a "Tech Summit 2026" event chip and a "Booth 412 · live" scope card, while the identity badge still reads "Direct customer". The Direct Customer is effectively operating inside the exhibitor's booth console.

---

## 3. Intended user journey (goals, decisions, actions — not screens)

**[inferred + recommended]** A Direct Customer is one organization running its own lead-retrieval program across one or more events. Their journey:

**Before the event (Setup)** — *Goal: walk onto every floor launch-ready.*
- Decisions: which events are we running; what is each event's goal; who are the reps and are they invited/seated; which devices/recorders are assigned; what makes a lead qualified/hot (qualification rules); which integrations feed enrichment and receive leads; which playbook and briefing content applies.
- Actions: create/configure event, invite & seat reps, assign & arm devices, connect CRM, set qualification criteria, apply playbook, resolve launch blockers.
- Success signal: a per-event readiness score reaching 100% and **zero blocking items**.

**During the event (Live)** — *Goal: operate the floor and never let a hot lead cool.*
- Decisions: which hot leads to contact now and who owns each; is capture healthy; are reps covering the floor and using the right talk tracks; what new objections/topics are emerging; which accounts are heating up; are we tracking toward the event goal.
- Actions: assign/act on hot-lead follow-ups, fix capture/device failures, coach reps mid-shift, adjust messaging, escalate account opportunities.
- Success signal: hot-lead first-touch happening within an SLA; capture coverage high; goal progress visible.

**After the event (Post)** — *Goal: convert conversations to pipeline and get smarter for next time.*
- Decisions: which hot leads still need outreach; which campaigns to launch; what synced to CRM and what failed; which accounts to fast-track; what lessons feed the next playbook; how this event compared to prior ones.
- Actions: launch follow-up campaigns, push/repair CRM sync, book/close opportunities, capture lessons into the playbook, export the recap.
- Success signal: follow-up completion climbing toward 100%, clean CRM handoff, playbook updated.

The prototype gestures at all three phases but **collapses account-level and event-level decisions into one surface**, and leaves several Setup decisions (qualification rules, seats, integrations, devices) with no home.

---

## 4. State-by-state findings

### 4A. SETUP

**Works [observed]**
- Portfolio framing is right for the persona: event cards with per-event setup %, and a launch-blockers rollup ("What's left to launch"). This is genuinely account-level thinking.
- The intelligence readiness screens (`realtime`/`coaching`/`executive` in setup) are excellent — honest, no fake analytics.

**Unclear [observed]**
- Hero says "**3** setup items", the KPI says "Setup items open **5**", and the checklist shows **4** not-done items. Three different counts on one screen ([cc-customer.jsx:54-76](.audit-reference/lr-admin-backend/cc-customer.jsx#L54-L76)).
- "Data sources **4/6**" (KPI) vs the readiness panel's **5** rows, 3 of which are 100% ([cc-customer.jsx:62,78-85](.audit-reference/lr-admin-backend/cc-customer.jsx#L62)). What are the 6 sources?
- "Team seats **7/10**" vs a Team-readiness list of **5** people. Seats and people are conflated.

**Missing [observed → the significant gap]**
- **Qualification criteria / lead-scoring rules** — the persona is responsible for "establishing lead qualification rules", but nothing lets them define what "hot"/"qualified" means. Scores just appear downstream.
- **Seat/license management** — surfaced as a number, not manageable (Users nav is dead).
- **Integrations** — only a "Connect Salesforce" toast; the Integrations nav item is `null`.
- **Device/recorder management** — only a checklist line ("assign 4 scanners"); no device inventory or arming flow.
- **Playbook & briefing preparation** — the playbook is a toast/foot button; briefings are reachable only by entering the event.
- **Campaign/workflow preparation** is absent from Setup entirely.

**Redundant [observed]:** The Tech Summit setup status is stated in the hero, the KPI band, and the event card — three times.

**Incorrectly prioritized:** "Import leads" is a primary-adjacent page action during Setup, before any leads exist, and it's a dead toast.

**Keep on command center:** portfolio cards, launch-blockers rollup, readiness KPIs, recommended next steps.
**Move to deeper surfaces:** the actual configuration (qualification rules, seats, integrations, devices, playbook editing) belongs in dedicated Setup pages the rollup links into.

### 4B. LIVE

**Works [observed]**
- The "attention queue" instinct is right: Hero → KPIs → "Urgent — needs attention today" gives a clear "what to do now."
- Real-Time Intelligence (the destination) is the most complete surface in the bundle — filterable, evidence-backed, with capture-health monitoring.

**Unclear / misleading [observed]**
- **"Emerging across your events"** claims cross-event aggregation but renders `CC.exhibitorThemesLive`, which is single-event (Tech Summit) data ([cc-customer.jsx:153](.audit-reference/lr-admin-backend/cc-customer.jsx#L153)). Only one event is live, so "across your events" is false today and will mislead once more events run concurrently.
- **Hot-lead count is contradictory:** account says **31** hot ([cc-customer.jsx:146](.audit-reference/lr-admin-backend/cc-customer.jsx#L146)); the event command center, Real-Time meta, and Executive summary all say **12** for the same event/day ([cc-exhibitor.jsx:128](.audit-reference/lr-admin-backend/cc-exhibitor.jsx#L128); [cc-data.jsx:103](.audit-reference/lr-admin-backend/cc-data.jsx#L103); [cc-data.jsx:286](.audit-reference/lr-admin-backend/cc-data.jsx#L286)). Nothing explains 31-vs-12.
- **"Follow-ups sent 0"** is shown as a KPI with no target or SLA context — is 0 fine at this hour or a crisis? The screen can't say because there is no goal-progress model.

**Missing [observed]**
- **No goal progress** — the event has a goal ("Lead generation / book qualified demos") but Live never shows progress toward it (e.g., demos booked vs target).
- **No follow-up ownership/assignment** — the command center flags 31 hot leads but offers no way to assign them to reps or track first-touch SLA; it only links to a read-only leads table.
- **No true alerting** — the "Scanner offline — Booth 412B" row is a static data point, not a live alert with severity/state.

**Redundant [observed]:** hot-lead count appears in Hero copy, Hero stat, KPI band, the event card, and the Urgent panel — five times on one screen.

**Incorrectly prioritized:** "Collected today" (leads/conversations/recordings/briefs/companies) is a vanity metrics stack in the rail; it competes with the Urgent queue for attention and drives no decision.

**Keep on command center:** the attention queue (Urgent), top-line KPIs, cross-event pulse (once it's *actually* cross-event).
**Move to deeper surfaces:** topic/theme detail → Real-Time; the leads table; device detail → Capture health.

### 4C. POST

**Works [observed]**
- "Performance across events" (hot-lead-rate and follow-up-completion comparisons) is the most genuinely account-level module in the whole surface — this is what a Direct Customer command center should be full of.
- Coaching/messaging callouts translate analysis into a next action ("add a migration talk track before DevCon").
- Follow-up gap is framed as the revenue leak ("82 hot leads still uncontacted"), which is the correct closeout message.

**Unclear [observed]**
- "Hot-lead rate 31%" is asserted but the underlying rep-level data doesn't reconcile to it (see §5 — coaching leads sum to 592, not 412).
- "Follow-ups sent 36% (148 of 412)" mixes *all* leads (412) as the denominator while the hero measures uncontacted *hot* leads (82 of 128). Two different follow-up denominators, unexplained.

**Missing [observed]**
- **CRM/handoff status is thin** — a "Push to Salesforce" action and a Workflows list, but no explicit "what synced / what failed / what's pending" closeout state.
- **No per-lead disposition** — a Direct Customer closing out needs to mark outcomes; the leads table is read-only with two sample leads.
- **No closed-won loopback** — only "pipeline influenced"; revenue outcome never returns.

**Redundant [observed]:** the Post state duplicates most of the Exhibitor Post page (`ExhibitorPage` post branch) — same 412/128/46 numbers, same coaching summary, same executive snapshot — reached two different ways.

**Keep on command center:** cross-event performance comparison, follow-up progress, closeout recommended actions, lessons.
**Move to deeper surfaces:** pipeline/funnel detail → Executive; per-rep detail → Coaching; the leads table and campaigns.

---

## 5. Cross-state problems

**Data credibility (the most serious cluster)**
1. **Hot-lead count conflict:** account Live = **31**; event/Real-Time/Executive = **12** for the same event/day. (§4B.)
2. **Coaching leaderboard leads exceed event totals:** `COACH_POST` per-rep leads sum to **592** (150+120+96+118+60+48) against an event total of **412** captured leads ([cc-coaching.jsx:11-21](.audit-reference/lr-admin-backend/cc-coaching.jsx#L11-L21)). `coachAgg` therefore computes hot-rate = 128/592 ≈ **22%**, contradicting the **31%** shown everywhere else. Live is also off: per-rep leads sum to 137 vs the event's 148.
3. **Setup counts don't reconcile:** 3 vs 5 vs 4 setup items; 4/6 data sources vs a 5-row panel; 7/10 seats vs 5 people.
4. **Unexplained precision / unsupported AI claims:** "ROI-first openers converting **3× better**" and messaging "**88%** best-converting" ([cc-data.jsx:162](.audit-reference/lr-admin-backend/cc-data.jsx#L162), [cc-data.jsx:60](.audit-reference/lr-admin-backend/cc-data.jsx#L60)). A booth *conversation* cannot establish *conversion*; conversion is a CRM-outcome metric. Presenting it as a conversation-analysis output is a credibility risk. Per-rep quality dimensions scored to the integer /100 ("dis 82, pain 80…") imply a precision the model can't defend.
5. **Metrics without a defined source:** "Data coverage 96%/98%" (% of what?), "quality 7.4/10" (how derived?), "hot" flag (rule vs model?) all appear without a definition. `EST` vs `CRM` pipeline is the one place this is handled well and should be the template.
6. **API vs AI conflation:** scan counts, briefs approved, scanner status, meetings booked are deterministic/CRM/API values; hot flags, themes, objections, messaging efficacy, sentiment are model outputs. They're presented in the same visual register with no signal of which is which.
7. **Filter scaling fabricates numbers:** `rtCompute` multiplies fixed scale factors per active filter ([cc-realtime.jsx:32-45](.audit-reference/lr-admin-backend/cc-realtime.jsx#L32)); stacking filters yields precise-but-invented counts ("showing 3 of 92").

**Duplicated metrics & unclear ownership**
- The same event's numbers live in both the **account** command center and the **event/exhibitor** command center, reached by different paths, with no single source of truth (and the 31-vs-12 conflict is the symptom).
- The Direct Customer and Exhibitor **share the same event surface and the same intelligence dashboards**; ownership of "who is this screen for" is genuinely ambiguous in the code (`idAud = customer`, `navAud = exhibitor`).

**Navigation problems**
- **Dead persona nav:** 6 of 7 customer sidebar items → toast ([cc-app.jsx:34](.audit-reference/lr-admin-backend/cc-app.jsx#L34)). The playbook foot button and event chip are also toasts.
- **No persistent path back to intelligence:** the customer has no "Intelligence/Leads/Coaching" nav; those exist only in the exhibitor nav that appears *after* drilling in. To return to Real-Time Intelligence the user must go home → find the card → click.
- **Chrome identity flip:** drilling in silently swaps the sidebar/header to Exhibitor + "Booth 412". Disorienting and persona-breaking.
- **Every event card opens the same event:** all three `CustomerEventCard`s call `t('__event')` → Tech Summit ([cc-customer.jsx:9](.audit-reference/lr-admin-backend/cc-customer.jsx#L9)). Opening "DevCon" or "Growth Expo" lands on Tech Summit.

**Weak lifecycle progression**
- Lifecycle is a **global** prototype toggle, not a per-event property, even though the account always holds events in different states simultaneously ([cc-data.jsx:8-42](.audit-reference/lr-admin-backend/cc-data.jsx#L8)). "The account is in Live" is a category error.
- Consequently Setup/Live/Post on the account command center are three *variants of the same rollup* rather than three *distinct operating modes with distinct jobs*.

**Missing system states**
- Setup empty states are handled; **loading and error states are absent everywhere** (no CRM-sync-failed, no device-dropped-mid-event beyond a static row, no skeleton loads). For a live operating tool, error/degraded states are essential, not optional.

**Visual hierarchy**
- **Metric repetition** (hot count ×5 on Live) flattens the hierarchy — everything is a stat card, so nothing is primary.
- **Competing CTAs:** the account head, the hero, and the panels all offer near-duplicate actions ("Review hot leads", "Open Tech Summit", "Follow up 12 hot") pointing to *different* destinations (a leads table vs a filtered Real-Time view vs the event).
- **Color-only status** — status is carried by badge tone (amber/green/neutral) and colored dots; several rows rely on color alone.
- **Clickability is inconsistent** — some rows are `<button>`s (good), some are `<div>`s with `onClick`; the info-tooltip (`Info`) opens on `:focus`/hover with no visible affordance of interactivity beyond a small "?".
- **Responsiveness:** the whole `cc-2col`/`cc-kpi`/`cc-split` grid collapses at 1120px ([cc-styles.css:661](.audit-reference/lr-admin-backend/cc-styles.css#L661)); the page max-width is 1180px, so there's a narrow band where the fixed 344px rail crowds the main column. Sidebar-collapsed state is styled ([cc-styles.css:43](.audit-reference/lr-admin-backend/cc-styles.css#L43)) but the content grid doesn't reflow to reclaim the freed width.

---

## 6. Keep / Change / Remove / Add

### Keep (serves a real need)
- **Portfolio-of-events framing** with per-event status cards — the correct account-level mental model. *(Need: "which of my events needs me?")*
- **Attention queue** ("Urgent — needs attention today", "What's left to launch") — decision-first, not metric-first. *(Need: "what do I do next?")*
- **Cross-event performance comparison** (Post) — the strongest account-level module. *(Need: "is my program improving?")*
- **The evidence drawer** (`EvidenceDrawer`/`RepDetailDrawer`) — traceability from metric → conversations → action. *(Need: "can I trust this number and act on it?")*
- **Setup readiness screens** with honest "no data yet" override bars. *(Need: "am I ready to launch?")*
- **EST vs CRM pipeline labelling** — make it the standard for every modelled metric. *(Need: credible numbers for leadership.)*
- **The shared `cc-modules` component library and `IntelShell`.** *(Need: consistency and reuse.)*

### Change (right idea, wrong execution)
- **Make lifecycle a per-event property**, not a global toggle. The account command center shows a *mix* of setup/live/post events at once. *(Need: an account is never in one state.)*
- **Give the Direct Customer real, functional navigation** — Events, Intelligence, Leads, Campaigns, Playbook, Users, Integrations, Settings must route, not toast. *(Need: reach work without leaving the persona.)*
- **Stop swapping the chrome to Exhibitor/"Booth 412" on drill-in.** Keep the Direct Customer's own shell; scope drill-throughs to the selected event without an identity change. *(Need: coherent persona.)*
- **Make "Emerging across your events" actually cross-event**, or relabel it "Tech Summit — live." *(Need: don't lie about scope.)*
- **Reconcile every duplicated metric to one source** (fix 31-vs-12, 592-vs-412, 3-vs-5). *(Need: trust.)*
- **Add goal-progress to Live** (demos booked vs target, follow-up SLA). *(Need: "are we winning?")*
- **Wire event cards to their own events.** *(Need: navigation that means what it says.)*

### Remove or combine
- **Remove the vanity "Collected today" rail stack** on Live (or fold its one useful number into the KPI band). *(Drives no decision.)*
- **Combine the account Post view and the Exhibitor Post view** — they duplicate the same numbers. Pick one canonical event closeout and have the account roll up to it.
- **Combine the many hot-lead CTAs** into one primary "follow up hot leads" action with a single destination.
- **Remove dead controls** (Import leads before leads exist; toast-only playbook/foot/nav items) until they do something.
- **Collapse metric repetition** — show the hot count once, prominently.

### Add (currently missing, needed by the persona)
- **Qualification-rules / lead-scoring configuration** (Setup) — define what "qualified"/"hot" mean. *(Persona owns qualification.)*
- **Seat/license management** and **user invitations** as real screens. *(Persona provisions the team.)*
- **Integrations management** (CRM + enrichment + scanners), with connection health. *(Persona owns integrations.)*
- **Device/recorder management** — inventory, assignment, arming, live health. *(Persona preps devices.)*
- **Follow-up ownership & SLA** — assign hot leads to reps, track first-touch. *(Live revenue protection.)*
- **CRM handoff/closeout state** (Post) — synced / failed / pending, with retry. *(Clean handoff.)*
- **Loading and error/degraded states** across all live surfaces. *(It's an operating tool.)*
- **A metric-definition/glossary layer** (source, model-vs-API, freshness) attached to each KPI. *(Credibility.)*

---

## 7. Recommended dashboard architecture

**[recommended]** A three-tier hierarchy with per-event lifecycle, keeping the existing drill-through dashboards but re-homing them.

```
Account Command Center  (persona: Direct Customer — always mixed lifecycle)
│   Purpose: portfolio health + "which event needs me" + account rollups
│   Sections:
│     • Portfolio of events (each card shows its OWN lifecycle chip + top blocker/hot metric)
│     • Account attention queue (blockers + uncontacted hot leads + failures, ACROSS events)
│     • Cross-event performance (hot-rate, follow-up completion, pipeline — trend over events)
│     • Account rollups: seats/licenses, integrations health, playbooks
│     • Recommended next actions (account scope)
│
├── Event Command Center  (per event; lifecycle = THIS event's state)
│     Purpose: the operating surface for one event, in its own state
│     • SETUP mode → readiness + links to config surfaces (below)
│     • LIVE mode  → attention queue, goal progress, capture health, live pulse
│     • POST mode  → closeout actions, CRM handoff, campaign launch, lessons
│     (This is today's ExhibitorPage content — re-scoped as the customer's own,
│      drop the "your exhibitor team" framing.)
│
│     ├── Config surfaces (Setup) — NEW: Event settings · Qualification rules ·
│     │     Team & seats · Devices & recording · Integrations · Playbook & briefings
│     │
│     └── Intelligence & operations drill-throughs (keep, scope to this event,
│           reach via a PERSISTENT intel nav — no chrome flip):
│             • Real-Time Intelligence (live floor read)      → most mature, keep
│             • Coaching (rep performance)                     → keep, fix aggregation
│             • Executive / Pipeline (funnel, accounts, EST/CRM) → keep
│             • Product & Market Trends                        → keep
│             • Leads (table + per-lead disposition)           → extend to writable
│             • Campaigns · Workflows                          → keep
```

**Data-placement principles**
- **Account tier holds only cross-event, roll-up, and portfolio data.** Anything hard-scoped to one event does not belong here (fixes "Emerging across your events").
- **Event tier owns the single lifecycle state.** Setup/Live/Post are properties of the event card the user selected, resolved per event — never a global toggle.
- **Drill-throughs own the deep, filterable, evidence-backed detail.** They stay event-scoped but gain a persistent tab/nav and a "which event" context that never silently changes persona.
- **Every metric carries a definition + source badge** (API vs modelled, freshness), extending the EST/CRM pattern to all numbers.

---

## 8. Prioritized build sequence

Ordered by dependency; each phase unblocks the next.

**Phase 0 — Foundation & shared components (build first; everything depends on it)**
1. **Data & metric contract:** define `qualified`, `hot`, `data coverage`, `quality score`, `pipeline (EST/CRM)`; declare source (API vs model) and freshness for each. *Resolve the 31-vs-12 and 592-vs-412 conflicts here — they are contract bugs, not display bugs.*
2. **Per-event lifecycle model** replacing the global `state` toggle.
3. **Real persona navigation & routing** for the Direct Customer (make `NAV_ROUTE.customer` functional; stop the drill-in chrome flip).
4. **Formalize shared primitives already present:** KPI band, attention queue, drill-through card, empty-state, evidence drawer, alert severity — as the cross-persona kit (§9 of the brief).
> *Why first:* the lifecycle model, nav, and metric contract are structural; building Setup/Live/Post on top of the current global toggle and broken data would bake in the defects.

**Phase 1 — Setup**
5. Event configuration + **qualification rules** (net-new, and a prerequisite for credible hot/qualified counts downstream).
6. **Team & seats**, **Integrations**, **Devices & recording** config surfaces (the dead-nav gaps).
7. Account readiness rollup + launch-blocker queue (refine existing).
> *Why here:* qualification rules must exist before Live can honestly label a lead "hot"; integrations/devices must exist before capture is real.

**Phase 2 — Live**
8. Event Command Center Live (re-scope current Exhibitor Live) + **goal progress** + **follow-up ownership/SLA**.
9. Real-Time Intelligence — already the most mature; wire it to the corrected hot-count source; add live alerting/severity.
> *Why here:* depends on Setup's qualification rules and device/capture wiring.

**Phase 3 — Post**
10. Event closeout: **CRM handoff state** (synced/failed/pending), campaign launch, per-lead disposition, lessons → playbook.
11. Account cross-event performance rollup (refine the existing strong module).
> *Why here:* needs Live's captured data and Phase-0's pipeline contract.

**Phase 4 — Intelligence drill-throughs (deepen in parallel with 2–3)**
12. Coaching — fix per-rep aggregation (leads must sum to event totals) before shipping the leaderboard.
13. Executive/Pipeline and Trends — keep, attach metric-definition layer.

**Phase 5 — Polish & validation**
14. Loading/error/degraded states across live surfaces.
15. Responsive pass (1120–1180px band; sidebar-collapsed reflow), accessibility (non-color status, button semantics, focus-visible, tooltip affordance), CTA de-duplication and hierarchy cleanup.

---

## 9. Open product decisions (need product-owner input)

These are genuinely undetermined by the prototype; do not invent answers.

1. **Is the Direct Customer a multi-event/account operator or a single-event operator?** The whole account tier's existence depends on this. (Code supports "account" scope but every path bottoms out in one event.)
2. **Does a Direct Customer have a distinct "exhibitor team," or are they the same people?** This decides whether the shared event/intelligence surfaces are truly shared or must be re-personed. (Current banner: "the same workspace your exhibitor team uses.")
3. **Is lifecycle per-event (recommended) — and if an account runs concurrent events, what does the account "command center" summarize?**
4. **Who authors qualification/hot rules — the customer, or the product's model?** This determines whether §8 Phase 1.5 is a config UI the customer owns or a model the product ships.
5. **Precise definitions:** what is "hot" vs "qualified"; what is "data coverage"; how is "quality /10" derived? (Required to resolve the metric conflicts.)
6. **Can conversation-derived "conversion %" (88%, 3×) be claimed without CRM outcomes?** If not, these metrics must be reframed or removed.
7. **Estimated-pipeline methodology** — is the model shown to customers, and is EST exposed to leadership or internal-only?
8. **Integration scope** — Salesforce only, or a broader CRM/enrichment set? Affects the Integrations surface and Post handoff.
9. **Does the Direct Customer manage devices/recorders directly**, or is capture hardware an AV/organizer responsibility? Determines whether "Devices & recording" is a customer Setup surface.
10. **Follow-up ownership model** — do Direct Customers assign leads to named reps with SLAs, or is follow-up centralized? Shapes the Live queue.

---

## 10. Readiness verdict

### ▶ Requires product-definition work before redesign

The visual system and the drill-through dashboards are ready to be refined and reused. But the Direct Customer *experience* cannot be responsibly redesigned yet because its foundational questions are unanswered in the prototype:

- **Persona scope is undefined** — account-level operator vs single-event operator, and whether the customer is distinct from the exhibitor (Open Decisions 1–2). A redesign can't choose a hierarchy without this.
- **The lifecycle model is conceptually wrong** — a global state on an account that always holds mixed-state events (Decision 3). This must be settled before laying out any command center.
- **Core workflows the persona owns have no product definition or surface** — qualification rules, seats/licenses, integrations, devices (Decisions 4, 8–9). These aren't styling gaps; the product hasn't decided what they are.
- **Metric definitions are unresolved and self-contradictory** — the 31-vs-12 and 592-vs-412 conflicts are symptoms of an undefined data contract (Decisions 5–7).

There is also **architectural cleanup** to do (kill the chrome flip, make nav functional, wire event cards, per-event lifecycle) — but cleanup alone won't produce a correct design, because the definition gaps above would still force guesses. Settle §9, adopt the §7 architecture, then the surface is ready for a focused redesign — and much of the existing component work (evidence drawers, readiness states, EST/CRM labelling, the intel shell) carries straight over.

---

## Completion report

- **Audit file created:** `DIRECT_CUSTOMER_DASHBOARD_AUDIT.md` (repository root). No implementation files modified.
- **Files inspected (Direct Customer journey + shared architecture):**
  - `Command Centers.html` (entry / script graph)
  - `cc-app.jsx` (shell, persona/lifecycle control bar, routing, surface resolution, chrome flip)
  - `cc-customer.jsx` (Direct Customer Setup/Live/Post — primary subject)
  - `cc-data.jsx` (all mock data: `customerEvents`, themes, real-time, coaching, executive)
  - `cc-modules.jsx` (shared modules: Panel, Hero, KpiBand, Checklist, RecommendedActions, etc.)
  - `cc-exhibitor.jsx` (the shared Event Command Center a Direct Customer enters via `__event`)
  - `cc-deep.jsx` (Leads, Campaigns, Workflows, Trends, + organizer deep pages; routing tables)
  - `cc-realtime.jsx` (`IntelShell`, Real-Time Intelligence, evidence drawer, filter scaling)
  - `cc-coaching.jsx` (Coaching dashboard, rep-detail drawer, post aggregation)
  - `cc-executive.jsx` (Executive Intelligence: funnel, accounts, EST/CRM pipeline, comparison)
  - `ui.jsx` (primitives + icon set), `data.jsx` (PLAYBOOK, EVENT, LEADS)
  - `cc-styles.css` (layout, responsive breakpoints, collapsed-sidebar rules)
- **Reviewed for shared-architecture context (not audited as personas):** organizer deep pages in `cc-deep.jsx`; exhibitor nav in `cc-app.jsx`.
- **States reviewed:** Setup, Live, Post — for the account command center and for every drill-through the Direct Customer can reach (Real-Time, Coaching, Executive, Trends, Leads, Campaigns, Workflows, shared Event Command Center).
- **Could not be verified / out of scope:**
  - The `uploads/` PNG screenshots and `.thumbnail` were not treated as source of truth; they appear to be reference captures of earlier "Lead Intel Redesign" screens (`Lead Intel Redesign*.html`, `Campaign Agents Redesign.html`), which are separate from the Command Centers prototype and outside the Direct Customer scope. Findings are based on the live JSX/CSS.
  - `screens-briefings.jsx`, `screen-agents.jsx`, `screen-agent-config.jsx` (Briefings/Campaign Agents) were traced only where the Direct Customer routes into them; their internal design was not audited as it is shared exhibitor tooling, not a Direct Customer surface.
  - Runtime behavior (hover/focus tooltips, drawer transitions, filter math edge cases) was inspected in code, not executed in a browser.
