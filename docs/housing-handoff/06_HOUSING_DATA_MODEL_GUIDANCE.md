# 06 — Housing Data Model Guidance

Two very different things live here:

- **§1–§4 are contract.** The mapping columns and rules are required for the launch handoff to work, and they are copied from two shipped implementations.
- **§5–§7 are a proposal.** Housing's domain has not been designed. Treat it as a starting point to argue with, not a spec.

---

## 1. The principle

> Housing owns its data. Platform owns identity, organizations, events and entitlement. They meet at exactly **three opaque UUID columns**.

No cross-database foreign keys. Platform ids are stored as plain `uuid` columns — the databases are separate Postgres instances and an FK across them is impossible and, more importantly, would couple their failure domains.

---

## 2. The three mapping columns — required

Modelled on Lead Retrieval's live schema.

```sql
-- Housing's local user record. The auth identity lives in Housing's OWN Supabase Auth.
alter table public.housing_users
  add column platform_user_id uuid;

create unique index housing_users_platform_user_id_key
  on public.housing_users (platform_user_id)
  where platform_user_id is not null;

-- Housing's organization/company equivalent.
alter table public.housing_organizations
  add column platform_organization_id uuid;

-- DELIBERATELY NOT UNIQUE. See §3.
create index housing_organizations_platform_organization_id_idx
  on public.housing_organizations (platform_organization_id)
  where platform_organization_id is not null;

-- Housing's local event record.
alter table public.housing_events
  add column platform_event_id uuid;

create unique index housing_events_platform_event_id_key
  on public.housing_events (platform_event_id)
  where platform_event_id is not null;
```

**Partial unique indexes**, not plain `UNIQUE` — Housing will have local rows with no Platform counterpart (a hotel contact, a draft event), and `NULL` must not collide.

### The one rule that matters most

> **Resolution reads ONLY these three columns. Never email, name, slug, company name, domain, or "the first matching row".**

From `apps/lead-retrieval/lib/platform/identity-mapping.ts`:

> *A value that merely resembles a local attribute must never become authority.*

This is not fussiness. A Lead Retrieval negative test deliberately proves `USER_MAPPING_NOT_FOUND` **while a user with the same email exists** — because an email-based fallback would let anyone who controls a matching address inherit someone's workspace. Write that test for Housing.

---

## 3. Resolution rules

### Users and events — trivial

`platform_user_id` and `platform_event_id` are unique, so each resolves to at most one row. No match → `USER_MAPPING_NOT_FOUND` / `EVENT_MAPPING_NOT_FOUND`. Fail closed.

### Organizations — the interesting one

`platform_organization_id` is **not** unique on purpose: one Platform organization may legitimately own several Housing organizations (a parent account with regional housing entities, say, or separate entities per event series).

So the organization id **alone never resolves**. Lead Retrieval narrows it, and Housing should use the same shape:

```
1. Candidates = all Housing orgs with this platform_organization_id
                → zero?      ORGANIZATION_MAPPING_NOT_FOUND

2. Narrow by the mapped EVENT: keep only candidates that own the event
   (housing_events.organization_id) or participate in it
                → zero?      EVENT_ORGANIZATION_MISMATCH
                → one?       resolved ✓

3. Still several? Narrow by the mapped USER's own relationships:
   housing_users.organization_id, then the user's event-level membership
                → exactly one?  resolved ✓
                → zero or several?  AMBIGUOUS_ORGANIZATION_MAPPING
```

**Nothing is ever picked by position.** "Take the first row" would make the answer depend on index order — which is why Lead Retrieval has an explicit *order-independent* test that shuffles the candidates and asserts the same refusal.

### Mapping is not authorization

Resolving a mapping answers *"which Housing rows do these canonical ids name?"* and nothing more. Whether that user may open that workspace is a **separate** decision, made afterwards by Housing's own rules, using the same resolver every other Housing surface uses. Do not invent a parallel permission model for the launch path — that is how two code paths drift and one of them becomes wrong.

### Full failure-code set to implement

| Code | Meaning |
|---|---|
| `INVALID_PLATFORM_ID` | Not a canonical UUID |
| `USER_MAPPING_NOT_FOUND` | No Housing user carries this `platform_user_id` |
| `EVENT_MAPPING_NOT_FOUND` | No Housing event carries this `platform_event_id` |
| `EVENT_NOT_LAUNCHABLE_CONTAINER` | The mapped row is not a real event (see §4) |
| `ORGANIZATION_MAPPING_NOT_FOUND` | No Housing org carries this `platform_organization_id` |
| `EVENT_ORGANIZATION_MISMATCH` | Mapped orgs exist, none relates to the mapped event |
| `AMBIGUOUS_ORGANIZATION_MAPPING` | Narrowing left zero or several |

---

## 4. Guard against synthetic containers

Lead Retrieval's `events` table holds both real events and `continuous_capture` buckets, so it carries:

```sql
container_kind text not null default 'event'
  check (container_kind in ('event', 'continuous_capture')),

-- a mapped row must be a real event
constraint events_platform_event_id_container_kind_check
  check (platform_event_id is null or container_kind = 'event')
```

