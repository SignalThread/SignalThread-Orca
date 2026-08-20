# Orca Help Center Implementation Plan

## Executive Recommendation

Build the Help Center as authenticated, global content under the existing Next.js App Router shell:

- `/help`
- `/help/category/[categorySlug]`
- `/help/article/[slug]`
- `/help/search?q=...`

Keep every Markdown article in `docs/help` as the source of truth. Do not read those files from the production server. Extend the existing help tooling to generate and validate committed JSON artifacts under `web/src/generated/help/`. The Next.js application should import those generated artifacts from server-only modules, so local development and Vercel builds do not depend on files outside the configured application root.

Render Markdown with `react-markdown`, `remark-gfm`, and `rehype-slug`. Generate a serialized MiniSearch index from article sections at documentation-build time. Keep landing, category, article, and search-result pages as React Server Components; use Client Components only where interaction requires browser state.

This architecture preserves the completed content library, avoids duplicating article content in React, and leaves a clean boundary for a future CMS or semantic search provider.

## 1. Current Repository Findings

### Application and package structure

- The repository root is an npm workspace root, but `web` is not listed as a workspace. The deployable Next.js package is `web/`.
- The application uses Next.js `16.1.6`, React `19.2.3`, TypeScript, Tailwind CSS 4, and the App Router.
- `web/next.config.ts` sets the Turbopack root to the repository root. This permits local development to see files above `web`, but it does not prove that a Vercel project configured with `web` as its Root Directory uploads `docs/help`.
- No repository-owned `vercel.json` or other checked-in Vercel project configuration defines Root Directory, build command, or output-file tracing behavior.
- `docs/help` is currently outside the Next.js package and is not a safe runtime filesystem dependency for production.
- The current worktree contains 66 article files, `help-manifest.json`, contributor documentation, screenshot assets, and validation/screenshot scripts. The task brief references `docs/help/ACCEPTANCE_REPORT.md`, but that file is not present in the current worktree. It is not required as a runtime input.

### Routing and shell behavior

- Authenticated product routes live under `web/app/(shell)`.
- The shell calls `ensureProvisionedUserAndContext()`. Unauthenticated users are redirected to `/login`; users without provisioned organization access receive the existing access states.
- Account routes use `ShellScaffold`, which displays the Orca logo, account navigation, organization context, notifications, and logout.
- Event routes use `EventWorkspaceShell`, which replaces the account sidebar with event-specific navigation.
- The account sidebar currently contains Account and Organization sections. There is no Help route or Help navigation item.
- The event sidebar currently contains Command Center, Planning, Event Directory, Management, Activity, and Settings. It has no Help item.
- The account shell constrains ordinary page content to `1100px`. Help articles need a wider Help-specific content constraint for a readable body plus a table of contents.
- At widths at or below `720px`, both account and event sidebars collapse to an `80px` rail rather than becoming an overlay drawer. Help layouts must work in the remaining viewport width.

### Authentication and scope

- Orca content is reached only after authentication and active organization resolution.
- Help article content itself is not organization-specific and contains no organization data.
- `status: internal` is used by the Platform Administration article and its audience is `administrator`. That article must not appear in planner category counts, search results, related links, or previous/next navigation unless the current user is a `SUPER_ADMIN`.
- The Help Center should therefore be globally authored but displayed inside the authenticated organization shell. Organization context controls access to Orca, not content variants.

### Existing content and tooling

- `docs/help/help-manifest.json` contains stable slugs, titles, descriptions, categories, source file paths, statuses, order, tags, related slugs, source routes, and screenshot status.
- Article frontmatter additionally contains subcategory, audience, difficulty, estimated read time, and last reviewed date.
- Articles use ordinary Markdown rather than MDX. They contain headings, lists, links, images, blockquotes, and screenshot placeholders. The renderer must also support tables, code blocks, horizontal rules, strong text, and emphasis.
- Article-to-article links are relative `.md` paths. Screenshot URLs already use `/help/screenshots/...`.
- Screenshot assets live under `web/public/help/screenshots`, so their current absolute URLs resolve correctly in local and production Next.js deployments as long as the files remain in `public`.
- `web/scripts/help-docs.mjs` already parses and validates the constrained frontmatter shape, related slugs, relative Markdown links, screenshot states, and screenshot assets.
- The current manifest has no `featured` field. Featured Guides should not be invented for MVP.

### UI primitives and visual system

- Orca uses Montserrat, white surfaces, slate borders/text, `#28439A` and dark navy for primary actions, and restrained cyan/blue/purple brand tokens.
- `@signalthread/ui` exports useful primitives including Button, IconButton, Input, Badge, Card, EmptyState, ErrorState, DrawerShell, PageHeader, SectionHeader, SearchField, StatusBadge, Alert, and Tabs.
- There is no shared breadcrumb component.
- Existing cards often use larger radii than the desired Help treatment. Help-specific cards should use an `8px` radius while still reusing shared tokens and controls.
- Existing search implementations are feature-local string filters. There is no repository-wide full-text search utility or Markdown/MDX dependency.

