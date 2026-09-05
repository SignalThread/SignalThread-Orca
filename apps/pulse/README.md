# Pulse

> **Monorepo note.** Pulse lives at `apps/pulse` in the SignalThread workspace alongside
> `apps/orca` and `apps/platform`. Install from the repository root (`npm install`) — there is
> no lockfile in this directory; npm workspaces hoist dependencies to the root `node_modules`.
> From the root, `npm run dev:pulse` starts Pulse on port 3002 so it can run beside Orca
> (3000) and Platform (3001); inside this directory `npm run dev` still defaults to 3000.
> Pulse is an independent product: it must not import from another `apps/*` (enforced by
> `npm run boundaries`). See `docs/DEPLOYMENT_BOUNDARIES.md`.

A production-ready Next.js application for collecting audio feedback in kiosk mode with AI-powered transcription and analysis.

**🎉 Current Status**: Core MVP Complete + Multi-Tenancy + Account-Scoped Navigation  
**✅ Production-Ready**: Multi-question flow, AI processing, responsive UI, text-to-speech, and multi-tenant architecture

## 🎯 What Is This?

Record voice feedback in a browser → Upload directly to S3 → AI transcription and sentiment analysis → Admin dashboard with insights.

**Key Capabilities:**
- 🎤 **Multi-question feedback collection** in browser (no app install)
- 🏢 **Multi-tenant architecture** (Account → Location → Event hierarchy)
- 🔐 **Account-scoped navigation** with deterministic routing per account
- 🎯 **Multi-event support** (separate questions and responses per event)
- 🤖 **AI-powered insights** (transcription, sentiment, themes, action items)
- 📊 **Dual admin surfaces**: Platform admin + Customer admin dashboards
- 🌱 **Demo data seeding** (realistic feedback with full analysis pipeline)

## ✨ Features

### Kiosk Mode (Attendee Experience)
- ✅ **Multi-question feedback** with sequential recording flow
- ✅ **Browser-based audio recording** (MediaRecorder API, no app install)
- ✅ **Text-to-speech** auto-reads questions with manual Listen/Stop control
- ✅ **Direct-to-S3 uploads** via presigned URLs (no server bottleneck)
- ✅ **Real-time transcription** using OpenAI Whisper
- ✅ **AI-powered analysis** with sentiment, themes, and actionable insights
- ✅ **Progress indicators** showing question N of M
- ✅ **Instant feedback display** showing transcript and insights after each answer
- ✅ **Fully responsive** mobile-first design with edge-to-edge immersive layout

### Admin Dashboard

**Platform Admin** (`/admin/**` - SUPER_ADMIN only):
- ✅ **Account Selector** (`/admin`) - View all accounts, click to manage
- ✅ **Account Management APIs** for creating and listing accounts
- ✅ **Generic kiosk link** (no account/event scoping)

**Customer Admin** (`/app/**` - Account-scoped):
- ✅ **Account Home** (`/app`) - DB-driven navigation
  - Account KPIs (total events, responses, avg sentiment)
  - Location hierarchy with nested events
  - Account-specific kiosk link (first active event)
- ✅ **Event Dashboard** (`/app/events/[eventId]`)
  - Event KPIs (total, completed, completion rate, sentiment)
  - Executive insights (summary, sentiment, themes, actions)
  - Event-specific kiosk link
  - Recompute insights button
- ✅ **Account isolation** - Each account sees only their own data
- ✅ **Mock authentication** via cookies for development
- ✅ **iOS-style Light/Dark mode toggle** with localStorage persistence
- ✅ **Fully responsive** design for phone, tablet, and desktop

### Data Model
- ✅ **Multi-tenant architecture**: Account → Location → Event → Response → Answer
- ✅ **Anonymous responses** (no auth/PII for MVP)
- ✅ **Question management** via `Event.questionsJson` (JSONB field)
- ✅ **Answer pipeline**: Answer → AnswerTranscript → AnswerAnalysis → AnswerProcessingLog
- ✅ **Admin roles**: SUPER_ADMIN (platform), ADMIN (account), MANAGER (location), VIEWER (read-only)
- ✅ **Demo data seeding**: 25 responses per event with realistic feedback

