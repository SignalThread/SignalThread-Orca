# SignalThread

## What's DONE

### Core Recording & Analysis
- ✅ Local audio recording kiosk (`/kiosk`) working
- ✅ **Text-to-speech accessibility**:
  - Auto-reads questions after consent (once per question)
  - Manual Listen/Stop control in progress bar
  - Voice preferences saved to localStorage
  - Browser Web Speech API (speechSynthesis)
  - Recording disabled until TTS completes (with fallback timer)
- ✅ **Presigned upload flow** (production-ready)
  - `/api/answer/presign` - Generates presigned PUT URLs
  - `/api/answer/complete` - Verifies object exists in storage (NEW)
  - `/api/answer/confirm` - Transcribes and analyzes
  - Shared object storage module (`lib/objectStorage.ts`)
  - Proper AWS SDK v3 credential handling (plain object)
  - Server-side verification via HeadObjectCommand
  - Client-side error handling at each step
  - Comprehensive logging for debugging
- ✅ **S3-compatible storage** (dev + prod)
  - **Production**: Cloudflare R2
  - **Development**: MinIO (local) or R2 (shared)
  - Single codebase works for both via env vars
  - No provider-specific branching in business logic
- ✅ Audio files successfully uploaded and persisted in R2
- ✅ Transcription working end-to-end using OpenAI Whisper
- ✅ Transcript stored in DB and returned in API response
- ✅ AI analysis (summary, sentiment, themes, action items, key quote)
- ✅ Insights rendered in the UI (verified working)
- ✅ Processing logs persisted
- ✅ **Fully responsive design** (mobile-first, edge-to-edge kiosk layout)
- ✅ **Professional UI polish** with consistent component system
- ✅ **Demo data seeding**: 25 responses per event with realistic feedback
  - Full analysis pipeline (transcript + sentiment + themes + actions)
  - 75 responses, 272 answers across 3 events
  - Idempotent seed script (safe to re-run)

### Data Model & Multi-Event Support
- ✅ **Event-scoped architecture**: Event → Attendee → Response → Answer → Question
- ✅ **Multi-question attendee flow** working end-to-end
- ✅ **Multi-event support** via URL parameter (`?eventId=retail-demo`)
  - Each event can have different questions
  - Responses/answers scoped to specific events
  - Kiosk routes to correct event via query param
  - Backward compatible (defaults to `default-kiosk-event`)
- ✅ **Retail demo event** pre-configured with retail-specific questions
  - Food/beverage quality
  - Service speed
  - Staff experience
  - General feedback

### Admin Dashboard

**Surface Split** (Middleware Guards):
- ✅ **Platform Admin** (`/admin/**`) - SUPER_ADMIN only
  - Account selector page (`/admin`)
  - View all accounts, click to manage
  - Generic kiosk link (no event specified)
  - Account management APIs
  - Retail provisioning form (`/admin/provision`)
- ✅ **Customer Admin** (`/app/**`) - Account-scoped
  - Account home (`/app`) with DB-driven navigation
  - Location hierarchy with nested events
  - Event dashboard (`/app/events/[eventId]`)
  - Account isolation (only see own data)
  - Account-specific kiosk links (first active event)
- ✅ **Supabase Authentication** (production-ready)
  - Password-based authentication (email + password)
  - Magic link option (temporarily disabled, code preserved)
  - `/login` page with forgot password link
  - `/auth/callback` server-side route for session exchange (HttpOnly cookies)
  - `/auth/reset` page for password reset flow
  - Session persistence via Supabase SSR helpers
  - Role-based access control (SUPER_ADMIN, ADMIN, MANAGER, VIEWER)
  - User table bridges Supabase auth to app authorization
  - Auto-redirect based on role (SUPER_ADMIN → /admin, others → /app)
  - Invite-based onboarding with PendingProvision tracking

**Platform Admin** (`/admin`):
- ✅ Account list with dynamic cards
- ✅ Account management APIs (GET, POST)
- ✅ Generic navigation (no account context)

