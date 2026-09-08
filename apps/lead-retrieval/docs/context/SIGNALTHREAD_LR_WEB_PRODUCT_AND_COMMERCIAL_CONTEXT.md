# SignalThread Lead Retrieval — Product and Commercial Context

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence for implemented workflows and user types evidenced by current code. Medium confidence for positioning inferred from maintained narratives. Low/unknown confidence for pricing, market validation, customer outcomes, and ROI; those claims require owner-approved external evidence.

## Product promise

SignalThread helps event teams turn brief, high-volume in-person interactions into durable lead context and timely action. It aims to close the gap between “we scanned someone” and “the right person understands the conversation and follows up appropriately.”

## Problem map

| Problem | Product response | Evidence status |
|---|---|---|
| Connectivity is unreliable at events | Offline SQLite capture, outbox, retry/reconciliation | Implemented |
| Badge scans lose conversation context | Notes, voice/conversation capture, transcript and intelligence artifacts | Implemented with processing dependencies |
| Reps cannot triage quickly | Lead priority, briefings, activity, event context | Implemented |
| Follow-up is delayed or generic | Editable one-to-one Gmail, meeting scheduling, dated follow-up/reminder | Implemented for Google |
| Managers cannot see patterns | Event/lifecycle intelligence dashboards and aggregations | Implemented; data health varies |
| Access is complex across events/teams | Company/event membership, roles, licenses, event access modes | Implemented |
| Actions need coordination | Campaigns, templates, agents, workflows, waits/approvals | Implemented with integration-specific maturity |

## Audience and buying-center hypotheses

### Likely economic stakeholders

- Exhibitor revenue/marketing leadership seeking more value from event spend.
- Event organizer leadership seeking better participant outcomes and intelligence.
- Sales operations or event operations owning capture, routing, and follow-up consistency.

### Daily users

- Booth representatives and field sellers.
- Exhibitor admins and event program managers.
- Organizer admins and platform operators.

These are defensible user categories. Exact buyer ownership, budget source, procurement process, and segment priority are not proven in the repositories.

## Defensible positioning

### Strong claims supported by implementation

- Captures leads through multiple mobile entry modes and preserves pending work offline.
- Connects lead identity to event, conversation, briefing, and follow-up context.
- Supports personal Gmail email, Calendar meeting scheduling, and private reminders using the acting user's Google connection.
- Provides company/event authorization, license, and team-management controls.
- Aggregates conversation-derived intelligence into lead and event surfaces.
- Supports import, campaign, template, document, and workflow operations beyond capture.

### Claims that must be qualified

- “AI-powered”: accurate for processing/intelligence features, but output quality and coverage depend on input and processing state.
- “Real time”: some updates may be asynchronous, queued, cached, or provider-dependent.
- “Offline”: capture/outbox is implemented; not every web/provider workflow is available offline.
- “Integrates with your stack”: provider maturity varies; verify the named provider.
- “End-to-end”: valid within supported capture-to-action workflows, not a claim to replace every CRM/marketing system.

### Claims not currently approved by evidence

- Guaranteed conversion or pipeline lift.
- Specific ROI or renewal improvement.
- Market-leading accuracy.
- Named customer success without explicit permission.
- Complete Outlook/Microsoft support.
- Universal CRM compatibility.

## Differentiation hypotheses

1. **Context continuity:** identity, conversation, evidence, briefing, action, and event learning live in a connected model.
2. **Offline operational resilience:** lead capture can survive unreliable event connectivity.
3. **Individual plus aggregate intelligence:** supports the rep's next action and management's event-level learning.
4. **User-owned Google actions:** personal email/calendar operations preserve acting-user ownership rather than a shared blast identity.
5. **Lifecycle scope:** product extends from preparation and capture through post-event intelligence and follow-up.

These are positioning hypotheses, not competitive research conclusions.

## Concise sales narrative

Event lead capture often produces a list without the conversation that made each person matter. SignalThread preserves the interaction, structures the intelligence, and gives the team a direct path to a personal follow-up, meeting, or managed workflow. Managers can also see recurring needs, objections, messaging, and processing gaps across the event. The result is a more usable operating record of the event—not merely a badge export.

