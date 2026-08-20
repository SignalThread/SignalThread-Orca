# Incident Runbooks & Rollback Plan

_Last reviewed: 2026-07-04. Stack: Next.js (Vercel-style host), Prisma + Postgres
(Supabase), Cloudflare R2 storage, Supabase Auth, SendGrid email._

These runbooks are deliberately tool-agnostic about observability: **no external
monitoring/alerting is configured in-repo**, so "diagnostics" below mean host
logs, direct DB queries, and manual checks. Fill the owner/escalation
placeholders per rotation. Never paste secrets, tokens, or connection strings
into tickets or chat.

Severity guide: **SEV1** customer-facing outage / data exposure · **SEV2** major
feature broken · **SEV3** degraded / partial.

---

## 1. Bad deploy

- **Symptoms:** errors/5xx spike right after a release; health check (`/login` →
  `/dashboard`) fails.
- **Severity:** SEV1 if app is down.
- **Contain:** re-deploy the previous known-good build/tag immediately (see
  Release checklist §4). Freeze further deploys.
- **Diagnose:** compare the failing release commit to the last good one; read
  host build/runtime logs for the first error.
- **Remediate:** fix forward on a branch; re-run `npm run verify` + `test:e2e:p0`
  before redeploying.
- **Customer comms:** if customer-visible >5 min, post a brief status note.
- **Owner / escalation:** _<release owner>_ → _<eng lead>_.
- **Follow-up:** why did `verify`/e2e not catch it? Add a regression test.

## 2. Failed migration

- **Symptoms:** `prisma migrate deploy` errors, or app throws Prisma "column/table
  does not exist" after deploy.
- **Severity:** SEV1.
- **Contain:** stop the rollout. If the app was switched before migration
  completed, roll the **app** back to the schema-compatible version.
- **Diagnose:** `npx prisma migrate status` (uses `DIRECT_URL`); inspect the
  partially-applied migration; check the `_prisma_migrations` table for a failed
  row.
- **Remediate:** resolve with `prisma migrate resolve` only with a fresh backup in
  hand. Prefer additive, reversible migrations; never `migrate reset` in prod.
- **Comms:** internal until data integrity is confirmed.
- **Owner / escalation:** _<DB owner>_ → _<eng lead>_.
- **Follow-up:** add the missing backward-compatibility (nullable/backfill) and a
  migration review step.

## 3. App outage (site down / 5xx across the board)

- **Symptoms:** all routes 5xx or time out.
- **Severity:** SEV1.
- **Contain:** confirm it is app vs. dependency (DB/Auth/R2). If a recent deploy,
  roll back (§1).
- **Diagnose:** host logs; is the process booting? env vars present? DB reachable?
- **Remediate:** restore the failing dependency or roll back.
- **Comms:** status note for a sustained outage.
- **Owner / escalation:** _<on-call>_ → _<eng lead>_.
- **Follow-up:** capture root cause; add a health signal.

## 4. Database connectivity outage

- **Symptoms:** Prisma connection errors / pool timeouts; reads and writes fail.
- **Severity:** SEV1.
- **Contain:** check Supabase status/dashboard; verify the pooled `DATABASE_URL`
  host is reachable and within connection limits.
- **Diagnose:** connect via `DIRECT_URL` from a trusted host; check active
  connections and Supabase incident status.
- **Remediate:** restore/scale the database; if pool exhaustion, reduce
  concurrency or restart the app to reset pools.
- **Comms:** SEV1 note if sustained.
- **Owner / escalation:** _<DB owner>_ → _<eng lead>_.
- **Follow-up:** review pool sizing; consider connection-limit alerts.

## 5. R2 / upload-storage failure

- **Symptoms:** presign or download routes fail; documents/speaker files won't
  upload or open.
- **Severity:** SEV2 (core app still works).
- **Contain:** confirm R2 credentials/bucket/endpoint env are correct and the
  bucket is reachable; check Cloudflare status.
- **Diagnose:** exercise a document presign → PUT → finalize manually; inspect the
  storage error. Note finalize now scope-checks object keys.
- **Remediate:** rotate/restore credentials; re-point endpoint if changed.
- **Comms:** notify affected users that uploads are temporarily unavailable.
- **Owner / escalation:** _<storage owner>_ → _<eng lead>_.
- **Follow-up:** consider retry/backoff and a storage health check.

