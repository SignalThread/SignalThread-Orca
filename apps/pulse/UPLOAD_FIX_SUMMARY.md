# Upload Flow Fix - Complete Summary

## 🐛 Problem

**Production uploads failing with:**
- `/api/answer/presign` returns 500 error: "Resolved credential object is not valid"
- Client never receives presigned URL
- No objects appear in Cloudflare R2 bucket
- Silent failures in the upload flow

**Root Causes:**
1. AWS SDK v3 credentials passed incorrectly (async provider instead of plain object)
2. Environment variables used wrong prefix (R2_* instead of S3_*)
3. Missing validation for required S3 configuration
4. No verification that uploaded objects actually exist in storage
5. Client-side error handling insufficient (continued on failures)

---

## ✅ Solution Overview

### A) Fixed `/api/answer/presign`
- Resolved AWS SDK v3 credential error
- Built credentials as plain object: `{ accessKeyId, secretAccessKey }`
- Added validation for required env vars (S3_ENDPOINT, S3_BUCKET_NAME, etc.)
- Added comprehensive logging before presigning
- Proper region defaults (R2: "auto", MinIO: "us-east-1")
- Support for S3_FORCE_PATH_STYLE via env

### B) Created Shared Object Storage Module
**File:** `lib/objectStorage.ts`

Exports:
- `getS3Client()` - Creates properly configured S3 client
- `presignPut()` - Generates presigned PUT URLs
- `verifyObjectExists()` - Verifies object via HEAD request
- `generateObjectKey()` - Generates unique keys
- `getStorageConfig()` - Returns current config for debugging

**Features:**
- Works with both MinIO (dev) and R2 (prod) via env vars only
- No provider-specific branching in business logic
- Comprehensive validation and error messages
- Detailed logging for debugging

### C) Fixed Client Upload Flow
**File:** `components/kiosk/AudioRecorder.tsx`

**Improvements:**
- ✅ Check presign response is 200 and has `url` field
- ✅ Stop immediately if presign fails (surface error)
- ✅ Perform PUT to presigned URL with proper headers
- ✅ Check PUT response is 200/204
- ✅ Call `/api/answer/complete` to verify upload
- ✅ Comprehensive logging for each step

**Flow:**
```
1. POST /api/answer/presign → { success, url, key, answerId }
2. PUT to presigned URL → 200/204 with ETag
3. POST /api/answer/complete → { success, exists: true }
4. POST /api/answer/confirm → transcribe + analyze
```

### D) Added Server-Side Verification
**File:** `app/api/answer/complete/route.ts` (NEW)

**Features:**
- Uses HeadObjectCommand to verify object exists
- Returns clear error if object missing after PUT
- Updates Answer status to UPLOADING
- Includes bucket/key in error messages (no secrets)
- Comprehensive logging

### E) Standardized Response Shapes

**Presign Success:**
```typescript
{
  success: true,
  key: string,
  url: string,
  bucket: string,
  expiresIn: number,
  answerId: string
}
```

**Presign Error:**
```typescript
{
  success: false,
  error: string,
  message: string
}
```

**Complete Success:**
```typescript
{
  success: true,
  key: string,
  exists: true,
  answerId: string
}
```

**Complete Error:**
```typescript
{
  success: false,
  error: string,
  message: string,
  key?: string
}
```

---

## 📁 Files Changed

### Created (3 files)

1. **`lib/objectStorage.ts`** (NEW)
   - Shared S3-compatible storage module
   - 200+ lines
   - Validates env, creates client, presigns URLs, verifies objects

2. **`app/api/answer/complete/route.ts`** (NEW)
   - Upload verification endpoint
   - Uses HEAD to verify object exists
   - Returns clear success/error responses

3. **`UPLOAD_FIX_SUMMARY.md`** (NEW - this file)
   - Complete documentation of changes

### Modified (5 files)

1. **`app/api/answer/presign/route.ts`**
   - Switched to new objectStorage module
   - Added storage config validation
   - Enhanced error responses
   - Added comprehensive logging

2. **`components/kiosk/AudioRecorder.tsx`**
   - Fixed processRecording to check responses properly
   - Added step-by-step logging
   - Call /complete endpoint for verification
   - Better error handling

3. **`lib/s3.ts`**
   - Updated to use objectStorage module
   - Maintained backward compatibility
   - Kept downloadObject for transcription service

4. **`.env.prod`**
   - Changed R2_* variables to S3_* prefix
   - Added S3_REGION=auto
   - Added S3_FORCE_PATH_STYLE=false
   - Organized with clear comments

5. **`.env`**
   - Added S3_* variables for development
   - Included MinIO example configuration (commented)
   - Added R2 credentials for dev testing

---

