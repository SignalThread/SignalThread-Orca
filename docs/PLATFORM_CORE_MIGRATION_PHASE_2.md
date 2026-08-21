# Platform Core Migration — Phase 2 Implementation Record

- **Status:** implemented
- **Branch:** `platform-core-phase-2` (from `main` @ `a088143`)
- **Blueprint:** [PLATFORM_CORE_INTEGRATION_AUDIT.md](PLATFORM_CORE_INTEGRATION_AUDIT.md)
- **Predecessor:** [PLATFORM_CORE_MIGRATION_PHASE_1.md](PLATFORM_CORE_MIGRATION_PHASE_1.md)
- **Scope:** authentication cutover — Platform Core becomes the authentication authority, Orca stops being an authentication entry point, and authentication alone stops being access. Canonical organization/event IDs remain Phase 3.

---

## Correction to an earlier premise

An earlier draft of this document stated that Platform Core did not exist, inferred from the absence of a Platform Core repository in the `SignalThread` GitHub organization. **That inference was wrong and is retracted.**

**The Platform Core Supabase project exists and is Orca's authentication authority.** The absence of a repository says nothing about whether the Supabase project exists.

What is genuinely outstanding is a set of *higher-level capabilities*, which must be assessed individually rather than lumped together as "Platform Core is missing":

| Capability | Status | Consequence for Phase 2 |
|---|---|---|
| **Supabase Auth / canonical identity** | **Exists** | Cutover is possible now. Set the Platform Core auth variables and Orca authenticates against it |
| **Entitlement claim issuance** | Mechanism exists, issuer does not | `app_metadata.signalthread.products` can be set today via the Supabase admin API or dashboard. What is missing is a systematic issuer that keeps the claim in step with entitlement changes — hence `PLATFORM_ENTITLEMENT_MODE=migration` as a transition window, not as a workaround for an absent service |
| **Orca-callable invitation endpoint** | Does not exist | An operator can invite through Platform Core Supabase directly. Orca cannot initiate one, so Orca's own invite route is gated to 410 |
| **Organization / event context contracts** | Does not exist | Organization context stays local; this is Phase 3's dependency |

The design consequence is unchanged: everything that moves at cutover is **configuration, not code**, no project identifiers are hardcoded, and where a capability is genuinely absent Orca **fails closed in production** rather than faking approval or reaching across a database boundary.

---

## What Phase 2 implemented

### 1. Platform Core as the authentication authority

`resolveAuthAuthorityPosture()` ([auth-authority.ts](../web/src/lib/supabase/auth-authority.ts)) extends the Phase 1 resolver with a cutover posture:

| Environment | Platform Core configured | Legacy Orca configured | Result |
|---|---|---|---|
| production | yes | — | authenticate against Platform Core |
| production | no | yes | **blocked** (`LEGACY_AUTH_AUTHORITY_NOT_PERMITTED`) |
| production | no | yes + `ALLOW_LEGACY_ORCA_AUTH_AUTHORITY=true` | legacy, as a deliberate rollback |
| production | partially | — | **blocked** (`AUTH_AUTHORITY_MISCONFIGURED`) |
| production | none | none | **blocked** (`AUTH_AUTHORITY_NOT_CONFIGURED`) |
| non-production | either | either | permitted, so local dev and Playwright work |

`ensureProvisionedUserAndContext` consults the posture **before** creating a Supabase client. Without this, a production deployment missing its Platform Core variables would have quietly kept signing people in against the legacy Orca project.

All Supabase clients (server, browser, service-role admin) already routed through the Phase 1 resolver and were verified to still do so. No new direct reads of `NEXT_PUBLIC_SUPABASE_*` were introduced.

### 2. Orca is no longer an authentication entry point

| Surface | Before | After |
|---|---|---|
| `/login` | client-side email OTP form with `shouldCreateUser: true` | server redirect to the configured Platform Core sign-in URL, carrying a validated return-to link |
| Signup | implicit, via `shouldCreateUser: true` | **removed.** Orca cannot mint an identity anywhere |
| `/auth/callback` | accepted PKCE `code` plus all six OTP token types | under Platform Core: PKCE `code` handoff only. `signup`, `recovery`, and `email_change` are refused — they are identity operations Platform Core owns |
| `(app)` route-group guard | its own `getSession()` check against `NEXT_PUBLIC_SUPABASE_*` | delegates to the canonical resolver |