### Backend APIs
- ✅ **Presigned upload flow** (`/api/answer/presign`, `/api/answer/confirm`)
- ✅ **Review APIs** (`/api/events/[eventId]/responses`, `/api/events/[eventId]/answers`)
- ✅ **Aggregation APIs** (`/api/events/[eventId]/analysis`, recompute endpoint)
- ✅ **Question APIs** (`/api/events/[eventId]/questions`)
- ✅ **Idempotent processing** (safe retries, no duplicate transcripts)

### Multi-Product Templates
- ✅ **Template-driven architecture** supporting multiple product lines (Events, Retail, Hospitality)
- ✅ **Product-specific UI** with custom labels, section ordering, and placeholder features
- ✅ **In-UI template switcher** in admin dashboard (development mode)
- ✅ **Demo mode gating** (dev-only by default, production requires `NEXT_PUBLIC_ENABLE_TEMPLATE_DEMO=true`)
- ✅ **Retail template** with priority action items, customer satisfaction focus, and retail-only sections
- ✅ **Events template** with event-specific language and question drilldown

### Multi-Event Support
- ✅ **Event-based kiosk routing** via `?eventId=` URL parameter
- ✅ **Per-event question customization** (each event can have different questions)
- ✅ **Separate data storage** (responses/answers scoped to specific events)
- ✅ **Pre-configured retail demo** (`retail-demo` event with retail-specific questions)
- ✅ **Helper scripts** for creating events and updating questions (`scripts/update-retail-questions.ts`)
- ✅ **Backward compatible** (defaults to `default-kiosk-event` if no eventId provided)

### Responsive Design & Accessibility
- ✅ **Mobile-first responsive design** across all pages
- ✅ **Breakpoint strategy**: Mobile (<640px), Tablet (640-1024px), Desktop (>1024px)
- ✅ **Kiosk: Full-width edge-to-edge** immersive layout for maximum impact
- ✅ **Admin: Constrained layouts** with max-width for optimal readability
- ✅ **Touch-friendly targets** (minimum 44px tap areas)
- ✅ **Responsive tables** with progressive column hiding on smaller screens
- ✅ **Modern viewport units** (`svh`) to handle mobile browser chrome
- ✅ **Text-to-speech accessibility** with auto-play and manual controls
- ✅ **Voice preferences** saved to localStorage for consistent experience
- ✅ **Theme system** with iOS-style Light/Dark mode toggle

## 🏗️ Tech Stack

- **Frontend**: Next.js 14 (App Router, TypeScript), Tailwind CSS, React Context (Theme)
- **UI/UX**: Fully responsive mobile-first design, Web Speech API (TTS), iOS-style controls
- **Database**: PostgreSQL with Prisma ORM
- **Object Storage**: MinIO (local) / AWS S3 (production)
- **AI**: OpenAI Whisper (transcription) & GPT-4 (analysis)

---

## 🎬 Quick Demo

### Account Selection & Navigation

**1. Login** (`/login`):
- Select an account (Platform Admin, Acme Coffee, TechConf Events)
- Click "Continue as [Account]"

**2. Platform Admin** (`/admin`):
- View all accounts
- Click account to manage
- Generic kiosk link (no event specified)

**3. Customer Admin** (`/app`):
- View account-specific data (locations, events)
- Account KPIs and metrics
- Kiosk link → first active event

**4. Event Dashboard** (`/app/events/[eventId]`):
- Event KPIs and insights
- Kiosk link → current event
- Recompute insights

**5. Kiosk** (`/kiosk?eventId=retail-sf-jan-2026`):
- Event-specific questions
- Voice recording flow
- Real-time transcription and analysis

See **[docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md)** for complete step-by-step guide.

---

## 🚀 Quick Start (Local Development)

### What's Running Locally

