# Voice Full Testing Brief

## Purpose

We are doing a full production-grade testing push for the Voice / Booth Audio product across both SMB and Events mode.

This is not a small regression pass. The goal is to stop under-testing the Voice product and bring it closer to the standard we already used for Planner Dash and Lead Retrieval: full journey coverage, backend/API coverage, service/unit coverage, and regression coverage around the riskiest product paths.

## What We Are Testing

The test suite should cover the full Voice product surface:

- SMB / retail-style voice survey setup
- Events / event-intelligence voice survey setup
- Anonymous kiosk capture
- QR and public survey links
- consent, branding, and question voice behavior
- response creation
- answer upload
- transcription
- analysis
- dashboard insights
- locations / teams
- account settings
- auth and tenant isolation
- admin / provisioning flows
- backward compatibility for existing kiosk links

## Journey Testing Is Required

Journey testing is a core requirement of this effort.

We are not only adding isolated unit tests. We need real end-to-end user journeys that prove the product works the way a customer, respondent, operator, and admin would actually use it.

Required journey testing includes:

1. **SMB setup journey**
   - login
   - create or confirm a Location / Team
   - create a survey
   - add questions
   - choose and preview question voice
   - save survey
   - confirm it appears on the dashboard

2. **SMB survey lifecycle journey**
   - create draft survey
   - edit draft survey
   - activate survey
   - verify active survey rules
   - verify completed/read-only behavior where applicable
   - delete draft survey where allowed

3. **QR and kiosk launch journey**
   - open QR action
   - verify QR modal actions
   - copy/open kiosk link
   - verify correct survey/event loads

4. **Kiosk respondent journey**
   - open public kiosk
   - accept/decline consent
   - play/hear questions
   - record answers with mocked browser media
   - upload answers
   - complete response
   - see thank-you state

5. **Kiosk failure journey**
   - microphone denied
   - upload failure
   - transcription/analysis failure
   - no questions available
   - retry behavior without duplicate completed responses

6. **Insights journey**
   - seed completed processed responses
   - open analytics
   - verify counts, pulse, trends, themes, recommendations, and response drilldown where available

7. **Account settings journey**
   - edit locations/teams
   - edit consent screen
   - edit branding
   - upload logo through mocked upload path
   - verify billing/users surfaces where implemented

8. **Auth and tenant isolation journey**
   - account A can access account A
   - account A cannot access account B
   - unauthenticated users cannot access protected app/admin pages
   - public kiosk stays public but exposes only safe survey data

9. **Events mode journey**
   - create/seed EVENTS account
   - create event voice survey
   - test SurveyTarget / Survey / PublicSurveyLink paths where implemented
   - launch event survey kiosk
   - verify event-specific questions and response linkage
   - verify Events language remains event-intelligence oriented

10. **Backward compatibility journey**
   - existing `/kiosk?eventId=...` links still work
   - old QR links still resolve
   - event-level questions still load
   - existing response/answer/transcript/analysis data still aggregates

## Why We Are Looping

This is too large and risky for one giant implementation prompt.

We should split the work into multiple docs/prompts so each pass has a clear scope, clear acceptance checks, and a clean final report.

The work should still be comprehensive, but it should be executed in loops:

1. **Brief / scope doc** — this document.
2. **Audit prompt** — identify exact current test setup, files, commands, gaps, fixtures, and risks.
3. **Test foundation prompt** — add mocks, factories, fixtures, auth helpers, media mocks, and cleanup utilities.
4. **Unit/service test prompt** — cover core business logic and helper behavior.
5. **API/integration test prompt** — cover route behavior, account scope, kiosk APIs, Events APIs, and provisioning APIs.
6. **Journey testing prompt** — add Playwright end-to-end journeys across SMB, kiosk, insights, settings, auth, Events, and backward compatibility.
7. **Hardening prompt** — run all verification, fix failures, remove flake, and produce final report.

## Testing Layers Required

The final testing package should include:

- unit tests
- service tests
- API / integration tests
- Playwright journey tests
- auth and tenant isolation tests
- regression tests for known risky flows
- deterministic mocked external-provider tests

External systems should be mocked:

- OpenAI transcription
- OpenAI chat analysis
- TTS generation
- object storage / S3 / R2 / MinIO
- Supabase session / OTP behavior
- Stripe billing portal where needed
- browser MediaRecorder in Playwright

## Product Behavior That Must Be Preserved

Do not break existing working behavior.

Must preserve:

- `/kiosk?eventId=...`
- existing anonymous kiosk flow
- existing Response / Answer / AnswerTranscript / AnswerAnalysis pipeline
- existing dashboard insight aggregation
- existing SMB survey behavior
- existing QR/link behavior
- legacy compatibility where the current product still depends on it

## Events Mode Guardrails

Events mode should be tested as event intelligence, not generic SMB reviews.

Events copy and behavior should stay focused on:

- attendee sentiment
- live event feedback
- onsite friction
- session-level insight
- location-level insight
- sponsor/exhibitor value
- real-time operations
- action briefs

Avoid drifting Events mode into:

- Google reviews
- storefront reviews
- reputation management
- local business-only feedback language

## Engineering Standard

This testing work should follow the project engineering bar:

- deterministic tests
- no hidden state leakage
- no order-dependent tests
- server-side enforcement for business rules
- canonical helpers for auth/account scope where needed
- route handlers kept thin
- no duplicate systems
- no broad refactors
- no real external-service calls
- no fake passing tests that mock the business rule being tested

## Definition of Done

The testing push is done when we have green verification across the relevant commands and coverage for:

- SMB setup
- SMB survey lifecycle
- QR/kiosk launch
- kiosk respondent flow
- upload/transcription/analysis
- insights/dashboard
- account settings
- auth and tenant isolation
- Events mode
- backward compatibility

Final report should include:

- branch name
- files changed
- test files added/updated
- helpers added
- product bugs found
- product bugs fixed
- known remaining gaps
- verification results
- total test counts where available
