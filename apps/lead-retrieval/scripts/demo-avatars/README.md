# Demo lead avatars (one-time workflow)

This folder documents how to **ingest** a fixed batch of square headshots and **assign** them to demo leads only. Nothing here runs on page load.

## Prerequisites

1. Apply migration `0022_lead_avatar_demo.sql` (`avatar_url`, `is_demo` on `public.leads`).
2. Mark demo rows so scripts never touch production data, for example:

```sql
-- Example: only you know which leads are demo in your tenant
UPDATE public.leads
SET is_demo = true
WHERE id IN ('…uuid…', '…');
```

## 1) Download / ingest placeholder batch

Downloads 32 square images into `public/demo-avatars/` and writes `manifest.json`.

```bash
npx tsx scripts/demo-avatars/download-demo-avatars.ts
```

- **Replace** these files with your own AI-generated headshots if you prefer (keep filenames `avatar-00.png` … `avatar-31.png` or update `manifest.json` accordingly).
- You can paste your batch prompt here in team docs when you have it.

## 2) Assign URLs to demo leads (deterministic)

Uses the same `leadIdStringHash` as `lib/leads/leadCardAvatar.ts`, so each lead id always maps to the same asset.

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

npx tsx scripts/demo-avatars/assign-demo-lead-avatars.ts --company-id=YOUR_DEMO_COMPANY_UUID
```

Dry run:

```bash
npx tsx scripts/demo-avatars/assign-demo-lead-avatars.ts --company-id=YOUR_DEMO_COMPANY_UUID --dry-run
```

Stored values look like `/demo-avatars/avatar-07.png` (served from `public/` by Next.js).

## UI behavior

- **List:** `components/leads/exhibitor-leads-table.tsx` — `LeadAvatar` uses `resolveLeadAvatarSrc(leadId, avatar_url, 48)`.
- **Detail:** `components/leads/exhibitor-lead-profile-card.tsx` — `ProfileAvatar` uses `resolveLeadAvatarSrc(..., 128)`.
- If `avatar_url` is null, the UI falls back to the existing deterministic pravatar placeholder, then **initials** on image error.

## Environment variables

| Variable | Used by |
|----------|---------|
| `SUPABASE_URL` | Assignment script |
| `SUPABASE_SERVICE_ROLE_KEY` | Assignment script (server-side; never expose to the browser) |

No new `NEXT_PUBLIC_*` vars are required for relative `/demo-avatars/...` URLs.