```
┌─────────────────────────────────────────────────┐
│  YOUR LOCAL MACHINE                             │
├─────────────────────────────────────────────────┤
│  1. Next.js (localhost:3000)                    │
│     - Kiosk UI (/kiosk)                         │
│     - API routes (/api/*)                       │
│                                                  │
│  2. MinIO (localhost:9000)                      │
│     - S3-compatible object storage              │
│     - Web Console: localhost:9001               │
│                                                  │
│  3. PostgreSQL (hosted or local)                │
│     - Managed via Prisma                        │
└─────────────────────────────────────────────────┘
```

### Setup Steps

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Set Up MinIO (Local Object Storage)
```bash
# Install MinIO
brew install minio/stable/minio

# Start MinIO, create the configured bucket, and apply browser PUT CORS
npm run storage:dev
```

#### 3. Configure Environment Variables

Create `.env.local`:

```bash
# Database (hosted or local)
DATABASE_URL="postgresql://user:password@host:5432/booth_audio"

# MinIO (Local Development)
S3_BUCKET_NAME="booth-audio-recordings"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_ENDPOINT="http://localhost:9000"
S3_PUBLIC_ENDPOINT="http://localhost:9000"

# Upload constraints
S3_UPLOAD_EXPIRES_IN=300
MAX_FILE_SIZE_BYTES=52428800
ALLOWED_MIME_TYPES="audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/ogg"

# AI (Required for transcription and analysis)
OPENAI_API_KEY="sk-..."
TRANSCRIPTION_PROVIDER="openai"
TRANSCRIPTION_MODEL="whisper-1"

# App
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional: Enable template demo mode in production (dev is auto-enabled)
# NEXT_PUBLIC_ENABLE_TEMPLATE_DEMO="true"
```

#### 4. Set Up Database
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed multi-tenant structure (accounts, locations, events)
npm run db:seed:multi-tenant

# Seed demo responses (25 per event with realistic feedback)
npm run db:seed
```

**Expected Result:**
- 2 accounts (Acme Coffee, TechConf Events)
- 3 locations (SF, NYC, Moscone)
- 3 events (2 retail, 1 conference)
- 75 responses (25 per event)
- 272 answers with full analysis pipeline

#### 5. Start Development Server
```bash
npm run dev
```

#### 6. Test the Application

**Login & Account Selection:**
```
http://localhost:3000/login
```
- Select "Acme Coffee Company"
- Click "Continue"
- Redirects to `/app` (customer admin home)

**Customer Admin Home** (`/app`):
- View Acme Coffee account data
- See 2 locations (SF, NYC) with 2 events
- Kiosk link → `/kiosk?eventId=retail-sf-jan-2026` (first event)

**Event Dashboard** (`/app/events/retail-sf-jan-2026`):
- View event KPIs (25 responses, sentiment, themes, actions)
- Kiosk link → current event
- Click "Recompute Insights" to regenerate

**Kiosk** (`/kiosk?eventId=retail-sf-jan-2026`):
- Record voice feedback for retail questions
- View transcript and insights after each answer
- Full analysis pipeline (transcription → sentiment → themes → actions)

**Platform Admin** (`/admin`):
- Login as "Platform Admin"
- View all accounts (Acme Coffee, TechConf Events)
- Click account to manage

**Verify Data:**
```bash
# Open Prisma Studio
npx prisma studio

