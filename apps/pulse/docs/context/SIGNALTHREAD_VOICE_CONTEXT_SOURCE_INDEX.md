# SignalThread context source index

> Source-confidence note — 2026-08-05: High confidence that listed repository paths existed when validated. A source proves only the claim cluster described; historical documents and commits are explicitly labeled and may not describe current behavior.

## Evidence map

| Claim cluster | Primary current sources | Tests/migrations | History/design sources |
| --- | --- | --- | --- |
| Product name and shared voice-to-insight thesis | `app/layout.tsx`, `README.md`, `lib/transcription.ts`, `lib/analysis.ts` | answer route tests | `docs/SALES_ONE_PAGER.md` |
| Canonical Events versus SMB boundary | `AccountType` in `prisma/schema.prisma`, `lib/account-product-mode.ts`, `lib/auth/require-events-event-access.ts` | `lib/account-product-mode.test.ts`, event-access tests | `docs/event-mode/EVENT_MODE_BUILDOUT_SUMMARY_FOR_FABEL.md` |
| Account context | `app/api/app/account/route.ts`, `lib/account-context-client.ts` | `lib/account-context-client.test.ts`, `app/app/page.test.ts` | commits `4832a4c`, `571a06c` |
| Auth and identity | `lib/supabase/*`, `lib/auth/complete-email-otp.ts`, `lib/auth/link-user-identity.ts` | auth/identity/membership tests | commits `82044f7`, `1f30340`, `ddf0629` |
| RBAC/platform admin | `lib/auth/require-super-admin.ts`, `lib/auth/super-admin.ts`, `app/admin/layout.tsx`, `app/api/admin/*` | `lib/auth/super-admin.test.ts`, admin route tests | March security audit/lockdown history |
| Tenant isolation | `lib/auth/require-account-membership.ts`, `lib/auth/require-events-event-access.ts`, scoped service queries | membership/event-access/service tests | `docs/MULTI_TENANCY.md` is partly stale |
| Canonical relational model | `prisma/schema.prisma` | 36 files under `prisma/migrations/*/migration.sql` | `docs/DB_SCHEMA.md`, `SAAS_DATA_MODEL.md` are secondary |
| Legacy/current model split | `prisma/schema.prisma` models `Response`/`Answer` and `Session`; `app/api/events/*` | `app/api/events/legacy-routes.guard.test.ts`, `lib/event-agenda-schema.test.ts` | `docs/event-mode/LEGACY_EVENT_ROUTES.md`, `docs/SECURITY_CODE_AUDIT.md` |
| Survey/question contract | `lib/mixed-survey-contract.ts`, `lib/question-read.ts`, `lib/event-voice-surveys.ts` | associated tests; migrations `20260504193000`, `20260720120000`, `20260803120000` | survey help docs |
| Public kiosk resolution | `app/kiosk/page.tsx`, `app/api/kiosk/event-details/route.ts`, `lib/event.ts` | `app/kiosk/page.test.ts`, kiosk route tests, both E2E journeys | `docs/PROCESSING_PIPELINE.md` |
| Upload/storage pipeline | `app/api/answer/presign`, `complete`, `confirm`; `lib/objectStorage.ts`, `lib/s3.ts` | answer route and question-audio tests | `docs/PROCESSING_PIPELINE.md` |
| AI processing | `lib/transcription.ts`, `lib/analysis.ts`, `lib/event-intelligence/extraction.ts`, `dual-write.ts` | analysis, extraction, dual-write tests | commits `667c4e9`, `7037ad5` |
| Events structure/agenda | `lib/event-structure.ts`, `lib/event-agenda-contract.ts`, `lib/event-agenda-service.ts` | structure/agenda contract/service/schema tests; migration `20260730130000` | July 30 commit series |
| Speaker model | `EventSpeakerProfile`/`EventSessionSpeakerAssignment` schema; `lib/event-agenda-service.ts`, `lib/event-speaker-intelligence.ts` | speaker roster/intelligence tests | commits `9d5709c`, `c513932` |
| Import parsing/templates | `lib/event-agenda-import-parser.ts`, `lib/event-agenda-import-template.ts`, `lib/event-speaker-roster-import.ts`, roster template | parser/template/route/service/UI tests | commits `28055d8`, `b1358af`, `c513932` |
| Import lifecycle and idempotency | `lib/event-agenda-import-service.ts`, import API route, import job/row schema | import service/route/UI tests; unique constraints in schema | current user QA reports are chat-derived and not committed proof |
| Events lifecycle | `lib/events-home-groups.ts`, `lib/event-workspace-lifecycle.ts`, `lib/event-dates.ts` | lifecycle/date/home-group tests | commits `a102098`, `190cd78` |
| Survey availability/deployment | `lib/survey-availability.ts`, `components/events/EventDeploymentWorkspace.tsx`, voice-surveys route | availability/deployment/voice-survey tests; migration `20260721120000` | prompt-pack QA evidence |
| Events metrics and intelligence | `lib/events-home-metrics.ts`, `lib/event-analysis.ts`, `lib/event-intelligence/aggregation.ts`, protected analysis/intelligence routes | extensive unit/route/component tests | commits `a6b9af2`, `8e66f2a` |
| Evidence and action workflow | `lib/event-intelligence/evidence-detail.ts`, `lib/event-actions/service.ts`, Events action components/routes | evidence/action/assignment tests; action-related migrations | commits `0aa4761`, `7fa148f` |
| Theme | `components/theme/ThemeProvider.tsx`, `ThemeSwitcher.tsx`, `app/globals.css`, Tailwind config | untracked `ThemeProvider.test.ts`, workspace-shell tests | commit `5fb155e`; current diff is uncommitted |
| Product Tour | `components/onboarding/TourContext.tsx`, `ProductTour.tsx`, `components/admin/SettingsMenu.tsx` | ProductTour/SettingsMenu/app-home tests | commits `54ac264`, `a478fb8`; current diff uncommitted |
| Billing | checkout route, account billing route, Stripe webhook | route tests where present; account billing schema fields | March 24 commits |
| Provisioning/users | `lib/provisioning.ts`, `lib/account-users.ts`, admin provision routes | provisioning/account-user/admin tests | January–May provisioning commits |
| Help/documentation build | `docs-site`, `scripts/build-help-docs.mjs`, `next.config.js` | build script via `npm run build` | `docs/help` and docs-site content may drift |
| Test architecture | `vitest.config.ts`, `playwright.config.ts`, `tests/*`, `e2e/*` | 155 Vitest files, 2 Playwright specs at capture | `TESTING_GUIDE.md` is partly historical |
| Security current/historical | current auth policies and route code | auth/route/legacy guard tests | `docs/SECURITY_CODE_AUDIT.md` and `SECURITY_FIX_PLAN.md` dated 2026-03-07 |
| Commercial positioning | implemented surfaces plus `docs/SALES_ONE_PAGER.md` | no commercial proof tests | `docs/MARKETING_FEATURE_MATRIX.md`, Events audit/buildout docs |
| Current work/QA | `git status`, current diff, `docs/Loop/Remaining QA Fix Prompt Pack.md` | verification lines within prompt pack | user instructions are chat-derived and internal |

