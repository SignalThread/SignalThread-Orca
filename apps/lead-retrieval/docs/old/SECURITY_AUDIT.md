# Security Audit Report

**Date:** 2026-03-07  
**Scope:** Multi-tenant isolation, RBAC, API authorization, session handling, input validation, secrets, logging

## Summary

The auth layer is generally solid. The critical issues are concentrated in two places: `GET /api/campaigns` returning all campaigns without a company-scoped filter (tenant isolation bypass), and the generate-draft endpoint accepting client-supplied `selectedSignalDefinitions` that bypass server-side signal validation. Everything else is either medium or lower severity.

---

## 1. Must Fix Before Production

---

### CRIT-01: GET /api/campaigns Returns All Campaigns — No Company Scope Filter

**Severity:** Critical  
**File:** `app/api/campaigns/route.ts` lines 13–43  
**Flow:**

```ts
const supabase = await createSupabaseServerClient();
const { data, error } = await supabase
  .from("campaigns")
  .select("id, name, mode, status, created_at")
  // NO .eq("company_id", ...) filter
```

An authenticated `exhibitor_admin` for Company A can call `GET /api/campaigns` and see the names, modes, and statuses of every campaign in the database across all companies — unless RLS enforces it. There is **no server-side company_id filter** in the application code, and the earlier audit noted RLS was not fully aligned with `exhibitor_admin` role. If RLS has any gap (e.g. the campaigns policy is missing or uses `current_user` which isn't set), this leaks all tenants' campaign metadata.

**Fix:** Add `.eq("company_id", sessionUser.company_id)` to the GET query, and verify RLS policy on `campaigns` enforces company scoping for `exhibitor_admin`.

**Launch blocker:** Yes.

---

### CRIT-02: generate-draft Accepts Client-Supplied Signal Prompt Definitions

**Severity:** High  
**File:** `app/api/campaigns/[campaignId]/generate-draft/route.ts` lines 84–98, 271–297  

The `GenerateDraftPayload` type accepts a `selectedSignalDefinitions` array from the client:

```ts
selectedSignalDefinitions?: {
  id?: string;
  name?: string;
  defaultPromptText?: string | null;
  ...
}[];
```

While the current code path in `normalizeSignalDefinitions` does *not* consume `payload.selectedSignalDefinitions` directly (it fetches from the DB using `selectedSignalIds` or `selectedSignalNames`), the field is accepted, deserialized, and logged. More critically: the `selectedSignals` (name-based) fallback allows a client to supply signal **names** that may match signals in the DB without providing their IDs, bypassing UUID validation. A crafted payload could also inject arbitrary prompt text if the code path were to evolve or if a future developer mistakes this field as already-validated.

The field also gets logged in development mode which could surface signal prompt content.

**Fix:** Strip `selectedSignalDefinitions` from the accepted payload entirely. Signal definitions must only come from the database after `selectedSignalIds` are validated. Never accept prompt text from the client.

**Launch blocker:** Yes (medium-high exploitation risk today, certainty of regression tomorrow).

---

### HIGH-01: `activate-memberships` Route — Any Authenticated User Can Activate Their Own Invitations With No Role Check

**Severity:** High  
**File:** `app/api/auth/activate-memberships/route.ts`  
**Flow:**

```ts
const admin = createAdminClient();
await admin.from("event_users")
  .update({ status: "active" })
  .eq("user_id", user.id)
  .eq("status", "invited")
```

This uses the **service role admin client** to update `event_users` status from `invited` → `active` for the caller's own user ID. No role check is performed. Any authenticated user — including a `viewer` or someone whose invitation was intentionally left in `invited` status by an admin — can call this endpoint and activate themselves. This is a low-bar privilege escalation for any user with a valid session.

**Fix:** Either remove this route and only activate memberships in the server-callback (which already calls `activateInvitedMemberships`), or add a role check and confirm the logic is intentional.

**Launch blocker:** Yes.

---

### HIGH-02: Organizer Invite Route — Seat Enforcement Uses Optimistic Check Without Atomic Lock

**Severity:** High  
**File:** `app/api/organizer/invite/route.ts` lines 57–92 and `app/admin/users/actions.ts` lines 84–117  
**Flow:**

The seat increment uses an optimistic concurrency loop: read current `seats_used`, check < `seats_total`, then update with `.eq("seats_used", seatsUsed)`. However, the seat check inside `getActiveExhibitorLicense` (line 50–52) happens *before* the invite email is sent, and the invite email is sent *before* the seat is incremented (line 208). Under concurrent requests, two organizers could both pass the seat check and both successfully invite a user, exceeding the license seat count.

**Fix:** The seat check and increment should be done atomically (a single DB function via Supabase RPC), or at a minimum the invite email should not be sent until after the seat is confirmed consumed.

**Launch blocker:** Yes (commercial/licensing integrity issue).

---

## 2. Should Fix Soon After Launch

---

### MED-01: `deleteUserAction` Allows Organizer to Delete Users Without Verifying Event Membership Exists

**Severity:** Medium  
**File:** `app/admin/users/actions.ts` lines 311–407  
**Flow:**

An `organizer_admin` supplies a `userId` and `eventId` via form data. The code checks if the event is in scope, but then deletes from `users` and calls `supabase.auth.admin.deleteUser(userId)` — permanently deleting the auth user. If the user has multiple event memberships (across different events), a scoped organizer can fully delete a user from the system even if they only manage one of the events the user belongs to.

**Fix:** Only delete `event_users` for the specific event. Only delete the `users` row and auth record if the user has **no remaining event_users records** after removal.

**Launch blocker:** No, but can cause permanent data loss.

---

### MED-02: `admin/licenses/[licenseId]` PATCH — Platform Admin Modifies Any License Without Ownership Verification

**Severity:** Medium  
**File:** `app/api/admin/licenses/[licenseId]/route.ts` lines 34–88  
**Flow:**

The organizer_admin path fetches scope and validates the license belongs to their events. The `platform_admin` path **skips this check entirely** and proceeds directly to modify the license by ID using the admin client, with no ownership or existence check. Platform admin is intentionally privileged, but the same admin client is used, so any error in role assignment (e.g. an organizer whose role was accidentally set to `platform_admin`) would have unrestricted license mutation power across all tenants.

**Fix:** By design if platform_admin is truly all-powerful. Document it explicitly. If there are multiple platform admins, log the actor ID and action for audit purposes.

**Launch blocker:** No, but warrants an audit log.

---

### MED-03: Signal Library Client Logs User Role to Browser Console

**Severity:** Medium  
**File:** `components/signals/signal-library-client.tsx` line 84  

```ts
console.log("Signal role check:", user.role);
```

Role values are logged to the browser console in all environments including production. While role values are not highly sensitive, they confirm the internal role names and user privilege level to anyone with DevTools open.

**Fix:** Remove the `console.log`, or gate it behind `process.env.NODE_ENV !== "production"`.

**Launch blocker:** No.

---

### MED-04: `draftBodyHtml` Stored Without Sanitization

**Severity:** Medium  
**File:** `app/api/campaigns/[campaignId]/route.ts` lines 130–134  

The client can send arbitrary `draftBodyHtml` which is stored in the database as-is. If this HTML is ever rendered unescaped in a browser (email preview, admin view, etc.), it becomes a stored XSS vector. An exhibitor user could inject scripts visible to other users in the same session.

**Fix:** Audit every render point for `draft_body_html`. At minimum, sanitize with a library like `DOMPurify` before storing or rendering.

**Launch blocker:** No, unless the HTML is rendered in the admin interface.

---

### MED-05: Invite Redirect URL Hardcoded as Production Domain in Fallback

**Severity:** Medium  
**Files:** `app/api/organizer/invite/route.ts` line 8, `app/admin/users/actions.ts` line 16  

```ts
const INVITE_REDIRECT_TO =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback";
```

If `NEXT_PUBLIC_AUTH_CALLBACK_URL` is not set (e.g. staging, local dev), the invite email will redirect to the **production domain**. Users invited from staging will accept their invitation and be redirected to production, which may have a different database, causing confusing auth state.

**Fix:** Throw an error if `NEXT_PUBLIC_AUTH_CALLBACK_URL` is not set (don't use a fallback), or use different environment-specific defaults.

**Launch blocker:** No for production itself, but important for staging/testing hygiene.

---

### MED-06: `GET /api/campaigns` Has No Role Check

**Severity:** Medium  
**File:** `app/api/campaigns/route.ts`  

There is no role check on GET. Any authenticated user (including `organizer_admin` or `platform_admin`) can call this endpoint. Combined with CRIT-01 (no company_id filter), platform admins and organizer admins would see campaigns across all companies.

**Fix:** Add a role check to restrict this endpoint to `exhibitor_admin` (and optionally `platform_admin` with scoped behavior).

**Launch blocker:** No on its own, but directly worsens CRIT-01.

---

## 3. Nice-to-Have Hardening

---

### LOW-01: No Rate Limiting on Any Endpoint

**Severity:** Low  
**Files:** All API routes  

No application-level rate limiting on:
- `POST /api/organizer/invite` (sends email, consumes seats — abusable)
- `POST /api/campaigns/[campaignId]/generate-draft` (calls OpenAI — cost exposure)
- `POST /api/auth/activate-memberships`
- Auth callback routes

**Fix:** Add rate limiting middleware (e.g. via Upstash/Redis or Vercel Edge) on invite and LLM generation routes at a minimum.

**Launch blocker:** No.

---

### LOW-02: Database Error Details Returned to Client

**Severity:** Low  
**Files:** Across all API routes  

PostgreSQL error codes and messages are forwarded verbatim to clients:

```ts
return NextResponse.json({ error: `${error.message} (${error.code ?? "no_code"})` }, { status: 500 })
```

This can leak internal table names, constraint names, and schema details.

**Fix:** Log full details server-side, return only a generic message client-side (e.g. `"Operation failed"`) with a correlation ID.

**Launch blocker:** No.

---

### LOW-03: `getOrganizerScope` Uses Admin Client Unnecessarily

**Severity:** Low  
**File:** `lib/data/organizer-scope.ts`  

`getOrganizerScope` uses `createAdminClient()` (service role) to fetch `users`, `event_users`, `events`, and `exhibitors`. These are read-only operations that could use the server client with RLS instead of bypassing it entirely.

**Fix:** Use `createSupabaseServerClient()` for reads, or limit admin client usage to operations that genuinely require service role (user creation, seat writes).

**Launch blocker:** No.

---

### LOW-04: Signal Name-Based Lookup Fallback in generate-draft

**Severity:** Low  
**File:** `app/api/campaigns/[campaignId]/generate-draft/route.ts`  

When `selectedSignalIds` is empty, the code falls back to matching signals by **name** (a string from the client payload). Signal names are not guaranteed unique, and a client could send a signal name that matches a higher-privilege signal they wouldn't normally have access to through ID-based lookup.

**Fix:** Require UUID-based signal selection on all paths. Remove the name-based fallback.

**Launch blocker:** No, but hardens signal scoping.

---

### LOW-05: `NEXT_PUBLIC_LEAD_ROUTE_DEBUG` Flag Exposed in Client Component

**Severity:** Low  
**File:** `components/leads/exhibitor-leads-table.tsx` line 259  

```ts
if (process.env.NEXT_PUBLIC_LEAD_ROUTE_DEBUG === "1") {
```

This is a `NEXT_PUBLIC_` variable visible to browsers. Anyone can observe it.

**Fix:** Remove this debug flag from production code.

**Launch blocker:** No.

---

## Reference Tables

### Endpoints That Trust Client-Supplied IDs Too Much

| Endpoint | Trusted Input | Risk |
|---|---|---|
| `GET /api/campaigns` | None (but no scope filter) | Returns cross-tenant data |
| `POST /api/campaigns/[campaignId]/generate-draft` | `selectedSignalDefinitions`, `selectedSignals` (names), `leadIds` | Signal bypass, prompt injection |
| `PATCH /api/campaigns/[campaignId]` | `selectedSignalIds` (not validated to exist in DB) | Stored invalid signal IDs |

### Routes Using Admin Privileges Without Sufficient Checks

| Route | Admin Client Usage | Gap |
|---|---|---|
| `POST /api/auth/activate-memberships` | Updates `event_users` as service role | No role check on caller |
| `POST /api/organizer/invite` | `auth.admin.inviteUserByEmail` + `users` upsert | Correct scope checks present |
| `app/admin/users/actions.ts deleteUserAction` | `auth.admin.deleteUser` | Deletes entire auth user even with partial event scope |
| `lib/data/organizer-scope.ts` | Full admin client for reads | Over-privileged for read-only scope fetch |

### Where a User Could Access Another Tenant's Data

| Surface | Path | Severity |
|---|---|---|
| `GET /api/campaigns` | No company_id filter in query | Critical |
| `POST /api/campaigns/generate-draft` with `selectedSignals` names | Could match signals from any company (signals are global) | Low |
| `PATCH /api/admin/licenses/[licenseId]` as platform_admin | No ownership check | By design — needs audit log |

### Role Escalation / Misassignment Risks

| Vector | Risk |
|---|---|
| `POST /api/organizer/invite` hardcodes `role: "exhibitor_admin"` | ✅ Safe — role is server-set |
| `addUserInviteAction` sets role from form input | ✅ Safe — role is validated server-side |
| `activate-memberships` route | Any authenticated user can self-activate without a role check |
| `users.upsert` with `onConflict: "id"` in invite flows | If an existing user (e.g. platform_admin) is re-invited, their `role`, `company_id`, and `license_id` are silently overwritten |

The last point warrants special attention: if `inviteUserByEmail` returns an existing user and the invite flow proceeds, the `upsert` will overwrite their role. A platform_admin whose email is accidentally invited as an `exhibitor_admin` would be downgraded.

**Fix:** Replace `upsert` with an insert that errors on conflict, or check for existing role before overwriting.
