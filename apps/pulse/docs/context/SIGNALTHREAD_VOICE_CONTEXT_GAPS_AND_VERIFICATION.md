# SignalThread context gaps and verification

> Source-confidence note — 2026-08-05: High confidence that these contradictions/gaps exist in the checked-out sources; the correct business or production answer is often unverified by definition. This file should shrink as owners make decisions and verify environments.

## Key contradictions

| Topic | Conflicting evidence | Current handling |
| --- | --- | --- |
| Authentication | Root README/quick-start/testing docs describe mock cookies/query selection or future auth; current code uses Supabase OTP plus Prisma identity | Treat old setup text as historical; use `lib/supabase/*` and `lib/auth/*` |
| Product mode | Template registry supports events/retail/hospitality and historically falls back to Events; canonical helper enables Events only for `Account.accountType=EVENTS` | Account product mode wins; hospitality and unknown values are retail-safe |
| Questions | Older docs say `Event.questionsJson` is authoritative; schema/services use normalized `Question` with compatibility readers | Use normalized survey questions where present; never edit two truths independently |
| Session | Legacy `Session` means a recording; Events UI/domain uses `EventStructureItem(kind=SESSION)` | Name the model explicitly in engineering discussions |
| Roles | `AdminRole`/`Admin` docs coexist with current `UserRole`/`User` policies | `UserRole` is current identity/RBAC; legacy models remain for compatibility |
| Tiers | Docs mention free/starter/pro/enterprise; current account code recognizes starter/growth/enterprise and maps pro→growth | Do not publish tier names/entitlements until commercial owner confirms |
| Security audit | March audit says several routes lack auth; current account/admin APIs now call shared guards | Re-test each finding; retain audit as incident history, not blanket current state |
| Storage | Docs variously say AWS S3, MinIO, or Cloudflare R2 | Code is S3-protocol compatible; actual production provider is environment-specific and unverified |
| Processing | UI/history says non-blocking/async summary; `answer/confirm` performs transcription and analysis synchronously | Describe UI as non-blocking where applicable, not the backend as queued |
| Event lifecycle | Stored status, dates, survey status, availability, and lifecycle views have historically been conflated | Use dedicated helpers/contracts and label every state |
| Theme | HEAD provider defaults to system; dirty work makes account-aware light fallback and removes child override | Until committed/verified, both current HEAD and working proposal must be distinguished |
| Tour | Prior commits gate Events; dirty work strengthens stale-context fail-closed behavior | Do not claim final behavior until targeted/browser verification |
| Import completeness | `c513932` adds flexible import tests; subsequent QA reports roster mapping/sticky draft failures | Reproduce current HEAD; tests alone do not close the browser-reported defect |

## Missing sources of truth

- No release/tag/deployment manifest maps production to a Git commit.
- No checked-in CI workflow or infrastructure-as-code describes promotion, rollback, secrets, scaling, WAF, or backups.
- No verified database migration status per environment.
- No data retention/deletion schedule for audio, transcripts, analysis, import source files, or logs.
- No formal privacy/security/compliance documentation or threat model.
- No central API error contract, observability standard, or service-level objectives.
- No authoritative pricing/entitlement table.
- No verified customer/pilot register, case study approvals, or outcome metrics.
- No product owner record resolving event close/wrap semantics or kiosk branding depth.
- No canonical definition of Hospitality.
- No ownership/RACI for product, security, data, support, and production incidents.
- No formal browser/device support matrix.

## Unverified production behavior

The following must not be inferred from local code:

- currently deployed commit and feature set;
- whether all 36 migrations are applied;
- Supabase RLS configured outside this repository;
- object-storage provider, bucket policy, CORS, encryption, retention, or malware controls;
- rate limiting/WAF at an upstream provider;
- Stripe webhook configuration and replay behavior;
- email deliverability and sender-domain setup;
- OpenAI/Google model availability, latency, quotas, and data-processing terms;
- real traffic capacity and Prisma connection limits;
- no dark flash/tour leakage in actual browsers;
- import behavior with the named real-world XLSX fixture;
- accessibility conformance beyond local implementation patterns.

## Possible orphaning or migration gaps