The legacy OTP form still exists at [legacy-otp-login-form.tsx](<../web/app/(public)/login/legacy-otp-login-form.tsx>) but is reachable **only** when the legacy Orca authority is both configured and permitted, and even then it passes `shouldCreateUser: false`.

`/login` is kept as a path rather than deleted: thirteen call sites redirect to it, and making it the redirector keeps the Platform Core destination in one configurable place instead of scattering an external URL through the codebase.

**Security fix found in review:** the `(app)` guard used `getSession()`, which only reads the session cookie and does not verify it with the auth server. It now delegates to the canonical resolver, which uses `getUser()`. That was a second, weaker copy of a rule that belongs in one place.

### 3. Auto-provisioning removed

Phase 1 deliberately left this intact. It is now gone:

- `createAppUserWithMembership` — **deleted.** An unknown Platform identity yields `ORCA_ACCESS_NOT_PROVISIONED` (403), never a new account.
- `ensureMembershipForUser` — **replaced** by `readProvisionedMemberships`, a pure read. It used to create a `Membership` *and rewrite `User.orgId`* as a side effect of a GET; authentication could grant tenancy.
- The request path now performs **no writes at all**. A test asserts `user.create`, `user.update`, `membership.create`, and `membership.upsert` do not appear in it.

### 4. `DEFAULT_ORG_ID` retired from access resolution

Every runtime use was in `getDefaultOrgIdResolution`, which is deleted along with its two helpers (`organizationExists`, `UUID_REGEX`). The only remaining reference is `isDefaultOrgIdUsedForAccessResolution()`, a documented function returning `false`, which exists so a test can prove the variable is gone from the request path. It survives only for `prisma/seed.ts` and dev fixtures.

### 5. Invitations moved out of Orca

Platform Core Supabase can already invite a user through its own Auth flow, but exposes no endpoint **Orca** can call — and an invitation must also carry organization membership and a product entitlement. Rather than invent a cross-database shortcut, [invitations.ts](../web/lib/platform/invitations.ts) gates the legacy path:

- While the **legacy Orca** project authenticates: invites work as before.
- Once **Platform Core** authenticates: `POST /api/admin/invite-user` returns **410 Gone** before doing any work, and the admin UI shows an explanatory panel instead of a form.

**Required Platform Core capability**, documented in the module:

```
POST {PLATFORM_CORE_API_URL}/v1/organizations/{organization_id}/invitations
Authorization: Bearer {PLATFORM_CORE_SERVICE_TOKEN}
{ "email": "...", "product": "orca", "role": "..." }
→ returns the canonical user_id
```

Orca needs the returned canonical `user_id` so it can attach its own product rows (`EventMember`, `EventMemberRole`) to a real identity rather than an email placeholder. `resolvePlatformInvitationCapability()` is the single function that flips when this exists.

### 6. Email identity bridge retired

The Phase 1 bridge now defaults **off in production** and on elsewhere (where fixtures create users without a Platform id). Production can re-enable it with `PLATFORM_IDENTITY_EMAIL_BRIDGE=true` for a migration window only.

Even while enabled, the Phase 1 guarantee holds and is re-tested here: a **different** Platform user sharing an email address is refused (`PLATFORM_IDENTITY_CONFLICT`) and never inherits the existing Orca identity.

### 7. Logout is Platform logout

`signOut({ scope: "global" })` ends the session everywhere, Orca's organization-context cookies are cleared first, then the browser is sent to the configured Platform Core sign-out URL. Clearing only Orca's cookies would have left the user authenticated centrally and bounced them straight back in — the confusing re-entry the brief calls out.

### 8. Entitlement boundary

[entitlements.ts](../web/lib/platform/entitlements.ts) makes entry a decision separate from authentication.

**The claim contract Platform Core must satisfy** — on `auth.users.app_metadata`, which is server-controlled (`user_metadata` is user-editable and is deliberately never consulted):

```jsonc
{
  "signalthread": {
    "products": ["orca"],
    "organizations": ["<canonical-org-uuid>"]   // read but not yet authoritative
  }
}
```

Claims ride on the verified session, so **no call back to Platform Core happens on the request path** — the audit's hot-path constraint is preserved. A test asserts no `fetch(` appears in the auth path.

