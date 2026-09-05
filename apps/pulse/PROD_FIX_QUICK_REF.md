# Production Fix - Quick Reference

## 🚨 THE PROBLEM
- Production error: `The table public.User does not exist`
- Root cause: Migration `20260127012625_add_user_model` failed to apply
- Why: Migration bundles User table with unrelated destructive changes

## ✅ THE FIX (3 commands)

```bash
# 1. Mark toxic migration as applied (updates metadata only)
npx dotenv -e .env.prod -- prisma migrate resolve --applied 20260127012625_add_user_model

# 2. Deploy safe User table migration
npx dotenv -e .env.prod -- prisma migrate deploy

# 3. Verify
npx dotenv -e .env.prod -- prisma db execute --stdin <<< "SELECT COUNT(*) FROM \"User\";"
```

## 📁 FILES

- `.PROD_MIGRATION_ANALYSIS.md` - Full technical analysis (why it failed)
- `.PROD_DEPLOYMENT_GUIDE.md` - Step-by-step deployment guide
- `prisma/migrations/20260129000000_add_user_table_safe/` - Safe idempotent migration

## 🎯 CONFIRMED

**1. User table IS required** ✅
   - `app/api/auth/link-user/route.ts` - creates User on first login
   - `app/api/admin/provision-retail/route.ts` - checks SUPER_ADMIN role

**2. Architecture is correct** ✅
   - Supabase Auth: authentication (login, sessions)
   - Prisma User: authorization (roles, account access)

**3. Migration is safe** ✅
   - Idempotent (can run multiple times)
   - No destructive operations
   - No dependencies on missing tables

## ⏱️ DEPLOYMENT

- **Time:** 2-3 minutes
- **Downtime:** None
- **Risk:** Low (purely additive)

## 🔍 VERIFY SUCCESS

```sql
-- Should return "User"
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'User';
```

## 📞 IF ISSUES

See `.PROD_DEPLOYMENT_GUIDE.md` troubleshooting section.

---

**TL;DR:** Run 3 commands above, User table will be created, invite flow will work. ✅