**Customer Admin** (`/app`):
- ✅ **Account Home** - KPIs and DB-driven navigation
  - Total events, responses, avg sentiment
  - Locations with nested events
  - First active event kiosk link
- ✅ **Event Dashboard** (`/app/events/[eventId]`)
  - Event KPIs (total, completed, sentiment)
  - Executive insights (summary, sentiment, themes, actions)
  - Event-specific kiosk link
  - Recompute insights button
- ✅ **Account isolation** - Each account sees only their own data
- ✅ **Query parameter-based routing** (`?account=<slug>`)
  - Replaced cookie-based mock auth with URL params
  - All `/app/**` links preserve account context
  - Simpler, stateless account scoping
- ✅ **Light/Dark mode theme system** with iOS-style toggle switch
  - High-contrast light mode (zinc-900/700/600 text progression)
  - Professional dark mode (zinc-100/300/400 text progression)
  - Subtle shadows for depth (shadow-sm on cards)
  - WCAG AA+ compliant color contrasts
- ✅ **Settings menu** with gear icon (contains theme controls)
- ✅ **Fully responsive** design (mobile, tablet, desktop)
- ✅ **Shared component system** (Card, Badge, Button, Section, PageHeader)
- ✅ Backend APIs fully account-scoped

### Template-Driven Architecture
- ✅ **Multi-product template system** (`lib/templates/`)
  - Events template (default)
  - Retail template (food service, coffee shops, restaurants)
  - Hospitality template stub (hotels, venues)
- ✅ **Template-specific configurations**:
  - Custom labels per template ("Customer Satisfaction" vs "Sentiment")
  - Custom section ordering (Retail: action items first, Events: summary first)
  - Custom theme buckets per product line
  - Custom impact keywords for action prioritization
- ✅ **In-UI template switcher** in admin dashboard (dropdown)
- ✅ **Demo mode gating** for production safety
  - Auto-enabled in development
  - Requires `NEXT_PUBLIC_ENABLE_TEMPLATE_DEMO=true` in production
- ✅ **Retail-specific UI elements**:
  - "Weekly Operations Summary" placeholder (coming soon)
  - "Google Review Campaign" placeholder (coming soon)
  - Priority action items at top (vs bottom for events)
  - No question drilldown (different UX for retail)
- ✅ **Demo override via URL**: `?demoUseCase=retail&demoVertical=coffee`

### Authentication & User Management
- ✅ **Supabase Auth Integration**
  - Password-based authentication (email + password)
  - Magic link (email OTP) option preserved for future use
  - Session persistence via Supabase SSR helpers
  - Server-side callback handler for code exchange (HttpOnly cookies)
  - Client-side callback page (loading UI only)
  - Auto-redirect based on user role after login
- ✅ **Password Reset Flow**
  - "Forgot password?" link on login page
  - Calls `resetPasswordForEmail` with `NEXT_PUBLIC_APP_URL/auth/reset`
  - `/auth/reset` page detects `PASSWORD_RECOVERY` event
  - `updateUser({ password })` to set new password
  - Environment-driven redirect URLs (dev + prod)
- ✅ **User Authorization Table** (`public.User`)
  - Bridges Supabase `auth.users` to app authorization
  - Stores role (SUPER_ADMIN, ADMIN, MANAGER, VIEWER)
  - Links to Account via `accountId` for multi-tenancy
  - Created on first login via `/api/auth/link-user`
- ✅ **Retail Provisioning System**
  - Shared provisioning function (`lib/provisioning.ts`)
  - Creates Account + Location + Retail Event (3 questions)
  - Sends Supabase invite email to owner
  - PendingProvision table tracks invite status
  - Two entry points:
    - Platform Admin: `/admin/provision` (SUPER_ADMIN only)
    - Public onboarding: `/start` (future Stripe integration)
  - Auto-links Prisma User to Account on first login
  - Redirects to `/app?account=<slug>` after setup
- ✅ **Production Database Migration**
  - Safe idempotent User table migration (`20260129000000_add_user_table_safe`)
  - Resolved toxic migration issue (bundled destructive changes)
  - Used `prisma migrate resolve --applied` strategy
  - Full documentation in `.PROD_MIGRATION_ANALYSIS.md`

