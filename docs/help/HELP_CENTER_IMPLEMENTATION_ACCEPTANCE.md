# Orca Help Center Implementation Acceptance

Final production-readiness audit completed on 2026-07-14.

## 1. Architecture verified

- Runtime Help content loads from generated artifacts under `web/src/generated/help/content.json` and `web/src/generated/help/search-index.json`.
- Runtime code does not read `docs/help` from the filesystem. Source Markdown outside `web/` is consumed only by generation and validation scripts.
- The generated artifacts include a source digest and schema version. `npm run help:validate` verifies generated artifacts are present and current.
- Markdown article rendering is centralized in the Help Markdown renderer. Article body content is not duplicated in React page components.
- Markdown raw HTML is not enabled; external links render with `target="_blank"` and `rel="noreferrer noopener"`.
- Help screenshots are served from `web/public/help/screenshots`, which is compatible with Next/Vercel static asset deployment.

## 2. Routes verified

Verified in authenticated development harness:

- `/help`
- `/help/category/event-planning`
- `/help/category/communications`
- `/help/article/manage-the-full-budget-grid#screenshots`
- `/help/article/build-and-review-a-run-of-show`
- `/help/article/budget-editing-and-approval-problems`
- `/help/article/use-the-fnb-catalog`
- `/help/search?q=budget+approval`
- `/help/search?q=zzzzzzzz`
- `/help/article/not-a-real-slug`
- `/help/article/use-platform-administration`
- `/help?from=...`

Results:

- Landing, category, article, and search routes rendered correctly when authenticated.
- Invalid article slug returned the Help article unavailable state.
- Internal article slug returned the Help article unavailable state and did not render internal content.
- Dynamic metadata rendered expected document titles.
- Heading anchors worked, including direct navigation to `#screenshots`.
- Query-string search state was preserved.
- Contextual return path was sanitized: private query parameters were dropped while safe `view=grid` was preserved.
- Production unauthenticated Help page requests redirected to `/login`, confirming Help remains inside the authenticated application shell.

## 3. Public/internal article counts

Generated content and manifest counts:

- Source/manifest articles: 66
- Generated runtime articles: 66
- Public articles: 65
- Internal articles: 1
- Published: 59
- Preview: 3
- Coming Soon: 3

Internal article exclusion:

- `use-platform-administration` is present in source/manifest as internal.
- It is excluded from public article lookup.
- It is excluded from category summaries.
- It is excluded from search results.
- It is excluded from contextual Help mapping.

## 4. Search verification

Verified by automated tests and browser checks:

- Exact and strong title matches rank first.
- Heading matches are searchable and link to heading anchors.
- Tags are searchable.
- Description/category/body text are searchable.
- Internal content is excluded, including direct search for `Platform Administration`.
- Duplicate noisy results are collapsed to one primary article result.
- Blank query behavior returns the search prompt state.
- No-results behavior renders recovery copy and category browsing.
- Landing suggestions render after the minimum query length.
- Keyboard behavior works: ArrowDown sets active suggestion, Escape dismisses, Enter opens `/help/search?q=...`.
- Result page focuses the result-count heading after navigation.
- Mobile search suggestions stay within viewport.
- No external search provider, semantic search, vector database, AI answer generation, Algolia, or Elasticsearch was added.

## 5. Contextual Help verification

Verified mappings:

- Account Command Center -> `use-the-account-command-center`
- Action Center -> `use-the-action-center`
- Event Command Center -> `use-the-event-command-center`
- Roadmap -> `use-the-roadmap`
- Budget Dashboard -> `use-the-budget-dashboard`
- Budget Grid -> `manage-the-full-budget-grid`
- Run of Show -> `use-the-run-of-show`
- Session Workspace -> `use-the-session-workspace`
- Directory -> `use-the-directory`
- Attendees -> `manage-attendees`
- Speakers -> `manage-speakers`
- Docs Hub -> `use-the-docs-hub`
- Marketing -> `use-marketing`
- F&B Catalog -> `use-the-fnb-catalog`
- Event Settings -> `configure-event-settings`

Fallback behavior:

- Unknown event module routes fall back to the Event Planning category.
- Platform Administration routes return no contextual Help action.
- Return paths are generated centrally, preserve safe route context, and strip unsupported/private query parameters.