| Situation | Decision |
|---|---|
| Claims name `orca` | GRANTED (`platform-claims`) |
| Claims present, `orca` absent | DENIED (`PLATFORM_ENTITLEMENT_MISSING_PRODUCT`) — authoritative everywhere |
| No claims, production | DENIED (`PLATFORM_ENTITLEMENT_UNAVAILABLE`) — **fails closed** |
| No claims, migration mode, linked + provisioned | GRANTED (`migration-provisioned`) |
| No claims, migration mode, unlinked or unprovisioned | DENIED |

Migration mode never approves on authentication alone: it requires a canonical `platformUserId` **and** provisioned Orca access (an organization membership, or an elevated Orca role such as `SUPER_ADMIN`, which is itself state a human deliberately created).

The development bypass (`DEV_ALLOW_NO_MEMBERSHIP`, already gated to `NODE_ENV=development`) can waive an *absent* entitlement, but **cannot** override an explicit Platform Core denial.

### 9. Organization context — transitional

Unchanged on purpose. `claims.organizations` carries **canonical Platform Core** organization ids, while Orca's `Organization.id` is still locally generated. The id spaces are not comparable, so intersecting them today would deny every user the moment Platform Core started issuing organization claims.

Organization context therefore stays decided by local `Membership` rows and the existing `activeOrgId` cookie. This is safe because Phase 2 also removed auto-provisioning: nothing can *gain* a membership any more, so a user's organization reach can only shrink. `arePlatformOrganizationClaimsAuthoritative()` returns `false` and is pinned by a test so this stays a deliberate decision rather than an omission. **Phase 3 replaces it.**

### 10. Orca RBAC untouched

`event-access.ts`, `canListOrganizationEvents`, `EventMember`, and `EventMemberRole` are unchanged. Platform entitlement establishes that a person *may enter Orca*; Orca's own checks still decide what they may do. A DB-backed test proves a user fully entitled by Platform Core — including a claim naming the event's organization — is still refused cross-organization event access.

---

## Environment variables

Placeholders only; no real values appear in this repository.

| Variable | New | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL` | Phase 1 | Platform Core auth project. Set with the anon key to cut over |
| `NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY` | Phase 1 | as above |
| `PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY` | Phase 1 | auth administration against Platform Core |
| `NEXT_PUBLIC_PLATFORM_CORE_APP_URL` | **Phase 2** | Platform Core web app base, e.g. `https://platform.example.com` |
| `NEXT_PUBLIC_ORCA_APP_URL` | **Phase 2** | this Orca deployment's base URL, for return-to links |
| `NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH` | **Phase 2** | optional; defaults to `/signin` |
| `NEXT_PUBLIC_PLATFORM_CORE_SIGN_OUT_PATH` | **Phase 2** | optional; defaults to `/signout` |
| `PLATFORM_ENTITLEMENT_MODE` | **Phase 2** | `claims` or `migration`. Defaults to `claims` in production |
| `PLATFORM_PRODUCT_KEY` | **Phase 2** | optional; product key in entitlement claims, defaults to `orca` |
| `ALLOW_LEGACY_ORCA_AUTH_AUTHORITY` | **Phase 2** | `true` permits legacy auth in production — rollback only |
| `PLATFORM_IDENTITY_EMAIL_BRIDGE` | Phase 1 | now defaults **off** in production |
| `DEFAULT_ORG_ID` | existing | **Obsolete.** No runtime reference remains anywhere in the repository, including `prisma/seed.ts`. Do not carry it forward |

No live Supabase configuration was modified and no `.env` file was written.

---

## Deployment / cutover order

Each step is independently reversible. Do not proceed until the previous one is verified.

