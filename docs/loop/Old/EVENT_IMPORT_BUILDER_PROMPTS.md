# Event Import Builder — Claude Prompt Pack

## Purpose

Use this prompt pack to build the Planner Dash **Event Import Builder** in controlled passes.

The feature creates a fast new-event setup flow with three starting paths:

1. **Upload planning workbook** — primary/recommended path.
2. **Paste agenda** — lightweight Run of Show creation path.
3. **Start from template** — no-file starter path.

The planning workbook path expects three sheets:

- `Run of Show`
- `Budget`
- `Timeline`

The user should be able to upload/paste/select a starter source, review a dry-run preview, confirm creation, and land on the event dashboard with a usable event shell.

---

## Absolute Guardrails For Every Prompt

Apply these to every pass.

```text
Do not silently change Prisma schema files.
Do not silently add migrations.
Do not scatter writes across many client-side calls.
Do not run git commit, git merge, git rebase, or any git command that may open an editor.
If the best product experience requires new persistence, schema, migrations, queue infrastructure, or stored import/template state, stop and propose the change separately before implementing it.
```

Do not artificially limit the product. Build the Event Import Builder as far as the current architecture supports. The goal is to avoid accidental schema drift, not to block import history, reusable templates, async status tracking, or saved mappings forever.

Server-side writes must be canonical. The UI can collect, preview, warn, and confirm. The server must own the actual creation/write behavior.

Preferred final service shape:

```ts
createEventFromImportPlan(input)
```

or, if project naming conventions suggest otherwise:

```ts
createEventFromBuilderPlan(input)
```

Use one canonical service/orchestration path instead of a long browser chain of `fetch()` calls.

### Schema and persistence guidance for Claude

Do not treat saved import history, reusable templates, mapping presets, resumable imports, or async import status as forbidden product ideas.

Treat them as product/persistence decisions. If they can be supported cleanly with existing services or existing records, explain how and implement only when it fits the current pass. If they require new schema, migrations, queue infrastructure, or major workflow decisions, pause and write the proposed change instead of implementing it silently.

---

## Suggested Branch / Setup

Run only the minimum setup needed.

```bash
cd "/Users/ali/Documents/God Emperor of Dune /planner-os"
git status --short
```

If a feature branch does not already exist:

```bash
git switch -c feat/event-import-builder
```

Do not commit unless explicitly asked.

---

## Implementation Passes

Recommended sequence:

1. Audit current paths.
2. UI shell with mock preview.
3. Workbook parser + normalized preview.
4. Server-side import plan + create mutation.
5. Paste agenda path.
6. Template path.
7. Polish, hardening, and tests.

This is intentionally split to make review easier. Do not combine passes unless specifically asked.

---

# Prompt 0 — Audit Current Paths First