No migration was proven orphaned, but these require environment checks:

- compatibility code that omits `trialEndsAt` suggests some database once lagged schema;
- legacy `Session/*`, `Admin`, and JSON fields remain after normalized replacements;
- direct schema changes versus all historical databases cannot be proven from the migration directory alone;
- no migration-status output was collected;
- external database policies/functions/triggers are not represented.

Run `npx prisma migrate status` only against an explicitly authorized target, then compare schema safely. Do not use `db push` as a diagnostic against production.

## Ambiguous ownership and semantics

- Whether Location means store, workspace, venue, or all three varies by product and copy.
- Event is both the shared campaign container and the user-visible Events object.
- Which metrics are contractual across lifecycle surfaces versus view-specific remains easy to misstate.
- Who can perform each `ADMIN`, `MANAGER`, and `VIEWER` operation lacks one centralized capability matrix.
- Public legacy review routes have documented legacy ownership but no retirement date.
- Settings JSON owns branding/consent and may grow without typed schema ownership.
- Action email delivery exists, but broader integration/export ownership is undefined.

## Questions requiring a human business decision

1. What does “Close/Wrap Event” change: display lifecycle only, collection availability, editability, or all of them?
2. Should the public kiosk be generic, account-branded with event/survey context, or fully event-branded?
3. Is Events intentionally light-only, or should explicit user dark/system preferences be honored there?
4. What are the supported public tiers, prices, entitlements, quotas, and trial rules?
5. Is Hospitality a real near-term product or should the placeholder be removed/hidden?
6. What audio/transcript retention, deletion, consent, and data-residency commitments apply?
7. Which claims and internal demo screenshots/data may be used publicly?
8. When can legacy public/admin event routes and legacy models be retired?
9. What reliability/latency target justifies moving answer processing to a queue?
10. Which external systems should receive actions, reports, or attendee follow-up?

## Verification plan

### Repository

- Run targeted tests for any changed contract, then `npm run typecheck` and `git diff --check`.
- For schema work, validate/generate and inspect SQL for additive safety.
- Periodically run the full Vitest suite and both Playwright journeys in a clean checkout.
- Replace source-string-only guards with behavioral coverage for high-risk states where feasible.

### Browser

- Maintain authenticated Events and SMB fixtures.
- Verify initial paint, hydration, navigation during slow account-context resolution, keyboard/focus behavior, console, and network request counts.
- For imports, use realistic CSV/XLSX files and inspect domain record counts before preview, after discard, and after confirmation/retry.
- For lifecycle metrics, compare the UI label/value directly with API payload and known database scope.

### Environment/operations

- Record deployed commit, migration status, provider topology, external policy controls, and rollback procedure per environment.
- Add synthetic checks for public link resolution, upload/confirm, auth, dashboards, webhooks, and email side effects.
- Establish redacted structured logging, error reporting, latency/error metrics, and alert ownership.

### Commercial

- Obtain an approved tier/price/entitlement sheet.
- Create a claims register with owner, evidence, date, audience, and expiration.
- Separate demo/QA outcomes from customer outcomes.
- Define pilot success metrics before publishing case studies.

## Top 10 facts future agents are most likely to get wrong

1. **`Event` does not mean Events product.** Only `Account.accountType === EVENTS` does.
2. **Non-Events defaults to SMB/retail-safe behavior.** Hospitality is not a completed third experience.
3. **Events agenda sessions are `EventStructureItem(kind=SESSION)`, not legacy `Session`.**
4. **Current answer capture uses `Response`/`Answer`; the old recording model still exists only for compatibility.**
5. **`/api/app/events/*` is the current protected Events surface; `/api/events/*` is legacy/public/admin.**
6. **A UI that loads a summary later does not mean backend AI processing is queued; confirmation is synchronous.**
7. **Metrics with similar labels can have different units/scopes; never copy a number without its contract.**
8. **Old README/security/multi-tenancy docs are not wholly current, even when historically useful.**
9. **The current theme/tour changes are uncommitted and unverified in a live browser.**
10. **Checked-in migrations and tests do not prove production deployment, migration application, customer usage, or commercial outcomes.**