## 6. Accessibility results

Verified:

- Help search has an accessible label.
- Clear search action has an accessible label.
- Search suggestions expose listbox/option state and active descendant state.
- Search result count is announced with a screen-reader status.
- Article table of contents uses `aria-current="location"`.
- Breadcrumb current page uses `aria-current="page"`.
- Icon-only actions have accessible labels.
- No unlabeled buttons found in audited Help pages.
- Screenshots have alt text.
- Tables are wrapped in a focusable, labeled scroll container.
- Focus moves to search result status after Enter navigation.
- No focus traps observed.
- Reduced motion classes are used on transition affordances.

No dedicated axe/a11y script exists in the repository for Help. Manual/browser accessibility checks and focused regression tests were used.

## 7. Responsive results

Verified at desktop, tablet, and mobile widths:

- No horizontal overflow on landing, article, or search pages.
- Search suggestions do not extend off-screen.
- Screenshot images are not clipped.
- Article table of contents does not collide with article content.
- Long article titles wrap without pushing viewport width.
- Status badges remain visually restrained.
- Support cards collapse appropriately at tablet/mobile widths.
- The black `N` seen in local mobile screenshots was identified as the Next.js development overlay portal, not Orca UI.

## 8. Production-build result

`npm run build` in `web/` passed.

Relevant build output confirmed:

- `/help`
- `/help/article/[slug]`
- `/help/category/[categorySlug]`
- `/help/search`
- `/api/help/search`

Production runtime check:

- `next start` served the built app.
- Unauthenticated `/help` requests redirected to `/login`.
- `web/src/generated/help/*` artifacts were included in the build path.
- `web/public/help/screenshots/*` assets are inside the deployable web app.

## 9. Tests and commands run

Commands run:

- `npm run help:manifest`
- `npm run help:generate`
- `npm run help:validate`
- `npm run help:check`
- `npm run lint -- 'scripts/help-screenshot-seed.ts' 'app/(shell)/help/**/*.tsx' 'app/(shell)/_components/contextual-help-action.tsx' 'lib/help/**/*.ts' 'app/api/help/**/*.ts'`
- `npm run typecheck:help`
- `npm run typecheck`
- `npx tsx --test lib/help/*.test.ts`
- `npm run build`
- `npm run start -- --hostname 127.0.0.1 --port 3101`
- `DEV_USER_EMAIL=help-center@planneros.com PW_E2E=1 npm run dev -- --hostname 127.0.0.1 --port 3100`
- `git diff --check`

Automated Help test result:

- 33 tests passed.
- 0 failed.

## 10. Failures corrected

Corrected production build blockers in `web/scripts/help-screenshot-seed.ts`:

- Replaced obsolete `TimelineStatus.DONE` with `TimelineStatus.COMPLETE`.
- Replaced obsolete roadmap workstream values with current `TimelineWorkstream` enum values.
- Replaced obsolete `BudgetLineItemApproval.SUBMITTED` and `NEEDS_SUBMISSION` with `PENDING`.
- Replaced obsolete attendee sync values with current `EventAttendeeSyncStatus` values.
- Replaced obsolete attendee registration and attendance values with current enum values.
- Added real `EventAttendeePortalStatus.INVITED` instead of an `as never` escape.
- Added typing for created roadmap items and seating table seed tuples.
- Removed unused Help screenshot seed imports, dead helper code, and unused parameters.

These fixes were Help Center implementation/support-script issues and were required for production build readiness.

## 11. Remaining non-blocking issues

- The search API route is reachable without page authentication, but it returns only public Help search results and excludes the internal Platform Administration article. Product/security may choose to gate it for consistency with the authenticated Help UI.
- There is no dedicated automated axe/accessibility script for Help. Current coverage is focused tests plus browser/manual checks.
- There is no dedicated Playwright Help e2e suite. Existing Help behavior is covered by focused unit/regression tests and browser verification in this audit.

## 12. Remaining product-owner decisions

- Decide whether `/api/help/search` should require authentication despite exposing only public Help metadata.
- Decide whether Help Center should have a dedicated Playwright e2e smoke test before broad release.
- Decide whether to add an automated axe check for Help pages as part of CI.

## 13. Launch recommendation

Ready for beta with minor follow-up.
