# Planner OS Data Model (Phase 1)

## Goals
- Support multiple events per planner/team
- Track deadlines, budgets, and an operational matrix (F&B, AV, room sets)
- Multi-user access with roles and event-level membership
- Clean, extensible schema. No UI concerns.

## Core Entities
1. Event
2. Deadline
3. BudgetItem
4. MatrixRow

## Supporting Entities (minimal but required)
- User
- Organization
- Membership (User <-> Organization)
- EventMember (User <-> Event)

---

## Organization
Represents a planning company or team.

Fields:
- id (uuid, pk)
- name (text, required)
- slug (text, unique, required)
- createdAt (timestamp, required)
- updatedAt (timestamp, required)

Relationships:
- Organization has many Users via Membership
- Organization has many Events

---

## User
Represents an authenticated user.

Fields:
- id (uuid, pk)
- orgId (uuid, fk -> Organization.id, required)
- email (text, unique, required)
- name (text, optional)
- role (enum: OWNER, ADMIN, MEMBER, VIEWER, required)
- createdAt (timestamp, required)
- updatedAt (timestamp, required)

Relationships:
- User belongs to Organization
- User has many Events via EventMember

---

## Event
Represents one program/event.

Fields:
- id (uuid, pk)
- orgId (uuid, fk -> Organization.id, required)
- name (text, required)
- startDate (date, required)
- endDate (date, optional)
- timezone (text, required, default: "America/New_York")
- venueName (text, optional)
- city (text, optional)
- state (text, optional)
- status (enum: DRAFT, ACTIVE, COMPLETED, CANCELED, required)
- createdByUserId (uuid, fk -> User.id, required)
- createdAt (timestamp, required)
- updatedAt (timestamp, required)

Relationships:
- Event has many Deadlines
- Event has many BudgetItems
- Event has many MatrixRows
- Event has many Users via EventMember

---

## EventMember
Defines event-level access and roles.

Fields:
- id (uuid, pk)
- eventId (uuid, fk -> Event.id, required)
- userId (uuid, fk -> User.id, required)
- eventRole (enum: EVENT_ADMIN, EVENT_EDITOR, EVENT_VIEWER, required)
- createdAt (timestamp, required)

Constraints:
- unique(eventId, userId)

---

## Deadline
Tracks an upcoming milestone date.

Fields:
- id (uuid, pk)
- eventId (uuid, fk -> Event.id, required)
- title (text, required)  // e.g. "F&B Submission", "A/V Order", "Cutoff Date"
- description (text, optional)
- dueAt (timestamp, required)
- category (enum: FNB, AV, HOUSING, REGISTRATION, LOGISTICS, OTHER, required)
- status (enum: OPEN, DONE, BLOCKED, CANCELED, required)
- ownerUserId (uuid, fk -> User.id, optional)
- createdAt (timestamp, required)
- updatedAt (timestamp, required)

Indexes:
- (eventId, dueAt)
- (eventId, status)

---

## BudgetItem
Budget line items with rollups.

Fields:
- id (uuid, pk)
- eventId (uuid, fk -> Event.id, required)
- category (text, required)        // e.g. "F&B", "A/V", "Rooms", "Decor"
- subcategory (text, optional)     // optional grouping
- name (text, required)            // line item name
- vendor (text, optional)
- notes (text, optional)

Money fields (store in cents as integer):
- forecastCents (int, required, default 0)
- actualCents (int, required, default 0)

Status fields:
- status (enum: PLANNED, COMMITTED, PAID, CANCELED, required)

Audit:
- createdAt (timestamp, required)
- updatedAt (timestamp, required)

Indexes:
- (eventId, category)
- (eventId, status)

Derived fields (computed, not stored):
- varianceCents = actualCents - forecastCents

---

## MatrixRow
Operational matrix row for room sets, F&B, and A/V needs.

This is the planner's grid.

Fields:
- id (uuid, pk)
- eventId (uuid, fk -> Event.id, required)

Time and location:
- dayDate (date, required)
- startTime (time, optional)
- endTime (time, optional)
- roomName (text, required)

Meeting context:
- sessionName (text, optional)
- setupType (text, optional)      // e.g. Theater, Classroom, Rounds
- attendance (int, optional)

F&B:
- fnbNotes (text, optional)
- mealPeriod (enum: NONE, BREAKFAST, BREAK, LUNCH, RECEPTION, DINNER, OTHER, optional)

A/V:
- avNotes (text, optional)
- avNeeds (text, optional)        // quick text for MVP

General:
- notes (text, optional)

Audit:
- createdAt (timestamp, required)
- updatedAt (timestamp, required)

Indexes:
- (eventId, dayDate, roomName)

---

## Phase 1 MVP Scope
Required to ship:
- Organization, User, Event, EventMember
- Deadline
- BudgetItem
- MatrixRow

Explicitly not in Phase 1:
- Seating charts
- Room layout rendering
- Registration or housing integrations
- Marketplace/reviews
