# Voice / Booth Audio Full Testing Prompt Pack

## Purpose

This prompt pack is for building the full automated testing suite for Voice / Booth Audio across **SMB** and **Events** mode.

The goal is the same level of confidence we previously built for Planner Dash and Lead Retrieval: **unit tests, API/integration tests, Playwright journey tests, auth/tenant isolation tests, kiosk/audio pipeline tests, Events tests, and backward-compatibility tests**.

This is not just “add a few tests.” We are intentionally testing the shit out of the product because we have under-tested this app.

## How to Use This Pack

Run these prompts in order with Codex.

Do **not** paste the entire pack as one giant prompt. Each prompt is a separate loop.

After each loop:

1. Let Codex run the verification commands it can run.
2. Review the final report.
3. Fix obvious failures in the next loop.
4. Do not push or merge until the final hardening loop is complete.

Recommended model:

- Codex / GPT-5.5 for implementation loops.
- Opus may be useful as a reviewer after the audit or after the final report, but Codex should do the repo work.

Branch:

```bash
git checkout -b test/voice-full-production-coverage
```

If the branch already exists, use it.

---

# Prompt 00 — Testing Audit and Coverage Map

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Audit only. Do not change files.

Task:
Audit the current Voice / Booth Audio testing setup and produce the implementation map for full production-grade coverage across SMB and Events mode.

Goal:
We need the whole testing package:
- service/unit tests
- API/integration tests
- Playwright journey tests
- kiosk/audio/upload/transcription/analysis tests
- SMB journey tests
- Events journey tests
- auth and tenant-isolation tests
- backward-compatibility tests

Current product baseline:
- The app already has a working anonymous kiosk voice flow:
  /kiosk?eventId=... -> consent -> response create -> answer upload -> transcription -> analysis -> response complete -> dashboard insights.
- The app supports SMB/retail-style voice surveys and newer Events/event-intelligence voice surveys.
- Existing /kiosk?eventId=<eventId> behavior must remain working.
- Newer Events work may include Event -> SurveyTarget -> Survey -> PublicSurveyLink -> Response -> Answer -> Transcript/Analysis.
- Existing Response, Answer, AnswerTranscript, AnswerAnalysis, and AnswerProcessingLog systems must be reused.
- Do not create a second kiosk flow.
- Do not create a second event system.
- Do not duplicate response, answer, transcription, analysis, or analytics systems.