## Discovery questions

- How are leads captured today, and what fails when connectivity drops?
- Where does conversation context live after the event?
- How quickly can a manager tell which leads need attention?
- Who owns personal follow-up, and how is completion tracked?
- What happens between capture, CRM entry, and the first useful action?
- How are attendee needs, objections, competitor mentions, and resonating messages summarized?
- Which roles need event-wide versus assigned-only access?
- Which providers are mandatory, and which are merely desirable?
- What evidence would prove event value to the buyer?

## Objection handling

### “We already have badge scanning.”

The differentiated scope is the retained conversation context, offline resilience, intelligence, and action layer. Validate whether those gaps exist; do not disparage an incumbent scanner without evidence.

### “Our CRM already handles leads.”

Position SignalThread as an event capture/intelligence and activation layer that can complement a CRM. Do not claim it replaces all CRM workflows.

### “AI summaries can be wrong.”

Agree that model output must be grounded in available input, distinguish evidence from inference, and support review. Never invent missing conversation details.

### “We use Outlook.”

The active Email & Calendar implementation is Google. The contract is designed for adapters, but Microsoft is not currently implemented.

### “What ROI can you guarantee?”

No guaranteed ROI is documented. Establish a baseline and approved pilot metrics before making outcome claims.

## Packaging and pricing

The code models companies, licenses, seats, app eligibility, membership, and event access. That describes entitlement mechanics, not a price book.

Unknown decisions requiring product ownership:

- packaging axis: event, organization, user/seat, captured lead, or usage;
- included versus metered AI/provider processing;
- organizer and exhibitor packaging relationship;
- onboarding/services fees;
- contract length, currency, discounts, trial/pilot terms;
- data export, retention, and support tiers.

Never derive prices from database fields, demo text, or seed data.

## Pilot and success metrics

Candidate measurements—not established results—include:

- capture completion and duplicate rate;
- offline queue success and time to synchronization;
- percentage of leads with usable conversation context;
- processing success/failure latency;
- time from capture to first personal action;
- meeting, email, and follow-up completion rates;
- briefing usage and approval rate;
- manager time to identify themes/objections;
- event/team adoption and retained usage;
- CRM handoff success where supported.

Define baselines, ownership, measurement windows, and privacy constraints before using these commercially.

## Go-to-market and channel hypotheses

- Direct sales to exhibitor/event revenue and operations teams.
- Organizer partnerships that enable participating exhibitors.
- Event-agency or implementation partnerships.
- Integration-led opportunities alongside CRM/event infrastructure.
- Pilot-to-expansion motion across an event portfolio.

No repository evidence establishes a chosen channel, sales cycle, CAC, conversion rate, or partner agreement.

## Content and messaging voice

- Lead with the operational problem and concrete workflow.
- Use “capture context,” “preserve the conversation,” and “act while it is fresh.”
- Separate implemented facts from roadmap language.
- Prefer precise descriptions to “magic,” “fully automated,” or unqualified “real time.”
- Avoid invented customer quotes, fabricated conversation details, and unsourced outcome percentages.
- State provider limits directly.

## Roadmap hypotheses

Potential directions visible in architecture or documents include provider expansion, broader lifecycle intelligence, stronger CRM synchronization, operator tooling, and more rigorous production canaries. None should be described as committed without an approved roadmap.

## Commercial diligence gaps

Before external publication or fundraising/customer diligence, obtain:

1. approved product name and category statement;
2. canonical feature/capability matrix;
3. approved pricing and contract model;
4. named competitive analysis with current evidence;
5. security/privacy/retention and consent documentation;
6. approved customer references and measured outcomes;
7. support/SLA and provider dependency policy;
8. clear roadmap ownership and dates.

## Related context

- [Master project context](./MASTER_PROJECT_CONTEXT.md)
- [System architecture and data](./SYSTEM_ARCHITECTURE_AND_DATA.md)
- [Current state and next work](./CURRENT_STATE_AND_NEXT_WORK.md)
- [Context gaps and verification](./CONTEXT_GAPS_AND_VERIFICATION.md)

