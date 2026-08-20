# Event Import Builder — Claude Implementation Plan

## Purpose

Build a fast “New Event Builder” for Planner Dash that lets a new user create a useful event workspace from one of three starting paths:

1. **Upload planning workbook** — primary/recommended path.
2. **Paste agenda** — lightweight path for fast Run of Show creation.
3. **Start from template** — no-file path for common event structures.

The main product win is that a user should not land in an empty event and then manually populate every module. They should upload or paste what they already have, review a clear preview, click **Create Event Workspace**, and land on an event dashboard with Run of Show, Budget, and Timeline already started.

---

## Ground Rules / Product Boundaries

### Schema and persistence guidance

Do not treat the current schema as a product limitation. Build the best Event Import Builder the current architecture can support, using existing event, Run of Show, Budget, Timeline, upload, and service paths first.

Do not add schema changes or migrations silently inside this implementation pass.

If the right product experience requires new persistence, stop and document the proposed schema change before implementing it. Examples that may require a separate schema proposal:

- saved import history
- resumable import jobs
- reusable import templates
- row-level import audit logs
- stored workbook-to-module mapping presets
- background import status tracking

The goal is not to block those features. The goal is to avoid accidental schema drift while building the core upload/create flow.

### Use current module paths and services

This plan should be implemented using existing concepts and current upload/import paths where available. Before writing new import code, inspect current repository paths for existing budget import/upload/parsing utilities and reuse them where possible.

Relevant current product areas:

- Events
- Rooms
- Run of Show / Matrix 2
- Budget
- Timeline
- Event dashboard

### Server owns writes

The UI can guide, preview, warn, and collect mapping decisions. The actual creation must be server-side and scoped/authorized. Do not have the browser fire a long chain of module-specific writes.

Preferred shape:

```ts
createEventFromImportPlan(input)
```

This server-side orchestration should create the event and selected module records in one deterministic flow.

### Execution model guidance

The first build should use the simplest reliable execution path that fits the current app: parse, preview, confirm, and create. If the existing architecture can support a better experience with persisted state, saved mappings, import history, or async processing without new schema, use it.

If the better implementation requires new persistence or background infrastructure, pause and propose that design separately instead of burying it inside this pass.

---

## Product Scope

### Initial implementation focus

- New Event Builder UI launched from Events page.
- Event basics collection.
- Three starting paths:
  - Upload planning workbook.
  - Paste agenda.
  - Start from template.
- Workbook detection for three sheets:
  - `Run of Show`
  - `Budget`
  - `Timeline`
- Sheet/header detection and manual column mapping review.
- Dry-run validation preview before any writes.
- Create event workspace using existing models/services.
- Land user on event dashboard after successful creation.
- Setup checklist on success state.
- Tests for parsing, mapping, validation, and create orchestration.

### Product expansion guidance

Do not artificially limit the module. Build the Event Import Builder as far as the current architecture supports.

For this pass, the core user promise is: create a new event workspace from a planning workbook, pasted agenda, or starter template. Run of Show, Budget, and Timeline are the primary modules because they are the planning artifacts in the upload flow.

Additional capabilities are allowed when they are naturally supported by existing services and do not create risky hidden behavior. Examples:

- import history, if an existing audit/activity/document pattern can support it cleanly
- reusable templates, if an existing template/config pattern already exists
- async/background handling, if existing infrastructure already exists
- speaker/staff extraction from Run of Show, if current speaker/staff services make this safe
- document preservation of the uploaded workbook, if current document/R2 paths make it straightforward and user-facing

If any of those require new tables, columns, migrations, queue infrastructure, or major product decisions, stop and propose them separately rather than silently implementing them.

---

## User Experience

### Entry point

On the Events page, replace or augment the current create flow with a primary button:

```text
New Event
```

Clicking opens a polished **New Event Builder**. This can be a full-page route, modal, or large drawer. Full-page is probably best if the current create flow is cramped.

Suggested route/component shape:

