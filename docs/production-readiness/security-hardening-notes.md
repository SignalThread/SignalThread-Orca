# Security Hardening Notes — Upload / Public Token / Rate Limit / Headers

_Last reviewed: 2026-07-04 (branch `chore/production-readiness-audit`)._

Audit of the upload (R2 presign/finalize/download), public-token (speaker
portal/intake), rate-limit, and security-header surfaces, with the narrow
no-schema fixes applied this pass and the deferred policy/infra decisions.

## Implemented this pass

1. **Baseline security headers** (`web/next.config.ts`) — `Strict-Transport-Security`,
   `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
   `Permissions-Policy`, applied to every route via `headers()`. No middleware
   previously set these.
2. **Document/budget finalize object-key scoping** (`web/src/server/services/documents.ts`)
   — `finalizeDocumentUpload` now re-scopes the client-supplied `objectKey` to
   `events/${eventId}/documents/${documentId}/` and rejects `..`. Previously a
   caller with write access to event A could finalize a version whose key pointed
   at another event's stored object (which the download route would later
   re-sign). Budget file finalize delegates to the same function, so it is covered
   too. Mirrors the existing speaker-file `assertObjectKeyScope` guard.

## Verified already safe (no change needed)

- **Presign size/type validation** — `validateUploadConstraints` (50MB +
  MIME allowlist) is enforced on document, budget, speaker-file, and headshot
  presign + finalize paths.
- **Object-key construction** — keys are built server-side from server-controlled
  ids; the only user-derived part (filename) passes through `normalizeFilename`,
  so path traversal is not possible.
- **Planner download/finalize access** — all gate on `resolveRequestUser` +
  `assertEventAccessForUser`/`assertBudgetAccessForEvent` before returning a URL.
- **Speaker portal token** — DB-backed, sha256-hashed at rest, `randomBytes(32)`,
  with expiry + revocation checks and prior-token revocation on re-mint.
- **Marketing unsubscribe token** — HMAC signed, constant-time compare, scoped to
  the encoded recipient.
- **Public route scoping** — no `web/app/api/public/**` route calls
  `resolveRequestUser`; each operates strictly on the token's resolved
  `eventId`/`speakerId`, and portal uploads additionally enforce object-key scope
  and speaker-session assignment.

## Deferred — implementable but needs coordination/testing

- **Presigned uploads bind only a client-*claimed* size, not the actual body.**
  `createPresignedUpload` signs a `PutObjectCommand` with `ContentType` but no
  `ContentLength`, so the presigned PUT URL does not constrain the uploaded
  object's size — a client can claim 1KB and PUT gigabytes. Fix is narrow (sign
  `ContentLength`, or switch to a presigned POST with a `content-length-range`
  policy) but changes the client upload contract and needs R2 integration testing,
  so it was not done blind under the "do not break uploads" rule. **Recommended
  next.**

## Deferred — policy / infra decisions

- **No rate limiting anywhere.** Public unauthenticated endpoints
  (`/api/public/speaker-intake|speaker-portal/*`, marketing unsubscribe) and
  costly authenticated ones (`/api/admin/invite-user`, all presign routes,
  `/api/copilot/*`, `/api/room-set/*`) have none. A real limiter needs a shared
  store (Upstash Redis / Vercel KV) or gateway-level limits — a package + infra
  decision outside this no-package pass. Highest-priority operational gap.
- **`/api/speaker-headshots/[...key]` is unauthenticated** — it validates only the
  key shape and 307-redirects to a presigned R2 GET; access rests on UUID
  unguessability. Likely intentional (headshots render in the public portal) but
  should be an explicit product decision.
- **Speaker intake token has no revocation** — it is a stateless 7-day HMAC, so a
  link cannot be invalidated before expiry. The DB-backed portal-token system is
  the intended replacement; decide whether to migrate intake onto it.
- **No Content-Security-Policy.** A strict CSP needs a nonce / report-only rollout
  to avoid breaking Next.js inline scripts/styles — a separate project, not a
  one-line config change.