```text
Model: Best available Claude
Reasoning: High

Audit the current Planner Dash repo for the Event Import Builder implementation path. Do not edit files yet.

Goal:
Find exactly what already exists for event creation, upload/import, budget import, Run of Show/Matrix row creation, and timeline creation so the feature reuses current code instead of duplicating logic.

Product context:
Planner Dash is an event planning OS. Events are org-scoped and may belong to a client. Event workspaces include Run of Show / Matrix, Budget, Timeline, Docs, Speakers, F&B, Room Set, and Seating. The new Event Import Builder should create a new event shell from either:
1. Planning workbook upload with Run of Show, Budget, and Timeline sheets
2. Paste agenda
3. Starter template

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Do not implement yet.
- Do not run commits or merges.

Inspect likely areas:
- web/app/(shell)/events
- web/app/(shell)/events/[eventId]
- web/app/api/events
- web/app/api/events/[eventId]/budget/import/route.ts
- web/lib/events.ts
- web/lib/event-access.ts
- web/lib/matrix2.ts
- web/lib/matrix2-session.ts
- web/lib/budget-category-filter.ts
- web/lib/budget-import-mapping.ts, if present
- web/src/server/services/budget.ts
- web/src/server/services/timeline.ts
- web/src/server/services/documents.ts only to avoid accidentally touching docs upload
- Any existing CSV/XLSX parser utilities
- Any existing tests for event creation, Matrix rows, budget import, and timeline

Return a concise but complete audit with these sections:

1. Current event creation path
- Entry UI file(s)
- API route/server action/service used
- Required fields
- Where EventMember/default setup is created
- Where to hook the builder launch

2. Current budget import path
- Files/functions found
- Whether XLSX/CSV parsing already exists
- How imported budget rows become Budget/BudgetVersion/BudgetLineItem records
- What can be reused directly
- What should not be duplicated

3. Current Run of Show / Matrix write path
- Files/functions/routes that create MatrixRow sessions
- Required fields for MatrixRow
- How rooms are created/matched today
- Which path is safest for event-scoped writes

4. Current Timeline write path
- Files/functions/routes that create TimelineItem records
- Required fields/status enums
- Whether dependency creation is supported and how
- Risks around dependencies or owner mapping

5. Upload/parsing utilities
- Any libraries already installed for XLSX/CSV
- Any helper functions already present
- Any patterns for file upload and server parsing

6. Access and authorization risks
- Which services/routes already call request-user/event-access guards
- Which paths are not uniformly guarded
- Recommended safe place for the new create/import service

7. Recommended implementation sequence
- Exact files likely to touch in Pass 1
- Exact helpers/services likely needed later
- Test files to add/update

Acceptance for this audit:
- No files changed.
- Exact reusable paths identified.
- Clear recommendation on whether to build a full-page route or modal/drawer.
- Clear recommendation on where the canonical create service should live.
```

---

# Prompt 1 — UI Shell With Mock Preview

```text
Model: Best available Claude
Reasoning: High

Implement Pass 1 of the Event Import Builder: polished UI shell with mock preview only.

Start by using the findings from Prompt 0. If Prompt 0 was not run, quickly inspect the Events page and current create-event flow before editing.

Goal:
Add a slick new-event setup experience that lets users choose:
1. Planning Workbook upload
2. Paste Agenda
3. Start from Template
4. Optional Start Blank, if preserving the existing create-event flow makes sense

This pass is UI only. Use mock preview data. Do not implement real parsing or real module writes yet.

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Do not wire final Run of Show/Budget/Timeline writes.
- Do not remove the existing event creation path unless the builder safely replaces it.
- Preserve current event creation behavior.

Preferred UX entry:
- Add/modify the Events page primary action to open or route to the builder.
- If project conventions support it, prefer a full-page route such as:
  - web/app/(shell)/events/new/page.tsx
  - web/app/(shell)/events/_components/new-event-builder.tsx
- Use existing project styling/component conventions.

Builder structure:

Step 1: Event Basics
Fields:
- Event name
- Client
- Start date
- End date
- Venue / city
- Timezone
- Estimated attendees

Validation:
- Event name required
- Start date required
- End date required
- End date cannot be before start date
- Timezone should default to current app/org/browser behavior if available

Step 2: Choose Starting Point
Show large selectable cards:

1. Planning Workbook
Badge: Recommended
Copy: Import Run of Show, Budget, and Timeline from one workbook.
Default selected.

2. Paste Agenda
Copy: Paste a rough schedule and we’ll create your Run of Show.

3. Start from Template
Copy: Use a starter structure for a common event type.

4. Start Blank
Copy: Create the workspace only.
Only include if this preserves current behavior cleanly.

Step 3: Source Input

Planning Workbook state:
- Upload/dropzone area
- Copy must clearly say expected sheets:
  - Run of Show
  - Budget
  - Timeline
- Show mock detected sheet cards:
  - Run of Show: detected
  - Budget: detected
  - Timeline: detected
- Include helper copy that this is a preview and nothing is written yet.

Paste Agenda state:
- Large paste textarea
- Example placeholder:
  9:00 AM Opening Remarks - Main Ballroom - Sarah Lee
  10:00 AM Breakout: Sponsor Strategy - Room 204
  11:00 AM Coffee Break - Foyer
- Mock preview should only populate Run of Show.

Template state:
- Static selectable cards:
  - Conference
  - Trade Show
  - Gala / Awards
  - Training
  - Workshop
  - Corporate Meeting
- Show badges like Sessions, Budget shell, Timeline tasks.

Blank state:
- Simple confirmation card explaining only the event workspace will be created.

Step 4: Preview Event Shell
Show a polished preview with three module summary cards:

Run of Show card:
- Count of rows/sessions
- Count of rooms detected
- Warning count
- 3 sample rows

Budget card:
- Count of line items
- Estimated total
- Count of categories
- Warning count
- 3 sample rows

Timeline card:
- Count of tasks
- Overdue/invalid count if mock data has it
- Warning count
- 3 sample rows

Also show a right-side or lower checklist:
- Review Run of Show
- Review Budget
- Review Timeline
- Add speakers
- Upload menu / F&B
- Upload key docs
- Build room sets / seating

Primary CTA:
Create Event Workspace

Secondary controls:
- Back
- Cancel
- Edit basics

UX requirements:
- Premium SaaS feel, clean and planner-friendly.
- No dense tables in the main flow.
- Use compact row previews, not giant grids.
- Responsive for mobile/tablet widths.
- Warnings should feel helpful, not scary.
- Avoid technical copy like MatrixRow, payload, parser, schema, mutation.

Implementation requirements:
- Keep state local to the builder for now.
- Create typed mock preview structures that can later become the real normalized preview type.
- Avoid deeply coupling the UI to mock-only structures that will be hard to replace.

Tests:
Add focused tests if the project has UI/component tests for event pages. At minimum, verify:
- Builder renders from Events page action/route.
- User can move through basics → method → source → preview.
- Workbook path shows Run of Show, Budget, Timeline sheet expectations.
- Paste path shows agenda textarea.
- Template path shows event type cards.
- Preview shows three module cards.

Acceptance:
- Existing Events page still works.
- Existing blank event creation still works or is preserved.
- No schema files changed silently.
- No migrations added silently.
- No real imported records are written yet.
- End with files changed and test commands run.
```

