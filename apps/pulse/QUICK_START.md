# 🚀 Quick Start Guide

Get SignalThread running in 5 minutes.

## Prerequisites Check

- [ ] Node.js 18+ installed (`node --version`)
- [ ] PostgreSQL running (`psql --version`)
- [ ] S3 bucket or MinIO setup
- [ ] OpenAI API key (for Phase 2+)

## Step-by-Step Setup

### 1. Install Dependencies (2 min)

```bash
npm install
```

### 2. Configure Environment (1 min)

```bash
cp env.example .env.local
```

Edit `.env.local` - **Minimum required:**

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/booth_audio"
S3_BUCKET_NAME="your-bucket"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="your-key"
S3_SECRET_ACCESS_KEY="your-secret"
S3_ENDPOINT="https://s3.amazonaws.com"
```

**Local Development with MinIO:**

```bash
# Install MinIO
brew install minio/stable/minio

# Start MinIO
minio server ~/minio-data --console-address :9001

# Update .env.local
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
```

### 3. Setup Database (1 min)

```bash
# Create database (if needed)
createdb booth_audio

# Generate Prisma Client and run migration
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Start Development Server (30 sec)

```bash
npm run dev
```

Open http://localhost:3000 🎉

## Testing the API

### Test Presigned Upload

```bash
# 1. Request presigned URL
curl -X POST http://localhost:3000/api/recording/presign \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.webm",
    "fileSize": 1024000,
    "mimeType": "audio/webm",
    "consentVersion": "v1.0"
  }' | jq

# Save the sessionId and uploadUrl from response

# 2. Upload test file (replace <presigned-url>)
curl -X PUT "<presigned-url>" \
  -H "Content-Type: audio/webm" \
  --data-binary @test-audio.webm

# 3. Confirm upload (replace <session-id> and <etag>)
curl -X POST http://localhost:3000/api/recording/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<session-id>",
    "objectEtag": "<etag-from-step-2>",
    "durationMs": 5000,
    "language": "en"
  }' | jq

# 4. Check session status
curl http://localhost:3000/api/sessions/<session-id> | jq
```

## Verify Setup

✅ **Database Connected**: `npx prisma studio` opens at http://localhost:5555  
✅ **S3 Working**: Upload test above succeeds  
✅ **API Responding**: GET http://localhost:3000 shows home page

## Common Issues

### "Cannot find module '@prisma/client'"
```bash
npx prisma generate
```

### "Can't reach database server"
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in .env.local
- Create database: `createdb booth_audio`

### "S3 upload failed"
- Check S3 credentials
- Verify bucket exists
- Check CORS configuration (AWS S3)
- Ensure S3_ENDPOINT is correct

### "MIME type not allowed"
Update `.env.local`:
```bash
ALLOWED_MIME_TYPES="audio/webm,audio/mp4,audio/mpeg,audio/wav"
```

## Initialize Git Repository

```bash
git init
git add .
git commit -m "feat: Phase 1 - Core infrastructure and presigned upload API"
git branch -M main

# Optional: Add remote and push
# git remote add origin https://github.com/yourusername/booth-audio.git
# git push -u origin main
```

## What's Next?

Phase 1 is complete! ✅

**Awaiting approval for Phase 2:**
- Kiosk recording UI with MediaRecorder
- Background processing orchestration
- OpenAI Whisper integration
- GPT-4 analysis integration

See `PHASE_1_COMPLETE.md` for full details.

## Development Workflow

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Check code quality
npm run db:studio    # Open database GUI
```

## Need Help?

1. Check `README.md` for comprehensive documentation
2. Review `PHASE_1_COMPLETE.md` for what's implemented
3. See `GIT_SETUP.md` for version control setup

---

**Ready to proceed?** 🚀 Let your team lead know Phase 1 is complete!