### Test conventions

- Unit and regression tests use `node:test` with `tsx`.
- Browser journeys use Playwright under `web/e2e` with one Chromium worker and seeded development authentication.
- Existing regression tests sometimes inspect source text, but Help behavior should primarily be tested through pure data functions, server-rendered output, and Playwright journeys.

### Live verification

- `/dashboard` currently shows the account shell and redirects to `/login` without a valid session or development fallback user.
- With the seeded Help Center user, the live account sidebar contains Command Center, Portfolio Reports with a Preview badge, and Settings.
- The live event Budget route uses the event workspace shell and exposes Roadmap, Budget, Run of Show, Event Directory, Marketing, Documents, Activity, and Settings.
- These checks confirm that Help needs entries in both shell variants and that an event-to-Help transition must preserve a return destination explicitly.

## 2. Recommended Content-Loading Architecture

### Decision

Use committed, generated JSON artifacts derived from `docs/help`.

Do not use runtime server-side filesystem reads. Do not move the Markdown files. Do not compile the articles into React or MDX modules.

### Data flow

```text
docs/help/**/*.md + docs/help/help-manifest.json
                    |
                    | npm run help:generate
                    v
web/src/generated/help/content.json
web/src/generated/help/search-index.json
                    |
                    | server-only imports
                    v
Next.js Help routes and Markdown renderer
```

### Why this is the repository-safe choice

1. `docs/help` remains the sole editable source of article content.
2. The existing manifest remains the canonical article index and ordering input.
3. Vercel can build from `web` even if files above the Vercel Root Directory are not uploaded.
4. Production requests do not perform filesystem reads, Markdown discovery, or index construction.
5. Generated artifacts can be reviewed, cached, imported with TypeScript JSON support, and checked for staleness in CI.
6. A later CMS can replace the generator output behind the same server-only repository API.

### Generated artifact contract

`content.json` should contain:

- schema version
- content digest
- generation timestamp for diagnostics only
- category definitions and counts
- all manifest metadata
- complete display metadata from frontmatter
- normalized Markdown body without frontmatter
- heading IDs and table-of-contents entries
- resolved article-link targets

`search-index.json` should contain:

- schema version
- the matching content digest
- serialized MiniSearch data
- stored search-result fields and excerpt sources

The generator should remove the first Markdown H1 only when it exactly matches the frontmatter title. The article header owns the page's sole H1; article body headings begin at H2.

### Generation and freshness

- Add root script `help:generate` for generation and keep `help:manifest` and `help:validate` as explicit commands.
- Extend `help:validate` to compare the generated artifact digest with the current manifest and article bodies.
- CI must run `npm run help:manifest`, `npm run help:generate`, and `npm run help:validate`, then fail if generated files produce a Git diff.
- The `web` production build should import only committed generated files. It should not attempt to regenerate from `../docs/help`, because that path may not exist in a Vercel project rooted at `web`.
- Add a lightweight generated-schema assertion to the web build/test suite so missing or incompatible artifacts fail before deployment.

## 3. Markdown Rendering

### Decision

Use `react-markdown` with `remark-gfm` and `rehype-slug`. Do not introduce MDX because the articles do not need executable components.

Use an AST parser during generation to extract headings and searchable plain text. Avoid regex-based Markdown conversion for links, headings, or body text.

### Rendering behavior

- Headings: stable GitHub-style IDs that match generated table-of-contents anchors.
- Paragraphs and lists: constrained readable line length and consistent vertical rhythm.
- Links to another `.md` file: resolved by the generator to `/help/article/[slug]`, preserving any fragment.
- Same-article fragments: remain local anchors.
- External links: open normally unless product policy later requires a new tab; if opened in a new tab, include `rel="noreferrer noopener"` and visible external-link semantics.
- Images under `/help/screenshots/`: rendered responsively with `max-width: 100%`, intrinsic aspect ratio, lazy loading, decoding hints, subtle border, and the Markdown alt text.
- Tables: wrapped in a horizontally scrollable region on narrow screens without changing table semantics.
- Blockquotes: rendered as restrained Orca callouts, not decorative quotation cards.
- Code blocks: horizontally scrollable, keyboard reachable when overflowed, and styled with the existing monospace font.
- Horizontal rules: subtle slate separators.
- Raw HTML: disabled. Screenshot-needed HTML comments should remain non-rendered contributor metadata.

### Validation additions

- Reject a leading article H1 that does not match the frontmatter title.
- Reject screenshots with empty alt text.
- Verify every transformed relative article link maps to a manifest slug.
- Verify generated table-of-contents IDs are unique within an article.
- Verify no article Markdown is copied into application components.

