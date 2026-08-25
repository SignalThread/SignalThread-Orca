# Event Command Center

The Event Command Center is the single-event dashboard for OrcaOS planners. It mirrors the account-level command center visual language while focusing on urgent event execution signals: days to event, conflicts, approvals, overdue work, budget variance, registration pace, housing pickup, and onsite readiness.

## Architecture

The module lives under `app/(shell)/events/[eventId]/_components/`.

| Component | Responsibility |
| --- | --- |
| `EventCommandCenter` | Root client component. Installs the theme provider and reducer-backed dashboard context. |
| `EventCommandCenterInner` | Event dashboard container. Fetches/syncs layout state and renders the page regions. |
| `KpiCard` | Accessible linked KPI tile for days to event, conflicts, approvals, overdue items, and budget. |
| `WidgetPanel` | Shared card shell for all widget implementations. |
| `SortableWidget` | Drag, keyboard move, keyboard resize, remove controls, and 12-column placement. |
| `Widget Library` | Defined in `event-command-center-layout.ts` with categories, labels, and descriptions. |
| `Widget Renderer` | The `widgetMap` in `event-command-center.tsx` maps each widget id to its concrete widget component. |
| `EventCommandCenterThemeProvider` | Custom theme provider exposing OrcaOS colors, typography, spacing, and shadows through CSS variables. |

State uses React context plus `useReducer` for local dashboard state. Reducer actions cover layout loading, role switching, edit mode, phase presets, executive summary, add/remove, keyboard move, resize, drag reorder, and dismissed attention items.

Initial event data is server-rendered by the Next.js page. Layout data is fetched from local REST routes with a localStorage fallback so planners still see their last known layout when the backend is unavailable.

## Props And Data

`EventCommandCenter` receives:

```ts
type EventCommandCenterProps = {
  data: EventCommandCenterPayload;
};
```

`EventCommandCenterPayload` is defined in `src/server/services/event-command-center.ts` and includes:

- `event`: event identity, dates, phase, KPIs, notifications, deadlines, approvals, financial, registration, housing, sponsors, speakers, and operations.
- `generatedAt`: ISO timestamp for the dashboard snapshot.
- `links`: module links used by KPI cards, CTAs, and widgets.

Each widget receives `WidgetProps`:

```ts
type WidgetProps = {
  data: EventCommandCenterData;
  config?: WidgetConfig;
  phase: "planning" | "preEvent" | "onsite";
  actionQueue: ActionQueueItem[];
  phaseSignals: Record<EventPhase, string[]>;
  budgetPercent: number;
  speakerReadinessPercent: number;
};
```

## Widget Usage

Add a widget definition to `WIDGET_LIBRARY`, then add its renderer entry to `widgetMap`.

```tsx
const widgetMap: Record<WidgetId, ReactNode> = {
  budgetOverview: <BudgetOverviewWidget {...widgetProps} config={{ currency: "USD", grouping: "category" }} />,
};
```

Layouts use 12-column positions:

```ts
layoutItem("budgetOverview", 0, 0, 6, 4);
```

`x` and `w` are columns. `y` and `h` are row units. Helpers in `event-command-center-layout.ts` sanitize, add, move, resize, and remove layout items.

## API Endpoints

REST endpoints back the dashboard:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/events/:eventId/command-center` | `GET` | Full event overview payload. |
| `/api/events/:eventId/command-center/widgets/:widgetId` | `GET` | Widget-scoped payload for lazy refreshes. |
| `/api/events/:eventId/command-center/layout?role=:roleKey` | `GET` | User layout, then role default, then phase default. |
| `/api/events/:eventId/command-center/layout` | `PUT` | Persist user layout and visibility by event, user, and role. |

Layout persistence is stored in `UserDashboardLayout`, keyed by `userId`, `eventId`, and `roleKey`.

## Design System

The command center uses the OrcaOS event theme:

- Primary navy `#0F2740`
- Secondary indigo `#2952A3`
- Accent blue `#0043FF`
- Success `#2CA77C`
- Warning `#F4A261`
- Error `#E76F51`
- Neutral surface `#F4F7FA`
- Readable secondary text `#4d5b68`

Typography, spacing, card radius, border, and shadow tokens are provided by `EventCommandCenterThemeProvider`. Cards use subtle borders and minimal shadow, with 8-12px radii.

Charts are implemented as lightweight accessible CSS/SVG primitives so they stay aligned to the dashboard tokens without adding a chart dependency. Each chart exposes `role="img"`, a label or title, and hidden text summaries.

## Accessibility

Interactive controls use semantic `button` or `a[href]`. Icon-only controls include `aria-label`. Edit mode provides:

- Drag handle button
- Remove button
- Resize button
- Screen-reader instructions
- Arrow-key movement
- Arrow-key resizing

Progress indicators use `role="progressbar"` with value metadata. Charts include text alternatives. Secondary text uses a darker readable token to meet WCAG 2.1 AA contrast on light surfaces.

## Testing

Regression coverage for widget categories, phase presets, layout sanitization, and add/move/resize/remove helpers lives in:

```text
lib/event-command-center-layout-regression.test.ts
```

Run focused validation with:

```bash
npx tsx --test lib/event-command-center-layout-regression.test.ts
npm run typecheck
```

## Prompt Snippet Style

When adding or refining command-center components, keep requests concrete and implementation-oriented:

```ts
/*
Build a React component called KPIBar that receives a `kpis` prop with `label`, `value`, `status`, and `onClick`.
Render a horizontal list of clickable cards using the OrcaOS design system.
Use status to map normal, warning, and error states to the event theme.
Expose keyboard-accessible buttons or links and include clear ARIA labels.
*/
```

```ts
/*
Create a FinancialOverviewCard component that accepts `financial`.
Render an accessible donut chart with a center label, summary stats, a four-row category table, and a "View full report" action.
Use the OrcaOS card style, typography scale, spacing, and variance color coding.
*/
```

```ts
/*
Implement a WidgetCanvas that receives layout items and save callbacks.
Render widgets on a 12-column grid with a visible drag handle, resize handle, remove control, keyboard movement, and backend persistence.
*/
```

These examples describe the style of future work. The current implementation adapts them to the repository's stack: `@dnd-kit` instead of `react-beautiful-dnd`, CSS/SVG chart primitives instead of Recharts, and Next REST routes instead of a separate GraphQL client.

## Final Deliverable

The Event Command Center deliverable includes:

- A visually consistent OrcaOS event dashboard at `/events/[eventId]`.
- Header, KPI row, Planner Attention Center, deadlines, approvals, financial overview, registration pace, housing pickup, and customizable widget canvas.
- A categorized widget library with 32 independent widget renderers.
- Phase-aware presets for Planning, Pre-event, Onsite, and Executive Summary layouts.
- Role-specific layout loading with user-specific persisted overrides.
- Drag, drop, resize, remove, keyboard move, keyboard resize, and reset layout controls.
- REST endpoints for full event data, widget-scoped data, and layout persistence.
- `UserDashboardLayout` Prisma model and migration for backend layout storage.
- OrcaOS event theme provider with required colors, spacing, typography, and card tokens.
- Accessible semantic controls, ARIA labels, chart text alternatives, and WCAG-conscious contrast.
- Focused regression tests for widget catalog and layout behavior.