---

# Prompt 2 — Workbook Parser + Normalized Preview

```text
Model: Best available Claude
Reasoning: High

Implement Pass 2 of the Event Import Builder: real workbook parsing and normalized preview for the Planning Workbook path.

Goal:
Users can upload a workbook, the app detects Run of Show/Budget/Timeline sheets, maps columns into normalized preview data, and shows counts/warnings/sample rows. Do not create final Event/Matrix/Budget/Timeline records yet.

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Do not write imported module records in this pass.
- Reuse existing budget import/mapping code where possible.
- Do not duplicate current budget import logic if a reusable helper exists.

Supported primary file type:
- .xlsx

Only support .csv if the repo already has a clean current path. If CSV support would cause complexity, leave CSV as a future enhancement with user-facing copy.

Expected sheets:
- Run of Show
- Budget
- Timeline

Sheet aliases:

Run of Show aliases:
- Run of Show
- ROS
- Agenda
- Schedule
- Program
- Sessions

Budget aliases:
- Budget
- Budget Tracker
- Costs
- Expenses
- Financials

Timeline aliases:
- Timeline
- Project Plan
- Milestones
- Tasks
- Production Timeline

Behavior:
- Uploading/parsing must not write data.
- Detect exact sheets first.
- If exact sheet is missing but an alias is found, auto-map it with a warning/info note.
- If multiple possible aliases are found, show a sheet mapping control instead of guessing silently.
- Allow partial import if at least one module has valid rows.
- Missing sheets should produce warnings, not hard failure.

Column mapping expectations:

Run of Show normalized fields:
- date
- startTime
- endTime
- title
- roomName
- type
- owner
- status
- notes

Run of Show accepted column aliases:
- date: Date, Day, Session Date
- startTime: Start Time, Start, Begins, Start
- endTime: End Time, End, Ends, Finish
- title: Session / Item Name, Session Name, Item Name, Title, Activity, Program Item, Description
- roomName: Room / Location, Room, Location, Venue, Space
- type: Type, Session Type, Format
- owner: Owner, Lead, Responsible, Contact
- status: Status, State
- notes: Notes, Internal Notes, Details, Comments

Budget normalized fields:
- category
- subcategory
- lineItem
- vendor
- quantity
- unitCost
- estimatedCost
- actualCost
- status
- notes

Budget accepted column aliases:
- category: Category, Budget Category, Group
- subcategory: Subcategory, Sub Category, Sub-Category
- lineItem: Line Item, Item, Description, Expense, Budget Item
- vendor: Vendor, Supplier, Provider
- quantity: Quantity, Qty, Count
- unitCost: Unit Cost, Unit Price, Rate
- estimatedCost: Estimated Cost, Estimate, Budgeted, Budget, Estimated
- actualCost: Actual Cost, Actual, Final Cost, Paid
- status: Status, State
- notes: Notes, Comments, Details

Timeline normalized fields:
- task
- dueDate
- owner
- status
- dependency
- relatedArea
- notes

Timeline accepted column aliases:
- task: Task / Milestone, Task, Milestone, To Do, Action Item, Deliverable
- dueDate: Due Date, Deadline, Target Date, Date
- owner: Owner, Lead, Responsible, Assigned To
- status: Status, State, Progress
- dependency: Dependency, Depends On, Predecessor, Blocking Task
- relatedArea: Related Area, Area, Module, Workstream, Category
- notes: Notes, Comments, Details

Validation rules:

Run of Show:
- title is required for a writable row.
- date/start/end should warn if missing.
- roomName can be missing but warns.
- invalid time/date values should mark the row as skipped or needs review.
- If endTime is missing, do not invent duration unless existing app behavior already does this safely.

Budget:
- lineItem or description is required for a writable row.
- category missing should warn but can default to Uncategorized only if current budget import already does that.
- numeric fields should parse currency symbols, commas, parentheses negatives, and blanks.
- estimatedCost can be computed from quantity * unitCost only if estimatedCost is empty and both values are valid.
- Preserve user-facing category/subcategory labels.

Timeline:
- task is required for a writable row.
- dueDate missing should warn.
- invalid dueDate should mark the row as skipped or needs review.
- dependency text should remain unresolved unless there is an exact unique match.

Normalized preview shape suggestion:

```ts
type EventImportPreview = {
  eventBasics: EventImportBasics;
  sourceType: "workbook" | "pasteAgenda" | "template" | "blank";
  modules: {
    runOfShow: RunOfShowPreview;
    budget: BudgetPreview;
    timeline: TimelinePreview;
  };
  globalWarnings: ImportWarning[];
};
```

Each module preview should include:

```ts
type ModulePreview<T> = {
  detected: boolean;
  sheetName?: string;
  mappedColumns: Record<string, string | null>;
  rows: T[];
  validRowCount: number;
  skippedRowCount: number;
  warnings: ImportWarning[];
  sampleRows: T[];
};
```

Warning shape suggestion:

```ts
type ImportWarning = {
  module: "runOfShow" | "budget" | "timeline" | "global";
  severity: "info" | "warning" | "error";
  rowNumber?: number;
  field?: string;
  message: string;
};
```

UI requirements:
- Replace mock workbook preview with real parsed results.
- Show detected sheet names.
- Show mapped columns.
- Show row counts and warning counts.
- Show sample rows.
- Show missing/ambiguous mappings clearly.
- Do not overwhelm the main screen with a full spreadsheet grid.

Tests:
Add tests for parser/mapping helpers. Cover:
- Exact sheet detection.
- Alias sheet detection.
- Ambiguous alias detection.
- Missing sheet warnings.
- Run of Show column alias matching.
- Budget column alias matching.
- Timeline column alias matching.
- Missing required field warnings.
- Currency/number parsing.
- Invalid date/time warnings.
- Budget estimated cost computed from quantity * unitCost only when safe.

Acceptance:
- Uploaded workbook produces a normalized preview.
- No event/module records are created yet.
- Existing budget import behavior is not broken.
- No silent schema changes.
- End with files changed and test commands run.
```