### Retail Dashboard Enhancements
- ✅ **Pulse Module** - Hero metric for retail experience tracking
  - **Circular ring graphic** (SVG, 160px) wraps 0-100 score
  - **Intuitive color system**: Green (good) → Yellow (caution) → Red (critical)
  - **Status labels**: Great (≥80), Good (60-79), Mixed (40-59), Needs Attention (<40)
  - **Delta tracking**: +/- vs previous same-length period
  - **Top Drivers**: Up to 3 dynamically derived from themes/actions
  - **Fallback messaging**: "Not enough consistent signals yet" when no drivers
  - **Lightweight implementation**: Pure CSS/SVG, no heavy dependencies
- ✅ **Hero Layout** (Retail-only)
  - **Pulse**: 2/3 width, visually dominant, full-height
  - **KPIs**: 1/3 width, stacked vertically (4 boxes)
    - Responses (Last Xd)
    - Sentiment (label)
    - Sentiment Score (numeric)
    - Answers (completed/total)
  - **Responsive**: Stacks naturally on mobile (<1024px)
  - **Conditional**: Falls back to grid when no data
- ✅ **Time Period Selector** (30/60/90 days)
  - Button group in header (retail accounts only)
  - Updates all metrics: Pulse score, delta, drivers, KPIs, charts
  - API calls include `?days=${timePeriod}` parameter
- ✅ **Response Timeline Chart**
  - Clean SVG line chart (daily buckets)
  - Adapts to selected time period
  - High contrast grid lines (light/dark mode)
  - Hover tooltips with date + count
- ✅ **Retail-specific KPIs**
  - Combined "Responses" KPI (removed separate Completed)
  - Split Sentiment (label + score in separate cards)
  - Dynamic labels based on time period

Deterministic Text-to-Speech (TTS)
✅ Server-side TTS endpoint (/api/tts)
✅ Audio generated server-side and played via <audio> element
✅ Eliminates inconsistent browser speechSynthesis behavior
✅ Consistent playback across iOS, Android, and desktop
✅ Recording locked until TTS completes
✅ Safe fallback timeout to prevent deadlocks
✅ No client-side race conditions between playback and recording

Impact & Insights System
✅ Three-tier Impact scoring system
impactScore: 1 | 2 | 3
   1 = Low
   2 = Medium
   3 = High
✅ Impact derived via template-driven keyword weighting
✅ Executive UI mapping (vertical indicator + labeled state)
✅ Pulse ring status tied to existing threshold logic
✅ No backend changes required for UI impact updates

Deployment & Environment Architecture
✅ Separate Dev / UAT / Prod environments
✅ Vercel Preview deployments per branch
✅ Environment-scoped variables (Development / Preview / Production)
✅ Production database isolated via .env.prod
✅ Idempotent Prisma migrations safe for existing production data
✅ No shared production infra during local development

### UI Components & Design System
- ✅ **Shared component library** (`components/ui/`):
  - Card, Badge, Button, Section, PageHeader
  - Consistent styling and behavior across Admin
- ✅ **Light/Dark theme system** (`components/theme/`):
  - ThemeProvider with React Context
  - iOS-style toggle switch (Light ↔ Dark)
  - Respects system preference by default
  - Persistent theme choice (localStorage)
  - Instant theme switching without reload
  - **High-contrast light mode**: zinc-900/700/600 text, zinc-50 cards, visible borders
  - **Professional dark mode**: zinc-100/300/400 text, zinc-900/50 cards, subtle shadows
- ✅ **Admin dashboard components** (`components/admin/dashboard/`):
  - KPICard (metric cards with variants, shadow-sm)
  - InsightCard (structured insight display, shadow-sm)
  - ThemeTag (interactive theme pills)
  - ActionItem (prioritized action display)
  - ResponseLineChart (SVG timeline visualization)
  - PulseModule (circular ring with status/delta/drivers)
