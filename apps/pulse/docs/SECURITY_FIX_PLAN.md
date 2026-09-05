# Security Fix Plan

Last updated: 2026-03-07
Source: `docs/SECURITY_CODE_AUDIT.md` (code-inspected findings only)

## Execution Plan

| Issue | Priority | Estimated effort | Recommended owner area | Dependency notes |
|---|---|---:|---|---|
| Protect `app/api/admin/accounts` with auth + super-admin role checks | P0 | 0.5-1 day | Platform API / Auth | Requires shared role source (`User.role`) and test coverage for admin vs non-admin |
| Disable or gate legacy public `app/api/events/*` data endpoints (responses/answers/analysis) | P0 | 1-2 days | Platform API | Coordinate frontend consumers before removal; temporary 401/403 gate can ship first |
| Enforce account membership on all `/api/app/*` routes (bind session user to `User.accountId`) | P0 | 2-3 days | Platform API / Auth | Introduce shared helper (e.g. `requireAccountAccess`) and migrate routes incrementally |
| Lock down account settings/branding APIs (`/api/app/account*`) and prevent cross-tenant slug access | P0 | 1-2 days | Dashboard API | Depends on membership helper; include regression tests for read/update endpoints |
| Restrict `/api/app/logo` object access to authorized account-scoped keys only | P0 | 1 day | Storage/API | Needs key-prefix convention check (`branding/<accountId>/...`) |
| Add rate limiting and abuse controls for costly public routes (`/api/tts`, `/api/answer/*`, `/api/response/create`, `/api/provision/start`) | P1 | 2-4 days | Platform API / Infra | Decide storage for counters (Redis/Upstash/DB); define per-IP and per-account quotas |
| Bound/validate all query/body inputs consistently (notably `days` in timeline/analysis) | P1 | 1-2 days | Platform API | Reuse shared Zod schemas; coordinate API error-shape standardization |
| Move `/api/answer/confirm` long-running transcription/analysis to async worker pipeline | P1 | 3-6 days | AI Pipeline / Backend | Requires queue/job orchestration and status polling contract |
| Restrict health diagnostics endpoint exposure (`/api/health/db`) and sanitize returned errors | P1 | 0.5-1 day | Platform API / Ops | May require internal auth token or environment gating |
| Redact sensitive logs (emails, analysis payloads) and disable client debug logs in production | P2 | 1-2 days | Platform API + Kiosk UI | Needs centralized logger or wrapper and production logging policy |
| Convert provisioning flow to transactional DB writes (`lib/provisioning.ts`) | P2 | 1-2 days | Provisioning/Backend | Requires transaction-safe handling for external side effects |
| Remove legacy drift artifacts (`.bak`, stale comments, unused modules) | P3 | 0.5-1 day | Platform maintainers | Safe cleanup after confirming no hidden references |

## Sequencing Guidance

1. Ship containment first (P0): close unauthenticated and cross-tenant data paths.
2. Add abuse/performance guardrails next (P1): rate limits, validation bounds, async processing.
3. Complete maintainability hardening (P2/P3): logging policy, transactions, drift cleanup.

## Acceptance Criteria (Minimum)

- All admin and account mutation routes return `401/403` for unauthorized users.
- No route returns transcripts/analysis without authenticated, account-authorized access.
- Attempting `?account=<other-tenant>` as non-admin fails consistently.
- Costly endpoints enforce throttling and emit clear `429` responses.
- Health and error responses do not expose internal stack traces or DB internals.
