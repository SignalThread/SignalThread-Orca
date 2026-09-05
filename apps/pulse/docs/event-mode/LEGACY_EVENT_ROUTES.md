# Legacy Event Routes — Ownership & Boundary

This document records the ownership, access model, and intended handling of the
legacy, eventId-based event routes. It exists so future contributors do not
accidentally build the EVENTS product on top of public/legacy surfaces.

## Critical boundary

`Event` and `eventId` do **not** mean EVENTS product mode. Retail surveys are
internally backed by `Event` records. The only valid EVENTS product boundary is:

```ts
Account.accountType === "EVENTS"
```

The authed, account/product-scoped EVENTS app API lives under
`/api/app/events/*`. New EVENTS features must be built there, not on the legacy
routes below.

## Legacy public routes: `/api/events/[eventId]/*`

These are **public and unauthenticated**. They do not check `Account.accountType`
and do not verify event/account ownership. They are consumed by the protected
`/admin/events/*` pages (which are themselves super-admin gated). **None are used
by the kiosk runtime** — the kiosk uses `/api/response/create`,
`/api/response/[responseId]/complete`, and `/api/kiosk/*`.

| Route | Method | Status | Used by |
|-------|--------|--------|---------|
| `/api/events/[eventId]/questions` | GET | legacy/admin | `/admin/events/[eventId]` |
| `/api/events/[eventId]/responses` | GET | legacy/admin | `/admin/events/[eventId]`, `/admin/events/[eventId]/responses` |
| `/api/events/[eventId]/responses/[responseId]` | GET | legacy/admin | `/admin/events/[eventId]/responses/[responseId]` |
| `/api/events/[eventId]/answers` | GET | legacy / no known callers | — |
| `/api/events/[eventId]/analysis` | GET | legacy/admin | `/admin/events/[eventId]` |
| `/api/events/[eventId]/analysis/recompute` | POST | legacy/admin | `/admin/events/[eventId]` |

## Admin pages: `/admin/events/*`

Super-admin gated (via `app/admin/layout.tsx` → `requireSuperAdminForPage()`).
These pages fetch from the legacy public API routes above. The pages are
protected, but the underlying routes are not.

## Rules

1. Do **not** add new EVENTS product features on `/api/events/[eventId]/*`.
2. Do **not** treat `Event`/`eventId` as proof of EVENTS product mode.
3. Do **not** change the runtime behavior, auth model, or response shape of these
   routes as part of EVENTS buildout work — they are shared/legacy/admin surfaces.
4. The kiosk pipeline must remain independent of these routes.

## Future hardening (not done here — requires an explicit, approved prompt)

The public routes lack auth and account scoping. A future, separately-approved
effort could add account/ownership verification (high-risk for the admin pages
that depend on them) or remove the unused `/answers` route. None of that is in
scope for documentation/source-guard work.
