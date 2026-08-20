# Planner Dash — Security & Customer Packet (Draft)

_Last reviewed: 2026-07-04. Source-backed draft for customer/procurement and
pen-test conversations. Statements are scoped to what the codebase demonstrates;
items not verified from source are called out as such — do not present those as
guarantees._

## 1. Product architecture

Planner Dash is a Next.js (App Router, Node runtime) application backed by
Postgres via Prisma (hosted on Supabase), with Cloudflare R2 for file storage,
Supabase Auth for identity, and SendGrid for transactional/marketing email.
Business logic lives in server-side services (`web/src/server/services/**`,
`web/lib/**`); API route handlers are thin and delegate to those services.

Core modules: Events, Run of Show (Matrix-2), Budget, Timeline, Documents,
Speakers (+ public speaker portal/intake), F&B catalog, Seating / Room Set,
Marketing, and Platform Admin.

## 2. Tenancy model

Data is scoped by **Organization → Event**. Records carry `orgId`/`eventId` and
queries are constrained by them. Cross-event access is prevented by filtering
reads/writes on `eventId` (e.g. a submission is looked up by
`{ id, budgetId }` where the budget is resolved from the event; document versions
are re-scoped to `events/{eventId}/documents/{documentId}/`).

## 3. Auth / access model

- Identity: Supabase Auth. Requests are resolved to an app user via
  `resolveRequestUser`.
- Authorization: enforced **in the application/service layer** via
  `assertEventAccessForUser(eventId, user, "read"|"write")` and module-specific
  guards (e.g. `assertBudgetAccessForEvent`). Roles include org-level roles and
  per-event roles (event editor / event viewer).
- **Not verified in this pass:** whether Postgres row-level security (RLS) is
  also configured at the database layer. Present the access model as
  application-enforced; confirm RLS separately before claiming defense-in-depth.

## 4. Event access & Platform Admin

Event-scoped roles gate reads vs. writes. Platform Admin surfaces
(`/platform/**`) provide org/account and membership management; membership
add/revoke validates identifiers server-side. Super-admin promotion is a
scripted operation, not a self-service UI.

## 5. Data storage

Application data is in Postgres (Supabase). Prisma manages schema via versioned
migrations (`web/prisma/migrations/`, ~53). Audit/activity trails exist for key
workflows (e.g. `BudgetActivity` on submit/approve/reject/revise; event and
speaker activity logs).

## 6. Document / file storage

Files are stored in Cloudflare R2. Uploads use presigned URLs. Server-side
validation enforces a size cap (50MB documents/speaker files; 5MB headshots) and
a MIME-type allowlist on both presign and finalize. Object keys are constructed
server-side from resource ids; the only user-derived component (filename) is
sanitized. Finalize re-scopes the object key to the owning event/document.
**Known gap:** the presigned PUT binds only a client-*claimed* size, not the
actual uploaded body (see §11).

## 7. Public token / speaker portal boundaries

- Public routes live under `/api/public/**` and never require planner auth.
- **Speaker portal tokens** are DB-backed, sha256-hashed at rest, generated from
  `randomBytes(32)`, and checked for expiry and revocation; re-minting revokes
  prior tokens. Portal actions operate strictly on the token's resolved
  event/speaker and enforce object-key and session-assignment scope.
- **Speaker intake tokens** are stateless HMAC-SHA256 with constant-time
  verification and a 7-day expiry; they **cannot be revoked** early (documented
  limitation; the portal-token system is the DB-backed successor).
- **Marketing unsubscribe tokens** are HMAC-signed, constant-time verified, and
  scoped to the encoded recipient.

## 8. Audit / activity behavior

State-changing workflows write activity rows inside the same transaction as the
mutation (e.g. budget submit/approve/reject/revise → `BudgetActivity`). This
provides an in-app audit trail; it is not a tamper-evident external audit log.

## 9. Backup / restore (assumptions & open questions)

Backups are expected to be provided by the managed Postgres host (Supabase) and
R2. **Not verified in this pass:** backup cadence, retention, and restore-drill
results. Confirm and document these with the hosting configuration before making
recovery commitments (RPO/RTO).

## 10. Security controls implemented

- Application-layer authorization on planner routes (read/write).
- Event/tenant scoping on reads and writes.
- Server-side upload size + MIME validation; server-derived, scoped object keys.
- Cross-event object-key scope check on document/budget finalize.
- Hashed, expiring, revocable speaker portal tokens; constant-time token checks.
- Baseline security headers (HSTS, X-Frame-Options SAMEORIGIN, nosniff,
  Referrer-Policy, Permissions-Policy) on all responses.
- Import row caps returning stable 413s.
- Timeline dependency cycle prevention; Matrix session partial-merge saves;
  budget CSV formula-injection neutralization.

## 11. Security controls pending

- **Rate limiting** — none in-app; needs a shared store / gateway (infra
  decision). Highest-priority operational gap.
- **Presigned upload size binding** — bind actual `ContentLength` or move to a
  POST policy with `content-length-range`.
- **Content-Security-Policy** — not enabled; needs a nonce / report-only rollout.
- **Unauthenticated headshot serving** (`/api/speaker-headshots/[...key]`) —
  relies on UUID unguessability; confirm as intended or gate it.
- **Intake-token revocation** — add, or migrate intake onto portal tokens.
- **DB-level RLS** — confirm whether it is configured.

## 12. Known exclusions / deferred risks

- Matrix **staffing** schema reconciliation is deferred (app writes the
  unmigrated `MatrixRowStaffAssignment`; see the staffing proposal).
- Several orphaned routes are retained pending a dedicated cleanup PR (see the
  dead-code inventory).
- Docs Hub approval production UX is a pending product decision (see that doc).

## 13. Pen-test packet notes

- **Route map:** planner APIs under `/api/events/[eventId]/**`; platform under
  `/api/admin/**` and `/platform/**`; public under `/api/public/**` (speaker
  portal/intake, marketing unsubscribe) plus `/api/speaker-headshots/[...key]`.
- **Test accounts needed:** org owner/admin, event editor, event viewer, an
  unrelated org user (for tenancy tests), and a valid speaker portal + intake
  token.
- **Modules in scope:** the Big 3 (Run of Show, Budget, Timeline), Documents,
  Speakers/portal, F&B, Seating/Room Set, Imports, Platform Admin.
- **Public/token flows in scope:** speaker portal (files/messages/documents/
  submission + presign), speaker intake (+ headshot presign), marketing
  unsubscribe, unauthenticated headshot serving.
- **Priority probes:** cross-event/tenant access on every `[eventId]` route;
  object-key scoping on finalize/download; token expiry/revocation and
  brute-force (no rate limiting); upload size/type bypass via the presigned PUT.
- **Known-open items to hand the tester:** the §11 pending controls and the
  deferred staffing schema issue.
