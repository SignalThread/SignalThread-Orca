# 🎯 Application URLs

## 🎤 Voice Capture (Kiosk)

**Default Event:**
```
http://localhost:3000/kiosk
```
Generic questions for any event

**Retail Demo Event:**
```
http://localhost:3000/kiosk?eventId=retail-demo
```
Retail-specific questions (food quality, service speed, staff)

---

## 📊 Admin Dashboard

**Admin Home:**
```
http://localhost:3000/admin
```
Landing page with event links · **Theme switcher in header** (☀️ Light / 🌙 Dark / 💻 System)

**Default Event Overview:**
```
http://localhost:3000/admin/events/default-kiosk-event
```
View responses and insights for default event (Events template)

**Retail Demo Overview:**
```
http://localhost:3000/admin/events/retail-demo
```
View responses and insights for retail event (Retail template)

**Default Event Responses:**
```
http://localhost:3000/admin/events/default-kiosk-event/responses
```
List all responses for default event

**Retail Demo Responses:**
```
http://localhost:3000/admin/events/retail-demo/responses
```
List all responses for retail event

**Response Detail:**
```
http://localhost:3000/admin/events/{eventId}/responses/{responseId}
```
View single response with transcripts and analysis

---

## 🎨 Admin Features

**Theme Support:**
- Light mode, dark mode, and system preference
- Switch themes via dropdown in admin header
- Preference saved per browser

**Template Switching:**
- Use dropdown in event overview to switch between Events/Retail views
- Different datasets and UI presentation per template

**Insights:**
- Event-level aggregated analysis
- Click "Recompute Insights" to refresh
- Question-level drilldown with stats

---

## 🛠️ Development Tools

### Initial Setup (First Time Only)

**Install MinIO (Required for File Storage):**
```bash
brew install minio/stable/minio
```

**Setup Local Database:**

**Option 1: Standalone MinIO (Recommended)**

MinIO runs as a standalone process - **you must start it manually in a separate terminal**:

```bash
# Start MinIO server (keep this running)
minio server ~/minio --console-address ":9001"
```

- **API**: http://localhost:9000
- **Console**: http://localhost:9001
- **Credentials**: `minioadmin` / `minioadmin`
- **Bucket**: Must create bucket `booth-audio-recordings` via console (first time only)
- **Important**: App will error with `ECONNREFUSED` if MinIO is not running

**Option 2: Docker Compose (Alternative)**

If you prefer Docker, you can run PostgreSQL and MinIO together:

```bash
# Check Docker is installed and running
./CHECK_DOCKER.sh

# Start both services
docker compose up -d

# Or start individually
docker compose up -d postgres
docker compose up -d minio

# Stop services
docker compose down

# Full reset (removes data)
docker compose down -v
```

### Daily Development

**Start Dev Server:**
```bash
npm run dev
```
App runs at `http://localhost:3000`

**Start MinIO (if using standalone):**
```bash
# Run in separate terminal - keep running while developing
minio server ~/minio --console-address ":9001"
```

**Hard Restart Dev Server (after .env changes):**
```bash
./RESTART_DEV_SERVER.sh
```
Kills processes, clears cache, verifies config, starts fresh

**Database Health Check:**
```
http://localhost:3000/api/health/db
```
Tests Prisma connection · Returns `{ok:true}` or `{ok:false, code, message}`

**Prisma Studio:**
```bash
npx prisma studio
```
Browse and edit database records at `http://localhost:5555`

**MinIO Console:**
```
http://localhost:9001
```
Login: `minioadmin` / `minioadmin`

**Create Retail Demo Event:**
```bash
npx ts-node --transpile-only scripts/update-retail-questions.ts
```

**Verify Questions:**
```bash
npx ts-node --transpile-only scripts/verify-questions.ts
```