## Screenshots and visual references

- Current audit screenshots: `docs/audits/voice-events/screenshots/*`.
- Event redesign references and old QA screenshots: `docs/Loop/Old/*` and `docs/Loop/Event Workspace Redesign Voice Events (1).html`.
- Kiosk/dashboard design images: `Design/*`, `docs/design/*`, `public/images/wec-survey/*`.

Screenshots prove a visual target or observed moment, not current runtime data or implementation.

## Meaningful commit anchors

- `d595021` — initial surface split and account navigation.
- `82044f7` / `1f30340` — Supabase auth evolution to OTP.
- `a746f15` — security-lockdown merge.
- `8a1d707` — Stripe checkout/webhook foundation.
- `5d43535` through `667c4e9` — Events survey/intelligence foundation.
- `bd8f452`, `39e2372`, `0aa4761` — mixed questions/kiosk/live intelligence.
- `bf3f66d` through `9d5709c` — agenda, imports, listening plan, session/speaker intelligence.
- `5fb155e` — theme mutation-loop fix.
- `7fa148f`, `a6b9af2`, `8e66f2a` — redesign and truth reconciliation.
- `b6686b2` — survey-creation retry safety.
- `c513932` — flexible imports and listening windows; current HEAD.

## Chat-derived decisions

The following are not code evidence and must be labeled when used:

- preserve Events and SMB behavior while fixing either product;
- one server on port 3001 for the named QA loop;
- browser absence is not always a hard stop, but unperformed checks must be listed and never claimed;
- per-prompt root-cause investigation, prompt-pack update, tests/typecheck, and separate commits;
- explicit product-decision stop for event closeout and kiosk context;
- use normal product flow, not direct DB mutation, for QA cleanup.

## Staleness warning

`README.md`, `QUICK_START.md`, `PROJECT_CONTEXT.md`, `docs/MULTI_TENANCY.md`, `TESTING_GUIDE.md`, `docs/SECURITY_CODE_AUDIT.md`, and several loop/audit documents contain valuable history but also claims superseded by current code. Always pair them with the primary sources in the table above.
