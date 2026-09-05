# Security and Code Audit

Last reviewed: 2026-03-07  
Scope reviewed: `app/**`, `lib/**`, `prisma/**`, `types/**` (implementation only, no assumptions beyond code).

## Executive Summary

**Overall risk level: HIGH**

The codebase has a functional core pipeline, but production security posture is currently weakened by inconsistent API protection, weak tenant isolation enforcement, and several publicly reachable high-impact routes.

### Top 5 risks

1. Unprotected admin account management API (`/api/admin/accounts`) allows unauthenticated account listing and creation.
2. Public legacy analytics APIs (`/api/events/*`) expose response IDs, transcripts, and analysis data with no auth.
3. Account settings/branding APIs (`/api/app/account*`) are unauthenticated and slug-driven, enabling cross-tenant read/write if slug is known.
4. Authorization model relies on `account` query param in many routes; authenticated user identity is not consistently bound to `User.accountId`.
5. Expensive public endpoints (`/api/tts`, kiosk upload/process endpoints, `/api/provision/start`) have no rate limiting or abuse controls.

### Top 5 code health issues

1. Legacy/current model drift (`Session/*` + `Response/Answer/*`) increases maintenance and security policy inconsistency.
2. Dead/unused or drifted code: `lib/supabase/middleware.ts`, `lib/validation.ts`, no-op helpers, and `.bak` files.
3. Stale comments/documentation in active code paths (e.g., auto-create/seed wording no longer true).
4. Validation patterns are inconsistent (some routes use Zod, many use ad-hoc checks or none).
5. Long synchronous request path in `/api/answer/confirm` creates reliability and scalability risk.

## Findings by Severity

## Critical

### 1) Unauthenticated admin account API
- **Severity:** Critical
- **Why it matters:** Anyone can list all tenant accounts and create new accounts.
- **Affected files:** `app/api/admin/accounts/route.ts:14`, `app/api/admin/accounts/route.ts:72`, `middleware.ts:4`
- **Exact issue:** `GET` and `POST` handlers do not verify session or role. Comments claim middleware enforcement, but root middleware is a no-op.
- **Recommended fix:** Add explicit auth (`supabase.auth.getUser`) + `User.role === SUPER_ADMIN` checks in handler; enforce route-level protection in middleware as defense-in-depth.

### 2) Public legacy response/analysis data exposure
- **Severity:** Critical
- **Why it matters:** Transcripts, analysis outputs, and response metadata are accessible without authentication.
- **Affected files:**
- `app/api/events/[eventId]/responses/route.ts:15`
- `app/api/events/[eventId]/responses/[responseId]/route.ts:15`
- `app/api/events/[eventId]/answers/route.ts:15`
- `app/api/events/[eventId]/analysis/route.ts:16`
- **Exact issue:** No auth/tenant checks on these routes; endpoints return sensitive response content (`transcript`, `analysis`, `anonymousId`, `objectKey`).
- **Recommended fix:** Restrict or remove legacy `/api/events/*` endpoints; migrate all consumers to protected `/api/app/*` endpoints with account/user enforcement.

### 3) Unauthenticated account settings and branding mutation
- **Severity:** Critical
- **Why it matters:** Cross-tenant settings (branding/consent/logo) can be read/modified by account slug alone.
- **Affected files:**
- `app/api/app/account/route.ts:13`
- `app/api/app/account/settings/route.ts:23`, `app/api/app/account/settings/route.ts:85`
- `app/api/app/account/logo-upload/route.ts:17`
- `app/api/app/account/logo-presign/route.ts:23`
- **Exact issue:** No Supabase auth checks; account selected via query/body slug. Writes occur without identity validation.
- **Recommended fix:** Require authenticated session, load Prisma `User`, enforce `user.accountId === resolvedAccount.id` (unless SUPER_ADMIN).

## High

### 4) Missing user-to-account authorization binding in "protected" routes
- **Severity:** High
- **Why it matters:** Logged-in users can potentially access other tenants by changing `?account=<slug>`.
- **Affected files:**
- `app/api/app/events/route.ts:11`
- `app/api/app/events/[eventId]/route.ts:14`
- `app/api/app/locations/route.ts:11`
- `app/api/app/locations/[locationId]/route.ts:14`
- **Exact issue:** Routes verify user session but do not verify the session user's Prisma `User.accountId` matches resolved account slug.
- **Recommended fix:** Introduce shared account authorization middleware/helper that resolves account slug and verifies user membership/role.

### 5) Arbitrary object-key proxy via logo route
- **Severity:** High
- **Why it matters:** Any bucket object can be fetched if key is known; route is unauthenticated and not prefix-constrained.
- **Affected files:** `app/api/app/logo/route.ts:12`, `app/api/app/logo/route.ts:26`
- **Exact issue:** `key` query param is passed directly into `GetObjectCommand` without auth, prefix checks, or ownership validation.
- **Recommended fix:** Require auth; allow only `branding/<accountId>/` keys for authorized account; reject non-image content types.