- ✅ **Responsive design system**:
  - Mobile-first approach (320px+)
  - Breakpoints: sm (640px), md (768px), lg (1024px)
  - Kiosk: Full-width edge-to-edge immersive layout
  - Admin: Constrained max-width for readability
  - Touch-friendly targets (44px minimum)
  - Modern viewport units (svh) for mobile browsers

### Developer Tools & Documentation
- ✅ Helper utilities for client-side insights processing (`lib/admin-insights.ts`)
- ✅ Helper scripts for event/question management:
  - `scripts/update-retail-questions.ts` (create retail demo event)
  - `scripts/verify-questions.ts` (verify questions across events)
  - `scripts/cleanup-duplicate-questions.ts` (one-time cleanup)
- ✅ **Comprehensive documentation**:
  - `docs/DEMO_RUNBOOK.md` (quick reference with URLs)
  - `docs/IDEAS.md` (product ideas backlog)
  - `docs/TEMPLATES.md` (template system documentation)
  - `QUICK_START.md` (setup guide)
  - **Implementation docs**:
    - `.LIGHT_MODE_FIX.md` (high-contrast light mode styling)
    - `.PULSE_V2.md` (circular ring implementation)
    - `.PULSE_COLOR_UPDATE.md` (green/yellow/red color system)
    - `.PULSE_HERO_LAYOUT.md` (retail dashboard hero layout)
    - `.QUERY_PARAM_AUTH.md` (query parameter routing)
    - `.ACCOUNT_FLOW_BUG_FIX.md` (slug vs id bug fix)
    - `.EVENT_DASHBOARD_UI_REFACTOR.md` (compact dashboard layout)
    - `.RETAIL_DASHBOARD_PULSE.md` (original Pulse v1)
    - `.USER_TABLE_INVESTIGATION.md` (User table architecture verification)
    - `.PROD_MIGRATION_ANALYSIS.md` (toxic migration diagnosis)
    - `.PROD_DEPLOYMENT_GUIDE.md` (safe migration deployment)
    - `PROD_FIX_QUICK_REF.md` (3-command production fix)
    - `UPLOAD_FIX_SUMMARY.md` (S3 credential fix + object storage module)
  - README fully updated with all features
  - env.example includes all variables
- ✅ All changes committed and stable

### Build & Stability
- ✅ **TypeScript compilation**: 100% clean (no errors)
- ✅ **Kiosk prerendering**: Suspense boundary wraps useSearchParams()
- ✅ **Mobile responsiveness**: Viewport meta tag configured
- ✅ **PostCSS/Tailwind**: Configuration verified and working
- ✅ **Multi-tenant schema alignment**: All API routes updated to new models
  - `AnswerTranscript`, `AnswerAnalysis`, `AnswerProcessingLog`
  - Questions in `Event.questionsJson` (no separate Question table)
  - `Response.anonymousId` (no separate Attendee table)
- ✅ **Dev/Prod environments**: Clean separation with `.env.local` and `.env.prod`
- ✅ **Static page generation**: All pages generate successfully
- ✅ **Prisma migrations**: Idempotent and backward-compatible
  - Multi-tenancy migration (20260124211951) safe to run on existing data
  - Old columns made nullable (attendeeId, answerType, questionId, language)
- ✅ **Seed scripts**: 
  - Multi-tenant structure seed (`npm run db:seed:multi-tenant`)
  - Demo responses seed (`npm run db:seed`)
  - Both idempotent and safe to re-run

## What's LOCKED (Core Architecture)
- **Multi-tenant data model** (Account → Location → Event → Response → Answer)
- **Anonymous responses for MVP** (no auth, no PII yet for kiosk respondents)
- **Account-scoped isolation** (each account sees only their own data)
- **Server-side processing only** (transcription + analysis never run in browser)
- **S3-compatible storage** (Cloudflare R2 in prod, MinIO option for local dev)
- **Supabase authentication** (magic link for admin users, production-ready)
- **Surface split** (platform admin vs customer admin)
- **Retail-only Pulse** (not shown on events/conference dashboards)
- **Voice-first drivers** (derived from existing themes/actions, no manual configuration)

## What's NEXT (Post-MVP Enhancements)

