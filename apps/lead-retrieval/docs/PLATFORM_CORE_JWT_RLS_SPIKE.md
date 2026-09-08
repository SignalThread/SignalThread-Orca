# Platform Core → LR Supabase JWT/RLS Spike

- **Verdict:** **FAIL — required end-to-end proof not yet completed.** This is a proof-status failure, not evidence that the architecture is impossible. Supabase has the necessary asymmetric/OIDC and third-party JWT capabilities, but no disposable Platform/LR project pair exists, and production configuration/data was intentionally not changed.
- **Recommended auth architecture:** Platform Core Supabase Auth as the canonical OIDC issuer; LR Supabase configured with a supported Third-Party Auth trust for the Platform issuer; LR authorization remains database-projected and RLS-enforced.
- **Does Platform JWT work directly against LR Supabase?:** **NO in the current LR configuration.** A deliberately untrusted ES256 token was rejected with HTTP `401`, PostgREST code `PGRST301`. **Expected YES after a Platform issuer trust is configured, but not yet live-proven.**
- **Does `auth.uid()` resolve correctly?:** **NO proof yet.** Supabase documents `sub` as the user UUID and `auth.uid()` as the requesting user ID; the exact cross-project mapping must still be observed in a disposable project.
- **Authorized RLS read/write:** **FAIL — not run.** Production writes were prohibited and no disposable LR target exists.
- **Cross-tenant denial:** **FAIL — not run.** The applicable RLS is present and deployed, but the required cross-project-token test was not run.
- **Mobile architecture preserved:** **YES in the recommended design; not yet proven end to end.** The bearer continues directly to LR PostgREST and no LR Admin API or service-role credential is introduced.
- **Production changes required:** Configure LR Third-Party Auth trust for the Platform issuer; ensure Platform tokens contain UUID `sub` and `role: authenticated`; resolve the existing `public.users.id → auth.users.id` foreign-key coupling without creating shadow LR identities; later switch mobile token acquisition to Platform Auth. No RLS weakening is required.
- **Remaining risk:** Supabase-to-Supabase Third-Party Auth acceptance and exact claim mapping need a live disposable-project test. The current profile foreign key prevents new Platform-only users from having an LR authorization projection without a small schema-boundary decision.

## Current JWT/RLS Path

The sibling `lead-intel-scan` app confirms that its lead data path is direct to LR Supabase, not service-role mediated:

1. Supabase Auth creates a mobile session.
2. The mobile client sends the session access token as `Authorization: Bearer <access_token>` and sends the LR public/anon API key as `apikey`.
3. The client calls LR `/rest/v1` directly for lead reads, inserts, and updates.
4. PostgREST selects the `authenticated` Postgres role from the JWT `role` claim.
5. LR RLS evaluates `auth.uid()` and joins that UUID through `public.users` and `public.event_users`.

Local evidence:

- `lead-intel-scan/lib/supabase.ts` builds direct `/rest/v1/<table>` requests with the session access token in `Authorization`.
- `lead-intel-scan/lib/api.ts` performs direct `supabase.from('leads').insert(...)` operations, including offline outbox synchronization.
- `lead-intel-scan/lib/company-context.tsx` reads `public.users` by the session user ID and probes `event_users` for app access.
- LR migrations `0064`, `0065`, and `0069` are all listed as applied by `supabase migration list --linked` on 2026-08-12.

The decisive lead policies are in `supabase/migrations/0069_consolidate_mobile_app_viewer_capture_rls.sql`. For `exhibitor_viewer`, SELECT/INSERT/UPDATE require all of the following:

- `public.users.id = auth.uid()`
- `public.users.role = 'exhibitor_viewer'`
- `public.users.company_id = leads.company_id`
- `event_users.user_id = public.users.id`
- `event_users.event_id = leads.event_id`
- `event_app_permission_enabled(event_users.permissions)`

This is the correct authorization shape for offline-first direct capture: the JWT supplies identity, while database rows supply tenant and event authorization.

One important current-schema constraint is defined in `0001_phase1.sql`:

```sql
public.users.id uuid primary key references auth.users(id) on delete cascade
```