### 6) No rate limiting/abuse controls on costly public endpoints
- **Severity:** High
- **Why it matters:** Enables cost amplification (OpenAI + storage), spam onboarding, and service degradation.
- **Affected files:**
- `app/api/tts/route.ts:92`
- `app/api/response/create/route.ts:16`
- `app/api/answer/presign/route.ts:45`
- `app/api/answer/complete/route.ts:35`
- `app/api/answer/confirm/route.ts:23`
- `app/api/provision/start/route.ts:14`
- **Exact issue:** No request throttling, IP/user quotas, challenge, or abuse detection.
- **Recommended fix:** Add global + endpoint-specific rate limits (IP + account/event dimensions), plus request budgets for TTS/AI endpoints.

### 7) Unbounded `days` input enables expensive loops/queries
- **Severity:** High
- **Why it matters:** Large `days` can create excessive CPU/memory usage and large DB scans.
- **Affected files:**
- `app/api/app/events/[eventId]/timeline/route.ts:63`
- `app/api/app/events/[eventId]/timeline/route.ts:90`
- `app/api/app/events/[eventId]/analysis/route.ts:24`
- **Exact issue:** `days` is parsed without strict bounds in timeline/analysis; timeline allocates a map/loop over requested day count.
- **Recommended fix:** Validate and clamp `days` (e.g., 1..365), reject invalid/NaN values.

## Medium

### 8) Synchronous transcription+analysis in request path
- **Severity:** Medium
- **Why it matters:** Long external calls increase timeout risk, tie up server resources, and degrade UX under load.
- **Affected files:** `app/api/answer/confirm/route.ts:119`, `app/api/answer/confirm/route.ts:192`
- **Exact issue:** Confirm endpoint performs full Whisper + GPT processing synchronously.
- **Recommended fix:** Move processing to background queue/worker; return 202 + polling status.

### 9) Validation inconsistency and MIME allowlist drift
- **Severity:** Medium
- **Why it matters:** Upload acceptance policy is inconsistent; easier to introduce unsafe input handling.
- **Affected files:**
- `app/api/answer/presign/route.ts:10` (accepts any `mimeType` string)
- `lib/validation.ts:19` (stricter schema not used)
- **Exact issue:** Reference validation module is unused; API route duplicates and weakens MIME checks.
- **Recommended fix:** Centralize schemas in `lib/validation.ts`, enforce allowlists in all upload routes.

### 10) Logging/privacy leakage in prod paths
- **Severity:** Medium
- **Why it matters:** Sensitive operational/user data can leak via logs or browser console on shared devices.
- **Affected files:**
- `components/kiosk/GoogleReviewHelper.tsx:26`, `components/kiosk/GoogleReviewHelper.tsx:71`
- `app/auth/callback/route.ts:68`
- `app/api/auth/link-user/route.ts:63`, `app/api/auth/link-user/route.ts:110`
- `app/api/health/db/route.ts:33`, `app/api/health/db/route.ts:61`
- `app/api/app/events/[eventId]/signals/route.ts:82`
- **Exact issue:** Debug logs include answer analysis payloads, emails, DB connection metadata, and raw error messages.
- **Recommended fix:** Add structured logger with redaction, environment-gated debug logging, and sanitized client-facing errors.

### 11) Provisioning is not transactional
- **Severity:** Medium
- **Why it matters:** Partial failure can leave orphaned account/location/event/provision records.
- **Affected files:** `lib/provisioning.ts:85`, `lib/provisioning.ts:104`, `lib/provisioning.ts:118`, `lib/provisioning.ts:169`
- **Exact issue:** Multi-step create flow runs without Prisma transaction; errors after partial writes return failure but do not roll back.
- **Recommended fix:** Use `prisma.$transaction` for DB writes; separate external side effects with retry-safe outbox/job pattern.

### 12) Unauthenticated health endpoint reveals internals
- **Severity:** Medium
- **Why it matters:** Attackers can probe DB state and error messages.
- **Affected files:** `app/api/health/db/route.ts:14`, `app/api/health/db/route.ts:57`
- **Exact issue:** Public endpoint returns DB error code/message and logs URL-derived metadata.
- **Recommended fix:** Restrict endpoint to internal/admin use; return generic status externally.

## Low

