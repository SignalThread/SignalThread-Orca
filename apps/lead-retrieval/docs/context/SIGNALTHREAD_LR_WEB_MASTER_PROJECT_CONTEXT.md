# SignalThread Lead Retrieval — Master Project Context

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence for repository structure, current code capabilities, recent commits, and deployed web revision. Medium confidence for older product narratives. Pricing, customer outcomes, applied production migrations, and live tenant/provider health are not verified and are never inferred here.

## One-sentence definition

SignalThread Lead Retrieval is an event lead-capture and intelligence system that helps organizers, exhibitors, and event teams capture people and conversation context, convert it into structured follow-up intelligence, and act through web, mobile, email, calendar, campaigns, and workflows.

## Repository and deployment map

| Surface | Location | Responsibility |
|---|---|---|
| Web/backend | `/Users/ali/Documents/lead retrieval app` (`WEB`) | Next.js product, server APIs, cloud schema, authorization, canonical services, integrations |
| Mobile | `/Users/ali/Documents/lead-intel-scan` (`MOBILE`) | Expo application, offline capture, SQLite/outbox, device UX |
| Context package | `WEB/docs/context/` | Portable project/product/operating knowledge |
| Production web | `https://lr.signalthread.ai` | Vercel deployment; inspected build used `main` commit `9424f11` |

At investigation start, both repositories were on clean `main` branches: web `9424f11` and mobile `7ad37f1`. This documentation task changes only `WEB/docs/context/`.

## Product thesis

At an event, the durable value is not merely a scanned badge. It is the combination of identity, context, conversation, intent, ownership, and an actionable next step. SignalThread attempts to preserve that value from the moment of capture through follow-up and event-level learning.

The product has three connected layers:

1. **Capture:** scan QR/business card, enter manually, record notes or voice context, and work through unreliable connectivity.
2. **Intelligence:** enrich identity, process conversations, produce summaries/briefings/evidence/themes, prioritize leads, and aggregate event insights.
3. **Action:** send one-to-one email, schedule meetings, set follow-ups, run campaigns/workflows, and synchronize selected provider or CRM actions.

## Primary users and jobs

### Exhibitor representatives

- Capture leads quickly while standing on a show floor.
- Preserve the conversation even when connectivity is poor.
- See priority, briefing, history, and recommended context.
- Send a personal email, book a meeting, or set a follow-up.

### Exhibitor administrators

- Configure and manage the exhibitor team and event access.
- Review leads, briefings, intelligence, imports, campaigns, templates, and workflows.
- Understand what prospects need and where follow-up is stalled.

### Organizer administrators

- Manage event/company access and participant administration.
- Operate event-level lead and intelligence surfaces within authorized scope.

### Platform administrators

- Support tenants, events, licenses, processing health, and controlled operations.
- Diagnose system-wide failures without bypassing ownership rules.

### Direct customer teams

This is a product/account workflow shape, not a distinct normalized role. The same company, membership, license, event-access, and resource-scope rules still apply.

## Canonical end-to-end workflows

### 1. Access and event context

Authentication establishes a user, then canonical authorization resolves company membership, normalized role, license/app eligibility, event membership, and event access mode. Company and event IDs supplied by a client are never sufficient by themselves.

### 2. Mobile lead capture

Mobile supports QR, card, and manual capture. Local SQLite and an outbox preserve work offline. Stable client identifiers and retry semantics reconcile the cloud mutation later. Voice/context uploads can be secondary asynchronous work and must not duplicate the lead.

### 3. Web import and publish

The web import flow parses source data, maps fields, enriches where configured, supports review/approval, and publishes canonical lead and briefing data. Import staging artifacts are not automatically the same thing as published leads.

### 4. Conversation intelligence

Conversation inputs move through transcript/processing states into summaries, evidence, themes, objections, messaging signals, and briefings. The canonical rich read model assembles scoped data for detail and dashboards. A thin legacy summary is a fallback symptom, not an equivalent replacement.

### 5. Lead prioritization and briefing

Lead attributes, activity, conversation evidence, and event context feed priority and briefing surfaces. Model output must remain distinguishable from user-authored corrections and approved content.

### 6. One-to-one engagement

An acting user may connect Google Workspace, compose a lead-specific Gmail message through the canonical MIME path, inspect availability, schedule a Calendar meeting, or manage a follow-up. Invalid credentials require reconnection; provider calls must stop once that state is known.

### 7. Follow-up