---

# Prompt 3 — Server-Side Import Plan + Create Event Workspace

```text
Model: Best available Claude
Reasoning: High

Implement Pass 3 of the Event Import Builder: server-owned create/write behavior for the normalized import plan.

Goal:
After the user reviews the preview and clicks Create Event Workspace, one canonical server-side path creates the Event and writes selected Run of Show, Budget, and Timeline records using existing models/services.

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Do not submit budget/document approvals.
- Do not silently create docs, F&B, seating, or room-set data in this pass. If one of those is clearly supported and valuable, call it out before adding it.
- Do not silently auto-create speakers/people from ambiguous owner/speaker text. If an existing safe explicit service supports it and the behavior is clear, call it out before adding it.
- Do not have the client fire separate write calls for event, rooms, rows, budget, and timeline.

Preferred service:
Create a canonical server/service function named according to project convention, such as:

```ts
createEventFromImportPlan(input)
```

or:

```ts
createEventFromBuilderPlan(input)
```

Likely location after audit:
- web/lib/events.ts
- or a new focused helper under web/lib/event-import-builder.ts
- or web/src/server/services/event-import-builder.ts if service-layer conventions point there

The route/server action should stay thin:
- authenticate
- authorize/org-scope
- validate input
- call canonical service
- return structured result

Input shape should include:
- eventBasics
- sourceType
- normalized runOfShow rows to write
- normalized budget rows to write
- normalized timeline rows to write
- user mapping decisions if needed
- skipped rows/warnings from preview for transparency

Output shape should include:

```ts
type EventImportCreateResult = {
  eventId: string;
  created: {
    rooms: number;
    runOfShowRows: number;
    budgetLineItems: number;
    timelineItems: number;
    timelineDependencies?: number;
  };
  skipped: {
    runOfShowRows: number;
    budgetLineItems: number;
    timelineItems: number;
  };
  warnings: ImportWarning[];
};
```

Write behavior:

1. Event
- Create the event using current event creation behavior.
- Preserve org/client scoping.
- Preserve existing creator EventMember/default setup behavior.
- Do not bypass current event defaults.

2. Rooms
- From valid Run of Show roomName values, create or match event-scoped Room records.
- Deduplicate room names case-insensitively where safe.
- Do not match rooms across events.
- Keep room names user-facing.

3. Run of Show
- Create MatrixRow-backed sessions/rows using current safe write path.
- title required.
- date/start/end values should map to existing MatrixRow fields according to current model/service.
- roomId should link to matched/created event Room where available.
- Preserve notes/type/status only where current model supports them.
- Do not invent unsupported fields.

4. Budget
- Use existing budget import/service path where possible.
- Create Budget/BudgetVersion/BudgetLineItem records according to existing behavior.
- Preserve category/subcategory/line item/vendor/quantity/unit cost/estimated/actual/status/notes where supported.
- Do not create approval submissions.
- Do not change review state.

5. Timeline
- Create TimelineItem records using current timeline service path.
- Map status values to existing timeline enum values.
- Invalid/unknown statuses should become default safe status only if the existing timeline create behavior has a default. Otherwise warn.
- Create TimelineDependency only where dependency text resolves to exactly one created task.
- Ambiguous dependencies should warn and not create dependency.

Transaction/safety:
- Prefer a transaction if current services allow it cleanly.
- If a full transaction is not feasible because existing services manage their own writes, keep orchestration deterministic and return clear partial-failure behavior.
- Validate server-side that the user can create/write in the org/event scope.
- Do not rely on client-only validation.

Client wiring:
- The Preview screen Create Event Workspace button should call only the new canonical endpoint/action.
- Show loading state.
- Show structured error state.
- On success route to `/events/[eventId]`.
- Show success copy: Your event workspace is ready. Review the imported Run of Show, Budget, and Timeline.

Tests:
Add server/service tests where project conventions support them. Cover:
- Create event with org/client scope.
- Creator membership/default setup preserved.
- Rooms are created event-scoped and deduped within event.
- Valid Run of Show rows become Matrix rows.
- Invalid Run of Show rows are skipped and reported.
- Budget rows are written through existing service/import path.
- Timeline tasks are event-scoped.
- Timeline dependencies are created only for exact unique matches.
- Invalid access/write attempt is rejected.
- No writes happen before final confirmation endpoint/action.

Acceptance:
- One user action creates the event workspace from the reviewed plan.
- User lands on event dashboard after success.
- Imported Run of Show/Budget/Timeline data appears in their existing module pages.
- No silent schema changes.
- No silent migrations.
- End with files changed and test commands run.
```