```text
web/app/(shell)/events/new/page.tsx
web/app/(shell)/events/_components/new-event-builder.tsx
```

Use current project conventions if different.

---

## Builder Steps

### Step 1 — Event Basics

Collect only what is required to create the event and contextualize parsing.

Fields:

- Event name
- Client
- Start date
- End date
- Venue / city
- Timezone
- Estimated attendees

UX notes:

- Keep this screen clean.
- Do not ask for every module detail here.
- The user should feel like they are setting up a workspace, not filling out a massive admin form.

Validation:

- Event name required.
- Start date required.
- End date required.
- End date cannot be before start date.
- Timezone should default from org/user/browser/current app behavior if available.

---

### Step 2 — Choose Starting Method

Show three large selectable cards.

#### Card 1: Upload planning workbook — recommended

Copy:

```text
Import Run of Show, Budget, and Timeline from one workbook.
```

Badge:

```text
Recommended
```

This is the default selected path.

#### Card 2: Paste agenda

Copy:

```text
Paste a rough schedule and we’ll create your Run of Show.
```

This path only creates Run of Show rows and rooms where detectable.

#### Card 3: Start from template

Copy:

```text
Use a starter structure for a common event type.
```

This path can start with code-defined template definitions if no reusable template system exists. If the repo already has a suitable template/config pattern, reuse it. If a true saved template library requires schema, propose that separately before implementation.

---

### Step 3A — Upload Planning Workbook

This is the primary path.

Expected workbook sheets:

```text
Run of Show
Budget
Timeline
```

Acceptable aliases:

#### Run of Show aliases

- Run of Show
- ROS
- Agenda
- Schedule
- Program
- Sessions

#### Budget aliases

- Budget
- Budget Tracker
- Costs
- Expenses
- Financials

#### Timeline aliases

- Timeline
- Project Plan
- Milestones
- Tasks
- Production Timeline

Supported file types:

- `.xlsx` preferred.
- `.csv` can be supported only for single-module import or if current upload path already supports it cleanly.

Important behavior:

- Do not write data on upload.
- Parse workbook into an import preview only.
- Show which sheets were detected, missing, or need mapping.
- Allow the user to continue if one or two sheets are missing, as long as at least one module has valid rows.

Sheet status cards:

```text
Run of Show
Detected: 42 rows
Needs attention: 5 rows missing end time
```

```text
Budget
Detected: 86 line items
Needs attention: 9 rows missing category
```

```text
Timeline
Detected: 54 tasks
Needs attention: 6 unresolved dependencies
```

Missing sheet state:

```text
Budget sheet not found
You can continue without Budget or map another sheet.
```

---

### Step 3B — Paste Agenda

This path is for the user who has a rough schedule but no workbook.

Input:

- Large paste area.
- Optional date selector if pasted text does not include dates.
- Example placeholder:

```text
9:00 AM Opening Remarks - Main Ballroom - Sarah Lee
10:00 AM Breakout: Sponsor Strategy - Room 204
11:00 AM Coffee Break - Foyer
```

Parsing target:

- Run of Show rows.
- Rooms/locations if obvious.
- Notes field for anything uncertain.

Do not force Budget or Timeline here. After creation, the dashboard checklist should recommend adding them.

Parser can start with a simple heuristic and improve from there:

- Detect time ranges like `9:00 AM - 10:00 AM`.
- Detect single start times like `9:00 AM` and leave end time blank or infer from next row only if current MatrixRow rules allow it.
- Split title/room/speaker-ish text on separators like `-`, `—`, `|`, tabs, or multiple spaces.
- Treat ambiguous tokens as notes, not hard assignments.

Warnings:

- Missing end times.
- Missing room.
- Unclear date.
- Rows that could not be parsed.

---

### Step 3C — Start From Template

Template choices:

- Conference
- Trade Show
- Gala / Awards
- Training
- Workshop
- Corporate Meeting

Each template should initially be represented in the simplest maintainable way the current architecture supports, likely code-defined template objects. If Claude finds an existing template/config system, reuse it. Do not silently add a persisted template library without a schema proposal.

