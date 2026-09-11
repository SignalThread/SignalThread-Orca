# 08 — Engineering Standards and Testing

Full text: `ENGINEERING_STANDARDS.md` at the repo root. This is the working summary plus how validation actually runs here.

---

## 1. The bar

> The standard is not "it works." The standard is production-quality, scalable, performance-aware, low-breakage code that is tested before merge and does not create future mess.

---

## 2. The non-negotiables

### Single source of truth
Business-critical rules get **one** canonical enforcement point. Not split across UI checks, duplicate helpers, stale cached fields, ad hoc route logic, or client assumptions. If a rule matters for permissions, billing, seat consumption, access, or data safety, **the server owns it**.

*Housing:* the launch path must use the same access resolver as every other Housing surface. A launch-only permission check is a second source of truth that will drift.

### Server-side enforcement
The UI may guide, warn, or disable controls. The server must always enforce. Never rely on hidden buttons, disabled state, optimistic assumptions, or client-side role checks as the final gate.

### Correct architecture over convenient patches
1. fix the canonical enforcement path → 2. remove parallel logic → 3. update the UI → 4. add regression coverage.

Avoid one-off conditionals to satisfy one screen, route-specific copies of a rule, silent fallbacks that hide inconsistent state, soft workarounds that preserve bad data models.

### Idempotent, deterministic mutations
Explicit, scoped, reversible where appropriate, safe to retry. A delete endpoint confirms the row was actually deleted before returning success. Reconciliation derives from live authoritative records. Migrations are safe against existing environments and partial history.

*Housing:* rooming-list imports and block pickup reconciliation are exactly the write paths where this bites. Design for retry from day one.

### Data integrity first
Database constraints for real invariants · explicit uniqueness where the business requires it · foreign keys where ownership matters · validation close to the write path. Do not tolerate duplicate active records for a canonical business key.

---

## 3. The testing style that is actually used here

The pattern across `apps/platform`, `apps/lead-retrieval` and `apps/pulse` is **pure core + injected I/O**, and it is why these products can assert every denial branch without a database:

| Layer | Example | Tested how |
|---|---|---|
| Pure decision | `launch-decision.ts`, `identity-mapping.ts`, `organization-access.ts`, `lr-authorization.ts` | direct unit assertions, no DB, no mocks of the rule under test |
| I/O wiring | `product-launch.ts`, `identity-mapping-supabase.ts`, `platform-entry-server.ts` | thin; mostly exercised through integration proofs |
| Route handler | `app/api/launch/[product]/route.ts` | thin handler + exception boundary |

Note the comments in those files: *"Keeping the decision free of I/O (and free of `server-only`) is what lets every denial be asserted directly in tests, with no database and no mocking of the rule under test."* That is the house style. Copy it.

### Architectural tests exist and must keep passing
- A test asserts `authorizeProductLaunch` stays **product-agnostic** — it fails if product-specific logic appears.
- A test pins `next.config.ts` header entries **and their ordering** (file 03 §7).
- `handoff.test.ts` pins the registry shape, including the exact `PRODUCT_APP_URL_ENV` entry text.

When you add Housing to the registry, expect to update the registry-shape assertions. That is the test doing its job.

---

## 4. Commands

From the repo root:

```bash
npm run boundaries           # import boundaries — must pass
npm run typecheck            # all workspaces
npm run lint                 # all workspaces
npm run test                 # all workspaces
npm run build                # all workspaces
npm run check                # typecheck + lint + test
```

Per app:

```bash
npm run typecheck:housing
npm run lint:housing
npm run test:housing
npm run build:housing
```

Test runners differ per app:

| App | Runner |
|---|---|
| `apps/platform` | `npx tsx --test` over every `*.test.ts` under `lib/` and `app/` |
| `apps/lead-retrieval` | `node --import tsx --test`, plus a custom tagged runner (`scripts/testing/lr-test.mjs`) |
| `apps/pulse` | Vitest |
| `apps/orca` | its own summary runner |

**Pick one for Housing and be consistent.** For a greenfield app, Node's built-in test runner via `tsx` — the `apps/platform` approach — matches the newest code in the repo and adds no test-framework dependency.

⚠️ Note the root script gap: there are `dev/build/lint/typecheck:platform` aliases but **no `test:platform`**. Run Platform's suite with `npm run test --workspace apps/platform`. When you add Housing's root aliases, add **all five** (`dev/build/test/lint/typecheck:housing`) so Housing does not inherit the same gap.

---

## 5. Known inherited state — so you do not think you broke it

Lead Retrieval's suite has **13 pre-existing failures** out of ~3530 tests, inherited from before consolidation. They are documented and name-stable. If you run `npm run test` at the root and see them, they are not yours.

Housing starts clean. Keep it that way — a green suite you trust is worth more than a large one you have learned to ignore.

---

## 6. There is no CI

No `.github/workflows` exists. Validation runs locally before merge. Proposing CI for Housing (boundaries + typecheck + lint + test on PR) is reasonable — raise it with Ali.

---

## 7. What "validated" means for a change like this

Lead Retrieval's Platform integration was accepted only with all of:

- typecheck clean, lint clean, production build succeeds
- full node suite run, with a **name-level diff** against the baseline (not just a count)
- `npm run boundaries` passing
- the Platform suite passing
- a **live** happy-path proof through real routes, with the session's JWT issuer and subject verified
- a **live negative matrix** — every denial code reproduced through real routes, including the order-independence case
- documentation updated in the same change

That is the bar for the Housing handoff integration too. The domain work that follows is ordinary product engineering and does not need the same ceremony — but the auth boundary does.