1. **Before anything else:** confirm `SPEAKER_INTAKE_TOKEN_SECRET` is set (Phase 1). Speaker links are independent of auth, and a test pins that, but the secret must exist before the project changes.
2. **Provision Platform Core** — create the Supabase project, mint identities, and set `signalthread.products` in `app_metadata` for every user who should reach Orca.
3. **Backfill identities:** `npm --prefix web run platform:backfill-user-ids` (dry run), resolve every reported conflict, then `--commit`. It must report **zero** unresolved users.
4. **Audit memberships.** Auto-provisioning is gone, so any user who previously relied on `ensureMembershipForUser` creating a `Membership` will now be denied. Query for users with no `Membership` row and provision them explicitly before cutover. *This is the highest-risk step in the phase.*
5. **Deploy Phase 2 with legacy auth still active** — set `ALLOW_LEGACY_ORCA_AUTH_AUTHORITY=true`, leave `PLATFORM_ENTITLEMENT_MODE=migration`. Nothing changes for users; the new code paths run.
6. **Set entry routing** — `NEXT_PUBLIC_PLATFORM_CORE_APP_URL`, `NEXT_PUBLIC_ORCA_APP_URL`. `/login` now redirects centrally.
7. **Cut over auth** — set the Platform Core Supabase variables and `PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY`, remove `ALLOW_LEGACY_ORCA_AUTH_AUTHORITY`. Orca invites become 410 at this moment; Platform Core must be issuing invitations first.
8. **Enforce entitlements** — remove `PLATFORM_ENTITLEMENT_MODE` (production defaults to `claims`). Verify a user without the `orca` product is refused.
9. **Retire the bridge** — ensure `PLATFORM_IDENTITY_EMAIL_BRIDGE` is unset (production default is off). Confirm `identityLinkMode` on `GET /api/me` reports `CANONICAL` for real sessions.

## Rollback

| Step to undo | Action |
|---|---|
| 9 | set `PLATFORM_IDENTITY_EMAIL_BRIDGE=true` |
| 8 | set `PLATFORM_ENTITLEMENT_MODE=migration` |
| 7 | unset the Platform Core Supabase variables and set `ALLOW_LEGACY_ORCA_AUTH_AUTHORITY=true` — legacy sign-in and Orca invites return |
| 6 | unset `NEXT_PUBLIC_PLATFORM_CORE_APP_URL` — `/login` renders the legacy form again |
| 5 | redeploy `main` |

Every rollback is a configuration change except the last. **Nothing in Phase 2 is a data migration**: no schema change, no migration file, no backfill beyond the Phase 1 script. Rolling back cannot lose data.

The one thing rollback does **not** undo is step 4: memberships provisioned explicitly are simply correct data either way.

---

## Compatibility behaviour that remains

1. **Legacy Orca auth still works outside production**, and inside production behind an explicit flag.
2. **The email bridge still exists**, off by default in production.
3. **Migration entitlement mode still exists** and is the default outside production.
4. **Organization context is still local** (see §9). Phase 3 replaces it.
5. **`SUPER_ADMIN`, `canListOrganizationEvents`, `User.orgId`, and the local `/platform` admin area are untouched** — Phase 4.
6. **The dev fallback remains**, development-gated, carrying an explicit development entitlement that returns `null` in production.
7. **`/login` still exists as a path**, now purely a redirector.

---

## Corrections to the audit

Recorded in the audit's Implementation Status section:

- §A.2 assumed the login page and callback would simply be **deleted**. Deleting `/login` would have orphaned thirteen redirect call sites; making it a configurable redirector is smaller and keeps the destination in one place. The callback is *narrowed* rather than deleted, because under a PKCE handoff Orca still needs to exchange the code for a session against Platform Core.
- The audit did not note that the `(app)` route-group guard ran its own weaker `getSession()` check. It now delegates to the canonical resolver.
- **Self-correction:** an earlier draft of this document concluded Platform Core did not exist, from the absence of a Platform Core GitHub repository. Platform Core Supabase does exist; see *Correction to an earlier premise* above. Nothing in the implementation depended on the wrong premise — the design was already "configuration, not code" — but the readiness assessment did, and is restated there.

---

## Phase 3 prerequisites

Phase 3 (canonical organization and event IDs) needs, in order:

1. **Platform Core issuing organization claims** with canonical ids, and a decision on whether Orca adopts those ids as `Organization.id` (audit §B recommends adopt-as-PK).
2. **A decision on who mints `event_id`** (audit Open Decision 4) — Platform Core on create, or Orca generating and registering.
3. **Resolution of `EventMember` ownership** (audit Open Decision 1) — recommendation stands: Platform Core grants event *access*, Orca keeps `EventMemberRole` as its capability layer.
4. **A reseed window.** `Event.id` is embedded in 162 route paths, R2 object keys, and signed speaker tokens; the audit recommends reseed over migration, which requires wiping the R2 bucket.
5. **Step 4 of the cutover above completed** — canonical org adoption assumes every user's access is explicit, not inherited from auto-provisioning.

Only once (1) lands can `arePlatformOrganizationClaimsAuthoritative()` flip and the transitional organization context in §9 be removed.