## 4. Exact Route Structure

| Route | Purpose | Rendering |
| --- | --- | --- |
| `/help` | Landing page, utility cards, search, categories | Server Component |
| `/help/category/[categorySlug]` | Category overview and ordered article list | Server Component |
| `/help/article/[slug]` | Article, metadata, TOC, related, previous/next | Server Component |
| `/help/search?q=...` | URL-addressable search results | Server Component with GET search form |

Place all routes under `web/app/(shell)/help` so the existing authentication, organization resolution, account shell, notifications, and logout behavior remain in force.

Use category slugs derived from the current directory/category model:

- `getting-started`
- `portfolio`
- `event-planning`
- `people-and-program`
- `communications`
- `collaboration`
- `administration`
- `workflows`
- `troubleshooting`

Article URLs must use the stable `slug` from `help-manifest.json`, never the source filename or title.

Implement `generateStaticParams()` for category and article slugs and set `dynamicParams = false`. Unknown category or article slugs return the existing Next.js 404 behavior. Add `generateMetadata()` for useful page titles and descriptions. The authenticated parent layout can remain dynamic even though the content inputs are static.

Search uses the query string rather than a dynamic segment. Normalize `q` by trimming whitespace and limiting it to 200 characters. An absent or blank query displays the search prompt state rather than a no-results error.

## 5. Navigation and Context

### Account shell

Add a `Resources` section to `SidebarNav` with a Help item using the Lucide `CircleHelp` icon. `/help` and all descendant routes should set `aria-current="page"` through the existing active-route logic. This makes Help visibly selected throughout the Help Center.

### Event shell

Add Help to the event shell utility list below Settings. Its contextual destination should be resolved centrally from the current pathname and query string. It should not embed article URLs directly in `EventWorkspaceShell`.

Selecting Help from an event route opens the global `/help/article/[slug]` route in the same tab with a sanitized `from` query parameter. The article header displays `Back to [module label]`. Browser Back remains a secondary, natural return path.

Example:

```text
/events/abc/budget?view=grid
  -> /help/article/manage-the-full-budget-grid?from=%2Fevents%2Fabc%2Fbudget%3Fview%3Dgrid
```

Only same-origin application paths beginning with a single `/` may be accepted as return paths. Reject protocol-relative values, absolute URLs, authentication callbacks, and token-bearing public speaker routes. Derive the return label from the trusted contextual mapping rather than from query-string text.

### Help-local navigation

- Use breadcrumbs as the primary Help-local navigation: Help Center / Category / Article.
- Do not add a second permanent left rail beside Orca's application sidebar.
- Use a sticky table of contents on the right at wide desktop widths.
- Use category cards and category pages for cross-topic browsing.
- Previous/next navigation should move within the current visible category, ordered by manifest `order` and then slug.
- Related articles come only from frontmatter `related` slugs and must respect visibility rules.

This top-navigation plus right-TOC model avoids squeezing article text between two left rails.

## 6. Proposed Component Tree

```text
ShellLayout (existing Server Component)
└── ShellScaffold (existing Client Component)
    └── Help routes
        ├── HelpLandingPage
        │   ├── HelpHero
        │   │   └── HelpSearchForm
        │   ├── HelpUtilityGrid
        │   │   └── HelpUtilityCard x3
        │   └── HelpCategoryGrid
        │       └── HelpCategoryCard xN
        ├── HelpCategoryPage
        │   ├── HelpBreadcrumbs
        │   ├── HelpCategoryHeader
        │   └── HelpArticleList
        │       └── HelpArticleListItem xN
        ├── HelpArticlePage
        │   ├── HelpBreadcrumbs
        │   ├── ContextReturnLink
        │   ├── HelpArticleHeader
        │   │   ├── HelpArticleMetadata
        │   │   └── HelpStatusCallout
        │   ├── HelpArticleLayout
        │   │   ├── HelpMarkdown
        │   │   └── HelpTableOfContents
        │   ├── RelatedArticleGrid
        │   └── ArticlePager
        └── HelpSearchPage
            ├── HelpBreadcrumbs
            ├── HelpSearchForm
            └── HelpSearchResults
                ├── HelpSearchResult xN
                ├── HelpSearchPromptState
                └── HelpNoResultsState
```

`ContextualHelpLink` is also used by major Orca modules and both navigation shells. `HelpStatusCallout` maps `preview` and `coming-soon` to concise, consistent explanations. Published articles do not need a status callout. Internal articles display an Internal badge only to authorized users.

## 7. Data Types