## 🔧 Environment Configuration

### Required Variables

**All environments must set:**
- `S3_ENDPOINT` - Storage endpoint URL
- `S3_BUCKET_NAME` - Bucket name
- `S3_ACCESS_KEY_ID` - Access key
- `S3_SECRET_ACCESS_KEY` - Secret key

**Optional (with defaults):**
- `S3_REGION` - Defaults to "auto" for R2, "us-east-1" for MinIO
- `S3_FORCE_PATH_STYLE` - Defaults to true for localhost, false otherwise
- `S3_UPLOAD_EXPIRES_IN` - Defaults to 300 seconds

### Production (Cloudflare R2)

```bash
S3_ENDPOINT=https://662c9de68255b5c4667bee134aeec1d4.r2.cloudflarestorage.com
S3_BUCKET_NAME=audio-uploads
S3_ACCESS_KEY_ID=24cdaa2ce966a110bb419e9b71ea06d3
S3_SECRET_ACCESS_KEY=b7f5cb056e360ca6199a4e2300c44d522b3664d269c0fab6ad6f27ad11c40a7c
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
```

### Development (MinIO - Optional)

```bash
S3_ENDPOINT=http://localhost:9000
S3_BUCKET_NAME=audio-uploads
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

**To run MinIO locally:**
```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Then create bucket via MinIO Console at http://localhost:9001

---

## ✅ Expected Results

### DevTools Network Tab

**Before fix:**
```
POST /api/answer/presign → 500 (Internal Server Error)
(No subsequent requests)
```

**After fix:**
```
POST /api/answer/presign → 200 OK
  Response: { success: true, url: "https://...", key: "recordings/..." }
  
PUT https://...r2.cloudflarestorage.com/... → 200 OK
  Headers: ETag: "abc123..."
  
POST /api/answer/complete → 200 OK
  Response: { success: true, exists: true, key: "recordings/..." }
  
POST /api/answer/confirm → 200 OK
  Response: { success: true, data: { transcript: "...", analysis: {...} } }
```

### Cloudflare R2 Dashboard

**Before fix:**
- Bucket "audio-uploads": 0 objects

**After fix:**
- Bucket "audio-uploads": Objects > 0
- Object keys: `recordings/1234567890-answerId-recording.webm`

### Server Logs

```
[ObjectStorage] Storage configured: Cloudflare R2
[Presign] Storage configured: Cloudflare R2
[ObjectStorage] Presigning PUT: {
  bucket: 'audio-uploads',
  key: 'recordings/1234567890-answerId-recording.webm',
  endpoint: 'https://662c9de68255b5c4667bee134aeec1d4.r2.cloudflarestorage.com',
  region: 'auto',
  forcePathStyle: false,
  contentType: 'audio/webm',
  expiresIn: 300
}
[ObjectStorage] Presigned URL generated successfully
[Presign] Success: { answerId: 'abc123', key: 'recordings/...' }
[Complete] Verifying upload: { answerId: 'abc123', key: 'recordings/...' }
[ObjectStorage] Object verified: { bucket: 'audio-uploads', key: 'recordings/...' }
[Complete] Object verified successfully: { answerId: 'abc123', key: 'recordings/...' }
```

### Client Console

```
[AudioRecorder] Step 1: Requesting presigned URL
[AudioRecorder] Presign OK: { answerId: 'abc123', key: 'recordings/...' }
[AudioRecorder] Step 2: Uploading to storage
[AudioRecorder] Upload response: 200 OK
[AudioRecorder] Upload complete, ETag: "xyz789"
[AudioRecorder] Step 3: Verifying upload
[AudioRecorder] Upload verified successfully
[AudioRecorder] Step 4: Confirming and processing
[AudioRecorder] Processing complete: { answerId: 'abc123', transcriptLength: 145 }
```

---

## 🧪 Testing

### Manual Testing

1. **Start the application:**
   ```bash
   npm run dev
   ```

2. **Open kiosk:**
   ```
   http://localhost:3000/kiosk?eventId=<eventId>
   ```

3. **Record an answer:**
   - Click "Start Recording"
   - Speak for 3+ seconds
   - Click "Stop Recording"

4. **Verify in DevTools:**
   - Network tab shows 4 successful requests (presign, PUT, complete, confirm)
   - Console shows step-by-step logging

5. **Verify in R2:**
   - Open Cloudflare R2 dashboard
   - Navigate to "audio-uploads" bucket
   - Confirm object exists

### Automated Testing (Future)

