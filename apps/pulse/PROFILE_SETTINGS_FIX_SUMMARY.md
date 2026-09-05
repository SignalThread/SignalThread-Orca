# Profile Settings / Logo Upload Fix — Summary

## Files Changed

| File | Changes |
|------|---------|
| `app/app/settings/profile/page.tsx` | Logo upload box redesigned to match design (dashed border, upload icon in light circle, "Click to upload or drag and drop", "PNG, JPG or SVG (recommended: 400x400px)", "Choose File" button, helper text); switched to server-side upload; location marker icon (classic map pin); "Saved" toast on success |
| `app/api/app/account/logo-upload/route.ts` | **NEW** — Server-side logo upload via multipart form; uploads to S3, returns logoUrl; avoids CORS issues with presigned PUT |

---

## What Was Wrong With Logo Upload/Save

**Problem:** The presigned PUT flow requires the browser to upload directly to S3/R2. If the bucket CORS config does not allow the app origin, the PUT fails and the logo never saves. Also, the post-upload PATCH was sending the full branding object (including null colors), which could overwrite existing的颜色 when doing a logo-only save.

**Fix:** (1) Added a server-side upload route (`POST /api/app/account/logo-upload`) that accepts the file via multipart form and uploads it server-side to S3. The server has direct access and is not blocked by CORS. (2) The logo-only save now sends only `{ branding: { logoUrl } }`, so existing colors are not overwritten.

---

## Final Persisted Field & Where Survey Reads From

- **Persisted field:** `Account.settingsJson.branding.logoUrl` (string)
- **Survey reads from:** `GET /api/kiosk/event-details?eventId=xxx` → `event.branding.logoUrl` (derived from event → location → account → settingsJson)
- **Flow:** Profile Settings saves to `Account.settingsJson`. The kiosk fetches event-details for the event’s location’s account and uses that branding. ConsentScreen and question screens render the logo from `eventDetails.branding.logoUrl`; it is not shown on the Thank You page.