---

# Prompt 4 — Paste Agenda Path

```text
Model: Best available Claude
Reasoning: Medium/High

Implement Pass 4 of the Event Import Builder: real Paste Agenda parsing and preview.

Goal:
A user can paste a rough schedule, review normalized Run of Show rows, and create an event workspace using the same preview/create flow from prior passes.

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Do not require AI/external APIs.
- Do not silently auto-create speaker records from pasted trailing names. Treat trailing names as notes unless the user/product explicitly chooses speaker creation or the existing service makes it clearly safe.
- Do not force Budget/Timeline creation unless the UI clearly shows starter placeholders and the user chooses them.

Supported paste examples:

```text
9:00 AM Opening Remarks - Main Ballroom - Sarah Lee
10:00 AM Breakout: Sponsor Strategy - Room 204
11:00 AM Coffee Break - Foyer
10:00 AM - 10:45 AM Breakout: Sponsor Strategy - Room 204
Monday 9:00 AM Coffee Break - Foyer
Day 1 | 9:00 AM | Opening Remarks | Main Ballroom
```

Parsing goals:
- Extract best-effort date/day if present.
- Extract start time.
- Extract end time if present.
- Extract title.
- Extract room/location if obvious.
- Preserve uncertain trailing text in notes.
- Generate warnings for missing/ambiguous dates/times/rooms.

Do not overfit parsing. This is a helper, not magic. Unknown values should produce warnings and remain editable in preview.

Behavior:
- Paste text updates normalized Run of Show preview.
- Budget and Timeline cards should either be empty/optional or show explicit starter shell options.
- Reuse the same EventImportPreview type from workbook path.
- Reuse the same createEventFromImportPlan/createEventFromBuilderPlan server path.
- The user should understand that Paste Agenda mainly creates the Run of Show.

UI requirements:
- Large textarea with example placeholder.
- Parse/Preview button or live debounced preview if simple.
- Warning copy should be clear:
  - “We found 12 agenda rows. 3 need a date or time before they can be created.”
- Preview should show sample parsed rows and warnings.

Tests:
Add parser tests for:
- Single time + title + room pattern.
- Start/end time pattern.
- Pipe-delimited agenda pattern.
- Day/date extraction.
- Missing time warning.
- Missing title skip/error.
- Room extraction.
- Notes preservation.

Acceptance:
- Paste agenda path creates normalized Run of Show preview.
- The same create path can create an event workspace from pasted agenda rows.
- No silent schema changes.
- No external API dependency unless already used by the project and explicitly justified.
- End with files changed and test commands run.
```

