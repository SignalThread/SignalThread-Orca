# Briefings Entry Point — Audit & Handoff

_Audit only — no implementation._

---

## 1. Current Exhibitor Navigation

### Where nav is defined

| File | Role |
|---|---|
| `components/layout/sidebar.tsx` | Hardcoded `exhibitorNav` array + `buildExhibitorSections()` for expanded sidebar |
| `app/(app)/layout.tsx` | Renders `AppShell` → `Sidebar` for all `(app)` routes |
| `app/(app)/exhibitor/layout.tsx` | Only `requireAuth()` + passes children through; does **not** render nav |

### Current exhibitor nav items

Defined in `exhibitorNav` array (lines 43–58 of `sidebar.tsx`):

| Label | Path | Section | Sub-items |
|---|---|---|---|
| Dashboard | `/exhibitor/dashboard` | _(no section)_ | — |
| Leads | `/exhibitor/leads` | Leads | Import Wizard (`/exhibitor/import/wizard`) |
| Documents | `/exhibitor/documents` | Leads | — |
| Signals | `/exhibitor/signals` | Engagement | — |
| Campaigns | `/exhibitor/campaigns` | Engagement | — |
| Email Templates | `/exhibitor/email-templates` | Engagement | — |
| Users | `/exhibitor/users` | System | — |
| Integrations | `/exhibitor/integrations` | System | — |
| Settings | `/exhibitor/settings` | System | — |

### Sub-item pattern

`NavItem.subItems` is an existing array of `{ href, label }`. Currently only **Leads** uses it (for Import Wizard). Sub-items render as indented rows under the parent with a `border-l-2` accent when active. Active-state check: `isExhibitorSubLinkActive()` matches `pathname.startsWith(subHref)`.

### How to add a new destination

**Option A — Sub-item under Leads:** Add `{ href: "...", label: "Briefings" }` to `subItems` on the Leads nav item. Zero new types, zero new icons. Matches existing Import Wizard pattern.

**Option B — Top-level nav item:** Add a new entry to `exhibitorNav` array + `buildExhibitorSections()`. Requires adding to `NavIconName` union and a new icon branch in `NavIcon`.

---

## 2. Existing Briefings Entry Points

| Source | Where | Destination | Status |
|---|---|---|---|
| Publish success CTA | `publish-step.tsx` → `ImportSuccess` | `batchBriefingsPath(batchId)` → `/exhibitor/import/[batchId]/briefings` | **Live** — "Review Draft Briefings" link |
| View Brief back-link | `view-brief-step.tsx` | `batchBriefingsPath(batchId)` → same briefings route | **Live** — "← Back to Brief Readiness" |
| `prepareBriefings=1` on leads page | `exhibitorLeadsAfterImportHref()` in `paths.ts` | `/exhibitor/leads?prepareBriefings=1` | **Dead code** — no call site passes `prepareBriefings: true` after the publish CTA was updated. Leads page still reads the param but nobody sets it. |

**Not linked anywhere:**
- No sidebar nav links to briefings
- No dashboard widget references briefings or import batches
- No import history / batch list page exists
- `batchBriefingsViewPath()` is defined in `paths.ts` but has zero component consumers

---

## 3. Existing Batch / History Surfaces

| Surface | Exists? | Detail |
|---|---|---|
| Import batch list / history page | **No** | No page lists batches. No API returns a batch array. |
| Dashboard batch widget | **No** | Dashboard is leads-only: KPI cards, priority distribution, follow-ups, recent lead activity. |
| Import batch detail page | **No** | Only the import wizard operates on a batch (active draft only). |
| Active draft API | **Yes** | `GET /api/exhibitor/import-wizard/active-draft` returns **one** batch (the current draft). Not a list. |
| Batch-scoped briefing pages | **Yes** | `/exhibitor/import/[batchId]/briefings` and `.../briefings/view` exist. Require `batchId` in URL. |

**Bottom line:** There is no existing batch-list or import-history surface. The only way to reach the briefing pages today is via the publish success CTA (which provides the `batchId`) or by constructing the URL manually.

---

## 4. Entry Options: Best to Worst

### Option 1: Sub-item under Leads → Briefings index page ★ RECOMMENDED

**Where:** `exhibitorNav[1].subItems` in `sidebar.tsx` → new `/exhibitor/briefings` page

**What it does:** Adds "Briefings" as a sibling of "Import Wizard" under Leads in the sidebar. Links to a new lightweight `/exhibitor/briefings` index page that shows the user's current/recent batch briefings.

**Files that change:**
- `components/layout/sidebar.tsx` — add sub-item `{ href: "/exhibitor/briefings", label: "Briefings" }`
- `app/(app)/exhibitor/briefings/page.tsx` — **new** thin index page
- `lib/import-wizard/paths.ts` — add `EXHIBITOR_BRIEFINGS_PATH`

**Fit:** Real. Follows the existing sub-item pattern. No new icons, no new nav types, no section changes. Import Wizard and Briefings are both batch-scoped tools under Leads.

