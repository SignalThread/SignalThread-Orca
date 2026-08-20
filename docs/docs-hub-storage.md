# Docs Hub Storage Notes

## Where are docs posted?
- Production uploads are stored in a Cloudflare R2 bucket using S3-compatible presigned uploads.
- Object keys use this prefix pattern:
  - `org/{orgId}/events/{eventId}/docs/{documentId}/v{versionNumber}/{filename}`
- A Cloudflare "folder" is not a separate object; it is only part of the key prefix.

## Local development
- If `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` are not configured, uploads fall back to local filesystem storage under `web/.uploads`.
- Upload flow stays the same for the UI:
  1. Request presign
  2. Upload file
  3. Finalize upload in DB