### Immediate Priorities
- **Auth Enhancements**: 
  - SSO integration (Google, Microsoft)
  - Multi-factor authentication
  - Session timeout configuration
- **Production Deployment**: 
  - Set up production environment (Vercel/Railway/AWS)
  - Configure production S3/R2
  - Add monitoring and logging (Sentry, LogRocket)
  - Performance testing under load
- **User Testing**: 
  - Run demos with real customers
  - Collect UX feedback
  - Iterate on navigation and insights

### Feature Enhancements
- **Account Management**:
  - Account creation flow (onboarding)
  - Account settings (branding, preferences)
  - Billing and subscription management
  - User invitations (email-based)
  - Default event selector per account
- **Kiosk UX Improvements**:
  - Branding customization per event (colors, logos)
  - Enhanced accessibility features (keyboard nav, screen reader support)
  - Error recovery flows (poor connection, mic permission denied)
  - Multi-language support for TTS and questions
  - Voice selection UI in settings
  - QR code per event for easy kiosk launch
- **Admin Dashboard Enhancements**:
  - Response list with filters (date, status, sentiment)
  - Full-text search across transcripts
  - Pagination for large response lists (1000+ responses)
  - CSV/JSON export for analytics
  - Downloadable reports (PDF summary with charts)
  - Sentiment trend visualizations
  - Location management UI
  - Event creation/editing forms

### Technical Improvements
- **Async Processing Queue**: 
  - Move transcription/analysis to background queue (BullMQ/Inngest)
  - Webhook/polling for status updates
  - Scales beyond MVP synchronous processing
- **Real-time Updates**:
  - WebSocket updates for admin dashboard (live response count)
  - Live progress indicators for kiosk (transcription status)
- **Cost Optimization**:
  - Batch transcription for cheaper per-minute pricing
  - Cache common analysis patterns
  - Optimize OpenAI prompt tokens
- **Data & Analytics**:
  - Trend detection (sentiment over time)
  - Benchmarking (compare events, compare to industry averages)
  - Predictive insights (forecast response volume)

## Ideas Backlog
For detailed product ideas, feature explorations, and future experiments, see **[docs/IDEAS.md](docs/IDEAS.md)**.

This backlog captures:
- Potential features (multi-language support, real-time notifications, integrations)
- UX/UI improvements (filters, search, pagination, branding)
- Technical enhancements (auth, async queue, monitoring)
- Analytics opportunities (trends, benchmarks, comparisons)

Each idea includes: target users, pains addressed, smallest test, risks, and monetization angle.

## Stack
Frontend / Backend: Next.js 14 (App Router, API routes)
Language: TypeScript (end-to-end)
UI: React 18 + Tailwind CSS
Database: PostgreSQL (Supabase)
ORM: Prisma
Authentication: Supabase Auth (RBAC + SSR helpers)
Storage: Cloudflare R2 (prod), MinIO option (dev)
Storage SDK: AWS SDK v3 (S3-compatible)
AI Processing:
OpenAI Whisper (transcription)
GPT-4 (analysis pipeline)
Server-side TTS endpoint (deterministic audio generation)
Architecture Pattern: Capture → Store → Transcribe → Analyze → Aggregate → Surface

## Multi-Tenant Data Model

### Hierarchy
```
Account → Location → Event → Response → Answer
```

### Key Entities
- **Account**: Top-level tenant (retail chain, event organizer, hotel group)
- **Location**: Physical location/venue (store, conference venue, hotel property)
- **Event**: Feedback campaign at a location
- **Response**: Individual respondent's session through an event
- **Answer**: Single audio answer to a question

### Data Isolation
- **Isolation Level**: Location-based
- All queries must filter by `locationId` for retail multi-tenancy
- Account admins can access all locations within their account
- Super admins can access all accounts

### Account Types
- **RETAIL**: Coffee shops, restaurants, retail stores
- **EVENTS**: Conferences, festivals, corporate events
- **HOSPITALITY**: Hotels, venues, resorts

### Admin Roles
- **SUPER_ADMIN**: Full system access (accountId = null)
- **ADMIN**: Account-level admin (all locations)
- **MANAGER**: Location-level manager
- **VIEWER**: Read-only access