A lead stores the canonical follow-up time, note, completion state, compatibility date, and optional provider-event reference. A private Calendar reminder belongs to the acting user, never invites the lead, and never creates conferencing. LR persistence succeeds even when Calendar synchronization partially fails.

### 8. Campaigns and workflows

Templates, campaigns/campaign agents, documents, signals, workflow triggers, waits, approvals, and integrations support broader engagement automation. These are distinct from the personal one-to-one Gmail and lead follow-up paths.

## What is implemented

### Web/backend

- Multi-role company/event application and lifecycle event workspaces.
- Lead lists/detail, import, enrichment, priority attributes, briefings, conversation intelligence, dashboards.
- Company users, invitations, licenses, seats, event access, settings, help content.
- Campaign agents, campaigns, templates, documents/links, workflows.
- Conversation/voice-note upload, processing, readiness, failure/reconciliation, and internal health paths.
- User-owned Google connection lifecycle, Gmail one-to-one send, Calendar availability/meeting creation.
- Provider-neutral mobile OAuth contract with Google as the only active provider.
- Canonical lead follow-up service and optional private Google reminder.

### Mobile

- Supabase sign-in and company/event context.
- QR/card/manual capture.
- SQLite local persistence, outbox, retry, ownership boundaries, and reconciliation.
- Leads/detail/priority, voice/context, conversation/briefing status.
- Provider settings, OAuth handoff, Gmail, meetings, and follow-up clients.
- Unit/device testing with Vitest and Maestro.

## What is not proven or not implemented

- Microsoft/Outlook Email & Calendar support is not implemented.
- A general-purpose task-management system is not part of follow-up.
- A complete CRM replacement is not established.
- Approved pricing/packaging is not present in the repositories.
- Customer ROI, renewal lift, conversion lift, and accuracy claims are not verified.
- Repository migration files do not prove the production database is fully migrated.
- Route or settings-card presence does not prove every CRM/enrichment provider is production ready.

## Core boundaries

- **Web versus mobile:** cloud authority and canonical services versus device experience and offline state.
- **Tenant versus event:** company ownership is necessary but event scope can further restrict access.
- **LR mutation versus provider side effect:** persist canonical LR state first when partial success is part of the contract.
- **One-to-one versus campaign:** do not route personal lead email through bulk/campaign systems.
- **Conversation source versus derived intelligence:** transcript, summary, evidence, briefing, and dashboard aggregation are separate layers.
- **Interface neutrality versus implementation:** provider-neutral contract does not imply multiple active providers.

## Vocabulary

| Term | Meaning |
|---|---|
| LR | SignalThread Lead Retrieval product/backend |
| Lead | Event-scoped prospect/person record owned through company/event rules |
| Event workspace | Event-specific operational and intelligence view |
| Briefing | Structured lead intelligence prepared for review/use |
| Conversation intelligence | Rich derived artifacts such as evidence, themes, objections, needs, and messaging |
| Outbox | Mobile queue of durable mutations awaiting synchronization |
| Connection | User-owned external-provider credential state |
| Reconnect required | Stored credentials are unusable/revoked and provider calls must stop |
| Launch ticket | Signed, expiring, single-use browser OAuth handoff credential bound to context |
| Partial success | Canonical LR change succeeded while optional provider synchronization failed |
| Access mode | Event/company rule controlling who can access an event beyond general membership |

## Non-negotiable principles

1. Preserve tenant, event, lead, and acting-user authorization boundaries.
2. Fix the canonical service/data path rather than patching individual cards or screens.
3. Never expose credentials or raw provider errors.
4. Preserve offline work and idempotency across retries.
5. Do not mutate production data until the failure layer is proven.
6. Separate implemented facts from plans, prototypes, and commercial hypotheses.
7. Reuse existing OAuth, token, provider, MIME, Calendar, and follow-up architecture.
8. Treat accessibility, empty/error/partial-success states, and focus behavior as product behavior.

## Package navigation

- [Product and commercial context](./PRODUCT_AND_COMMERCIAL_CONTEXT.md)
- [System architecture and data](./SYSTEM_ARCHITECTURE_AND_DATA.md)
- [Decision and incident history](./DECISION_AND_INCIDENT_HISTORY.md)
- [Current state and next work](./CURRENT_STATE_AND_NEXT_WORK.md)
- [Agent operating rules](./AGENT_OPERATING_RULES.md)
- [Context source index](./CONTEXT_SOURCE_INDEX.md)
- [Context gaps and verification](./CONTEXT_GAPS_AND_VERIFICATION.md)

