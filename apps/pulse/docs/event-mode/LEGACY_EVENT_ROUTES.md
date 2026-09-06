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

## Legacy routes: `/api/events/[eventId]/*`

These do not check `Account.accountType`. Since the Pulse access-boundary
hardening (Platform integration phase 1) they are **organizer-authenticated**:
every handler calls `requireLegacyEventReportingAccess(eventId)`
(`lib/auth/require-legacy-event-reporting-access.ts`), which admits a platform
super admin or an active Pulse user with canonical membership in the account
that owns the event, and answers 404 for everything else (missing event and
forbidden event are indistinguishable). They are consumed by the protected
`/admin/events/*` pages (which are themselves super-admin gated).

**One route is also part of the attendee thank-you flow:** the kiosk polls
`/api/events/[eventId]/responses/[responseId]` for the attendee's own synopsis
(`lib/hooks/useSummaryPolling`). When the organizer guard does not pass, that
route serves only the narrowly scoped attendee summary from
`lib/legacy-response-summary.ts` (status + per-answer synopsis, no transcript
text, object keys, or anonymous IDs) while the response is in progress or within
24h of completion. The URL is unchanged so kiosk builds and QR codes already in
the field keep working. Every other kiosk call goes through
`/api/response/create`, `/api/response/[responseId]/complete`, `/api/answer/*`,
and `/api/kiosk/*`, none of which use organizer authentication.

| Route | Method | Access | Used by |
|-------|--------|--------|---------|
| `/api/events/[eventId]/questions` | GET | organizer (legacy guard) | `/admin/events/[eventId]` |
| `/api/events/[eventId]/responses` | GET | organizer (legacy guard) | `/admin/events/[eventId]`, `/admin/events/[eventId]/responses` |
| `/api/events/[eventId]/responses/[responseId]` | GET | organizer → full payload; otherwise attendee summary | `/admin/events/[eventId]/responses/[responseId]`, kiosk thank-you poll |
| `/api/events/[eventId]/answers` | GET | organizer (legacy guard) / no known callers | — |
| `/api/events/[eventId]/analysis` | GET | organizer (legacy guard) | `/admin/events/[eventId]` |
| `/api/events/[eventId]/analysis/recompute` | POST | organizer (legacy guard) | `/admin/events/[eventId]` |

## Admin pages: `/admin/events/*`

Super-admin gated (via `app/admin/layout.tsx` → `requireSuperAdminForPage()`).
These pages fetch from the legacy API routes above with the browser session, so
the super admin passes `requireLegacyEventReportingAccess` and receives the
full reporting payloads.

## Rules

1. Do **not** add new EVENTS product features on `/api/events/[eventId]/*`.
2. Do **not** treat `Event`/`eventId` as proof of EVENTS product mode.
3. Do **not** change the response shapes of these routes as part of EVENTS
   buildout work — they are shared/legacy/admin surfaces. The access guard is
   part of the boundary and must not be removed.
4. The kiosk pipeline must remain independent of these routes. (The thank-you
   poll is the documented exception and only ever sees the attendee summary.)

## Hardening applied (Pulse Platform integration phase 1)

Account/ownership verification was added via `requireLegacyEventReportingAccess`
and the response poll was split into organizer and attendee views. Source
guards: `app/api/events/legacy-routes.guard.test.ts` and
`app/api/access-boundaries.guard.test.ts`. The full matrix lives in
`docs/PULSE_ACCESS_BOUNDARIES.md`. Removing the unused `/answers` route remains a
separate decision.