```ts
export type HelpArticleStatus =
  | "published"
  | "preview"
  | "coming-soon"
  | "internal";

export type HelpDifficulty = "beginner" | "intermediate" | "advanced";

export type HelpScreenshotStatus = "captured" | "partial" | "needed" | "none";

export type HelpHeading = {
  depth: 2 | 3;
  id: string;
  text: string;
};

export type HelpArticleMeta = {
  slug: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  order: number;
  status: HelpArticleStatus;
  audience: string[];
  difficulty: HelpDifficulty;
  estimatedReadTime: number;
  lastReviewed: string;
  tags: string[];
  related: string[];
  sourceRoutes: string[];
  screenshotStatus: HelpScreenshotStatus;
  filePath: string;
};

export type HelpArticle = HelpArticleMeta & {
  bodyMarkdown: string;
  headings: HelpHeading[];
};

export type HelpCategory = {
  slug: string;
  label: string;
  description: string;
  order: number;
  articleSlugs: string[];
};

export type HelpSearchRecord = {
  id: string;
  articleSlug: string;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  heading: string | null;
  headingId: string | null;
  tags: string[];
  body: string;
  excerptSource: string;
  status: HelpArticleStatus;
  order: number;
};

export type HelpSearchResult = {
  articleSlug: string;
  title: string;
  description: string;
  category: string;
  matchedHeading: string | null;
  href: string;
  excerpt: string;
  score: number;
};

export type ContextualHelpTarget = {
  articleSlug: string;
  returnLabel: string;
};
```

Keep generated JSON types separate from the public repository API. `web/lib/help/help-content.server.ts` should validate the generated schema once and expose typed selectors such as `getVisibleArticles`, `getArticleBySlug`, `getCategoryBySlug`, `getRelatedArticles`, and `getArticleNeighbors`.

## 8. Search-Index Design

### Decision

Use MiniSearch with a serialized index generated by `help:generate`. Load it only from `web/lib/help/help-search.server.ts`.

### Index granularity

Create one search document for the article introduction and one for each H2/H3 section. Section-level documents allow results to identify the matched heading and link directly to its anchor.

### Indexed fields and weighting

| Field | Relative boost |
| --- | ---: |
| Article title | 8 |
| Section heading | 6 |
| Tags | 5 |
| Description | 4 |
| Category | 2 |
| Body text | 1 |

Enable prefix matching and conservative fuzzy matching for terms of at least four characters. Normalize case and punctuation, but retain meaningful event-planning terms such as `F&B` through synonyms or token normalization (`f&b`, `fnb`, `food and beverage`). Add tested aliases for `Run of Show`/`ROS`, `Command Center`/`dashboard`, and `Docs Hub`/`documents`; keep the alias table small and explicit.

### Result behavior

- Collapse multiple matching sections from the same article into one result.
- Use the highest-scoring section as the matched heading and anchor.
- Return title, description, category, matched heading, and a plain-text excerpt around the first matched term.
- Escape excerpt text and render matched terms as React nodes, never HTML strings.
- Use manifest order as the deterministic tie-breaker after score.
- Filter unauthorized internal records before returning results.
- Return at most 20 results for MVP.

### Index timing

Parsing and indexing occur during `help:generate`, not on requests and not in the browser. Search requests deserialize the committed MiniSearch index in a memoized server-only module. With 66 articles this is small, fast, and deterministic.

The landing search is a standard GET form to `/help/search`. Instant suggestions are not required for MVP and should not force the full index into the client bundle.

## 9. Contextual-Help Mapping Design

Create one ordered route registry in `web/lib/help/contextual-help.ts`. Route matchers should be pure functions and the most specific patterns must appear first.

```ts
export const CONTEXTUAL_HELP_ROUTES: ContextualHelpRoute[] = [
  route("/events/:eventId/budget", { view: "grid" }, "manage-the-full-budget-grid", "Full Budget Grid"),
  route("/events/:eventId/budget", null, "use-the-budget-dashboard", "Budget"),
  route("/events/:eventId/matrix/sessions/:sessionId", null, "use-the-session-workspace", "Session Workspace"),
  route("/events/:eventId/matrix", null, "use-the-run-of-show", "Run of Show"),
  route("/events/:eventId/timeline", null, "use-the-roadmap", "Roadmap"),
  route("/events/:eventId/speakers", null, "manage-speakers", "Speakers"),
  route("/events/:eventId/attendees", null, "manage-attendees", "Attendees"),
  route("/events/:eventId/directory", null, "use-the-directory", "Event Directory"),
  route("/events/:eventId/docs", null, "use-the-docs-hub", "Docs Hub"),
  route("/events/:eventId/marketing", null, "use-marketing", "Marketing"),
  route("/events/:eventId/fnb-catalog", null, "use-the-fnb-catalog", "F&B Catalog"),
  route("/events/:eventId/settings", null, "configure-event-settings", "Event Settings"),
  route("/events/:eventId", null, "use-the-event-command-center", "Event Command Center"),
  route("/events/new", null, "create-your-first-event", "Event Builder"),
  route("/dashboard/action-center", null, "use-the-action-center", "Action Center"),
  route("/dashboard", null, "use-the-account-command-center", "Account Command Center"),
  route("/reports", null, "understand-portfolio-reports-and-activity", "Portfolio Reports"),
  route("/settings", null, "use-workspace-settings", "Settings"),
];
```