### 13) Legacy drift and dead-code artifacts
- **Severity:** Low
- **Why it matters:** Increases confusion, inconsistent behavior, and future security regressions.
- **Affected files:**
- `app/app/events/[eventId]/page.tsx.bak`
- `scripts/cleanup-duplicate-questions.ts.bak`
- `lib/supabase/middleware.ts:4` (not used)
- `lib/event.ts:28` (no-op helper)
- `app/api/events/[eventId]/questions/route.ts:13` (stale comment)
- `types/index.ts:1` (legacy model exports)
- **Exact issue:** Repo contains backup files, unused utilities, stale comments, and legacy type/model references.
- **Recommended fix:** Remove backups/dead code, align comments with behavior, complete migration away from legacy model artifacts.

### 14) Inconsistent error response policy
- **Severity:** Low
- **Why it matters:** Leaks internals and makes clients brittle.
- **Affected files:** multiple API routes returning `error.message` directly (e.g., `app/api/admin/accounts/route.ts:60`, `app/api/app/account/settings/route.ts:132`, `app/api/tts/route.ts:150`).
- **Exact issue:** Mixed response shape and direct propagation of internal exception messages.
- **Recommended fix:** Standardize API error contract and sanitize internal exceptions.

## Security Review Areas

## Authentication
- Confirmed: Supabase OTP/session is wired (`/login`, `/auth/callback`, `/api/auth/link-user`).
- Confirmed gap: root middleware does not enforce auth (`middleware.ts:4`).

## Authorization
- Confirmed: Some routes check session only.
- Confirmed gap: role checks missing on `/api/admin/accounts`; account membership checks generally missing.

## Tenant/account scoping
- Confirmed pattern: heavy reliance on `?account=<slug>`.
- Confirmed gap: slug is often trusted without validating `User.accountId` ownership.

## Public vs protected routes
- Confirmed public-sensitive routes exist (`/api/events/*`, `/api/app/account*`, `/api/app/logo`, `/api/health/db`).

## Supabase browser/client exposure
- Confirmed: Browser uses anon key via `NEXT_PUBLIC_*`, which is expected.
- Confirmed: No service role key usage found in application runtime paths.

## RLS implications
- Confirmed: No RLS policies in repo migrations.
- Confirmed implication: Isolation depends on application logic, not DB-level RLS.

## File upload / presign flow
- Confirmed: Presigned upload flow exists and checks response/question existence.
- Confirmed gaps: endpoints are public, no abuse limits, MIME policy is inconsistent.

## API input validation
- Confirmed: Mixed validation quality (strong Zod in some routes, ad-hoc or absent in others).

## Secret handling
- Confirmed: `.env` and `.env.local` are not tracked in git (checked via `git ls-files`).
- Confirmed risk: Some runtime errors and health routes expose too much operational detail.

## Data exposure risks
- Confirmed: transcripts/analysis are publicly retrievable through legacy routes.

## Logging of sensitive data
- Confirmed: Email/debug/analysis payload logging exists in both server and client paths.

## Code Health Review Areas

## Duplicate logic
- Repeated account+slug resolution logic across many routes without shared authz helper.

## Legacy vs current model drift
- `Session/*` and `Response/Answer/*` coexist; old and new API surfaces remain active.

## Stale comments
- Multiple comments describe behavior no longer implemented (`getOrCreate`, auto-seed wording).

## Dead code
- Unused middleware/validation modules and `.bak` files are present.

## Inconsistent service patterns
- Some routes rely on Zod and strict checks; others parse unvalidated body/query.

## Missing abstractions
- No shared policy layer for authz + tenant ownership; logic is duplicated and uneven.

## Synchronous bottlenecks
- `/api/answer/confirm` performs full external AI pipeline inline.

## Maintainability risks
- Route-level behavior diverges significantly across `app`, `admin`, `kiosk`, and legacy `events` APIs.

## Recommended Fix Plan

## Fix now
- Lock down `/api/admin/accounts` with strict super-admin auth checks.
- Remove or protect legacy `/api/events/*` endpoints exposing transcripts/analysis.
- Protect `/api/app/account*` and `/api/app/logo` with auth + account ownership checks.
- Implement shared authz helper (`requireAccountAccess`) and apply to all `/api/app/*` routes.
- Add rate limiting to `/api/tts`, `/api/answer/*`, `/api/response/create`, `/api/provision/start`.

## Fix next
- Bound and validate all query params (`days`, etc.) and standardize Zod across routes.
- Move answer processing to async workers/queue.
- Restrict health endpoint to internal/admin-only access and sanitize responses.
- Replace verbose/debug logs with redacted structured logs.

## Fix later
- Complete legacy model/API deprecation (`Session/*`, old `/api/events/*` consumers).
- Remove dead files/modules and stale comments.
- Add contract tests for authz, tenant isolation, and route protection matrices.

## Uncertainty Notes

- No deployment config (edge firewall/WAF/reverse-proxy rules) was inspected here; external protections may exist but are not visible in this codebase.
- If RLS is configured directly in managed DB outside repo migrations, it was not observable from this source review.
