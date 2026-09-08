# APP ARCHITECTURE

Last verified from code: 2026-03-07
Primary verification sources:
- `/Users/ali/Documents/lead-intel-scan/app/_layout.tsx`
- `/Users/ali/Documents/lead-intel-scan/app/(tabs)/_layout.tsx`
- `/Users/ali/Documents/lead-intel-scan/app/(tabs)/leads/_layout.tsx`
- `/Users/ali/Documents/lead-intel-scan/screens/*.tsx`
- `/Users/ali/Documents/lead-intel-scan/lib/api.ts`
- `/Users/ali/Documents/lead-intel-scan/lib/company-context.tsx`
- `/Users/ali/Documents/lead-intel-scan/lib/supabase.ts`

## 1) Architecture Overview
Lead Intel Scan is an Expo Router React Native app.

High-level architecture:
- UI layer: screen modules in `/screens` mounted by Expo Router routes in `/app`.
- App-level providers: `ThemeProvider` and `CompanyProvider` in root layout.
- Data layer: Supabase client + API helpers in `lib/supabase.ts` and `lib/api.ts`.
- State model: local component state for UX responsiveness, persisted to shared Supabase tables.

The mobile app is a thin operational client over a backend shared with the Admin app.

## 2) Surface / Navigation Architecture
### Routes and structure
- Root stack (`/app/_layout.tsx`):
  - `(auth)` stack
  - `(tabs)` stack
  - `edit-profile`
- Auth routes:
  - `/(auth)/sign-in`
- Tab routes:
  - `/(tabs)/index` -> Capture
  - `/(tabs)/leads` -> leads nested stack
  - `/(tabs)/priority`
  - `/(tabs)/settings`
- Leads stack:
  - `/(tabs)/leads/index`
  - `/(tabs)/leads/[id]`

### User flow
1. Authenticated user lands in tab shell.
2. Capture scans QR -> inserts lead -> routes to lead detail.
3. Leads tab supports list browsing + card-level quick edits + modal edit.
4. Lead detail supports focused editing and save.
5. Priority tab shows ranked leads from same dataset.
6. Settings manages account context, active event stats, and app theme.

## 3) Backend Architecture
Shared backend: Supabase Auth + Postgres (shared with Admin app).

Mobile-side backend responsibilities:
- Authenticate user sessions.
- Resolve tenant context (`company_id`) via `public.users` row.
- Query/update shared `public.leads` records.
- Resolve related metadata from `companies` and `events`.
- Call Admin API endpoint for invite redeem (`POST /api/invites/redeem`) using Supabase bearer token.

Separation of concerns:
- Mobile app: fast capture + action updates.
- Admin app: operational management/reporting on same records.

## 4) State Model
### Local state
- Screen-level `useState` for form inputs, loading flags, modal visibility, and optimistic interactions.
- `useFocusEffect` used heavily for refetch on return to screen.

### Shared app context
- `CompanyProvider` stores `userId`, `companyId`, `activeCompanyId`, `role`.
- Supports `activeCompanyId` switching for platform admin scope.
- `ThemeProvider` stores selected visual theme and exposes semantic tokens.

### Stable sync points
- Star rating updates write `rating` + mapped `priority_score`.
- List/detail synchronization is focus-refetch based.
- Follow-up date changes persist from both list and detail flows.

## 5) Feature Modules
### Capture module (`screens/CaptureScreen.tsx`)
Purpose:
- Badge scan entry point and lead creation.

Inputs:
- Camera QR payload.
- Company/user context from `CompanyProvider` + session.
- Active event lookup.

Outputs:
- Inserts lead row (`company_id`, `event_id`, `owner_user_id`, `full_name`, `job_title`, `priority_score`, `status='new'`).
- Routes to lead detail.

Notes:
- Includes flash toggle + local audio record UX.
- Audio URI is currently UI-local and not persisted in insert payload.

### Leads list module (`screens/LeadsScreen.tsx`)
Purpose:
- Display scoped leads and allow fast in-list updates.

Inputs:
- Scoped lead query by `company_id`.

Outputs:
- Immediate writes for rating/priority and follow-up date.
- Modal save for name/title/company/rating/temperature/follow_up_date.
- Navigation into detail screen.

### Lead detail module (`screens/LeadDetailScreen.tsx`)
Purpose:
- Focused lead editing and read-only insight display.

Inputs:
- `id` route param.
- Lead row + related event/company lookups.

Outputs:
- Save writes `full_name`, `job_title`, `rating`, `priority_score`, `follow_up_date`.
- Back/navigation return to Leads context.