No later migration drops that foreign key. Existing LR users already have matching LR Auth and profile UUIDs. A future user created only in Platform Auth cannot receive a new `public.users` projection under the current constraint unless LR also receives a shadow `auth.users` row. That would duplicate identity ownership and is not recommended.

## Proposed Platform JWT Path

```text
Platform Core Supabase Auth
  ├─ user UUID U is the canonical global_user_id
  ├─ access token: iss=Platform Auth, sub=U, role=authenticated
  └─ asymmetric signature with kid published by Platform JWKS
           │
           ▼
LR Supabase API Gateway / PostgREST
  ├─ validates Platform issuer/signature through Third-Party Auth
  ├─ selects Postgres role authenticated
  └─ exposes JWT sub as auth.uid() = U
           │
           ▼
LR RLS
  ├─ public.users projection id=U
  ├─ event_users membership for U
  └─ permits only matching company/event lead rows
```

Supabase's current documentation establishes the necessary platform primitives:

- Supabase Auth supports asymmetric signing keys and publishes trusted public keys at `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`: [JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys).
- Supabase Auth can operate as an OIDC issuer with discovery metadata and JWKS: [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server).
- Supabase APIs can accept JWTs from other asymmetric OIDC issuers through Third-Party Auth and apply them to the Data API, Storage, Realtime, and Functions: [Third-party auth](https://supabase.com/docs/guides/auth/third-party/overview).
- Custom/third-party JWTs are passed to the target Supabase project as the bearer while a target-project publishable key remains in `apikey`: [JSON Web Tokens](https://supabase.com/docs/guides/auth/jwts).
- Supabase JWTs carry UUID `sub` and the Postgres `role` claim: [JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields).

The current LR project already publishes asymmetric OIDC material. Read-only requests on 2026-08-12 returned:

```text
GET /auth/v1/.well-known/jwks.json                 200
active public key algorithm                        ES256
active public key type                             EC P-256

GET /auth/v1/.well-known/openid-configuration     200
issuer                                              https://imkrdrscrikxqywdcmzy.supabase.co/auth/v1
jwks_uri                                            https://imkrdrscrikxqywdcmzy.supabase.co/auth/v1/.well-known/jwks.json
```

This proves that a new Platform Core Supabase project can use the required asymmetric/JWKS model and that Supabase projects expose the OIDC metadata needed by a trust consumer. It does not by itself prove that LR has been configured to trust a separate Platform project.

## Configuration Required

Use two disposable Supabase projects. Do not use the production LR project for this proof.

### 1. Disposable Platform issuer

Create `st-platform-jwt-spike`:

- Enable or rotate to an asymmetric signing key (`ES256` or `RS256`).
- Confirm a non-empty JWKS endpoint.
- Confirm OIDC discovery advertises the same issuer and JWKS URL.
- Create one throwaway Auth user and record its UUID as `U`.
- Obtain a normal user access token from Platform Auth.
- Decode without trusting it and confirm:
  - `iss = https://<PLATFORM_REF>.supabase.co/auth/v1`
  - `sub = U`
  - `role = authenticated`
  - header contains the expected asymmetric `alg` and `kid`

Do not mint a service-role token and do not place a service key in mobile code.

### 2. Disposable LR target

Create `st-lr-rls-spike`:

- Apply the LR schema/migrations, especially `0064`, `0065`, `0066`, `0069`, and their prerequisites.
- Configure a Third-Party Auth trust using the Platform issuer/discovery/JWKS.
- Use the disposable LR publishable key only for the `apikey` header.
- Do not use the LR service-role key for any proof request. Service role may be used only to seed and clean disposable fixtures.

The desired trust is issuer-scoped OIDC/JWKS trust, not a shared symmetric secret. Importing one private signing key into both projects is technically another supported custom-JWT mechanism, but it couples signing domains and should not be the first choice.

### 3. Projection boundary

For the disposable proof only, remove the `public.users.id → auth.users.id` foreign key before inserting the Platform-only projection. Keep the primary key, role constraint, company foreign key, grants, and RLS intact.

The test-only operation must be identified explicitly in the evidence bundle, for example:

```sql
alter table public.users drop constraint users_id_fkey;
```

Confirm the actual constraint name from `pg_constraint` first. Do not apply this statement to production during the spike.

This test-only decoupling is necessary to prove one canonical Auth identity without creating an LR Auth shadow user. A production migration, if later approved, should separately analyze lifecycle behavior currently inherited from `on delete cascade`.

### 4. Test-only identity probe

Create a disposable, security-invoker RPC to observe the request identity:

```sql
create function public.spike_auth_uid()
returns uuid
language sql
stable
security invoker
as $$ select auth.uid() $$;

grant execute on function public.spike_auth_uid() to authenticated;
```

Drop this function when deleting or cleaning the disposable target. It is evidence instrumentation, not production architecture.

## Test Procedure

Use deterministic fixture UUIDs for companies, events, and leads. Use Platform's generated Auth UUID as `U`.

### Seed fixtures using target-project administrative setup

1. Create Company A and Company B.
2. Create Event A owned by Company A and Event B owned by Company B.
3. Insert the LR authorization projection:

   ```sql
   insert into public.users (id, role, company_id, full_name)
   values (U, 'exhibitor_viewer', COMPANY_A, 'Platform JWT spike user');
   ```

4. Insert one active `event_users` row for `(U, EVENT_A, COMPANY_A)` with `{"app": true}` permissions.
5. Do not insert a membership for Event B.
6. Seed one allowed lead in Company A/Event A and one denied lead in Company B/Event B.

No test setup should modify production rows.

### Request headers

Every proof request must use:

```http
apikey: <DISPOSABLE_LR_PUBLISHABLE_KEY>
Authorization: Bearer <PLATFORM_USER_ACCESS_TOKEN>
Content-Type: application/json
```

The Platform token must never be placed in the `apikey` header.

### Identity assertion

```http
POST /rest/v1/rpc/spike_auth_uid
```

Expected response: UUID `U` exactly.

### A. Authorized SELECT

```http
GET /rest/v1/leads?id=eq.<ALLOWED_LEAD_ID>&select=id,company_id,event_id,owner_user_id
```

Expected: HTTP `200` with exactly the Company A/Event A row.

### B. Authorized INSERT

```http
POST /rest/v1/leads?select=id,company_id,event_id,owner_user_id
Prefer: return=representation

{
  "company_id": "<COMPANY_A>",
  "event_id": "<EVENT_A>",
  "owner_user_id": "<U>",
  "full_name": "Platform JWT authorized spike lead"
}
```

Expected: HTTP `201` with one inserted row.

### C. Cross-tenant SELECT

```http
GET /rest/v1/leads?id=eq.<DENIED_LEAD_ID>&select=id,company_id,event_id
```

Expected: HTTP `200` with `[]`. For SELECT, RLS normally conceals inaccessible rows rather than returning an authorization error. Zero rows is the denial evidence.

### D. Cross-tenant INSERT

```http
POST /rest/v1/leads?select=id
Prefer: return=representation

{
  "company_id": "<COMPANY_B>",
  "event_id": "<EVENT_B>",
  "owner_user_id": "<U>",
  "full_name": "Platform JWT denied spike lead"
}
```

Expected: HTTP `403` with an RLS `WITH CHECK` violation and no inserted row.

Also run a same-company/wrong-event INSERT to prove the `event_users.event_id` gate independently of the company gate.

### Evidence capture

Record, with tokens and API keys redacted:

- Platform JWT protected header and non-sensitive claims.
- Platform JWKS key matching the JWT `kid`.
- LR Third-Party Auth configuration identifier, issuer, and resolved JWKS timestamp.
- HTTP status, PostgREST code, and redacted response body for all five requests.
- Fixture UUIDs.
- Administrative verification that the allowed insert exists and both denied inserts do not.
- Cleanup confirmation.

## Test Results

### Observed

| Check | Result | Evidence |
|---|---:|---|
| LR uses asymmetric signing/JWKS | PASS | Public LR JWKS returned one ES256/EC P-256 verification key. |
| LR exposes OIDC discovery | PASS | Public discovery returned the LR issuer and JWKS URI. |
| Mobile uses bearer directly with PostgREST | PASS | `lead-intel-scan/lib/supabase.ts` and `lib/api.ts`. |
| Required mobile RLS migrations deployed | PASS | Linked migration list shows `0064`, `0065`, and `0069` applied. |
| LR rejects an unknown asymmetric key today | PASS | Ephemeral ES256 token request returned HTTP `401`, `PGRST301`, `No suitable key or wrong key type`. |
| Platform issuer trusted by disposable LR | NOT RUN | Requires disposable projects/configuration approval. |
| Platform JWT `sub` observed as LR `auth.uid()` | NOT RUN | Requires configured trust and identity probe. |
| Authorized RLS SELECT | NOT RUN | Production read was not substituted for the required isolated proof. |
| Authorized RLS INSERT | NOT RUN | Production writes prohibited. |
| Cross-tenant SELECT denied | NOT RUN | Requires disposable fixtures. |
| Cross-tenant INSERT denied | NOT RUN | Requires disposable fixtures. |

Repository verification performed after writing this spike:

- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- Targeted RLS/migration tests: 18 PASS, 1 FAIL. The failure is the existing source-regex assertion `lead list requires eventId for bearer exhibitor_viewer` in `tests/exhibitor-mobile-app-authorization.test.ts`; the current route no longer contains the exact expression the test expects. No application or test code was changed as part of this documentation-only spike.

### Current rejection control

A five-minute ES256 JWT was generated in memory with:

- `kid = platform-spike-untrusted`
- `sub = 11111111-1111-4111-8111-111111111111`
- `role = authenticated`

It was sent to the production LR Data API only as a read-only `GET /rest/v1/leads?select=id&limit=1`, using the normal LR anon/public API key. No token or key material was logged. Result:

```json
{
  "status": 401,
  "code": "PGRST301",
  "message": "No suitable key or wrong key type"
}
```

This is a useful negative control: LR is not accepting arbitrary external JWTs. It does not replace the positive configured-trust test.

## Security Validation

The recommended proof preserves these properties:

- **No service role on mobile.** The LR publishable key identifies the target project; the Platform user JWT supplies identity.
- **No API bypass.** PostgREST and LR RLS remain the enforcement point.
- **No authorization from mutable user metadata.** Company and event scope remain in LR tables.
- **No trust by UUID alone.** LR first validates issuer/signature/expiry and only then uses `sub` as identity.
- **Tenant isolation is tested both ways.** SELECT must conceal the other tenant's row, and INSERT must fail `WITH CHECK`.
- **Key rotation is supported.** The consumer follows Platform JWKS by `kid`; Supabase notes that third-party key changes may take up to 30 minutes to propagate.
- **Least privilege claim.** The Platform token must contain `role: authenticated`, never `service_role`.
- **Short token lifetime.** Offline verification cannot detect logout instantly. Keep access tokens short-lived and use normal refresh-token rotation.

The current LR RLS itself does not need to trust company/event claims embedded in the JWT. That is preferable because membership revocation takes effect immediately in LR without waiting for a Platform token refresh.

## Mobile Impact

If the positive test passes, LR Mobile's data architecture remains intact:

- Offline scans continue to queue locally.
- When connectivity returns, the outbox writes directly to LR PostgREST.
- The only auth plumbing change is that the bearer comes from Platform Core and the LR client uses it through Supabase's `accessToken` option (or the existing bearer wrapper during a staged migration).
- The LR publishable key remains safe to ship; no LR secret or service-role key is added.
- Existing RLS continues to validate live LR company/event membership.

The mobile session-refresh design must use Platform Core's refresh token. A Platform access token cannot be refreshed through LR Auth.

## Orca/Voice Server Verification

Orca, Voice, and other products can verify Platform JWTs without a synchronous Platform database call on each request when Platform uses an asymmetric signing key.

Server verification should:

1. Load Platform's remote JWKS.
2. Select the public key by JWT `kid`.
3. Verify the signature and restrict allowed algorithms.
4. Require the exact Platform `issuer`.
5. Require the intended `audience`/token purpose.
6. Validate `exp`, `nbf`, and UUID `sub`.
7. Cache JWKS within the documented rotation window and support cache busting during emergency revocation.

Example shape:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const platformIssuer = "https://<PLATFORM_REF>.supabase.co/auth/v1";
const platformJwks = createRemoteJWKSet(
  new URL(`${platformIssuer}/.well-known/jwks.json`)
);

export async function verifyPlatformAccessToken(token: string) {
  return jwtVerify(token, platformJwks, {
    issuer: platformIssuer,
    audience: "authenticated",
    algorithms: ["ES256"]
  });
}
```

This performs local cryptographic verification after JWKS retrieval/cache and does not query Platform Core's database per request. Supabase recommends JWKS-based verification for asymmetric tokens: [JavaScript `getClaims`](https://supabase.com/docs/reference/javascript/auth-getclaims) and [JWT documentation](https://supabase.com/docs/guides/auth/jwts).

Authorization that depends on current product-local state can still require a local product database lookup. That is distinct from authenticating the token and does not require a synchronous Platform Core lookup.

## Alternatives if Needed

| Alternative | Canonical identity | Offline-first capture | `auth.uid()` effect | Security implications | Complexity | Duplicate identities |
|---|---|---|---|---|---:|---:|
| Supported Third-Party Auth / custom OIDC trust | Platform UUID remains canonical | Preserved | Expected to equal Platform `sub` | Strong issuer/JWKS trust; LR RLS remains authoritative | Medium | No, after projection FK is decoupled |
| Token/session exchange into LR Supabase | Platform can remain business key, but LR session becomes operational identity | Preserved after exchange/refresh | Resolves to LR Auth subject | Adds exchange service, refresh/revocation coordination, and account-link integrity risk | High | Usually yes |
| Claims-based RLS | Platform UUID remains canonical | Preserved | Still Platform `sub` if direct trust exists | Company/event claims can become stale until refresh; wider RLS rewrite and claim-governance burden | Medium–High | No |
| Route mobile operations through LR Admin API | Platform UUID can remain canonical | Local queue remains, but sync architecture changes | Database operations generally run as server/service identity, not mobile `auth.uid()` | Centralizes enforcement but creates a high-value API/service-role boundary | High | No |

An additional mechanism is importing/shared signing-key trust. It can make custom JWTs acceptable to the Data API, but sharing a private key across product projects broadens the blast radius and complicates directional trust. Prefer issuer-scoped Third-Party Auth if Supabase accepts the Platform Supabase issuer in the disposable test.

## Recommendation

Proceed with **Platform Core Supabase Auth as the single canonical identity provider plus LR Third-Party Auth trust**, contingent on the disposable end-to-end test passing.

Do not design a token exchange or move mobile writes behind LR Admin yet. The documented capabilities strongly support the direct path, and the current RLS structure is already aligned with UUID identity projection.

Before migration design, resolve one schema issue explicitly: LR authorization projections must no longer require a local `auth.users` parent for new Platform-only users. Prefer decoupling the profile/projection foreign key over creating LR Auth shadow users. Preserve `public.users.id` as the canonical Platform UUID and retain company/event authorization in LR tables.

Because the required positive and denial operations were not run, this document intentionally does not claim the architecture is proven.

## Exact Next Step

Obtain approval to create two disposable Supabase projects (or one disposable Platform project plus one disposable LR preview branch with isolated data and billing understood):

1. `st-platform-jwt-spike` — Platform Auth issuer with ES256 and one throwaway user.
2. `st-lr-rls-spike` — LR schema/RLS clone with no production data.

Then execute the five-request matrix in **Test Procedure**, capture redacted evidence, delete the disposable infrastructure, and update the top verdict:

- `PASS` only if identity RPC equals `U`, allowed SELECT/INSERT succeed, and both cross-tenant operations are denied.
- `PASS WITH CAVEATS` if the JWT/RLS flow passes but requires a documented projection-FK migration or provider-specific operational constraint.
- `FAIL` if a properly configured Platform token cannot be accepted directly by LR PostgREST or does not map `sub` to `auth.uid()`.

No Platform Core migration should begin before that result is recorded.
