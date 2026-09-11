# Housing — Engineering Handoff Pack

**Audience:** the PM/engineer who will build SignalThread Housing into the platform monorepo.
**Repo:** `signalthread` monorepo (this repository), branch `main`.
**Status of this pack:** written 2026-09-10 from the live code and the live Platform Core database. Every claim here was verified against one or the other, not from memory.

---

## Read in this order

| # | File | What it answers |
|---|---|---|
| 00 | `00_START_HERE.md` (this) | What Housing is, what already exists, your first week |
| 01 | `01_PLATFORM_ARCHITECTURE.md` | How the monorepo and failure domains work |
| 02 | `02_PLATFORM_CORE_SCHEMA.md` | The canonical registry schema you must integrate with |
| 03 | `03_AUTH_AND_IDENTITY.md` | Who authenticates whom, and the claim contract |
| 04 | `04_LAUNCH_HANDOFF_CONTRACT.md` | The exact Platform → product launch protocol |
| 05 | `05_HOUSING_INTEGRATION_CHECKLIST.md` | The concrete build steps, in order |
| 06 | `06_HOUSING_DATA_MODEL_GUIDANCE.md` | Housing's own schema: required bits + domain proposal |
| 07 | `07_LOCAL_DEV_AND_ENVIRONMENT.md` | Ports, env vars, running the stack, provisioning Supabase |
| 08 | `08_STANDARDS_AND_TESTING.md` | The engineering bar and how work is validated |
| 09 | `09_OPEN_QUESTIONS.md` | Decisions to make with Ali before/while building |

If you read only two: **04** (the contract you must implement) and **05** (the checklist).

---

## What SignalThread is

SignalThread is an event-operations platform made of independent product applications that share one identity and entitlement layer:

| Product | App | Status |
|---|---|---|
| **OrcaOS** — event planning and operations | `apps/orca` | live |
| **Registration** — attendee identity | `apps/registration` | **not started** |
| **Housing** — stay logistics | `apps/housing` | **not started — this is you** |
| **Lead Retrieval** — exhibitor engagement | `apps/lead-retrieval` | built, pre-cutover |
| **Pulse** — attendee voice intelligence | `apps/pulse` | built |

The shared layer is **Platform Core** — a Supabase project (`wtbnpeluwhjjqccdofxd`) holding organizations, events, memberships, the product catalog, and entitlements. It is the *only* thing products share. Everything else — Housing's database, its RBAC, its UI, its deployment — belongs to Housing alone.

**Platform** (`apps/platform`) is the front door at `app.signalthread.ai`: users sign in there, pick an event, and launch into a product.

---

## The one-sentence version of your job

> Build `apps/housing` as a standalone Next.js app with its own database, and implement one contract — the Platform launch handoff — so that a user who signs in at Platform and clicks "Housing" on an event lands inside Housing, already authenticated, scoped to that event.

---

## What already exists for Housing (more than you'd expect)

You are **not** starting from zero. These are live and verified:

1. **`housing` is in the live product catalog.** Platform Core's `products` table contains `('housing', 'Housing', 'AVAILABLE')`. Nothing to add.
2. **Housing has a dashboard tile definition.** `apps/platform/lib/event-overview/product-catalog.ts` already defines Housing's display name, capability verb ("House"), purpose copy ("Knows where they stay"), lifecycle span (before → during), fact label ("Rooms held"), metrics (`Rooms held`, `Committed`), icon (`bed`) and sort order (30, after Registration, before Lead Retrieval).
3. **Housing has a brand colour ramp.** `apps/platform/app/globals.css` defines `--product-housing` (`#047857`) plus `-soft`, `-faint`, `-border`, `-ink`, `-dot`.
4. **The launch machinery is product-agnostic and finished.** `authorizeProductLaunch` has a test that *fails if product-specific logic appears in it*. Adding Housing is a registry entry, not new auth code.
5. **Two reference implementations exist**, both "own auth authority" products like Housing will be: `apps/pulse` and `apps/lead-retrieval`. Lead Retrieval is the more recent and more thoroughly documented one — treat `apps/lead-retrieval/lib/platform/` as your template.

What does **not** exist: `apps/housing`, a Housing Supabase project, a Housing Vercel project, and any Housing domain model.

---

## Your first week, concretely

**Day 1–2 — read and run.**
Read files 01–04 of this pack. Then get the existing stack running locally (file 07) and *launch Lead Retrieval from Platform in your own browser*. Watch the 7-hop redirect chain in devtools. That chain is the thing you are going to reproduce.

**Day 3 — trace the reference.**
Read `apps/lead-retrieval/lib/platform/` end to end (~8 files, all heavily commented) alongside `apps/lead-retrieval/docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md`. Do not write code yet.

**Day 4 — decide the domain shape.**
Work through file 06 and file 09 with Ali. Housing's domain (room blocks, hotels, rate plans, reservations, attrition) is the part *nobody has designed yet* — that is the real product work, and it's yours.

**Day 5 — scaffold.**
`apps/housing` skeleton + Supabase project + the three mapping columns (file 05, steps 1–4). Get `/platform-entry` returning a deliberate `501` before it does anything real. Prove the launch reaches you.

Then build the domain.

---

## Hard rules (these are not style preferences)

1. **Never import from another app.** `apps/housing` may import `packages/*`. It may **not** import `apps/orca`, `apps/pulse`, `apps/lead-retrieval`, or `apps/platform`. There is an automated check: `npm run boundaries`.
2. **Never query another product's database.** Not Platform Core's Postgres either — Housing talks to Platform only through the documented HTTP claim endpoint.
3. **Never create a cross-database foreign key.** Platform ids are stored in Housing as *opaque UUID columns*, never as FKs.
4. **Never put a service-role key in a `NEXT_PUBLIC_` variable**, and never ship Platform Core's service-role key to Housing. Housing has no business holding it.
5. **Authorization is re-derived, never carried.** The event id in a launch URL is a navigation hint. Housing re-validates everything server-side.

The reasoning behind each is in files 01, 03 and 04. They are worth understanding rather than just obeying — several were learned the expensive way.

---

## Who to ask

- **Ali** — product decisions, Supabase project provisioning, Vercel projects, DNS, anything touching production.
- **This pack + the code comments** — architecture. The codebase is unusually heavily commented; the "why" is nearly always written down next to the "what".