…and the application refuses a non-event container **independently** of the constraint.

If Housing ever introduces an event-like container that is not a Platform event (a standing room-block agreement across a series, an annual master contract), add the same pair: a DB check *and* an application check. Belt and braces, deliberately — the schema forbids the state, and the code refuses it anyway.

---

## 5. Domain proposal — argue with this

Nobody has designed Housing's domain. This is a starting sketch from the shape of the problem and what Platform already assumes.

**What Platform already assumes Housing knows** (from `product-catalog.ts` — change it if wrong, but change it deliberately):
- Purpose: *"Knows where they stay"*
- Responsibility: *"Stay logistics"*
- Lifecycle span: **before → during**
- Headline fact: **Rooms held**
- Metrics: **Rooms held**, **Committed**

### Sketch

```
housing_organizations     ← platform_organization_id
housing_users             ← platform_user_id        (auth identity in Housing's own Auth)
housing_events            ← platform_event_id

hotels                    property record: name, address, geo, brand, contacts
                          (org-scoped; reusable across events)

room_blocks               event_id + hotel_id + date range
                          the contracted allotment — the core object
                          "Rooms held" almost certainly counts here

block_inventory           per block, per night, per room_type:
                          contracted / picked_up / released
                          ⚠️ housing is a per-night problem, not a per-stay one

rate_plans                per block: room_type, nightly rate, currency,
                          taxes/fees, inclusions, commission

reservations              an attendee's stay: guest, block, arrival, departure,
                          room_type, rate_plan, status, confirmation number

reservation_nights        materialised per-night rows
                          (makes pickup, occupancy and attrition tractable)

rooming_list_imports      batch ingest from a hotel or planner, with row-level
                          validation and provenance

attrition_terms           contractual: cutoff date, allowable shrink %,
                          penalty basis — what makes housing financially risky

sub_blocks                allocation of a block to an exhibitor / sponsor / group
```

### Modelling notes worth arguing about now, not later

1. **Per-night, not per-stay.** Pickup, attrition, and occupancy are all nightly. A `reservations` table without `reservation_nights` makes every interesting query a date-range gymnastics exercise.
2. **Attrition is the money.** Cutoff dates and shrink allowances are the contractual risk a housing product exists to manage. Model them as first-class from day one.
3. **"Rooms held" is ambiguous** — contracted allotment, or current pickup? Pick one, name the column unambiguously, and make Platform's tile say the same thing.
4. **Event dates are not reliably available from Platform** (file 02 §3: `starts_at`/`ends_at` are frequently NULL, and `timezone` is not even applied live). A room block has a hard date range. **Housing must own its own dates** and treat Platform's as an optional hint.
5. **Timezones.** Lead Retrieval carries its own `events.timezone` because Platform's is unreliable. Housing needs one too — hotel nights are local-date concepts, and a UTC-day assumption will produce off-by-one nights.
6. **Currency and tax.** If rates are contracted in multiple currencies, decide early. Retrofitting currency is painful.
7. **Guests are not necessarily Platform users.** An attendee with a reservation is a Housing-domain entity with no `platform_user_id`. Keep "guest" and "Housing user" as separate concepts from the start.

---

## 6. Schema conventions to follow

Copied from Platform Core and Lead Retrieval:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` with a shared `set_updated_at()` trigger
- Real invariants as **database constraints**, not just application checks
- Explicit uniqueness where the business model requires it
- Foreign keys where ownership matters, with deliberate `ON DELETE` semantics
- `check` constraints for enumerated text columns (Lead Retrieval's style) *or* Postgres enums (Platform Core's style) — pick one per project and be consistent
- RLS **enabled and forced** on every table; deny by default; `anon` revoked; privileged writes reachable only by service-role server code

---

## 7. Publishing to Platform's event dashboard (optional, later)

Platform's connected-event overview can render a summary band per product, via `ProductFeedSource` in `apps/platform/lib/event-overview/product-feed.ts`:

```ts
type ProductFeed = {
  productKey, organizationId, eventId,
  status: "active" | "setup" | "needs-review" | "at-risk",
  headline: string,                      // "412 held · 68% picked up · cutoff in 9 days"
  fact: { kind: "count", value: number } // Housing's contribution to the shared event object
     | { kind: "state", label: string }
     | { kind: "unavailable", label: string },
  metrics: [ProductMetric, ProductMetric],
  narrative: string,
  attention: FeedAttentionItem[],
  reportedAt: string,
}
```

**No adapter exists yet for any product.** There is no service-to-service contract between Platform and products today — the launch handoff is the only cross-app contract — and `apps/*` may not import each other. Until one ships, the dashboard renders each product's *registry* state and says plainly that its summary is not connected. **It never fabricates a number to look complete.**

If Housing wants to publish a feed, that is new shared infrastructure: design the transport (a signed HTTP endpoint Platform polls, most likely) with Ali before building it. Do not reach into Housing's database from Platform.