The implementation may use a small route-pattern helper, but it should not add a routing library solely for this registry.

Expose:

- `getContextualHelpTarget(pathname, searchParams)`
- `buildContextualHelpHref(target, currentPath)`
- `getSafeHelpReturnTarget(rawFrom)`

Add a validator that confirms every mapped slug exists, planner-visible targets are not `internal`, query-specific rules precede broad rules, and every major module has a mapping. Cross-check mappings with article `sourceRoutes` as a validation signal, while allowing intentional many-to-one mappings.

Module headers should render a shared `ContextualHelpLink`; they should never hardcode `/help/article/...`.

## 10. Accessibility Requirements

- Preserve a single page H1 and a logical H2/H3 article hierarchy.
- Provide a visible label or programmatic label for every Help search field.
- Use native GET forms and links so search and navigation work without client JavaScript.
- Announce the result count in the search-page heading; do not use a noisy live region for server-rendered results.
- Mark the selected Help sidebar item and current table-of-contents item with `aria-current`.
- Render breadcrumbs in a `nav` landmark with an ordered list and `aria-label="Breadcrumb"`.
- Include a keyboard-visible “Skip to article” link on article pages when the TOC precedes the body in DOM order.
- Keep focus outlines consistent with Orca tokens and never remove native focus without replacement.
- Ensure icon-only controls have accessible names and tooltips where their meaning is not obvious.
- Require meaningful screenshot alt text. Do not repeat captions verbatim in alt text if captions are added later.
- Keep metadata and status meaning available as text, not color alone.
- Use sufficient contrast for body text, muted metadata, links, focus rings, and Preview/Coming Soon callouts.
- Let tables and code blocks scroll at 200% zoom without clipping page content.
- Honor `prefers-reduced-motion`; Help does not require decorative animation.
- Ensure sticky TOC positioning does not cover focused anchors beneath the top bar; apply `scroll-margin-top` to headings.
- Test keyboard navigation, landmark structure, heading order, accessible names, and automated axe checks on landing, article, category, and search states.

## 11. Responsive Behavior

### Wide desktop: 1280px and above

- Keep the Orca account sidebar visible.
- Allow the Help route container to expand to approximately `1360-1400px` instead of the shell's ordinary `1100px` cap.
- Article content uses a two-column layout: readable body at `680-760px` and sticky TOC at approximately `220-240px`.
- Landing categories use three columns; utility cards use three compact columns.

### Tablet and narrow desktop: 721px to 1279px

- Keep the existing shell behavior.
- Use a single article column.
- Move the TOC into a native disclosure above the article body, expanded by default only when space permits.
- Category and utility cards use two columns where they fit.

### Mobile and collapsed-shell widths: 720px and below

- Design for the existing `80px` collapsed Orca rail plus the remaining viewport.
- Use one-column cards and article lists.
- Allow breadcrumbs to wrap cleanly; truncate only long intermediate labels, not the article H1.
- Make the search control full width with at least a `44px` target height.
- Keep article body type at a fixed accessible size; do not scale font size with viewport width.
- Make screenshots, tables, and code blocks horizontally safe.
- Stack related cards and previous/next links without changing their reading order.

No Help layout should introduce its own mobile side drawer for MVP.

## 12. UI Details and States

### Landing page

- Eyebrow: `Help Center`.
- H1: a literal Help Center purpose statement, not a marketing slogan.
- Supporting copy: one short sentence explaining that planners can find Orca workflows and troubleshooting guidance.
- Prominent search field with a Search icon and clear submit action.
- Utility cards:
  - Contact Support: disabled/non-link placeholder until a configured destination exists.
  - Product Walkthroughs: disabled/non-link placeholder until a configured destination exists.
  - Account or Access Help: live internal link to `read-only-access-and-permission-problems`.
- Browse by Topic: compact cards with category description, visible article count, and a single restrained accent treatment.
- Do not render Featured Guides until metadata or a small reviewed configuration file names them.

### Article metadata

Display category, estimated read time, last reviewed date, difficulty, and status where relevant. Do not display contributor-only screenshot status or source file paths.

### Status callouts

- `preview`: explain that the documented surface is available for evaluation and may change.
- `coming-soon`: explain that the article describes a visible or planned workflow that is not generally available.
- `internal`: visible only to authorized platform administrators.
- `published`: no callout.

Use one consistent callout component and copy source. Do not let each article page invent status language.

### Empty states

- Blank query: prompt the user to enter a feature, workflow, or problem.
- No results: show the escaped query, suggest broader terms, and link to Browse by Topic.
- Hidden-only result: behave as no results; do not disclose internal article titles.

## 13. Testing Plan

### Content and generator tests