Notes:
- AI insights use fallback content if row fields missing.
- Enrichment fields are render-only (no write path).

### Priority module (`screens/PriorityScreen.tsx`)
Purpose:
- Ranked view of top leads for rapid triage.

Inputs:
- Scoped lead query, optional active event filter.

Outputs:
- Sorted/ranked cards with route to lead detail.

### Settings module (`screens/SettingsScreen.tsx`)
Purpose:
- Account summary, current event stats, app preferences.

Inputs:
- Session + `users`, `companies`, `events`, `leads` queries.

Outputs:
- Sign out.
- Theme switch persisted locally.

## 6) Shared-System Context
```text
[Expo Mobile App] -----\
                        \ 
                         > [Supabase Auth + DB] <----- [Admin Web App]
                        /
[Invite Redeem API] ----

Future:
[Enrichment Workers/Services] --> write enrichment fields --> [Supabase DB]
```

Interpretation:
- Mobile and Admin are sibling clients over one backend contract.
- Mobile does not own enrichment generation.
- Contract changes to shared lead fields impact both surfaces.


## 7) Admin CRM Integrations: Salesforce
Last verified from code: 2026-06-21

Salesforce integration is multi-tenant by LR account/company. LR uses one Salesforce External Client App / Connected App registration to identify the LR application during OAuth, but each customer authorizes access to their own Salesforce org. Customers do not use the LR-owned Salesforce developer org or token.

Canonical storage model:
- OAuth callback saves Salesforce credentials to `integrations` with `account_id = sessionUser.company_id` and `provider = "salesforce"`.
- The uniqueness/upsert key is `account_id,provider`, so each LR account has at most one Salesforce connection per provider.
- Salesforce `instance_url` is stored as `provider_account_id`; access/refresh tokens are stored on the account-scoped integration row.
- Sync settings are stored separately in `integration_sync_configs`, also scoped by `account_id` and `provider = "salesforce"`.

Verified code paths:
- OAuth save: `app/api/integrations/salesforce/callback/route.ts`
  - `account_id: sessionUser.company_id`
  - `.upsert(..., { onConflict: "account_id,provider" })`
- Setup page load: `app/admin/integrations/salesforce/setup/page.tsx`
  - loads `integrations` with `.eq("account_id", sessionUser.company_id)` and `.eq("provider", "salesforce")`
  - loads `integration_sync_configs` with the same account/provider scope
- Disconnect: `app/admin/integrations/salesforce/setup/page.tsx`
  - deletes only rows matching the current session account/company and `provider = "salesforce"`
- Sync execution: `lib/integrations/salesforce/syncLeadToSalesforce.ts`
  - loads sync config by `accountId` and `provider = "salesforce"`
  - calls `salesforceFetch(accountId, ...)`
- Salesforce API client: `lib/integrations/salesforce/client.ts`
  - loads tokens from `integrations` by `.eq("account_id", normalizedAccountId)` and `.eq("provider", "salesforce")`
  - sends API requests to the account-specific stored `provider_account_id` instance URL

Required invariant:
```text
Customer A connects Salesforce -> integrations.account_id = Customer A company_id -> Customer A Salesforce instance/token
Customer B connects Salesforce -> integrations.account_id = Customer B company_id -> Customer B Salesforce instance/token
Customer A and B must never read, overwrite, disconnect, or sync with each other's Salesforce token or instance URL.
```

Operational note:
- If the LR-owned Salesforce org that hosts the External Client App / Connected App is deleted, the global OAuth `SALESFORCE_CLIENT_ID` / `SALESFORCE_CLIENT_SECRET` become invalid and new customer connections fail with `invalid_client_id`.
- Fixing that does not require rebuilding the integration. Create a replacement Salesforce External Client App, update Vercel production env vars, redeploy, and keep the per-account token storage unchanged.

## 8) Constraints / Non-Goals
- No enrichment execution logic in mobile app.
- Mobile app is not the admin/reporting system.
- No active use of legacy `is_hot` / `quick_tags` in mobile UX.
- Avoid adding app-only schema assumptions that diverge from shared backend.

## 9) Risks / Watchouts
1. Schema drift risk across app/admin for shared `leads` contract.
2. Role string mismatch risk:
   - App types currently include `exhibitor_admin`.
   - SQL/RLS docs/migrations use `exhibitor`.
3. Legacy “hot” semantics are partially retained via `status` checks despite hot-column removal from app logic.
4. `lib/api.ts` still contains legacy mock helpers and deprecated scan-value helpers (`qr_value`/`raw_payload`) that are not core runtime paths but can mislead future work.