**Index page content (v1):** Loads the company's batches (draft + published) from `import_batches`, shows them as a simple list with links into each batch's briefing flow. Needs a tiny new server query (one `select` on `import_batches` filtered by `company_id`). Could also start with just a link to the current active draft's briefings if we want to defer the list.

---

### Option 2: Top-level "Briefings" nav item

**Where:** New entry in `exhibitorNav` → new `/exhibitor/briefings` index page

**Files that change:**
- `components/layout/sidebar.tsx` — add item + icon + section placement
- `NavIconName` type union — add `"briefings"`
- `NavIcon` component — add icon branch
- `buildExhibitorSections` — decide where it goes (Leads section? new section?)
- Same new index page as Option 1

**Fit:** Premature. Briefings is still batch-scoped and tightly tied to import. Promoting it to top-level nav creates IA expectations (its own section, its own identity) before the feature warrants it. More files, more surface, same destination.

---

### Option 3: Dashboard card linking to briefings

**Where:** Add a card/section to `exhibitor/dashboard/page.tsx`

**Files that change:**
- `app/(app)/exhibitor/dashboard/page.tsx` — add a "Draft Briefings" card with batch link
- New server query for batch status

**Fit:** Supplementary at best. Dashboard is a glanceable summary; a briefing deep-link belongs in primary nav, not buried in a dashboard card. Could add as a secondary entry later but not as the primary discovery path.

---

### Option 4: Reuse active-draft API, no index page, just link to current batch

**Where:** `sidebar.tsx` sub-item that links directly to `/exhibitor/import/ACTIVE_DRAFT/briefings`

**Problem:** The sidebar is rendered server-side via layout. Linking to a specific batch requires knowing the active draft ID at nav render time. Current sidebar is a static array — it doesn't fetch batch data. This would require either:
- Making the sidebar dynamic (fetch active draft ID server-side in the layout)
- Or a client-side redirect page that resolves the active draft and redirects

**Fit:** Hack. Adds complexity to the nav layer for a dynamic lookup that belongs in a page, not a nav link. The index page (Option 1) solves this cleanly.

---

## 5. Recommended Briefings Entry Model v1

### Primary entry: Sidebar sub-item → Briefings index page

Add **"Briefings"** as a sub-item under **Leads** in the sidebar, linking to `/exhibitor/briefings`.

The index page:
- Loads the company's import batches from `import_batches` (draft and published)
- Shows each batch with its status, display label, and a link to `/exhibitor/import/[batchId]/briefings`
- If no batches exist, shows an empty state pointing to the Import Wizard

This is the **only new page needed**. The per-batch briefing readiness and view-brief pages already exist.

### Secondary entries (keep as-is):

| Entry | Current state | Action |
|---|---|---|
| Publish success CTA | Links to `batchBriefingsPath(batchId)` | **Keep** — contextual, honest |
| View Brief back-link | Links to `batchBriefingsPath(batchId)` | **Keep** — internal navigation |
| `prepareBriefings=1` on leads page | Dead code (no call site sets it) | **Clean up** in same PR or defer |

### Future entries (not built now):

| Entry | When |
|---|---|
| Lead-selection → briefing | When lead-selection briefing flow is built |
| Dashboard briefing card | When briefings become a daily-use feature |

### Do we need the index page now or can we defer?

**We need it now.** Without it, the sidebar link has nowhere to go, and users can only reach briefings through the publish success CTA (requires completing an import first). The index page is trivial: one server component, one Supabase query, one list of links.

---

## 6. Smallest Possible Next Prompt

> **Prompt: Add Briefings to exhibitor sidebar + create Briefings index page**
>
> Goal: Make Briefings discoverable from the main exhibitor UI.
>
> **Part A — Sidebar sub-item (1 file):**
> 1. `components/layout/sidebar.tsx` — add `{ href: "/exhibitor/briefings", label: "Briefings" }` to `subItems` on the Leads nav item, after Import Wizard.
>
> **Part B — Briefings index page (2–3 new files):**
> 1. `lib/import-wizard/paths.ts` — add `EXHIBITOR_BRIEFINGS_PATH = "/exhibitor/briefings"`.
> 2. `app/(app)/exhibitor/briefings/page.tsx` — server component:
>    - `requireRole("exhibitor_admin")`
>    - Query `import_batches` for `company_id` (both `draft` and `published`), ordered by most recent
>    - Render a simple list: batch display label, status badge, link to `batchBriefingsPath(batchId)`
>    - Empty state: "No import batches yet. Start with the Import Wizard."
>
> **Part C — Optional cleanup:**
> 1. Remove dead `prepareBriefings` param from `exhibitorLeadsAfterImportHref` in `paths.ts` and the consumer in `leads/page.tsx` if it's now fully dead code.
>
> **Do not touch:** API routes, server services, briefing components, publish step, import wizard, schema.
>
> **Tests:** Add a small test asserting the sidebar sub-item exists. Ensure existing tests still pass.
>
> **Estimated files:** 2–3 new, 1–2 edited. Smallest possible change to make briefings reachable.