- All 66 source articles generate exactly once.
- Manifest and generated content digests remain consistent.
- Frontmatter fields map to the generated types.
- Leading H1 normalization is correct.
- Relative article links resolve to stable Help URLs with fragments preserved.
- Missing related slugs, screenshot assets, alt text, or source files fail validation.
- Duplicate heading IDs are made deterministic and unique.
- Internal article visibility is enforced by role.

### Route tests

- Every category and article generates a route parameter.
- Stable manifest slugs produce the expected URLs.
- Unknown category/article slugs return 404.
- Metadata uses the article/category title and description.
- `from` accepts safe in-app paths and rejects external, protocol-relative, auth, and token routes.

### Search tests

- Index contains title, description, headings, body, tags, and category text.
- Exact title matches rank above body-only matches.
- Heading matches return the heading label and anchor.
- F&B/FNB, Run of Show/ROS, Command Center/dashboard, and Docs Hub/documents aliases work.
- Duplicate section matches collapse to one article result.
- Ties are deterministic.
- Internal content is absent for planner users.
- Blank and no-results states render correctly.

### Markdown rendering tests

- Headings, paragraphs, ordered/unordered lists, links, screenshots, tables, blockquotes, code blocks, horizontal rules, strong, and emphasis render correctly.
- Article links use `/help/article/[slug]`.
- Screenshot URLs under `/help/screenshots` load and retain alt text.
- Raw HTML and contributor screenshot comments do not render.
- The article has one H1 and TOC links target real IDs.

### Related and contextual navigation tests

- Related links resolve and respect role visibility.
- Previous/next stays within the visible category and follows manifest order.
- Every listed major Orca module maps to an existing article.
- Budget Grid wins over the broad Budget matcher.
- Session Workspace wins over the broad Run of Show matcher.
- Event return links preserve pathname and allowed query parameters.

### Playwright acceptance journey

Add `web/e2e/planner-help-center.spec.ts` covering:

1. Open `/dashboard`, select Help, and confirm the account shell remains visible and Help is selected.
2. Search for `budget variance`, open a result, and confirm matched heading, breadcrumbs, metadata, body, TOC, screenshot, related links, and pager.
3. Browse a category and open an article.
4. Open Budget Grid, select contextual Help, and return to the same event and grid view.
5. Verify unknown article behavior.
6. Verify blank and no-results search states.
7. Verify a normal planner cannot discover the internal Administration article.
8. Run at desktop, a tablet-sized viewport, and a narrow mobile viewport.
9. Test keyboard-only operation and basic axe scans.

### Build verification

- `npm run help:manifest`
- `npm run help:generate`
- `npm run help:validate`
- `npm --prefix web run typecheck`
- focused Help unit/regression tests
- focused Help Playwright journey
- `npm --prefix web run build`

## 14. File-by-File Implementation Sequence

### Stage 1: Content pipeline

1. `web/scripts/lib/help-content.mjs`
   - Extract reusable discovery, frontmatter, AST parsing, slug, link-resolution, visibility metadata, and digest helpers from the existing script.
2. `web/scripts/help-docs.mjs`
   - Preserve current validation and add generated-artifact, H1, alt-text, heading-ID, and resolved-link checks.
3. `web/scripts/help-generate.mjs`
   - Generate typed-contract JSON content and the serialized search index.
4. `web/src/generated/help/content.json`
   - Commit deterministic generated content.
5. `web/src/generated/help/search-index.json`
   - Commit deterministic serialized search data.
6. Root `package.json`
   - Add `help:generate` and a CI-friendly `help:check` sequence.
7. `web/package.json` and `web/package-lock.json`
   - Add the approved Markdown, AST, search, and accessibility-test dependencies.

### Stage 2: Server-only Help domain

8. `web/lib/help/types.ts`
   - Define content, category, search, and contextual-help contracts.
9. `web/lib/help/categories.ts`
   - Define reviewed category labels, descriptions, and order without article content.
10. `web/lib/help/help-content.server.ts`
    - Import generated content, assert schema/digest, and expose role-aware selectors.
11. `web/lib/help/help-search.server.ts`
    - Deserialize MiniSearch, perform weighted search, collapse sections, and create safe excerpts.
12. `web/lib/help/help-links.ts`
    - Build article/category/search URLs and resolve safe return paths.
13. `web/lib/help/contextual-help.ts`
    - Own the ordered route-to-article registry and helper API.

### Stage 3: Reusable Help UI