# Check tables:
# - Account: 2 accounts
# - Location: 3 locations
# - Event: 3 events
# - Response: 75 responses
# - Answer: 272 answers
# - AnswerAnalysis: 272 analyses
```

---

## 🔄 Request Lifecycle

### Current: Multi-Question Recording Flow

```
┌──────────┐                                    ┌──────────┐
│  Browser │                                    │ Next.js  │
│  /kiosk  │                                    │  Server  │
└────┬─────┘                                    └────┬─────┘
     │                                                │
     │ 0. POST /api/response/create                  │
     │    (on consent accept)                        │
     ├──────────────────────────────────────────────►│
     │                                                │ Create Response + Attendee
     │                                                │ Fetch Questions
     │ { responseId, questions[] }                   │
     │◄──────────────────────────────────────────────┤
     │                                                │
     │ [For each question:]                          │
     │                                                │
     │ 1. POST /api/answer/presign                   │
     │    { responseId, questionId, promptLabel }    │
     ├──────────────────────────────────────────────►│
     │                                                │ Create Answer
     │                                                │ Generate presigned URL
     │ { answerId, uploadUrl, objectKey }            │
     │◄──────────────────────────────────────────────┤
     │                                                │
     │                                               ┌┴────────┐
     │ 2. PUT <uploadUrl>                            │  MinIO  │
     │    (direct upload, no server)                 │   S3    │
     ├──────────────────────────────────────────────►│         │
     │                                                │         │
     │ { ETag }                                       │         │
     │◄──────────────────────────────────────────────┤         │
     │                                                └┬────────┘
     │                                                │
     │ 3. POST /api/answer/confirm                   │
     │    { answerId, objectEtag, durationMs }       │
     ├──────────────────────────────────────────────►│
     │                                                │ Fetch audio from S3
     │                                                │ Transcribe (OpenAI Whisper)
     │                                                │ Analyze (OpenAI GPT-4)
     │                                                │ Store transcript + analysis
     │ { answerId, transcript, analysis }            │
     │◄──────────────────────────────────────────────┤
     │                                                │
     │ [Advance to next question or complete]        │
     │                                                │
     │ 4. POST /api/response/[id]/complete           │
     │    (after last question)                      │
     ├──────────────────────────────────────────────►│
     │                                                │ Mark Response COMPLETED
     │ { success: true }                             │
     │◄──────────────────────────────────────────────┤
     │                                                │