Inspect:
- package.json
- existing test directories
- Playwright config
- existing test helpers/factories
- existing auth/session mocks
- existing Prisma test setup
- existing storage/OpenAI/TTS mocks
- app/kiosk/**
- app/app/**
- app/admin/**
- app/api/response/create/**
- app/api/answer/presign/**
- app/api/answer/complete/**
- app/api/answer/confirm/**
- app/api/response/[responseId]/complete/**
- app/api/kiosk/event-details/**
- app/api/tts/**
- app/api/app/account/**
- app/api/app/account/settings/**
- app/api/app/locations/**
- app/api/app/events/**
- app/api/app/events/[eventId]/**
- app/api/app/events/[eventId]/analysis/**
- app/api/app/events/[eventId]/signals/**
- app/api/app/events/[eventId]/timeline/**
- app/api/app/events/[eventId]/voice-surveys/**
- app/api/admin/accounts/**
- app/api/admin/provision-retail/**
- app/api/provision/start/**
- app/api/auth/link-user/**
- lib/event.ts
- lib/event-analysis.ts
- lib/analytics/**
- lib/analysis.ts
- lib/transcription.ts
- lib/tts.ts
- lib/objectStorage.ts
- lib/provisioning.ts
- lib/event-voice-surveys.ts
- prisma/schema.prisma

Return:
1. Current test commands and what each does.
2. Current unit/API test setup.
3. Current Playwright/journey test setup.
4. Existing useful tests to preserve.
5. Missing helpers/factories/mocks.
6. Current SMB coverage gaps.
7. Current Events coverage gaps.
8. Current kiosk/audio/transcription/analysis coverage gaps.
9. Current auth/tenant-isolation coverage gaps.
10. Current Playwright journey coverage gaps.
11. Product behavior that appears broken or risky.
12. The safest loop order for implementation.
13. Exact suggested files for Prompt 01.
14. Verification commands to run after each loop.

Constraints:
- Audit only.
- Do not edit files.
- Do not add tests yet.
- Do not refactor.
- Do not change product behavior.
- Preserve existing /kiosk?eventId=... behavior in the recommendation.
- Keep the plan focused and production-safe.
```

---

# Prompt 01 — Test Foundation, Fixtures, and Provider Mocks

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Implement the deterministic test foundation for the full Voice / Booth Audio testing suite.

Use the audit from Prompt 00 as the source of truth for exact file locations and existing conventions.

Goal:
Before we add broad coverage, create the reusable test foundation needed for reliable unit, API, and Playwright journey tests.

Required foundation:
- isolated test data factories
- auth/session helpers
- account/role helpers
- mocked external providers
- reusable kiosk/audio helpers
- cleanup utilities
- stable Playwright setup for browser journeys

Add or improve helpers for:
- createTestAccount
- createTestUser
- createTestLocation
- createTestEvent
- createTestSurveyQuestions
- createTestResponse
- createTestAnswer
- createProcessedAnswer
- createEventsAccount
- createEventVoiceSurveyFixture, if Events survey models exist
- createPublicSurveyLinkFixture, if token links exist
- mockAuthenticatedUser / loginAsRole
- mockSupabaseSession
- mockObjectStorage
- mockOpenAITranscription
- mockOpenAIAnalysis
- mockTTS
- mockStripePortal, if billing routes are touched
- Playwright MediaRecorder mock
- cleanupTestData

Rules:
- No real OpenAI calls.
- No real object storage calls.
- No real Supabase OTP/email delivery.
- No real Stripe calls.
- No dependency on production seed data.
- No hidden test-order dependency.
- No shared mutable fixture leakage.
- Clean up mutable DB data in finally blocks where applicable.
- Keep helpers consistent with current test framework conventions.
- Do not refactor app code unless needed to expose testable seams without changing behavior.

Acceptance checks:
- Existing tests still run.
- Test helpers compile.
- Provider mocks are reusable by both API/unit tests and Playwright tests where applicable.
- No production code path calls real external providers during tests.
- Fixtures make Account, Location, Event, Response, Answer, and Events-mode ownership explicit.

Verification:
Run the commands identified in Prompt 00, at minimum:
- npx prisma validate
- npx prisma generate, if Prisma types are involved
- npm run typecheck
- npm test, or the repo’s unit/API test command

Return:
- files changed
- helpers added
- mocks added
- any product code touched and why
- verification results
- suggested next files for Prompt 02

Do not push or merge.
```

---

# Prompt 02 — Service and Unit Tests for Core Voice Logic

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Add focused service/unit tests for the core Voice / Booth Audio business logic.

Use the test foundation from Prompt 01. Do not duplicate helper logic. Do not mock the business rule being verified. Mock only external providers.

Goal:
Cover the core kiosk, response, answer, transcription, analysis, TTS, analytics, provisioning, and auth/scope logic at the service/helper level.

Coverage required:

1. Kiosk launch / response context
- eventId mode resolves active Event and questions.
- inactive/missing/invalid event fails cleanly.
- existing /kiosk?eventId=<eventId> backward compatibility remains unchanged.
- token mode resolves PublicSurveyLink -> Survey -> SurveyTarget -> Event if implemented.
- token mode loads only survey-specific questions if implemented.
- inactive/expired token fails cleanly if implemented.
- conflicting eventId/token input fails cleanly if both modes exist.

2. Response and Answer lifecycle
- response creation starts IN_PROGRESS.
- answer presign creates or updates expected answer metadata.
- answer presign keeps response/event/survey scope intact.
- answer complete validates uploaded object metadata and transitions to UPLOADED.
- answer confirm transitions through transcript and analysis states.
- transcript records are persisted.
- analysis records are persisted.
- processing logs are written.
- confirm is idempotent where current product intends it.
- response complete marks completion only under valid conditions.

3. Transcription and analysis
- mocked transcription success persists transcript.
- mocked transcription failure creates safe FAILED state/log.
- mocked analysis success persists sentiment/themes/actions/entities.
- mocked analysis failure creates safe FAILED state/log.
- malformed provider output is handled safely.

4. TTS and question voice
- same voice + same text uses stable cache key.
- changed voice produces different cache/generated key.
- changed question text produces different cache/generated key.
- voice preview works through mocked TTS.
- voice selection persists on create/edit where service coverage exists.
- question audio regeneration happens only for voice/text/question changes, not name-only edits.

5. Analytics and signals
- processed answers produce expected response counts.
- completed responses are counted correctly.
- top themes aggregate correctly.
- sentiment/pulse labels match current logic.
- empty data produces safe empty states.
- mixed sentiment produces stable deterministic results.

6. Provisioning and auth linking
- provisioning creates expected Account, Location, Event, and PendingProvision.
- duplicate provisioning behaves deterministically.
- auth link-user attaches user to the correct account.
- legacy fallback behavior is covered if still present.

7. Account and role scope helpers
- own-account access succeeds.
- cross-account access fails.
- SUPER_ADMIN behavior is explicit.
- ADMIN/MANAGER/VIEWER differences are covered where implemented.

Allowed product fixes:
Only fix small root-cause bugs exposed by tests. Examples:
- incorrect status transition
- broken idempotency
- unsafe scope check
- stale helper behavior
- broken provider error handling

Not allowed:
- broad refactors
- new kiosk flow
- new event system
- new response/answer pipeline
- queue/worker rewrite
- unrelated UI changes

Verification:
Run:
- npx prisma validate
- npm run typecheck
- npm test, or the repo’s unit/API command

Return:
- files changed
- tests added/updated
- product bugs found
- product bugs fixed
- known gaps left for API/Playwright loops
- verification results

Do not push or merge.
```

---

# Prompt 03 — API and Integration Tests

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Add route-level API/integration tests for the critical Voice / Booth Audio endpoints.

Use the helpers and mocks from Prompt 01 and service coverage from Prompt 02. Keep route handlers thin. If a route lacks required auth/account enforcement, write the failing test for intended production-safe behavior, then fix the smallest canonical server-side root cause.

Goal:
Prove the public kiosk APIs, SMB app APIs, Events APIs, admin/provisioning APIs, and tenant boundaries behave correctly.

Coverage required:

1. Public kiosk APIs
- POST /api/response/create with eventId succeeds for a valid active event.
- missing/invalid/inactive event fails cleanly.
- token mode succeeds if PublicSurveyLink token mode is implemented.
- invalid/inactive/expired token fails if token mode is implemented.
- POST /api/answer/presign requires valid response/question context.
- presign does not allow cross-response leakage.
- presign does not allow cross-event leakage.
- presign does not allow cross-survey leakage where survey fields exist.
- POST /api/answer/complete verifies upload metadata through mocked storage.
- POST /api/answer/confirm runs mocked transcription and mocked analysis.
- confirm persists AnswerTranscript, AnswerAnalysis, and AnswerProcessingLog.
- POST /api/response/[responseId]/complete completes only valid responses.
- /api/kiosk/event-details returns only safe public kiosk data.
- /api/tts uses mocked provider/storage and returns playable URL.

2. SMB app APIs
- /api/app/account requires auth and returns only current user account.
- /api/app/account/settings requires auth/account membership.
- logo upload/presign requires auth/account membership.
- /api/app/locations create/read/update/delete enforces account scope.
- location/team plan limits are enforced server-side.
- /api/app/events create/read/update/delete enforces account scope.
- /api/app/events/[eventId]/analysis enforces account scope.
- /api/app/events/[eventId]/signals enforces account scope.
- /api/app/events/[eventId]/timeline enforces account scope.
- invalid account slug cannot access another tenant’s data.

3. Events APIs
- POST /api/app/events/[eventId]/voice-surveys?account=<slug> requires auth/account access.
- creates an event voice survey under the correct Event.
- creates/uses SurveyTarget, Survey, Questions, and PublicSurveyLink according to current schema.
- rejects event from another account.
- rejects invalid SurveyTarget category if applicable.
- preserves Event as top-level container.
- does not create duplicate kiosk/event systems.

4. Admin/provisioning APIs
- /api/admin/accounts requires SUPER_ADMIN or current intended admin protection.
- non-admin cannot list/manage accounts.
- /api/admin/provision-retail validates required fields.
- /api/admin/provision-retail creates expected Account/Location/Event/PendingProvision.
- /api/provision/start behaves consistently with the public onboarding path.
- /api/auth/link-user attaches user to the right account from PendingProvision.

5. Security and abuse regression cases
- unauthenticated protected API requests fail.
- authenticated user from account A cannot use account B slug.
- authenticated user from account A cannot access account B eventId analytics.
- public kiosk APIs expose only safe public fields.
- answer upload/confirm cannot be used to mutate another response.

Allowed product fixes:
- add missing server-side auth/account check
- centralize account/event/survey scope validation
- fix unsafe tenant filtering
- fix broken error response shape
- fix upload/answer scoping bug

Not allowed:
- broad auth rewrite beyond routes under test
- new kiosk implementation
- new event implementation
- unrelated UI refactors
- deleting legacy routes

Verification:
Run:
- npx prisma validate
- npm run typecheck
- npm test, or the repo’s unit/API/integration command

Return:
- files changed
- API tests added/updated
- product code changed and why
- security bugs found/fixed
- known issues left for Playwright journeys
- verification results

Do not push or merge.
```

---

# Prompt 04 — Playwright Journey Tests for SMB, Kiosk, QR, Insights, and Settings

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Add full Playwright journey tests for the SMB Voice product and kiosk respondent experience.

This is the major journey-testing loop. Do not reduce this to shallow page-load tests. These should prove actual user flows from setup through kiosk capture through insights review.

Use the test foundation, auth helpers, provider mocks, and MediaRecorder mock from earlier prompts. Prefer semantic roles. Add stable data-testid attributes only where they materially improve reliability for important flows.

Goal:
Cover the real browser journeys an SMB customer and kiosk respondent use.

Journey 1 — SMB account setup and dashboard
- login using test auth/session helper
- land on dashboard
- see empty/onboarding state when no surveys exist
- create or confirm first Location/Team
- create first survey
- add survey name
- add survey description
- choose Location/Team
- add multiple questions
- choose question voice
- preview voice using mocked TTS
- save survey
- confirm survey appears on dashboard under the correct Location/Team

Journey 2 — SMB survey lifecycle
- create a DRAFT survey
- edit draft name, description, questions, and voice
- activate survey
- verify active survey rules according to current product behavior
- verify active survey allows intended edits and blocks protected edits
- verify completed survey read-only behavior according to current code
- delete draft survey where allowed
- verify destructive confirmation and final state

Journey 3 — QR/link/kiosk launch
- open QR action from dashboard or analytics/detail screen
- verify QR opens in an in-app modal, not raw browser image behavior
- verify View QR action exists
- verify Download PNG action exists
- verify Copy Link action exists
- copy/open kiosk link
- verify kiosk loads the correct survey/event
- verify missing/wrong eventId shows a safe error state

Journey 4 — Kiosk respondent happy path
- open /kiosk?eventId=<eventId>
- verify consent screen appears with configured branding/consent text
- decline consent and verify recording flow does not continue
- accept consent and verify response is created
- verify question playback UI appears
- use mocked MediaRecorder to record answer
- verify mocked upload succeeds
- verify answer confirm runs mocked transcript + analysis
- complete all questions
- verify response completes
- verify thank-you state appears
- verify Google review helper appears only when valid Location/Team review URL is configured

Journey 5 — Kiosk failure handling
- microphone denied shows safe error/retry state
- upload failure shows safe error/retry state
- transcription/analysis failure does not fake success
- no questions available shows the current safe no-questions message
- retry does not create duplicate completed responses

Journey 6 — Insights and response review
- seed completed processed responses
- open survey analytics
- verify response counts
- verify completion counts
- verify response trend area
- verify overall pulse/label
- verify top themes
- verify opportunities or recommended actions
- verify transcript/raw response drilldown if present
- verify empty analytics state when there are no responses

Journey 7 — Account settings
- open Profile Settings
- manage Locations/Teams
- create Location/Team
- edit Location/Team
- validate Google review URL behavior
- verify plan limit blocking/messaging
- edit Consent Screen fields and verify live preview updates
- edit Branding fields and verify preview updates
- upload logo through mocked upload/presign path
- verify Billing tab renders mocked plan/subscription/portal data if implemented
- verify Users tab renders and basic intended workflow if implemented

Journey 8 — SMB auth and tenant isolation in browser
- account A user can access account A dashboard/data
- account A user cannot access account B slug/routes/events/analytics/locations
- unauthenticated user cannot access protected app pages
- public kiosk remains accessible without login
- public kiosk exposes only safe public data
- admin pages require SUPER_ADMIN or intended admin protection

Allowed product fixes:
- add missing accessible names or stable selectors
- fix broken QR modal behavior
- fix broken kiosk error state
- fix stale/fake success state
- fix broken voice preview/save path
- fix missing server-side enforcement discovered by the browser flow

Not allowed:
- visual redesign
- broad navigation rewrite
- new kiosk implementation
- new event implementation
- unrelated refactors

Verification:
Run:
- npm run typecheck
- npm test, or relevant unit/API command if touched
- npx playwright test, or the repo’s Playwright command

Return:
- files changed
- Playwright tests added/updated
- stable selectors added, if any
- product bugs found/fixed
- browser journey coverage map
- verification results

Do not push or merge.
```

---

# Prompt 05 — Events Journey Tests and Backward Compatibility

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Add Events-mode Playwright/API coverage and backward-compatibility regression tests.

This loop is specifically for the newer Events/event-intelligence behavior and for proving that legacy eventId kiosk links still work.

Current product baseline:
- Existing /kiosk?eventId=<eventId> must keep working.
- Existing Response, Answer, AnswerTranscript, AnswerAnalysis, and AnswerProcessingLog must be reused.
- Events mode should not introduce a second event system or second kiosk flow.
- If token links exist, they should resolve PublicSurveyLink -> Survey -> SurveyTarget -> Event.
- If token links are not fully wired yet, cover the implemented backend/API behavior and document the missing UI path.

Coverage required:

1. Events account and event setup
- create or seed EVENTS account
- create Event under the EVENTS account
- verify Events dashboard/home surfaces render if implemented
- verify Events language is event intelligence / attendee sentiment / onsite friction, not SMB Google-review language

2. Event voice survey creation
- create event voice survey through API and UI if UI exists
- create SurveyTarget for EVENT category if supported
- create SurveyTarget for SESSION category if supported
- create SurveyTarget for LOCATION category if supported
- create SurveyTarget for CUSTOM category if supported
- verify SurveyTarget belongs to the correct Event
- verify Survey belongs to the correct SurveyTarget/Event
- verify Questions belong to the correct Survey if question model supports it
- verify PublicSurveyLink is created/retrieved if implemented

3. Tokenized kiosk path, if implemented
- launch tokenized event survey kiosk
- verify token resolves correct Event, SurveyTarget, Survey, and Questions
- verify tokenized response writes:
  - eventId
  - surveyId
  - surveyTargetId
  - publicSurveyLinkId
- verify tokenized kiosk loads only survey-specific questions
- verify inactive token fails
- verify expired token fails
- verify token for another account/event cannot leak data

4. Legacy eventId kiosk backward compatibility
- /kiosk?eventId=<eventId> still creates responses
- event-level questions still load
- old QR links still resolve
- old dashboard survey rows still open analytics
- existing processed Response/Answer/Transcript/Analysis records still aggregate
- Events changes do not break SMB survey/kiosk behavior

5. Events analytics
- seed processed event voice responses
- verify event dashboard/analysis reads processed answers correctly
- verify survey target context is preserved in response records where schema supports it
- verify aggregate insights do not mix unrelated surveys/targets incorrectly

6. Security
- SMB account cannot access EVENTS account event data
- EVENTS account A cannot access EVENTS account B event data
- public token exposes only safe public survey data
- protected Events APIs require auth/account access

Allowed product fixes:
- fix missing Events account/event scope checks
- fix token resolver bug
- fix survey target/survey/question filtering bug
- fix backward compatibility regression
- fix unsafe public token data exposure

Not allowed:
- create a second kiosk flow
- create a second event system
- duplicate response/answer/transcript/analysis models
- broad redesign
- unrelated refactors

Verification:
Run:
- npx prisma validate
- npm run typecheck
- npm test, or relevant unit/API command
- npx playwright test, or relevant Playwright command

Return:
- files changed
- Events API tests added/updated
- Events Playwright tests added/updated
- backward compatibility tests added/updated
- product bugs found/fixed
- Events coverage map
- known missing product paths not covered because they are not implemented
- verification results

Do not push or merge.
```

---

# Prompt 06 — Final Full Verification, Failure Loop, and Coverage Report

```text
Model: GPT-5.5
Reasoning: High

Admin / Voice App

Run the final hardening loop for the full Voice / Booth Audio production testing suite.

Goal:
Make the suite green, fix legitimate root-cause failures, remove flaky/duplicated tests, and produce the final coverage report.

Scope:
- Run all available validation/test commands.
- Fix test failures caused by real bugs or broken test setup.
- Keep fixes scoped and production-safe.
- Do not add new product scope.
- Do not push or merge.

Required verification commands:
Run these if available:
- npx prisma validate
- npx prisma generate
- npm run typecheck
- npm test
- npx playwright test

If repo-specific commands differ, run the closest available commands and document exactly what happened.

Failure handling:
- If a test fails because the test is wrong, fix the test.
- If a test fails because the product has a real bug, fix the smallest correct root cause.
- If a test fails because current product behavior is intentionally different, update the test to match current intended behavior and document it.
- If Playwright flakes, fix selectors/setup/waits instead of hiding the test.
- Do not skip important tests just to get green.
- Only skip when the product path is genuinely not implemented, and document the gap clearly.

Final cleanup:
- remove unused helpers
- remove debug logs added during testing
- remove temporary bypasses
- make test names clear
- ensure fixtures clean up data
- ensure no real external provider calls remain
- ensure no production test hooks or bypass headers were introduced

Final report must include:
1. Branch name.
2. Files changed.
3. Test files added/updated.
4. Helpers/fixtures/mocks added.
5. Product code changed, if any.
6. Bugs found.
7. Bugs fixed.
8. Known issues not fixed.
9. Any skipped tests and why.
10. Total unit/API test count if available.
11. Total Playwright test count if available.
12. Exact verification command results.
13. Coverage map:
   - SMB setup
   - SMB survey lifecycle
   - QR/link/kiosk launch
   - kiosk respondent happy path
   - kiosk failure handling
   - audio upload
   - transcription
   - analysis
   - insights/dashboard
   - account settings
   - auth/tenant isolation
   - Events mode
   - Events token links, if implemented
   - backward compatibility
14. Remaining recommended follow-up prompts, if any.

Hard requirements:
- Preserve /kiosk?eventId=... behavior.
- Preserve existing Response/Answer/Transcript/Analysis pipeline.
- Do not create duplicate systems.
- Do not rely on real external services.
- Enforce protected business/security rules server-side.
- Keep tests deterministic and isolated.
- Do not hide failures.
- Do not push or merge.
```

---

# Optional Prompt 07 — Opus Review After Codex Finishes

Use this only after Codex has completed Prompt 06 and produced a final report.

```text
Model: Claude Opus
Reasoning: High

Review the completed Voice / Booth Audio testing implementation.

Task:
Audit the final Codex report and changed files for test quality, coverage gaps, security gaps, and overbroad product changes.

Focus areas:
- Does the suite include real Playwright journey testing, not just page-load smoke tests?
- Does it cover SMB setup, survey lifecycle, QR/kiosk, respondent flow, insights, settings, auth/tenant isolation, Events mode, and backward compatibility?
- Are external providers mocked correctly?
- Are tests deterministic and isolated?
- Did Codex accidentally create duplicate kiosk/event/response systems?
- Did Codex preserve /kiosk?eventId=... behavior?
- Did Codex fix auth/account scope bugs at the server layer instead of hiding them in UI tests?
- Are any important routes still untested?
- Are there brittle selectors or fake passing tests?
- Are any skips unjustified?

Return:
1. Overall pass/fail recommendation.
2. Critical issues before merge.
3. Important but non-blocking issues.
4. Missing tests to add.
5. Product-code changes that need closer review.
6. Suggested final cleanup prompt if needed.

Do not implement changes in this review pass.
```