14. `web/app/(shell)/help/_components/help-search-form.tsx`
15. `web/app/(shell)/help/_components/help-breadcrumbs.tsx`
16. `web/app/(shell)/help/_components/help-utility-card.tsx`
17. `web/app/(shell)/help/_components/help-category-card.tsx`
18. `web/app/(shell)/help/_components/help-article-list.tsx`
19. `web/app/(shell)/help/_components/help-article-header.tsx`
20. `web/app/(shell)/help/_components/help-article-metadata.tsx`
21. `web/app/(shell)/help/_components/help-status-callout.tsx`
22. `web/app/(shell)/help/_components/help-markdown.tsx`
23. `web/app/(shell)/help/_components/help-table-of-contents.tsx`
24. `web/app/(shell)/help/_components/help-related-articles.tsx`
25. `web/app/(shell)/help/_components/help-article-pager.tsx`
26. `web/app/(shell)/help/_components/help-search-results.tsx`
27. `web/app/(shell)/help/help.module.css`
    - Own prose rhythm, anchor offsets, table/code overflow, image treatment, and responsive article grid. Keep colors aligned with existing tokens.

### Stage 4: Routes and shell integration

28. `web/app/(shell)/help/page.tsx`
29. `web/app/(shell)/help/category/[categorySlug]/page.tsx`
30. `web/app/(shell)/help/article/[slug]/page.tsx`
31. `web/app/(shell)/help/search/page.tsx`
32. `web/app/(shell)/_components/sidebar-nav.tsx`
    - Add the Resources/Help navigation item.
33. `web/app/(shell)/_components/shell-scaffold.tsx`
    - Apply the Help-specific wider content constraint.
34. `web/app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx`
    - Render the shared contextual Help link in the utility area.
35. Major module header components
    - Add `ContextualHelpLink` at the established header action location; consume the central helper only.

### Stage 5: Verification

36. `web/lib/help/*.test.ts`
    - Add generator contract, loading, search, visibility, link, related, pager, and contextual-mapping tests.
37. `web/e2e/planner-help-center.spec.ts`
    - Add the end-to-end and responsive Help journey.
38. `web/playwright.config.ts`
    - No structural change expected; add a mobile Help project only if the focused spec cannot set its own viewport cleanly.
39. CI configuration, when identified
    - Add manifest/generation/validation freshness checks before the web build.

Implement and verify each stage before beginning the next. Do not add contextual links across all modules until route, visibility, and return-path helpers are tested.

## 15. Dependencies and Justification

### Production dependencies

- `react-markdown`: maintained React renderer that does not require executable MDX and avoids unsafe hand-built HTML rendering.
- `remark-gfm`: adds the table and common Markdown behavior required by the content contract.
- `rehype-slug`: generates stable heading IDs for table-of-contents anchors.
- `unified`, `remark-parse`, and `mdast-util-to-string`: parse the same Markdown structurally during generation for headings, links, and searchable text. Declare direct dependencies for packages imported directly rather than relying on transitive installation.
- `github-slugger`: ensures generator TOC IDs use the same duplicate-heading behavior as rendered headings.
- `minisearch`: small local full-text index with field boosts, prefix/fuzzy matching, serialization, and no external service.

### Development dependency

- `@axe-core/playwright`: automated accessibility baseline for the four Help page types. It supplements, rather than replaces, keyboard and responsive checks.

Do not add MDX, a CMS SDK, a hosted-search client, a state-management library, a client data-fetching library, or a new component framework.

## 16. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Vercel Root Directory excludes `docs/help` | Production build cannot read source Markdown | Commit generated artifacts inside `web`; production imports only those files; CI verifies freshness from repository root |
| Generated content becomes stale | UI differs from source Markdown | Digest both manifest and bodies; fail `help:validate`; CI fails on generated Git diff |
| Relative Markdown links break after routing | Articles lead to source paths or 404s | Resolve links through the manifest during generation and test every target |
| Internal administration content leaks | Planner users see restricted guidance | Apply role-aware filtering in one server-only repository layer before counts, search, related, and pager logic |
| Search returns weak or duplicated results | Users cannot find guidance | Index by section, weight metadata, collapse by article, add a small tested synonym map |
| Heading anchors differ between TOC and renderer | TOC links do nothing | Use GitHub slugging in generation and rendering; test duplicate headings |
| Event context is lost when opening Help | Planner must relocate the event/module | Add sanitized `from` path and trusted return label through one helper |
| Help content is squeezed by the existing shell | Poor readability on desktop and mobile | Add a Help-specific wide container; use right TOC only on wide screens; collapse TOC below that |
| Screenshots cause overflow or layout shift | Article layout breaks | Responsive image wrapper, intrinsic dimensions where available, lazy loading, Playwright viewport checks |
| Status language drifts across pages | Preview or Coming Soon behavior is overstated | Central status callout component and copy map driven by frontmatter |
| Support cards imply destinations that do not exist | Users click dead or invented support channels | Render non-link placeholders until product-approved configuration exists |

The highest-risk technical issue is the unverified Vercel project root and upload boundary. The committed generated-artifact design removes that runtime dependency, but the implementation team should still record the actual Vercel Root Directory and build command during Stage 1.

## 17. Explicit Non-Goals

