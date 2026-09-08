# Streampoint Integration V1 (Lead Intel)

## 1) Purpose
Streampoint V1 enables Lead Intel to ingest event registration data into an event dataset so badge scans can resolve to real attendee context (person + company + registration identity).

This integration is event-level because registration sources are configured by Platform Admin at event setup time. Registration data powers the full event dataset used by organizers and exhibitors, so it cannot be owned or configured per exhibitor.

## 2) V1 Scope
### Included (MVP)
- Connect one Lead Intel event to one Streampoint event.
- Import/sync registrants into Lead Intel’s event dataset.
- Import badge/registration identifiers used for scan-time lookup.
- Import company data when available from Streampoint payloads.
- Support manual resync.
- Surface sync status to Platform Admin.

### Explicitly out of scope for V1
- Bidirectional sync from Lead Intel back to Streampoint.
- Writeback of leads, updates, or profile changes to Streampoint.
- Advanced field-mapping UI.
- Complex webhook-driven near-real-time pipelines (candidate for later phases).

## 3) Core Entities
Lead Intel must normalize these Streampoint concepts:

- **Event**
  - External event identity in Streampoint linked to one LR event.
- **Registrant / Person**
  - Attendee identity used for lead resolution and profile context.
- **Company**
  - Organization associated with a registrant when provided.
- **Badge / Registration Identifier**
  - Identifier used at scan-time to match the scanned attendee.
- **Attendee Type / Role (optional)**
  - Optional classification if present (e.g., attendee/exhibitor/sponsor/staff).

## 4) Normalized LR Data Contract (V1 Minimum)
Minimum normalized fields expected from Streampoint into LR event data:

- `external_event_id`
- `external_registrant_id`
- `badge_id`
- `full_name`
- `email`
- `job_title`
- `company_name`
- `registration_type`
- `status`

Notes:
- This is a product-level contract for normalized event data, not a DB migration spec.
- Field presence can vary by provider payload quality; nullability handling is implementation detail.

## 5) Sync Flow (Happy Path)
1. Platform Admin creates a Lead Intel event.
2. Platform Admin selects **Streampoint** as the event registration source.
3. Platform Admin enters/maps the Streampoint event identifier.
4. Lead Intel runs registrant sync into the event dataset.
5. Exhibitors scan badges during event operations.
6. Lead Intel matches scanned identifiers to synced registrant records and returns attendee context.

## 6) Admin UX Requirements (Event Integration Surface)
Platform Admin event-level integration UI should expose:

- Selected provider (`Streampoint`)
- External event ID
- Connection status
- Last sync time
- Sync count (records processed/imported)
- Manual resync trigger
- Sync errors (latest failure reason + actionable message)

## 7) Open Questions
Questions that need product/technical confirmation before implementation:

- What Streampoint authentication model will be used in V1 (API key, OAuth, account credentials, other)?
- Is the relationship strictly 1 LR event : 1 Streampoint event in V1, or should multi-source event stitching be supported later?
- What is the canonical badge identifier field from Streampoint for scan lookup when multiple identifiers exist?
- Which registrant statuses are considered sync-eligible in V1 (registered, checked-in, cancelled, no-show, etc.)?
- What is the expected manual resync behavior: full replace, incremental upsert, or configurable mode?
- What is the target sync volume/SLA per event (performance and pagination requirements)?
- What conflict-resolution strategy should apply when duplicate registrants exist by email vs external ID?
- Should attendee type/role be required for downstream workflows, or treated as optional metadata in V1?
- What audit requirements are needed for Platform Admin actions (who connected, who resynced, when)?
- What retry/error notification behavior is required when sync fails (UI-only, email alerts, both)?

---
This document is the canonical V1 planning spec for Streampoint as Lead Intel’s first registration provider integration.
