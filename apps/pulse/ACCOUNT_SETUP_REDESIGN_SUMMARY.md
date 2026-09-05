# Profile Settings / Account Setup — Fix Summary

## Files Changed

| File | Changes |
|------|---------|
| `app/app/settings/profile/page.tsx` | A) Blue map pin next to each location card; B) Branding 2-col layout (Logo Upload left, Color Palette right), dashed dropzone, guidance text; C) Consent: title+subtitle side-by-side, live preview card; D) Save success/error banner (auto-hide 2.5s); E) Logo upload: dropzone, auto-save after upload, credentials, error state |
| `app/api/app/account/logo-presign/route.ts` | Base URL fallback from request URL when origin headers missing; ensures logoUrl is always valid |

---

## Storage & Data Flow

### Where branding settings are stored
- **Account.settingsJson.branding** (JSON field)
- Fields: `logoUrl`, `primaryColor`, `primaryButtonColor`
- Read/write: `GET/PATCH /api/app/account/settings?account=<slug>`

### Where consent settings are stored
- **Account.settingsJson.consent** (JSON field)
- Fields: `title`, `subtitle`, `items` (string[]), `buttonText`
- Read/write: `GET/PATCH /api/app/account/settings?account=<slug>`

### What URL/field the survey uses for logo + colors
- **Kiosk:** `GET /api/kiosk/event-details?eventId=xxx` returns `event.branding` and `event.consent` (from event → location → account → settingsJson)
- **Logo:** `branding.logoUrl` — full URL (S3 public or `/api/app/logo?key=...` proxy)
- **Colors:** `branding.primaryButtonColor` (CTAs), `branding.primaryColor` (accents, progress bar)

---

## Success Message Trigger

- **When:** Any save succeeds (location, branding, consent)
- **How:** `showSaveMessage('success', '...')` is called in the success path of each save handler
- **UI:** Fixed banner at top center, green background, white text
- **Auto-hide:** 2.5 seconds via `setTimeout`
- **Error:** Same banner, red background, on save failure

---

## Logo Upload Flow

1. User clicks or drops file in dashed dropzone
2. Client calls `POST /api/app/account/logo-presign` (credentials: include) with account, fileName, fileSize, mimeType
3. Server returns presigned PUT URL + logoUrl
4. Client PUTs file to presigned URL
5. On success: client updates local state and calls PATCH settings to persist logoUrl
6. Success banner shows "Logo saved"
7. On failure: `logoUploadError` state + success banner (error) + `console.warn`

---

## Implemented Requirements

- **A) Locations:** Blue map pin icon next to each location item (inside each card)
- **B) Branding:** 2 columns (Logo Upload left, Color Palette right); dashed dropzone; guidance (PNG/SVG/JPG, transparent preferred, max 56×220px, <2MB); Primary Button Color + Primary Color only; Save Branding button
- **C) Consent:** Live preview card; Title and Subtitle side-by-side; Consent items with add/remove; Button text; Preview reflects current edits
- **D) Save confirmation:** Success banner (green, auto-hide 2.5s); Error banner (red) on failure
- **E) Logo upload:** Dropzone with click + drag/drop; auto-save after upload; credentials; error handling; baseUrl fallback in presign