- AI-generated answers or summaries
- semantic, embedding, or vector search
- external search services
- video hosting or walkthrough playback
- comments or discussion threads
- article editing UI
- documentation versioning
- favorites
- recently viewed history
- helpful/not-helpful analytics
- an external CMS
- third-party documentation SaaS
- public unauthenticated Help routes
- separate organization-specific article variants
- runtime reads from `docs/help`
- MDX or executable components inside article files
- a second permanent Help navigation rail
- Featured Guides without reviewed metadata/configuration

The server-only content/search interfaces should make later providers replaceable, but MVP should not add abstractions for hypothetical provider features beyond those boundaries.

## 18. Product-Owner Decisions Needed Before Implementation

1. Provide the real Contact Support destination, or approve the card to remain visibly unavailable for MVP.
2. Provide the real Product Walkthroughs destination, or approve the card to remain visibly unavailable for MVP.
3. Decide whether Featured Guides are omitted, as recommended, or supply an explicitly reviewed list/configuration.
4. Confirm whether Help must remain authenticated and organization-context gated. This plan recommends matching the existing app shell; public access would require a separate product and security decision.

No product-owner decision is needed to keep `docs/help` in place, use stable manifest slugs, hide `internal` content from planners, or use generated artifacts for deployment reliability.

## 19. Acceptance Checklist

### Content source and build

- [ ] All article copy is sourced from `docs/help`; no article body is duplicated in React.
- [ ] `help-manifest.json` supplies stable article identity, order, relations, and source routes.
- [ ] Generated artifacts live under `web/src/generated/help` and are committed.
- [ ] Generated content and search digests match the current source.
- [ ] Production Help rendering performs no runtime filesystem reads.
- [ ] A Vercel build succeeds when only the `web` application root and committed artifacts are available.
- [ ] All documentation generation and validation commands pass.

### Routes and navigation

- [ ] `/help` renders the landing page in the existing Orca shell.
- [ ] Every visible category has a stable category route.
- [ ] Every visible article has a stable manifest-slug route.
- [ ] `/help/search?q=...` is addressable and refresh-safe.
- [ ] Unknown category and article slugs return 404.
- [ ] Help is selected in the account sidebar for all Help routes.
- [ ] Event navigation provides contextual Help without hardcoded article URLs.
- [ ] Safe return links restore the original major module and query state.

### Landing and category experience

- [ ] Landing page includes eyebrow, clear H1, supporting copy, and prominent search.
- [ ] Three required utility cards are present without invented live destinations.
- [ ] Browse by Topic shows role-correct article counts.
- [ ] Category cards are compact, restrained, and use no rainbow treatment.
- [ ] Category pages show breadcrumbs, description, ordered articles, descriptions, and relevant statuses.
- [ ] Featured Guides are absent unless supported by approved configuration.

### Article experience

- [ ] Article page has one H1, metadata, breadcrumbs, readable body, and status callout when required.
- [ ] H2/H3 table of contents targets real heading anchors.
- [ ] TOC is sticky only when viewport space supports it.
- [ ] Markdown supports every required content element.
- [ ] Relative article links resolve to Help routes.
- [ ] Screenshots load from `/help/screenshots`, have meaningful alt text, and do not overflow.
- [ ] Related links use frontmatter and respect visibility.
- [ ] Previous/next navigation follows visible category order.
- [ ] Internal articles are available only to authorized platform administrators.

### Search

- [ ] Search covers title, description, headings, body, tags, and category.
- [ ] Results include title, description or relevant excerpt, category, and matched heading when available.
- [ ] Result anchors open the matched section.
- [ ] Ranking and tie-breaking are deterministic.
- [ ] Blank, no-results, and normal result states are complete.
- [ ] Internal content is not disclosed to planner users.
- [ ] Search requires no external service and sends no content or query off platform.

### Visual quality and responsiveness

- [ ] Orca shell, typography, colors, borders, controls, and focus treatment are reused.
- [ ] Help uses clean white surfaces, restrained existing accents, and no whale graphic.
- [ ] No oversized marketing gradient, decorative orb, or per-category color system is introduced.
- [ ] Landing, category, article, and search pages work at desktop, tablet, and narrow mobile widths.
- [ ] Text, controls, screenshots, tables, code, related cards, and pager never overlap or clip.
- [ ] Article line length remains readable on wide screens.

### Accessibility and verification

- [ ] Heading order, landmarks, breadcrumbs, labels, link names, and `aria-current` are correct.
- [ ] All workflows are keyboard operable with visible focus.
- [ ] Text and status meaning do not depend on color alone.
- [ ] Layout remains usable at 200% zoom and with reduced motion.
- [ ] Automated axe checks report no serious or critical violations on core Help pages.
- [ ] Focused unit, rendering, search, route, mapping, and Playwright tests pass.
- [ ] Typecheck and production build pass.