---

# Prompt 5 — Template Path

```text
Model: Best available Claude
Reasoning: Medium

Implement Pass 5 of the Event Import Builder: Start from Template path.

Goal:
A user can select an event starter template, review generated Run of Show/Budget/Timeline starter content, and create the event workspace through the same canonical create path.

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Start with the simplest maintainable template implementation the current architecture supports. If a real saved template library or admin UI is needed, stop and propose the schema/product change separately.
- Do not silently auto-create docs, speakers, F&B, seating, or room-set data. If one of those is a natural extension supported by existing services, call it out before adding it.
- Template output must be editable starter content, not claimed as final.

Templates to add initially as code-defined starter definitions, unless the repo already has a better reusable template/config pattern:

1. Conference
2. Trade Show
3. Gala / Awards
4. Training
5. Workshop
6. Corporate Meeting

Each template should generate normalized preview data for:
- Run of Show starter rows
- Budget starter category/line placeholders
- Timeline starter tasks

Suggested Conference starter:
Run of Show:
- Registration / Check-in
- Opening Remarks
- Keynote
- Breakout Session Block
- Lunch
- Sponsor Session
- Networking Reception

Budget placeholders:
- Venue rental
- AV / Production
- Food & Beverage
- Staffing
- Signage / Printing
- Speaker / Talent
- Sponsor / Expo setup

Timeline tasks:
- Confirm venue contract
- Lock agenda draft
- Confirm speaker list
- Collect session requirements
- Finalize AV plan
- Finalize F&B guarantees
- Publish final Run of Show

Suggested Trade Show starter:
Run of Show:
- Exhibitor Move-in
- Registration Opens
- Expo Hall Opens
- Education Session
- Networking Break
- Expo Hall Closes
- Exhibitor Move-out

Budget placeholders:
- Hall rental
- Booth services
- Registration setup
- Security
- Cleaning
- Signage
- Exhibitor services

Timeline tasks:
- Publish exhibitor kit
- Confirm floor plan
- Confirm move-in schedule
- Finalize sponsor deliverables
- Confirm security/cleaning plan

Suggested Gala / Awards starter:
Run of Show:
- Guest Arrival / Cocktail Reception
- Doors Open
- Dinner Service
- Welcome Remarks
- Awards Program
- Closing Remarks
- After-event teardown

Budget placeholders:
- Venue
- Catering
- Bar
- Decor
- AV / Lighting
- Entertainment
- Awards / Gifts

Timeline tasks:
- Confirm honorees
- Finalize menu
- Confirm seating plan
- Confirm script/run of show
- Finalize awards assets

Suggested Training starter:
Run of Show:
- Check-in
- Welcome / Orientation
- Training Block 1
- Break
- Training Block 2
- Lunch
- Hands-on Exercise
- Wrap-up

Budget placeholders:
- Room rental
- Training materials
- AV
- Food & Beverage
- Facilitator costs

Timeline tasks:
- Confirm curriculum
- Prepare materials
- Confirm facilitator
- Confirm room setup
- Send attendee reminders

Suggested Workshop starter:
Run of Show:
- Arrival
- Introductions
- Working Session 1
- Break
- Working Session 2
- Share-out
- Wrap-up

Budget placeholders:
- Room rental
- Materials
- Facilitation
- Food & Beverage
- AV

Timeline tasks:
- Define outcomes
- Confirm participants
- Prepare worksheets/materials
- Confirm room layout
- Send prep email

Suggested Corporate Meeting starter:
Run of Show:
- Arrival / Breakfast
- Leadership Welcome
- Business Review
- Break
- Planning Session
- Lunch
- Team Discussion
- Next Steps

Budget placeholders:
- Meeting space
- AV
- Food & Beverage
- Travel
- Materials

Timeline tasks:
- Confirm attendees
- Build agenda
- Collect pre-read materials
- Confirm room setup
- Send final logistics

Implementation details:
- Define templates in a small typed helper/module.
- Template data should map into the same normalized import preview type as workbook/paste paths.
- Template dates/times should be relative to the event start date where possible.
- If relative scheduling is too risky, leave dates/times blank with clear warnings/placeholders.
- The Preview screen should clearly label generated rows as starter content.

Tests:
- Each template returns non-empty Run of Show, Budget, and Timeline preview data.
- Template output conforms to normalized preview types.
- Template create path writes event-scoped data.
- Counts are reported correctly.

Acceptance:
- User can select each template and see a real preview.
- User can create an event workspace from template output.
- No silent schema changes.
- End with files changed and test commands run.
```