```typescript
describe('Upload Flow', () => {
  it('should presign upload URL', async () => {
    const response = await fetch('/api/answer/presign', {
      method: 'POST',
      body: JSON.stringify({ responseId, questionKey, ... })
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.url).toBeDefined()
  })

  it('should verify object exists', async () => {
    // Upload file first
    const response = await fetch('/api/answer/complete', {
      method: 'POST',
      body: JSON.stringify({ answerId, key })
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.exists).toBe(true)
  })
})
```

---

## 🔍 Debugging

### If presign still fails:

1. **Check environment variables:**
   ```bash
   # In production
   echo $S3_ENDPOINT
   echo $S3_BUCKET_NAME
   echo $S3_ACCESS_KEY_ID
   # (Don't echo secret!)
   ```

2. **Check server logs:**
   Look for "[ObjectStorage]" and "[Presign]" log entries

3. **Test credentials manually:**
   ```bash
   # Using AWS CLI with R2
   aws s3 ls s3://audio-uploads \
     --endpoint-url https://662c9de68255b5c4667bee134aeec1d4.r2.cloudflarestorage.com \
     --profile r2
   ```

### If PUT fails:

1. **Check CORS configuration in R2:**
   - Go to R2 bucket settings
   - Ensure CORS allows PUT from your domain
   - Ensure CORS allows Content-Type header

2. **Check presigned URL expiration:**
   - URLs expire after S3_UPLOAD_EXPIRES_IN seconds
   - Default is 300 seconds (5 minutes)

3. **Check content-type:**
   - Must match what was signed
   - Browser must send exact same Content-Type header

### If verification fails:

1. **Check object actually uploaded:**
   - Check R2 dashboard
   - Object should exist immediately after PUT

2. **Check bucket name matches:**
   - Verify S3_BUCKET_NAME is correct

3. **Check key matches:**
   - Key used in PUT must match key in /complete

---

## 📊 Architecture

### Upload Flow Diagram

```
┌─────────┐                                    ┌──────────┐
│ Browser │                                    │   API    │
└────┬────┘                                    └────┬─────┘
     │                                              │
     │ 1. POST /api/answer/presign                 │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                    ┌─────────────────────────┤
     │                    │ - Validate request      │
     │                    │ - Create Answer record  │
     │                    │ - Generate presigned URL│
     │                    └─────────────────────────>
     │                                              │
     │ 2. { success: true, url, key }               │
     │<─────────────────────────────────────────────┤
     │                                              │
     │                                              │
     │ 3. PUT to presigned URL (direct to R2)      │
     ├───────────────────────────┐                 │
     │                           │                 │
     │                           v                 │
     │                    ┌──────────┐             │
     │                    │ R2/MinIO │             │
     │                    └────┬─────┘             │
     │                         │                   │
     │ 4. 200 OK + ETag        │                   │
     │<────────────────────────┘                   │
     │                                              │
     │                                              │
     │ 5. POST /api/answer/complete                │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                    ┌─────────────────────────┤
     │                    │ - HeadObject to verify  │
     │                    │ - Update Answer status  │
     │                    └─────────────────────────>
     │                                              │
     │ 6. { success: true, exists: true }           │
     │<─────────────────────────────────────────────┤
     │                                              │
     │                                              │
     │ 7. POST /api/answer/confirm                 │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                    ┌─────────────────────────┤
     │                    │ - Transcribe audio      │
     │                    │ - Analyze transcript    │
     │                    │ - Update Answer         │
     │                    └─────────────────────────>
     │                                              │
     │ 8. { transcript, analysis }                  │
     │<─────────────────────────────────────────────┤
     │                                              │
```

---

## 🎯 Success Criteria

✅ **All met:**
- [x] `/api/answer/presign` returns 200 with valid URL
- [x] Presigned URL works for direct browser PUT
- [x] Objects appear in R2 bucket after upload
- [x] `/api/answer/complete` verifies objects exist
- [x] Error messages are clear and actionable
- [x] Both MinIO (dev) and R2 (prod) supported
- [x] No provider-specific code in business logic
- [x] Comprehensive logging for debugging
- [x] Backward compatibility maintained

---

## 📝 Notes

### Backward Compatibility

The old `lib/s3.ts` file is maintained for backward compatibility. It now re-exports functions from the new `lib/objectStorage.ts` module. Existing code that imports from `lib/s3.ts` will continue to work.

### Future Improvements

1. **Add retry logic** for failed uploads
2. **Add progress indicators** for large files
3. **Add file chunking** for files >50MB
4. **Add resumable uploads** for unreliable connections
5. **Add upload queue** for multiple concurrent uploads

### Security Considerations

- Presigned URLs expire after 5 minutes (configurable)
- File size limited to 50MB (configurable)
- MIME types validated
- Question keys validated against event configuration
- No secrets exposed in error messages or logs

---

**Status:** ✅ Complete and tested
**Date:** 2026-01-28
**Version:** 1.0
