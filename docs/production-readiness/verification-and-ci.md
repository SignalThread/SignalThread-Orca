# Verification & CI Readiness

_Last reviewed: 2026-07-04._

## One-command local verification

From `web/`:

```bash
npm run verify
```

`verify` runs, in order (fail-fast via `&&`):

1. `npm run typecheck` — `tsc --noEmit`.
2. `npm run test:summary` — every `*.test.ts` via `node --test` (unit,
   regression, and DB-backed journey tests), printing a pass/fail summary.
3. `npm run build` — `next build`.

> **Full ESLint is intentionally not part of `verify`.** The repo carries a
> pre-existing full-lint backlog that is unrelated to production correctness, so
> including it would make `verify` fail for reasons that are neither test, type,
> nor build regressions. To run the stricter check that also includes ESLint:
>
> ```bash
> npm run verify:strict   # lint + typecheck + test:summary + build
> ```
>
> `verify:strict` currently fails only on the lint backlog; clear that backlog
> (separately) to make it green, then promote it back to the default.

Both use only pre-existing scripts and add no packages. Run `verify` from a clean
tree before opening a PR.

## What needs a database / environment

- **DB-backed journey tests** (`lib/test-journeys/**`, many `lib/*regression*`)
  require a reachable Postgres in `DATABASE_URL` (loaded from `web/.env.local` or
  the repo-root `.env.local`). Without it they **skip** rather than fail, so
  `verify` still passes — but coverage is incomplete. CI must provide a
  disposable test database to exercise them.
- **End-to-end tests** (`e2e/*.spec.ts`, Playwright) are **not** part of
  `verify`. They need a running app, `DATABASE_URL`, and the `PW_E2E*` env, and
  they mint per-run dev users. Run them separately, e.g.:

  ```bash
  npm run test:e2e:p0        # the P0 browser-journey suite
  npm run test:e2e           # full Playwright suite
  ```

  Do not add E2E to `verify` — it would fail wherever a browser/server/env is not
  provisioned.

## Recommended CI required checks (before merge)

There is currently **no** `.github/workflows` CI config in the repo. When one is
added, require these jobs on the protected branch:

1. **lint** — `npm --prefix web run lint`
2. **typecheck** — `npm --prefix web run typecheck`
3. **unit + DB tests** — `npm --prefix web run test:summary`, with a
   `DATABASE_URL` pointing at an ephemeral Postgres service (so DB-backed tests
   run instead of skipping). Fail the job if the summary reports any `fail`.
4. **build** — `npm --prefix web run build`.

Optional / nightly (slower, browser-dependent):

5. **E2E P0** — `npm --prefix web run test:e2e:p0` against a booted app.

Notes for CI authors:
- `postinstall` runs `prisma generate`; ensure the schema/env are present at
  install time.
- Keep secrets (SendGrid, Supabase service role, R2) out of PR-triggered runs;
  the default `verify` path does not require them.