---

# Prompt 6 — Polish, Hardening, and Regression Tests

```text
Model: Best available Claude
Reasoning: High

Polish and harden the Event Import Builder after the core passes are implemented.

Goal:
Make the flow production-ready, low-breakage, and pleasant to use.

Hard constraints:
- Do not silently change schema.
- Do not silently add migrations.
- Do not rewrite unrelated modules.
- Do not silently broaden scope into docs, F&B, seating, speaker import, or existing-event update. If one of those is naturally supported by existing services and improves the product, call it out clearly before adding it.

Polish checklist:

1. UX clarity
- The user always knows which path they are on.
- The user knows nothing is written until Create Event Workspace.
- Warnings explain what will be skipped vs what can be created.
- Missing sheets are allowed if at least one module has valid rows.
- Button states are clear.
- Back/cancel behavior is safe.

2. Loading/error states
- Upload/parsing loading state.
- Create workspace loading state.
- Parse failure state.
- Invalid workbook state.
- Server create failure state.
- Partial warning state after successful create, if applicable.

3. Empty states
- No workbook selected.
- Workbook uploaded but no expected sheets detected.
- Sheet detected but no valid rows.
- Paste agenda empty.
- Template not selected.

4. Responsive layout
- Mobile width does not break.
- Stepper/cards stack cleanly.
- Preview cards remain readable.
- Long warnings do not overflow.

5. Accessibility/basic semantics
- Buttons have clear labels.
- Inputs have labels.
- Errors/warnings are accessible text, not icon-only.
- Keyboard navigation is not broken.

6. Data integrity
- No client-side-only write assumptions.
- Create service validates input server-side.
- Event/module data is event-scoped.
- Existing event creation still works.
- Existing budget import still works.
- Existing Run of Show, Budget, and Timeline pages can read imported data.

7. Duplication cleanup
- Remove mock-only data that should not remain.
- Do not leave duplicate budget parsing/mapping if existing helpers can be reused.
- Do not leave dead helper functions.
- Keep types shared where appropriate but not over-abstracted.

Regression tests to add/update:
- Builder entry renders.
- Workbook path can parse valid workbook fixture.
- Workbook missing one sheet still previews remaining modules.
- Workbook ambiguous sheet names require mapping/warning.
- Invalid rows are skipped and reported.
- Paste agenda creates Run of Show preview.
- Template creates non-empty preview.
- Create service writes event-scoped data after confirmation.
- Unauthorized write rejected.
- Existing event creation regression still passes.
- Existing budget import regression still passes.

Manual QA checklist:
- Create from workbook with all 3 sheets.
- Create from workbook missing Budget.
- Create from workbook with bad dates/currency values.
- Create from paste agenda.
- Create from each template.
- Cancel/back behavior.
- Mobile viewport.
- Imported data visible in Run of Show, Budget, Timeline.

Final repo check:
- Confirm no Prisma schema files changed.
- Confirm no migrations were added.
- Confirm no generated Prisma client changes were added.
- Confirm no git commit/merge/rebase was run.

Deliver final summary:
1. Files changed.
2. Behavior implemented.
3. Tests added/updated.
4. Test commands run and result.
5. Known limitations/follow-ups.
```

---

## Notes For Reviewing Claude Output

After each pass, ask:

```text
Did this pass change schema or migrations?
Did it duplicate existing budget import logic?
Did it introduce client-owned multi-call writes?
Did it preserve existing event creation?
Did it add tests for the risky behavior it introduced?
Can I manually test this pass without the next pass?
```

If the answer is bad, stop and fix that pass before moving on.

---

## Suggested Review Loop After Each Prompt

Ask Claude to end every pass with:

```text
Summary:
- What changed
- Files changed
- Tests run
- Manual QA steps
- Known risks / next pass recommendation
```

Do not let the implementation drift into:

- new schema
- background jobs
- template admin
- speaker import
- docs/F&B/seating automation
- existing event update flows
- approval/review state changes

This feature is about creating a useful new event shell from Run of Show, Budget, and Timeline inputs.