Each template can include starter data:

- Run of Show starter rows.
- Room placeholders.
- Budget category shell or starter budget line placeholders if current budget APIs support this cleanly.
- Timeline starter tasks.

Example: Conference template

```text
Run of Show:
- Registration Opens
- Opening Remarks
- Keynote
- Breakout Sessions
- Lunch
- Sponsor Break
- Closing Remarks

Timeline:
- Confirm venue
- Finalize agenda
- Confirm speakers
- Collect AV requirements
- Finalize catering
- Publish attendee schedule

Budget:
- Venue
- AV / Production
- F&B
- Speaker Travel
- Signage
- Staffing
```

UX should make it clear this creates placeholders, not finished data.

---

## Mapping Review

After upload/paste/template, show a mapping and validation step before preview.

### Workbook mapping review

For each detected sheet, show:

- Source sheet name.
- Rows found.
- Columns found.
- Auto-mapped fields.
- Required fields missing.
- Rows with issues.

User actions:

- Change a mapped column.
- Mark a sheet as ignored.
- Continue with warnings.
- Cancel import.

Do not require perfect data to continue. The product should be forgiving.

---

## Canonical Import Plan Shape

Create an internal normalized object before writing anything. This should be the boundary between parsing/mapping and database creation.

Suggested type shape:

```ts
type EventImportPlan = {
  event: {
    name: string;
    clientId?: string | null;
    startsAt: string;
    endsAt: string;
    venueName?: string | null;
    city?: string | null;
    timezone: string;
    estimatedAttendees?: number | null;
  };
  source: {
    method: "workbook" | "paste_agenda" | "template";
    fileName?: string;
    templateKey?: string;
  };
  runOfShow: {
    rows: ImportRunOfShowRow[];
    warnings: ImportWarning[];
    skippedRows: ImportSkippedRow[];
  };
  budget: {
    rows: ImportBudgetRow[];
    warnings: ImportWarning[];
    skippedRows: ImportSkippedRow[];
  };
  timeline: {
    rows: ImportTimelineRow[];
    dependencies: ImportTimelineDependency[];
    warnings: ImportWarning[];
    skippedRows: ImportSkippedRow[];
  };
  summary: {
    roomsToCreate: string[];
    runOfShowRowsToCreate: number;
    budgetRowsToCreate: number;
    timelineRowsToCreate: number;
    totalWarnings: number;
    totalSkippedRows: number;
  };
};
```

Keep this as a TypeScript type/helper, not a database object.

---

## Run of Show Mapping

### Target records

- Create `Room` records for unique room/location names if they do not already exist for the new event.
- Create `MatrixRow` records for valid Run of Show rows.

### Expected columns

Strong matches:

- Date
- Start Time
- End Time
- Session / Item Name
- Room / Location
- Type
- Owner
- Status
- Notes

Aliases:

```text
Session / Item Name: Session, Item, Activity, Title, Program Item, Agenda Item
Room / Location: Room, Location, Venue Space, Space
Start Time: Start, Begins, StartTime
End Time: End, Ends, EndTime
Type: Session Type, Format, Category
Owner: Lead, Responsible, Planner, Contact
Notes: Notes, Details, Description
```

### Required fields for creation

Minimum required:

- Title/session name
- Date or default event date
- Start time if current MatrixRow rules require it

If end time is missing:

- Prefer warning and allow creation if current MatrixRow supports missing end.
- If required, skip row and show clear warning.

### Room handling

- Normalize room names by trimming whitespace and collapsing repeated spaces.
- Treat case-insensitive exact matches as the same room.
- Create room only once per unique normalized name.
- Keep original display casing from the first occurrence.

### Status handling

Map common imported values to current status values if compatible. Unknown values become notes/warnings rather than breaking the import.

Examples:

```text
Confirmed → confirmed/current equivalent if supported
Draft / TBD → draft/planning equivalent if supported
Cancelled → cancelled equivalent if supported
```