### Backward Compatibility
- Legacy `Session` model remains for existing kiosk deployments
- New `locationId` field added to `Session` for gradual migration
- New retail customers use Account/Location/Event model

**Documentation**: See `docs/MULTI_TENANCY.md` for detailed architecture, query patterns, and security considerations.

## Environment Configuration (Dev vs Prod)

### Development Environment
Uses `.env` (not `.env.local`) for local development with Cloudflare R2 or MinIO.

**Setup:**
```bash
# Copy template
cp env.example .env

# Edit with your local values
# - DATABASE_URL: Supabase dev instance
# - DIRECT_URL: Supabase direct connection (for migrations)
# - S3_ENDPOINT: R2 endpoint or http://localhost:9000 (MinIO)
# - S3_BUCKET_NAME: audio-uploads
# - S3_ACCESS_KEY_ID: R2/MinIO access key
# - S3_SECRET_ACCESS_KEY: R2/MinIO secret key
# - S3_REGION: auto (R2) or us-east-1 (MinIO)
# - S3_FORCE_PATH_STYLE: false (R2) or true (MinIO)
# - NEXT_PUBLIC_SUPABASE_URL: Supabase project URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase publishable key
# - SUPABASE_SERVICE_ROLE_KEY: Supabase service role (for invites)
# - OPENAI_API_KEY: Your OpenAI key
```

**Database Commands:**
```bash
npm run db:generate   # Generate Prisma Client
npm run db:migrate    # Run migrations (creates migration files)
npm run db:push       # Push schema changes (quick dev iteration)
npm run db:studio     # Open Prisma Studio
```

### Production Environment
Uses `.env.prod` for production database operations (gitignored for security).

**Setup:**
```bash
# Copy template
cp .env.prod.example .env.prod

# Edit with your production values
# - DATABASE_URL: Supabase production connection string (pooled)
# - DIRECT_URL: Supabase direct connection (for Prisma migrations)
# - S3_ENDPOINT: Cloudflare R2 endpoint
# - S3_BUCKET_NAME: audio-uploads
# - S3_ACCESS_KEY_ID: R2 access key
# - S3_SECRET_ACCESS_KEY: R2 secret key
# - S3_REGION: auto (for R2)
# - S3_FORCE_PATH_STYLE: false (for R2)
# - NEXT_PUBLIC_SUPABASE_URL: Supabase production URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase production publishable key
# - SUPABASE_SERVICE_ROLE_KEY: Supabase production service role
# - OPENAI_API_KEY: Production OpenAI key
# - NEXT_PUBLIC_APP_URL: Your production domain
```

**Production Database Commands:**
```bash
npm run db:prod:migrate   # Deploy migrations to production (safe, no prompts)
npm run db:prod:push      # Push schema to production (careful!)
npm run db:prod:studio    # Open Prisma Studio connected to prod
npm run db:prod:generate  # Generate Prisma Client for prod schema
```

**⚠️ Production Migration Safety:**
- `db:prod:migrate` uses `prisma migrate deploy` (safe for production)
- Only applies already-created migration files
- Does NOT create new migrations or prompt for input
- Run migrations from your local machine or CI/CD
- Always test migrations in staging before production

**User Table Migration Fix:**
If production is missing the `User` table:
```bash
# 1. Mark toxic migration as applied (metadata only)
npx dotenv -e .env.prod -- prisma migrate resolve --applied 20260127012625_add_user_model

# 2. Deploy safe idempotent migration
npx dotenv -e .env.prod -- prisma migrate deploy

# 3. Verify User table exists
npx dotenv -e .env.prod -- prisma db execute --stdin <<< "SELECT * FROM \"User\" LIMIT 1;"
```
See `PROD_FIX_QUICK_REF.md` for details.

**Supabase Connection Strings:**
- **DATABASE_URL**: Connection pooling (Supavisor) - for app runtime
- **DIRECT_URL**: Direct connection - for Prisma migrations only
- Both are available in Supabase Project Settings → Database → Connection String