## 6. Auth / session failure

- **Symptoms:** users can't log in; valid sessions rejected; planner routes return
  401/403.
- **Severity:** SEV1 for login outage.
- **Contain:** check Supabase Auth status and that
  `NEXT_PUBLIC_SUPABASE_URL`/anon/service-role keys are correct and unexpired.
- **Diagnose:** reproduce login; inspect `resolveRequestUser` failures in logs
  (reason/hint fields).
- **Remediate:** fix env/keys; if a bad access change shipped, roll back.
- **Comms:** SEV1 note.
- **Owner / escalation:** _<auth owner>_ → _<eng lead>_.
- **Follow-up:** add an auth smoke check to the health path.

## 7. Data incident / suspected cross-tenant exposure

- **Symptoms:** a user reports seeing another org's/event's data, or a report
  shows mismatched scoping.
- **Severity:** SEV1 — treat as a security incident.
- **Contain:** capture evidence (request, account, resource ids); do **not**
  delete data. If an endpoint is leaking, disable/guard it immediately.
- **Diagnose:** confirm the failing access path bypassed
  `assertEventAccessForUser` / event-scoped queries; identify blast radius by
  querying affected records.
- **Remediate:** patch the scope check; add a regression test; audit siblings.
- **Comms:** follow the org's breach-notification policy; involve
  security/legal before any customer statement.
- **Owner / escalation:** _<security lead>_ (immediate).
- **Follow-up:** post-incident review; tenancy test coverage for the path.

## 8. Leaked secret

- **Symptoms:** a key/token appears in a commit, log, screenshot, or ticket.
- **Severity:** SEV1.
- **Contain:** **rotate the secret immediately** (Supabase keys, R2 creds,
  SendGrid, `CRON_SECRET`, marketing/token secrets). Invalidate the old value.
- **Diagnose:** determine exposure window and what the key could access.
- **Remediate:** purge the secret from history if it was committed; update the
  deployment env with the new value.
- **Comms:** internal; customer notice only if data was accessible.
- **Owner / escalation:** _<security lead>_.
- **Follow-up:** ensure secrets are env-only; add secret scanning.

## 9. Broken public token / speaker portal

- **Symptoms:** speaker portal or intake links return errors or the wrong scope.
- **Severity:** SEV2.
- **Contain:** confirm `SPEAKER_PORTAL_BASE_URL` and token secrets are set; a
  portal token can be re-minted (which revokes prior tokens).
- **Diagnose:** portal tokens are DB-backed (hashed, with expiry + revocation);
  intake tokens are stateless HMAC with a 7-day expiry and **cannot be revoked**
  early. Check expiry/revocation state for the affected token.
- **Remediate:** re-issue the link; for intake, wait out or migrate to the portal
  token system.
- **Comms:** send the speaker a fresh link.
- **Owner / escalation:** _<speakers module owner>_.
- **Follow-up:** consider adding intake-token revocation.

## 10. Critical workflow failure (Budget / Run of Show / Timeline)

- **Symptoms:** saves clobber data, approvals stick, or edits error in one of the
  Big 3 modules.
- **Severity:** SEV2 (data-integrity risk → escalate toward SEV1).
- **Contain:** if saves are corrupting data, advise affected users to pause edits
  in that module; roll back if a recent deploy caused it.
- **Diagnose:** reproduce with a test event; check the relevant service
  (`matrix2-session`, `budget`, `timeline`) and recent changes. Matrix session
  PATCH is partial-merge; budget approval locks line items when APPROVED.
- **Remediate:** fix forward with a regression test; restore affected records from
  backup only if provably corrupted.
- **Comms:** notify affected event owners.
- **Owner / escalation:** module owner → _<eng lead>_.
- **Follow-up:** add/extend regression coverage for the failing path.

---

## Rollback quick reference

1. **App-level:** re-deploy the previous good tag. First and safest move for most
   incidents.
2. **Migration:** prefer rolling the app back to the schema-compatible version
   over reversing a migration. Only reverse with a fresh backup.
3. **Config/secret:** rotate + redeploy env; no code change needed.
4. Always re-run the health check and a smoke-test subset after any rollback.