If current MatrixRow status enum is different, use existing mapping helpers or keep status unset and warn.

---

## Budget Mapping

### Target records

Use the current budget creation/import path. Do not create a parallel budget system.

Expected target records may include:

- `Budget`
- `BudgetVersion`
- `BudgetLineItem`
- relevant activity entries if the current budget service creates them

### Expected columns

Strong matches:

- Category
- Subcategory
- Line Item
- Vendor
- Quantity
- Unit Cost
- Estimated Cost
- Actual Cost
- Status
- Notes

Aliases:

```text
Line Item: Item, Description, Expense, Cost Item
Estimated Cost: Estimate, Estimated, Est Cost, Forecast, Budgeted
Actual Cost: Actual, Final Cost, Spent
Unit Cost: Rate, Price, Cost Each
Quantity: Qty, Count, Units
Vendor: Supplier, Provider, Company
Category: Type, Area, Department
Subcategory: Sub-category, Group
```

### Required fields for creation

Minimum required:

- Line item name/description
- Category or fallback category like `Uncategorized`
- At least one cost value OR zero-cost placeholder if current budget supports it

### Currency/cost parsing

Support common values:

```text
$1,200
1200
1,200.00
($500)
```

Warnings:

- Negative values.
- Non-numeric costs.
- Missing category.
- Missing item name.
- Both estimated and actual missing.

### Budget totals preview

Show:

- Total estimated cost.
- Total actual cost if present.
- Category count.
- Line item count.
- Rows skipped.
- Rows with warnings.

---

## Timeline Mapping

### Target records

- Create `TimelineItem` records.
- Create `TimelineDependency` records only when dependency references resolve cleanly to imported timeline rows.

### Expected columns

Strong matches:

- Task / Milestone
- Due Date
- Owner
- Status
- Dependency
- Related Area
- Notes

Aliases:

```text
Task / Milestone: Task, Milestone, To Do, Action Item, Deliverable
Due Date: Due, Deadline, Target Date, Date
Owner: Lead, Responsible, Assignee
Status: State, Progress
Dependency: Depends On, Blocked By, Prerequisite
Related Area: Module, Category, Workstream, Area
Notes: Description, Details, Comments
```

### Required fields for creation

Minimum required:

- Task title
- Due date if current TimelineItem requires it

If due date is missing but current service supports it:

- Create with no due date and warning.

If due date is required:

- Skip row and show warning.

### Status mapping

Map imported status values to current timeline statuses:

```text
Not Started / Todo / To Do / Open → NOT_STARTED
In Progress / Started / Active → IN_PROGRESS
At Risk / Blocked / Delayed → AT_RISK
Complete / Completed / Done → COMPLETE
```

Unknown status:

- Default to `NOT_STARTED` and warn.

### Dependency handling

Timeline dependencies should be imported when current services support them safely. If dependency creation is risky or unsupported, import the tasks, warn clearly, and document what would be needed for full dependency support.

If dependency cell names another imported task:

- Match by normalized title.
- If exactly one match exists, create dependency.
- If no match or multiple matches, do not create dependency; show warning.

---

## Preview Screen

Before writing anything, show a clear “This will create” summary.

Suggested layout:

Left side: module cards.
Right side: warnings/checklist.

Module cards:

```text
Run of Show
42 rows will be created
8 rooms will be created
5 warnings
```

```text
Budget
86 line items will be created
12 categories detected
$248,400 estimated
9 warnings
```

```text
Timeline
54 tasks will be created
6 dependencies detected
11 warnings
```

Global summary:

```text
This will create:
- 1 event workspace
- X rooms
- X Run of Show rows
- X budget line items
- X timeline tasks
```

Primary CTA:

```text
Create Event Workspace
```

Secondary CTA:

```text
Back to mapping
```

Warning behavior:

- Warnings do not block unless the row cannot be safely created.
- Skipped rows should be explicit.
- Do not hide skipped rows behind aggregate counts only.

---

## Create Flow

### Preferred backend shape

Add or reuse a server-side service boundary such as:

