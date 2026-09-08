# Load Test Cleanup (TEMP)

This checklist tracks temporary load-testing and debug code that must be removed or gated before production.

## Auth bypass
- [ ] Remove `x-dev-bypass` shortcut in `/Users/ali/Documents/lead retrieval app/middleware.ts`.
- [ ] Remove `x-dev-bypass` API bypass handling in `/Users/ali/Documents/lead retrieval app/lib/supabase/middleware.ts`.
- [ ] Remove mock dev session branch in `/Users/ali/Documents/lead retrieval app/lib/auth/resolveApiSession.ts`.
- [ ] Verify API auth in production requires real cookie/bearer auth only.

## Upload debug flags
- [ ] Remove `x-debug-fail-part` support from `/Users/ali/Documents/lead retrieval app/app/api/conversations/upload/chunked/complete/route.ts`.
- [ ] Remove `failPartNumber` query/body handling from `/Users/ali/Documents/lead retrieval app/app/api/conversations/upload/chunked/complete/route.ts`.
- [ ] Remove any debug-only fail-part parsing helpers once forced-failure testing is complete.

## Logging
- [ ] Reduce or remove verbose multipart upload logging in:
  - `/Users/ali/Documents/lead retrieval app/app/api/conversations/upload/route.ts`
  - `/Users/ali/Documents/lead retrieval app/app/api/conversations/upload/chunked/session/route.ts` (if temporary logs are added)
  - `/Users/ali/Documents/lead retrieval app/app/api/conversations/upload/chunked/chunk-urls/route.ts` (if temporary logs are added)
  - `/Users/ali/Documents/lead retrieval app/app/api/conversations/upload/chunked/complete/route.ts`
- [ ] Remove test-only grep-friendly debug log variants once validation is done.

## Test-only code paths
- [ ] Remove forced failure simulation logic in chunked upload finalize flow.
- [ ] Remove test-only branches in chunked endpoints (`session`, `chunk-urls`, `complete`) after load validation.
- [x] Keep strict finalize validation that all expected parts exist before completion.
- [x] Keep automatic abort cleanup for failed multipart sessions.

## Storage cleanup
- [ ] Run one-time multipart cleanup in R2 to abort stale/ongoing uploads.

### One-time command: list and abort all ongoing multipart uploads (R2)
```bash
set -a
source .env.local
set +a

node --input-type=module -e '
import { S3Client, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

const bucket = process.env.R2_BUCKET;
const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const prefix = process.env.R2_MULTIPART_PREFIX || "conversations/";
if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error("Missing R2 env vars (R2_BUCKET/R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY).");
}

const client = new S3Client({
  endpoint,
  region: "auto",
  credentials: { accessKeyId, secretAccessKey }
});

let keyMarker;
let uploadIdMarker;
let total = 0;

while (true) {
  const res = await client.send(
    new ListMultipartUploadsCommand({
      Bucket: bucket,
      Prefix: prefix,
      KeyMarker: keyMarker,
      UploadIdMarker: uploadIdMarker
    })
  );

  const uploads = res.Uploads || [];
  for (const upload of uploads) {
    if (!upload.Key || !upload.UploadId) continue;
    total += 1;
    console.log(`[R2 MULTIPART] aborting key=${upload.Key} uploadId=${upload.UploadId}`);
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: upload.Key,
        UploadId: upload.UploadId
      })
    );
  }

  if (!res.IsTruncated) break;
  keyMarker = res.NextKeyMarker;
  uploadIdMarker = res.NextUploadIdMarker;
}

console.log(`[R2 MULTIPART] aborted_total=${total}`);
'
```

