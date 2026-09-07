# Supabase Connection Troubleshooting

**Goal:** Get Prisma runtime working with Supabase (no Docker)

---

## 🔍 Run Diagnostics First

```bash
./DIAGNOSE_SUPABASE.sh
```

This will test:
- Network connectivity to pooler
- DNS resolution (IPv4 vs IPv6)
- Prisma CLI connection
- Runtime connection (if dev server running)
- IPv6 availability

---

## 🔧 Connection String Variations to Try

Your Supabase project appears to be: `aws-1-us-east-2` region, project ref: `xcveazzoavnizefbcjfg`

### Current Setup (Session Pooler - Port 5432)

```env
DATABASE_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
```

**Status:** ❌ Circuit breaker error

---

## 🧪 Try These Connection Strings

### Option 1: Transaction Pooler with Connection Limit

```env
DATABASE_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connect_timeout=10&pool_timeout=10"
DIRECT_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
```

**Why:** Shorter timeouts might help if connection is slow

### Option 2: Session Pooler with Longer Timeout

```env
DATABASE_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=30"
DIRECT_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
```

**Why:** Circuit breaker might be timing out too quickly

### Option 3: Direct Database Connection (if accessible)

```env
DATABASE_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@db.xcveazzoavnizefbcjfg.supabase.co:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@db.xcveazzoavnizefbcjfg.supabase.co:5432/postgres?sslmode=require"
```

**Why:** Bypasses pooler entirely (but requires IPv6)

### Option 4: Disable SSL Verification (Testing Only)

```env
DATABASE_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=prefer"
DIRECT_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=prefer"
```

**Why:** Rule out SSL handshake issues

⚠️ **Never use `sslmode=prefer` in production**

### Option 5: Add Statement Timeout

```env
DATABASE_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require&statement_timeout=60000"
DIRECT_URL="postgresql://postgres.xcveazzoavnizefbcjfg:BoothAudioDev2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
```

**Why:** Prevents queries from hanging indefinitely

---

## 🔄 Testing Workflow

For each option above:

### 1. Update .env.local

```bash
# Edit .env.local and paste one of the connection strings above
nano .env.local
```

### 2. Hard Restart Dev Server

```bash
./RESTART_DEV_SERVER.sh
```

### 3. Check Logs

Look for:
```
[Prisma] Creating new PrismaClient instance
[Prisma] DATABASE_URL host: aws-1-us-east-2.pooler.supabase.com:XXXX
```

### 4. Test Health Check

```bash
curl http://localhost:3000/api/health/db
```

**Success:**
```json
{"ok":true,"duration":45,"timestamp":"..."}
```

**Failure:**
```json
{"ok":false,"code":"P1001","message":"Circuit breaker open..."}
```

### 5. Check Terminal for Errors

Look for specific error messages:
- "Circuit breaker open" → Pooler can't reach DB
- "Connection timed out" → Network issue
- "FATAL: password authentication failed" → Wrong credentials
- "SSL connection has been closed unexpectedly" → SSL issue

---

## 🌐 Check Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings → Database**
4. Check:
   - ✅ Database is **not paused** (free tier auto-pauses after inactivity)
   - ✅ Connection pooling is **enabled**
   - ✅ Copy the **exact** connection strings from the dashboard

### Connection Pooler Settings

In Supabase dashboard, under **Database → Connection Pooling**, you should see:

**Transaction Mode (Port 6543):**
```
postgresql://postgres.xcveazzoavnizefbcjfg:[PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```
Add: `?pgbouncer=true&sslmode=require`

**Session Mode (Port 5432):**
```
postgresql://postgres.xcveazzoavnizefbcjfg:[PASSWORD]@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```
Add: `?sslmode=require` (no pgbouncer parameter)

---

## 🧪 Test Different Network

The IPv6 issue might be network-specific. Try:

### 1. Phone Hotspot

```bash
# Connect Mac to phone's hotspot
# Then test connection
./DIAGNOSE_SUPABASE.sh
```

If this works, it confirms your home/office network lacks IPv6.

### 2. Different WiFi Network