```text
web/lib/event-import-builder.ts
```

Suggested functions:

```ts
parseEventWorkbook(file): ParsedWorkbook
createImportPlanFromWorkbook(parsedWorkbook, eventBasics, mappingOverrides): EventImportPlan
createImportPlanFromPastedAgenda(text, eventBasics): EventImportPlan
createImportPlanFromTemplate(templateKey, eventBasics): EventImportPlan
validateEventImportPlan(plan): EventImportValidationResult
createEventFromImportPlan(plan, user): Promise<CreateEventFromImportResult>
```

If current repo conventions prefer `web/src/server/services`, follow that convention.

### Important creation behavior

The confirmed create action should:

1. Resolve/authenticate user.
2. Validate org/client/event access rules.
3. Create the Event using the current event creation path.
4. Ensure creator has event membership using existing behavior.
5. Create rooms for Run of Show rows.
6. Create MatrixRow records.
7. Create budget records/line items using current budget service/import mapping.
8. Create timeline items.
9. Create timeline dependencies only when safe.
10. Return event id and import summary.

### Transaction behavior

Prefer a transaction for the whole create flow if current services can participate cleanly.

If current services cannot be composed in a single transaction:

- Do not silently partial-create.
- Either refactor to support a safe service-level transaction or return a clear failure before writes.
- Avoid “event created but budget failed” unless product explicitly wants partial success. Prefer atomic creation or a clearly documented failure/recovery behavior.

### Double-click/retry behavior

- Disable submit while creating.
- Server should be deterministic and avoid duplicate sub-record creation from a single confirmed request.
- Do not add new schema solely for idempotency inside this pass. Use submit disabling and deterministic server behavior first; if true persisted idempotency is needed, propose it separately.

---

## Dashboard Success State

After success, route to:

```text
/events/[eventId]
```

Show success message:

```text
Your event workspace is ready.
```

Show imported summary:

```text
Imported from workbook:
- 42 Run of Show rows
- 86 budget line items
- 54 timeline tasks
```

Show next-step cards:

- Review Run of Show
- Review Budget
- Review Timeline
- Add speakers
- Upload menu / F&B
- Upload key docs
- Build room sets / seating

If user used paste agenda:

- Review Run of Show
- Add Budget
- Add Timeline

If user used template:

- Replace placeholder sessions
- Add real budget estimates
- Assign owners to timeline tasks

---

## UI Details

### Visual direction

- Premium SaaS.
- Clean white/light surface.
- Strong hierarchy.
- Soft card borders.
- Minimal but confident color.
- Progress indicator at top.
- Avoid dense tables until mapping/preview.
- Use planner language, not internal model language.

Do not show internal terms like:

- MatrixRow
- payload
- schema
- mutation
- Prisma

User-facing equivalents:

```text
MatrixRow → Run of Show item/session
BudgetLineItem → Budget line item
TimelineItem → Timeline task
Room → Room/location
```

### Important empty/error states

- No workbook selected.
- Workbook uploaded but no recognized sheets.
- Sheet found but no valid header row.
- Rows found but all invalid.
- One module missing but import can continue.
- File too large/unsupported.
- Server create failed.

---

## Validation Rules

### Workbook-level validation

- File type supported.
- Workbook has at least one usable sheet.
- At least one of Run of Show, Budget, Timeline has valid rows.

### Event validation

- Name required.
- Start/end dates valid.
- Timezone valid.
- Client belongs to current organization if client selected.

### Run of Show validation

- Title required.
- Date/time parseable when required.
- End time cannot be before start time.
- Room names normalized.
- Rows without required fields are skipped with warning.

### Budget validation

- Line item name required.
- Cost values parseable if provided.
- Missing category falls back to `Uncategorized` with warning if current budget path supports it.
- Rows without line item name are skipped.

### Timeline validation

- Task title required.
- Due date parseable when provided.
- Status mapped to supported enum.
- Unresolved dependencies do not block task creation; they block only dependency creation.

---

## Suggested File/Code Organization

