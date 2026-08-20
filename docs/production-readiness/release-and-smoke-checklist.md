# Release & Smoke-Test Checklist

_Last reviewed: 2026-07-04. Scope: Planner Dash web app (`web/`), Next.js + Prisma/Postgres (Supabase) + R2 storage._

This is a manual checklist. It does not assume any CI pipeline or external
monitoring exists (none is configured in-repo today). Adjust as those are added.

## 1. Pre-deploy checks

- [ ] Branch is clean and up to date with `main`; the release commit is tagged.
- [ ] `cd web && npm run verify` passes (typecheck, `test:summary`, build)
      against a database — confirm DB-backed journey tests actually ran (did not
      all skip). Full ESLint is `npm run verify:strict` (currently blocked by a
      pre-existing lint backlog, not a correctness regression).
- [ ] `npm run test:e2e:p0` passes against a booted app (browser journeys).
- [ ] `git status` shows no uncommitted generated files (e.g. Prisma client).
- [ ] Required env vars are present in the target environment:
      - Database: `DATABASE_URL`, `DIRECT_URL`
      - Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
        `SUPABASE_SERVICE_ROLE_KEY`
      - Email: `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`
      - Storage (R2): access key / secret / bucket / endpoint / public base
      - Public surfaces: `SPEAKER_PORTAL_BASE_URL`, `MARKETING_PUBLIC_BASE_URL`,
        `MARKETING_UNSUBSCRIBE_TOKEN_SECRET`
      - Jobs: `CRON_SECRET`
      - AI (if used): `OPENAI_API_KEY`, `OPENAI_ROOMSET_MODEL`, `FNB_MENU_PARSER_MODEL`
- [ ] Pending Prisma migrations reviewed (`web/prisma/migrations/`, currently ~53).
      Confirm each new migration is additive/backward-compatible with the running
      app version, or that a staged rollout is planned.

## 2. Deploy steps

- [ ] Cut the release from the tagged commit.
- [ ] Install + generate: `npm ci` (runs `prisma generate` via postinstall).
- [ ] Apply migrations **before** switching traffic to the new build:
      `npx prisma migrate deploy` (uses `DIRECT_URL`). Do not run `migrate dev`
      or `migrate reset` against production.
- [ ] Build + release the new app version (`next build`).
- [ ] Post-deploy health check: load `/login`, then sign in and load `/dashboard`
      (the Command Center) — confirm it renders without 500s.

## 3. Post-deploy smoke tests (critical modules)

Run as a real planner account against production data (or a staging copy):

- [ ] **Auth** — log in and log out.
- [ ] **Events** — event list loads; open an event; open the event Command Center.
- [ ] **Run of Show (Matrix-2)** — open a session drawer, edit one field (e.g.
      status/notes), save, reload → change persisted and unrelated fields intact.
- [ ] **Timeline** — list loads; create an item; add a dependency between two
      items; confirm a cycle is rejected (A→B then B→A).
- [ ] **Budget** — open budget; submit a line item; approve and reject via the
      submission workflow; export line-items CSV and confirm it downloads.
- [ ] **Docs** — upload a document (presign → PUT → finalize); submit for review.
- [ ] **Speakers / portal** — open a speaker; generate a portal link; open the
      portal token URL in a clean browser and confirm scoped read + upload.
- [ ] **F&B** — open the F&B catalog for an event; it lists items.
- [ ] **Seating / Room Set** — open a session's room-set workspace; it renders.
- [ ] **Platform Admin** (if applicable to the account) — accounts list loads;
      member add/revoke works.
- [ ] **Imports** — import a small CSV in one section (e.g. attendees); confirm
      rows land and that an oversized file is rejected with a clear error.

## 4. Rollback checklist

- [ ] Re-deploy the previous known-good build/tag (fastest recovery).
- [ ] If a migration is implicated: prefer rolling the app back to the version
      compatible with the current schema. Only roll a migration back if it is
      safely reversible **and** you have a fresh backup — additive migrations
      usually need no DB rollback.
- [ ] Verify the health check + a subset of smoke tests after rollback.
- [ ] Record the incident (see the incident runbooks) and the follow-up fix.

## 5. Go / no-go ownership

- [ ] Release owner (drives the deploy, holds go/no-go): _<name>_
- [ ] Engineering approver (verified `verify` + e2e): _<name>_
- [ ] Rollback decision maker if smoke tests fail: _<name>_

## 6. Known deferred risks at release

Carry these forward from the production-readiness pass (see the other docs in
this folder for detail):

- No rate limiting on public/costly endpoints (infra decision).
- Presigned uploads bind only a client-claimed size, not the actual body.
- Content-Security-Policy not yet enabled.
- Matrix staffing schema reconciliation is deferred (see the staffing proposal).
- Several orphaned routes retained pending a dedicated cleanup PR (see the
  dead-code inventory).
