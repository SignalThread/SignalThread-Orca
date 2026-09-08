# Load Testing Cleanup Tracker

## Temporary instrumentation added
- `app/api/campaigns/route.ts`
  - Added per-request query counter logs before each Supabase query in `GET`.
  - Added end-of-request totals: `[SUPABASE QUERY COUNT]` and `[ROUTE DURATION]`.
  - Status: REMOVE after profiling pass.
- `app/api/exhibitor/documents/route.ts`
  - Added labeled per-query Supabase logs in `GET` and `POST`.
  - Added end-of-request total query count logs.
  - Status: REMOVE after profiling pass.
- `app/api/exhibitor/leads/list/route.ts`
  - Added per-request query counter logs before each Supabase query in `GET`.
  - Added end-of-request totals: `[SUPABASE QUERY COUNT]` and `[ROUTE DURATION]`.
  - Status: REMOVE after benchmark route is retired.

## Temporary load test routes
- `app/api/exhibitor/leads/list/route.ts`
  - Purpose: benchmark API mirror of exhibitor leads page query workload.
  - Delete after testing: YES (unless promoted to permanent API contract).

## Temporary auth / dev bypass dependencies
- `lib/auth/resolveApiSession.ts`
  - Uses `x-dev-bypass: true` to return fake exhibitor session in dev/testing context.
  - Classification: TEMP test-only behavior in centralized auth helper (REMOVE or hard-gate after load testing).
- `middleware.ts`
  - API bypass for requests with `x-dev-bypass: true` plus debug header log.
  - Classification: TEMP test-only middleware behavior (REMOVE after load testing).
- `load-tests/*.js` (scripts listed below)
  - Send `x-dev-bypass: true` header to exercise authenticated endpoints in local load runs.
  - Classification: KEEP for local perf harness; header usage can be removed when real auth load testing is enabled.

## Temporary scripts
- `load-tests/campaigns-only.js`
  - Endpoint tested: `GET /api/campaigns`
  - Action: KEEP (replace placeholder token value before use).
- `load-tests/signals-only.js`
  - Endpoint tested: `GET /api/signals`
  - Action: KEEP (replace placeholder token value before use).
- `load-tests/leads-only.js`
  - Endpoint tested: `GET /api/exhibitor/leads/list`
  - Action: KEEP (new benchmark target).
- `load-tests/leads-post-burst.js`
  - Endpoint tested: configurable lead-create path (default `/api/exhibitor/leads`).
  - Action: KEEP (confirm final create endpoint before repeated runs).
- `load-tests/voice-upload-burst.js`
  - Endpoint tested: `POST /api/conversations/upload` (multipart `file` + `leadId`).
  - Action: KEEP.
- `load-tests/event-spike-mixed.js`
  - Endpoints tested:
    - lead create POST (configurable)
    - `POST /api/conversations/upload`
    - read mix across `/api/exhibitor/documents`, `/api/signals`, `/api/campaigns`
  - Action: KEEP as composite spike profile.
- `load-tests/fixtures/voice-fixture.m4a`
  - Purpose: deterministic local multipart audio fixture for upload tests.
  - Action: KEEP.
- `scripts/audit-r2-voice-uploads.ts`
  - npm script: `audit:r2:voice`
  - Purpose: one-off R2 multipart + object audit for voice upload validation.
  - Remove after: multipart uploads remain stable (no growth) across 2 consecutive load tests.

## Temporary log statements to remove
- [ ] `middleware.ts` — `console.log("DEV BYPASS HEADER:", request.headers.get("x-dev-bypass"));`
- [ ] `lib/auth/resolveApiSession.ts` — `console.log("DEV BYPASS HEADER: true");`
- [ ] `app/api/campaigns/route.ts` — `[SUPABASE QUERY N] ...` logs in `GET`
- [ ] `app/api/campaigns/route.ts` — `[SUPABASE QUERY COUNT] ...` log in `GET` finally block
- [ ] `app/api/campaigns/route.ts` — `[ROUTE DURATION] ...ms` log in `GET` finally block
- [ ] `app/api/exhibitor/documents/route.ts` — `[SUPABASE QUERY N] ...` logs in `GET`
- [ ] `app/api/exhibitor/documents/route.ts` — `[SUPABASE QUERY N] ...` logs in `POST`
- [ ] `app/api/exhibitor/documents/route.ts` — `[SUPABASE QUERY COUNT] ...` log in `GET` finally block
- [ ] `app/api/exhibitor/documents/route.ts` — `[SUPABASE QUERY COUNT] ...` log in `POST` finally block
- [ ] `app/api/exhibitor/leads/list/route.ts` — `[SUPABASE QUERY N] ...` logs in `GET`
- [ ] `app/api/exhibitor/leads/list/route.ts` — `[SUPABASE QUERY COUNT] ...` log in `GET` finally block
- [ ] `app/api/exhibitor/leads/list/route.ts` — `[ROUTE DURATION] ...ms` log in `GET` finally block

## Cleanup status
- [ ] campaigns instrumentation removed
- [ ] signals instrumentation removed
- [ ] leads instrumentation removed
- [ ] temporary benchmark routes removed
- [ ] load test scripts reviewed
- [ ] final retest completed after cleanup

## Dev Bypass + Leads API Load Testing (TEMP)
Added: 2026-03-20

### Files Modified
- lib/supabase/middleware.ts
- lib/auth/resolveApiSession.ts
- app/api/exhibitor/leads/list/route.ts
- load-tests/leads-only.js

### Changes Introduced
- Added support for `x-dev-bypass: true` header to skip auth for `/api/*`
- Modified middleware to return JSON 401 instead of redirect for API routes
- Added mock session in `resolveApiSession` for dev bypass
- Introduced hardcoded UUID for bypass user
- Created `/api/exhibitor/leads/list` endpoint mirroring RSC query
- Added load test script targeting new endpoint

### Why This Exists
- To enable accurate load testing without real auth
- To benchmark actual leads query behavior (not fake API path)

### Cleanup Required (MANDATORY BEFORE PROD)
- Remove or gate `x-dev-bypass` logic behind non-production check
- Remove mock session logic in `resolveApiSession`
- Restore strict auth behavior in middleware
- Delete temporary `/api/exhibitor/leads/list` route if not needed
- Remove load testing scripts or move to internal tooling

### Risk If Not Removed
- Auth bypass vulnerability
- Unauthorized API access
- Invalid test user leaking into production logic