Claude should inspect current repo first, but likely additions are:

```text
web/app/(shell)/events/new/page.tsx
web/app/(shell)/events/_components/new-event-builder.tsx
web/app/(shell)/events/_components/event-import-method-card.tsx
web/app/(shell)/events/_components/event-import-mapping-review.tsx
web/app/(shell)/events/_components/event-import-preview.tsx
web/lib/event-import-builder.ts
web/lib/event-import-builder.test.ts
web/lib/event-import-parser.ts
web/lib/event-import-parser.test.ts
```

API/server action location should follow current app conventions. Possible route shape:

```text
POST /api/events/import/preview
POST /api/events/import/create
```

But if the app uses server actions for event creation, prefer current conventions.

---

## Testing Plan

### Unit tests

Add pure tests for:

- Sheet name detection.
- Header/column matching.
- Run of Show row normalization.
- Budget row normalization.
- Timeline row normalization.
- Status mapping.
- Currency parsing.
- Date/time parsing.
- Dependency resolution.
- Warning/skipped-row generation.

### Service/API tests

Add tests for:

- Preview endpoint/action returns normalized import plan and warnings without writing data.
- Create endpoint/action creates event and expected records.
- Missing Budget sheet still allows Run of Show + Timeline import.
- Invalid workbook fails safely before writes.
- Event access/org/client validation is enforced server-side.

### UI tests where practical

- User can open New Event Builder.
- User can choose workbook path.
- User can see detected module cards.
- User can continue with warnings.
- User can create event from valid preview.
- User lands on event dashboard.

---

## Implementation Phases

### Phase 1 — UI shell + mocked preview

Build the event builder UI with all three starting methods. Use mocked import summary data. No final import writes yet unless needed to preserve the existing event creation path.

Goal: validate UX quickly.

### Phase 2 — Workbook parsing + dry-run plan

Wire upload parsing using current upload/import utilities where available. Add sheet detection, header mapping, normalized import plan, and warnings.

Goal: real preview, still no writes.

### Phase 3 — Create event from import plan

Add server-side create orchestration. Create event, rooms, Run of Show, Budget, Timeline using existing services/models.

Goal: one confirmed action creates usable event shell.

### Phase 4 — Paste agenda path

Add heuristic paste parser that creates Run of Show preview and uses same import plan/create path.

Goal: lightweight no-file event creation.

### Phase 5 — Template path

Add in-code templates for event types and pipe them into same import plan/create path.

Goal: no-file starter event creation.

### Phase 6 — Polish + tests

Tighten empty states, warnings, dashboard success state, and regression coverage.

---

## Acceptance Criteria

Feature is acceptable when:

- User can launch New Event Builder from Events page.
- User can upload a workbook with Run of Show, Budget, and Timeline sheets.
- App detects sheets and maps common headers.
- App shows module-level preview before writes.
- App warns about skipped/problem rows.
- Create action creates a new event workspace.
- Imported Run of Show rows appear in Run of Show/Matrix 2.
- Imported budget line items appear in Budget.
- Imported timeline tasks appear in Timeline.
- User lands on event dashboard with success summary/checklist.
- Paste agenda path can create at least Run of Show rows.
- Template path can create a starter event shell.
- No unreviewed schema changes are introduced.
- Tests cover parser/mapping/create flow.

---

## Claude Implementation Instruction

When implementing, do this in small passes and stop after each pass with changed files, behavior added, and tests run.

Recommended order:

1. Inspect existing event creation, budget import, timeline services, and Run of Show/Matrix row creation paths.
2. Build UI shell with mocked preview.
3. Add pure import plan types and parser/mapping helpers.
4. Wire real workbook preview.
5. Add server-side create orchestration.
6. Add paste agenda path.
7. Add template path.
8. Add tests and polish.

Do not silently add schema or migrations. Do not create a parallel budget/import system. Reuse current services where possible. If a current service is not reusable, explain why before adding a new helper. If the best product experience requires new persistence, stop and propose the schema/infrastructure change separately.
