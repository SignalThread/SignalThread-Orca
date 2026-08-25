# Docs Hub Implementation Notes

## Where are docs posted?
- Files are stored in a Cloudflare R2 bucket (S3-compatible) in production.
- Object key pattern:
  - `org/{orgId}/events/{eventId}/docs/{documentId}/v{versionNumber}/{filename}`
- A "folder" in Cloudflare is only a key prefix. No separate folder provisioning is required.
- Browser upload flow:
  1. Request presigned upload URL from `/api/events/[eventId]/documents/presign`
  2. Upload directly from browser to storage
  3. Finalize upload in `/api/events/[eventId]/documents/[documentId]/finalize-upload`

## Local dev fallback
- If R2 env vars are missing, uploads are stored locally under `web/.uploads` using the same API flow.

## Prisma location
- Prisma schema/migration/seed changes for Docs Hub live in the repository root:
  - `./prisma/schema.prisma`
  - `./prisma/migrations/20260226143926_docs_hub/migration.sql`
  - `../prisma/seed.ts`