```

**Key Points:**
- Audio **never goes through** Next.js server
- Browser uploads **directly to MinIO/S3** using presigned URLs
- **Transcription and analysis** happen synchronously on confirm (MVP)
- Each question creates a separate **Answer** record
- Questions are fetched dynamically per event

---

## 🌍 Storage Options

### Local Development: MinIO

**Best for**: Local development and testing

```bash
# .env.local
S3_BUCKET_NAME="booth-audio-recordings"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_ENDPOINT="http://localhost:9000"
```

**Setup:**
```bash
brew install minio/stable/minio
minio server ~/minio-data --console-address :9001
# Create bucket at http://localhost:9001
```

### Production: AWS S3

**Best for**: Production deployment

```bash
# .env (production)
S3_BUCKET_NAME="booth-audio-prod"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="AKIA..."
S3_SECRET_ACCESS_KEY="your-secret"
S3_ENDPOINT="https://s3.amazonaws.com"
```

**Setup:**
1. Create S3 bucket in AWS Console
2. Configure CORS for browser uploads:
```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedOrigins": ["https://yourdomain.com"],
  "ExposeHeaders": ["ETag"]
}]
```
3. Create IAM user with S3 permissions
4. Add credentials to environment

### Production: Cloudflare R2

**Best for**: No egress fees, S3-compatible

```bash
# .env (production)
S3_BUCKET_NAME="booth-audio-prod"
S3_REGION="auto"
S3_ACCESS_KEY_ID="your-r2-key"
S3_SECRET_ACCESS_KEY="your-r2-secret"
S3_ENDPOINT="https://[account-id].r2.cloudflarestorage.com"
```

---

## 📋 Required Environment Variables

### Essential (Core MVP)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `S3_BUCKET_NAME` | ✅ | - | Bucket name for audio storage |
| `S3_ACCESS_KEY_ID` | ✅ | - | S3/MinIO access key |
| `S3_SECRET_ACCESS_KEY` | ✅ | - | S3/MinIO secret key |
| `OPENAI_API_KEY` | ✅ | - | For AI transcription & analysis |
| `S3_ENDPOINT` | ❌ | AWS S3 | Custom endpoint (MinIO/R2) |
| `S3_REGION` | ❌ | `us-east-1` | AWS region |
| `TRANSCRIPTION_PROVIDER` | ❌ | `openai` | Transcription service |
| `TRANSCRIPTION_MODEL` | ❌ | `whisper-1` | Whisper model version |

### Optional (Future Enhancements)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | ❌ | - | Admin authentication (32+ chars) |
| `NEXTAUTH_URL` | ❌ | - | Auth callback URL |
| `NEXTAUTH_URL` | Phase 3 | - | App URL for auth callbacks |

### Upload Constraints

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_UPLOAD_EXPIRES_IN` | 300 | Presigned URL expiry (seconds) |
| `MAX_FILE_SIZE_BYTES` | 52428800 | Max upload size (50MB) |
| `ALLOWED_MIME_TYPES` | audio/* | Comma-separated MIME types |

---

## 🗃️ Database Schema (Phase 2)

### Session
Tracks each recording with metadata and processing status.

```typescript
{
  id: string              // Unique session ID
  boothId?: string        // Kiosk identifier
  consentVersion: string  // Legal consent tracking
  consentAt: DateTime     // When consent given
  mimeType: string        // Audio format
  fileSizeBytes: number   // File size
  durationMs?: number     // Recording duration
  objectKey: string       // S3 storage key
  objectEtag?: string     // S3 ETag for verification
  status: SessionStatus   // Current status
  statusReason?: string   // Error details if failed
}
```

**Status Pipeline:**
```
CREATED → UPLOADING → UPLOADED → PROCESSING_TRANSCRIPT → 
PROCESSING_ANALYSIS → COMPLETED | FAILED
```

---

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start dev server (localhost:3000)
npm run build            # Build for production
npm run start            # Start production server

# Database (Development)
npm run db:generate      # Generate Prisma Client
npm run db:migrate       # Run migrations
npm run db:push          # Push schema (dev only)
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed demo responses
npm run db:seed:multi-tenant  # Seed accounts/locations/events

# Database (Production)
npm run db:prod:migrate  # Deploy migrations to production
npm run db:prod:push     # Push schema to production (careful!)
npm run db:prod:studio   # Open Prisma Studio (prod)
npm run db:prod:generate # Generate Prisma Client (prod)

# Code Quality
npm run lint             # Run ESLint
```

---

## 🧪 Testing the API

### 1. Test Presign Endpoint
```bash
curl -X POST http://localhost:3000/api/recording/presign \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.webm",
    "fileSize": 1024000,
    "mimeType": "audio/webm",
    "consentVersion": "v1.0"
  }' | jq
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "clx...",
    "uploadUrl": "http://localhost:9000/booth-audio-recordings/...",
    "objectKey": "recordings/...",
    "expiresIn": 300
  }
}
```

### 2. Test Upload to S3
```bash
# Use uploadUrl from previous response
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: audio/webm" \
  --data-binary @test-audio.webm \
  -v
```

**Check for**: `ETag` header in response

### 3. Test Confirm Endpoint
```bash
curl -X POST http://localhost:3000/api/recording/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<session-id>",
    "objectEtag": "<etag-from-upload>",
    "durationMs": 5000,
    "language": "en"
  }' | jq
```

### 4. Check Session Status
```bash
curl http://localhost:3000/api/sessions/<session-id> | jq
```

---

## 🚧 Project Status

### ✅ Phase 1: Core Infrastructure (Complete)
- Next.js app with TypeScript
- Prisma schema and migrations
- Presigned upload API
- Session management

### ✅ Phase 2: Recording & Upload (Complete)
- Kiosk recording UI with MediaRecorder
- Direct browser-to-S3 upload
- Audio validation (duration, size, codec)
- MinIO local development setup
- MIME type normalization

### 🔜 Phase 3: AI Processing (Next)
- Background job orchestration
- OpenAI Whisper transcription
- GPT-4 sentiment analysis
- Status tracking and error handling

### 🔜 Phase 4: Admin Dashboard
- NextAuth authentication
- Session list with filters
- Session detail with audio player
- Analytics and insights

---

## 🆘 Troubleshooting

### "Failed to fetch" on /api/recording/presign

**Cause**: MinIO is not running

**Fix**:
```bash
minio server ~/minio-data --console-address :9001
```

### "Bucket does not exist"

**Cause**: Bucket not created in MinIO

**Fix**: 
- Open http://localhost:9001
- Login: `minioadmin` / `minioadmin`
- Create bucket: `booth-audio-recordings`

### "Region is missing"

**Cause**: `S3_REGION` not set (now optional)

**Fix**: Update to latest code (defaults to `us-east-1`)

### "Invalid enum value" for MIME type

**Cause**: Browser sends `audio/webm;codecs=opus`

**Fix**: Update to latest code (MIME type now normalized)

### Prisma Client errors

**Fix**:
```bash
npx prisma generate
npm run dev
```

### Database connection issues

**Fix**:
- Verify PostgreSQL is running
- Check `DATABASE_URL` format
- Ensure database exists

---

## 📁 Project Structure

```
booth-audio/
├── app/
│   ├── admin/                        # Admin dashboard
│   │   ├── events/[eventId]/
│   │   │   ├── page.tsx              # Event overview (metrics + insights)
│   │   │   └── responses/
│   │   │       ├── page.tsx          # Response list
│   │   │       └── [responseId]/page.tsx  # Response detail
│   │   └── page.tsx                  # Admin home
│   ├── api/
│   │   ├── answer/
│   │   │   ├── presign/route.ts      # Generate presigned URL for Answer
│   │   │   └── confirm/route.ts      # Confirm upload + transcribe + analyze
│   │   ├── events/[eventId]/
│   │   │   ├── responses/route.ts    # List responses
│   │   │   ├── responses/[responseId]/route.ts  # Get response detail
│   │   │   ├── answers/route.ts      # List answers (flat)
│   │   │   ├── questions/route.ts    # List questions
│   │   │   └── analysis/
│   │   │       ├── route.ts          # Get event analysis
│   │   │       └── recompute/route.ts  # Recompute aggregations
│   │   └── response/
│   │       ├── create/route.ts       # Create Response + Attendee
│   │       └── [responseId]/complete/route.ts  # Mark complete
│   ├── kiosk/page.tsx                # Multi-question recording UI
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── admin/
│   │   └── TemplateSwitcher.tsx      # Template switcher dropdown (admin)
│   └── kiosk/
│       ├── AudioRecorder.tsx         # Recording logic (per question)
│       └── ConsentScreen.tsx         # Consent UI
├── lib/
│   ├── admin-insights.ts             # Theme/action item processing utilities
│   ├── analysis.ts                   # OpenAI GPT-4 analysis
│   ├── event.ts                      # Event/Question helpers
│   ├── prisma.ts                     # Database client
│   ├── s3.ts                         # S3/MinIO utilities
│   ├── templates/                    # Multi-product template system
│   │   ├── types.ts                  # Template types & interfaces
│   │   ├── registry.ts               # Template registry & resolution
│   │   ├── events.ts                 # Events template config
│   │   ├── retail.ts                 # Retail template config
│   │   └── index.ts                  # Public exports
│   ├── transcription.ts              # OpenAI Whisper transcription
│   └── validation.ts                 # Zod schemas
├── prisma/
│   ├── schema.prisma                 # Database schema (Event/Attendee/Response/Answer/Question)
│   └── migrations/                   # Migration files
├── scripts/
│   ├── update-retail-questions.ts    # Create retail-demo event with retail questions
│   ├── update-retail-questions.sql   # SQL version of above
│   ├── verify-questions.ts           # Verify questions for all events
│   └── cleanup-duplicate-questions.ts # One-time cleanup script
├── types/
│   └── index.ts                      # TypeScript types
├── docs/
│   ├── IDEAS.md                      # Product ideas backlog
│   └── TEMPLATES.md                  # Template system documentation
├── .env.local                        # Local environment (gitignored)
├── env.example                       # Environment template
├── PROJECT_CONTEXT.md                # High-level project status
└── README.md
```

---

## 📄 License

MIT

---

## 🤝 Contributing

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: add feature description"

# Push and create PR
git push origin feature/your-feature
```

---

**Current Version**: Core MVP Complete + Multi-Tenancy + Account-Scoped Navigation ✅  
**GitHub**: https://github.com/akamyab12/voxsignal  
**Status**: Production-ready with multi-question flow, AI processing, multi-tenant architecture, dual admin surfaces (platform + customer), account-scoped navigation, and comprehensive demo data seeding
