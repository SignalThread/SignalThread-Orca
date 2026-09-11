# 07 — Local Development and Environment

> `docs/local-dev.md` in this repo is **stale** — it describes the pre-monorepo `planner-os` layout. Use this file instead.

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Node | 20+ (verified working on 25.x) |
| npm | 10+ (workspaces) |
| `psql` | any recent client, for direct DB work |
| Supabase CLI | for migrations (`supabase db push --linked`) |

Install once from the repo root — **not** from inside an app:

```bash
npm install
```

> ⚠️ In a secondary worktree, Orca's `prisma generate` postinstall can fail. The workaround used previously is `npm install --ignore-scripts`, then run Prisma generation only where needed.

---

## 2. Port map

| App | Port | Start |
|---|---|---|
| Orca | 3000 | `npm run dev:orca` |
| Platform | 3001 | `npm run dev:platform` |
| Pulse | 3002 | `npm run dev:pulse` |
| Lead Retrieval | 3003 | `npm run dev:lead-retrieval` |
| **Housing** | **3004** *(proposed)* | `npm run dev:housing` |

Ports are pinned in each app's own `dev` script (e.g. Lead Retrieval: `next dev -H 0.0.0.0 --port 3003`). Pin Housing's the same way rather than relying on Next's auto-increment — a floating port silently breaks the handoff, because `HOUSING_APP_URL` points at a fixed one.

> 🐛 **Real bug that cost a session:** during testing someone moved Lead Retrieval to 3013 and left `LEAD_RETRIEVAL_APP_URL=http://localhost:3013` and `NEXT_PUBLIC_SITE_URL=http://localhost:3013` in the local env files. The app started fine on 3003; every launch and auth callback went to a dead port. **If a launch 404s or hangs, check the port values in *both* apps' env files first.**

> 🐛 **Cookies on `localhost` are shared across ports.** Platform (3001) and Housing (3004) see each other's cookies locally, which does **not** reflect production (different hosts, host-only cookies). Never rely on that locally, and be aware a stale session cookie from another app can confuse a local test.

---

## 3. Environment files

Every app reads **its own** `apps/<app>/.env.local`. The repo-root `.env.local` is **not** read at runtime by any app — deliberately, so it cannot become a shared runtime secret namespace.

All `.env*` files are gitignored in every app. **Production values come from each Vercel project's own dashboard settings, never from a file in the repository.**

### `apps/housing/.env.local`

```bash
# Housing's OWN Supabase project — never Platform Core's
NEXT_PUBLIC_SUPABASE_URL=https://<housing-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<housing anon key>
SUPABASE_SERVICE_ROLE_KEY=<housing service role key>   # server-only

# Housing's own origin — drives Secure on cookies and auth callbacks
NEXT_PUBLIC_SITE_URL=http://localhost:3004
NEXT_PUBLIC_AUTH_CALLBACK_URL=http://localhost:3004/auth/callback

# Where to POST the handoff claim — server-only
PLATFORM_APP_URL=http://localhost:3001
```

### `apps/platform/.env.local` — add one line

```bash
HOUSING_APP_URL=http://localhost:3004
```

Platform's existing local file also carries `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL`, `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY`, `PLATFORM_CORE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_PLATFORM_APP_URL`, `NEXT_PUBLIC_ORCA_APP_URL`, `PULSE_APP_URL`, `LEAD_RETRIEVAL_APP_URL`.

### Secrets hygiene

- `.local-secrets/` (repo root, gitignored) holds DB credentials per project, one file per product: `lead-retrieval-db.env` exists; add `housing-db.env`. Mode `600`.
- Commit an `apps/housing/.env.example` with **names and comments only, never values**.
- When sharing terminal output, redact keys. Service-role keys are full database bypass.

---

## 4. Running the stack

```bash
npm run dev:platform        # 3001
npm run dev:housing         # 3004
# plus any others you need
npm run dev:orca            # 3000
npm run dev:lead-retrieval  # 3003
```

Health check:

```bash
for p in 3000 3001 3002 3003 3004; do
  printf "%s " $p
  curl -s -o /dev/null -m 20 -w "%{http_code}\n" "http://localhost:$p/"
done
```

Expect redirects to each app's sign-in route (`307`/`303`) or `200`. Find a stale listener with `lsof -nP -iTCP:3004 -sTCP:LISTEN`.

> ⚠️ `npm run dev:pulse` emits a harmless `npm error code ENOWORKSPACES` from a trailing `-- --port 3002` in the root script. Pulse's own `dev` already sets the port and starts correctly. Cosmetic.

---

## 5. Exercising the launch locally

The clean way, once Housing has an entitled org and mapping rows:

1. Sign in at `http://localhost:3001` as a user who is an ACTIVE member of an organization holding an ACTIVE `housing` entitlement.
2. Open an event owned by that organization.
3. Click the Housing card — or go straight to
   `http://localhost:3001/api/launch/housing?event_id=<platform event uuid>`.
4. Watch the redirect chain (file 04 §1).

### Scripted proof (no token pasting)

For repeatable runs, mint a Platform session server-side and drive the chain with a cookie jar:

1. `POST {PLATFORM_CORE_URL}/auth/v1/admin/generate_link` with the **service-role** key, `{ "type": "magiclink", "email": "<user email>" }` → `hashed_token`.
   *The admin endpoint returns the link; it does **not** send an email.*
2. `createServerClient(url, ANON_KEY, { cookies: <in-memory jar> })` from `@supabase/ssr`, then `verifyOtp({ type: "magiclink", token_hash })` → session cookies land in the jar.
3. `fetch` the launch URL with `redirect: "manual"`, absorbing `Set-Cookie` and following `Location` by hand.

This technique is proven and was used to validate the Lead Retrieval chain end to end. Two practical notes:

- Run the script from a directory where `@supabase/ssr` resolves, or import it by absolute path.
- Redact `handoff`/`state`/`token` query params before logging.

**Alternative for a real-browser pass:** serve the minted cookies from a throwaway `localhost:3099` 302 redirector — cookies on `localhost` are shared across ports — then navigate normally. Avoids pasting tokens into a URL bar.

> 🐛 Platform Core GoTrue rate-limits verification at roughly **30 per 5 minutes per IP**. Heavy proof loops start returning `401 HANDOFF_INVALID`. Wait five minutes; it is not a bug.

---

## 6. Migrations

Housing follows the Lead Retrieval pattern:

```
apps/housing/supabase/
├── config.toml          auth config as code (site_url, redirect allow-list)
└── migrations/
    └── 2026MMDDHHMMSS_housing_baseline.sql
```

```bash
supabase link --project-ref <housing-ref>
supabase db push --linked
```

Then regenerate types into `apps/housing/types/database.ts`.

Conventions: additive migrations; a `do $$ ... end $$` guard for anything that must be idempotent; a rollback note in the file header (see `20260907120000_platform_core_event_venue_timezone.sql` for the house style).

> ⚠️ **Migration files are not proof of live schema.** That venue/timezone migration is committed but **not applied** to the live Platform Core project. Always verify against the live catalog before depending on a column.

---

## 7. Useful read-only inspection

Direct DB, read-only:

```bash
PGOPTIONS='-c default_transaction_read_only=on' psql "$HOUSING_DB_URL" -c "\d housing_events"
```

Platform Core (read-only via PostgREST, service role):

```bash
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "$PC_URL/rest/v1/organizations?select=id,name,slug"
```

List every relation and column Platform Core exposes:

```bash
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$PC_URL/rest/v1/"
```

> ⚠️ These are **debugging** tools. Housing's *application code* must never call Platform Core — only the claim endpoint.

---

## 8. Demo data

`scripts/demo-seeding/` provisions deterministic multi-product demo worlds (canonical Platform Core records plus matching product rows). Read `scripts/demo-seeding/README.md` first — it writes to real projects, verifies the exact target project ref before mutating, keeps immutable ownership journals, and refuses to reuse rows without an unchanged receipt.

A Housing adapter would be a later loop. Until then, hand-provision a small fixture set and keep the ids written down.