Try from a coffee shop, library, or different location.

### 3. VPN

Some VPNs provide IPv6 tunneling:
- Mullvad VPN
- ProtonVPN
- Cloudflare WARP (free)

---

## 🔍 Check Prisma Client Configuration

Verify `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

**Key points:**
- ✅ `directUrl` is required for migrations
- ✅ Both URLs should use `sslmode=require` for Supabase
- ✅ `pgbouncer=true` only for transaction pooler (port 6543)

---

## 📊 Connection Parameters Reference

| Parameter | Values | Purpose |
|-----------|--------|---------|
| `sslmode` | require, prefer, disable | SSL/TLS mode |
| `pgbouncer` | true, false | Required for transaction pooler |
| `connect_timeout` | seconds (e.g., 10) | Max time to establish connection |
| `pool_timeout` | seconds (e.g., 10) | Max time to get connection from pool |
| `statement_timeout` | milliseconds (e.g., 60000) | Max query execution time |
| `connection_limit` | number (e.g., 1) | Max connections from this client |

---

## 🆘 If Nothing Works

### Root Cause: IPv6-Only Database + IPv4-Only Network

If diagnostics confirm:
- ❌ No IPv6 connectivity (`ping6 google.com` fails)
- ✅ Pooler is reachable (nc test passes)
- ❌ Circuit breaker error persists

**Then the pooler cannot reach your IPv6-only database.**

### Solutions (in order of preference):

1. **Enable IPv6 on your router/network**
   - Contact ISP or check router settings
   - Many ISPs support IPv6 but it's disabled by default

2. **Use a VPN with IPv6 support**
   - Cloudflare WARP (free): https://1.1.1.1
   - Tunnels IPv6 over IPv4

3. **Use phone hotspot temporarily**
   - Most cellular networks support IPv6
   - Good for testing

4. **Switch to local PostgreSQL (Docker or native)**
   - Docker: `./SETUP_LOCAL_DB.sh` (when ready)
   - Native: `brew install postgresql@16`

5. **Migrate to IPv4-compatible database**
   - Create new Supabase project with IPv4 support
   - Or use Railway, Neon, PlanetScale (all support IPv4)

---

## 📝 Logging for Debugging

Add more detailed logging to `lib/prisma.ts`:

```typescript
export const prisma =
  globalForPrisma.prisma ??
  (() => {
    console.log('[Prisma] Creating new PrismaClient instance')
    console.log('[Prisma] DATABASE_URL host:', getConnectionInfo(process.env.DATABASE_URL))
    console.log('[Prisma] DIRECT_URL host:', getConnectionInfo(process.env.DIRECT_URL))
    console.log('[Prisma] NODE_ENV:', process.env.NODE_ENV)
    
    // Add connection event handlers
    const client = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    })
    
    client.$on('query', (e) => {
      console.log('[Prisma Query]', e.query.substring(0, 100), `(${e.duration}ms)`)
    })
    
    client.$on('error', (e) => {
      console.error('[Prisma Error]', e.message)
    })
    
    client.$on('warn', (e) => {
      console.warn('[Prisma Warn]', e.message)
    })
    
    return client
  })()
```

---

## ✅ Success Checklist

When connection works, you should see:

```bash
# 1. Diagnostics pass
./DIAGNOSE_SUPABASE.sh
# ✅ Can reach pooler
# ✅ Prisma CLI works
# ✅ Runtime connection works

# 2. Health check passes
curl http://localhost:3000/api/health/db
# {"ok":true,"duration":45,...}

# 3. App loads without errors
# Open http://localhost:3000/admin
# No "Circuit breaker" errors in terminal

# 4. Prisma Studio connects
npx prisma studio
# Opens at http://localhost:5555
# Can view tables and data
```

---

## 📞 Next Steps

1. Run diagnostics: `./DIAGNOSE_SUPABASE.sh`
2. Share the output
3. Try connection string variations above
4. Check Supabase dashboard for paused database
5. Test from different network (phone hotspot)

If all else fails, we can revisit Docker or try a different database provider.
