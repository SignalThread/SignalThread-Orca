# Testing Guide - Surface Split

**Status:** Ready to test  
**Prerequisite:** Database must be seeded with multi-tenant data

---

## 🗄️ Setup Database (First Time)

```bash
# Reset database and apply migrations
npx prisma migrate reset --force --skip-seed

# Seed multi-tenant structure (accounts, locations, events)
npm run db:seed:multi-tenant

# Seed demo responses (25 per event with realistic feedback)
npm run db:seed
```

**Expected:** 75 responses, 272 answers with full analysis pipeline

---

## 🚀 Start Dev Server

```bash
npm run dev
```

App runs at: **http://localhost:3000**

---

## ✅ Test Scenarios

### Scenario 1: Platform Admin (SUPER_ADMIN)

**Goal:** Verify platform admin can see all accounts

1. Visit **http://localhost:3000**
2. Should redirect to `/login`
3. Select **"Platform Admin (Super Admin)"**
4. Click **"Login"**
5. Should redirect to **`/admin`**

**Expected:**
- ✅ See "Platform Admin" header
- ✅ See 2 account cards:
  - "Acme Coffee Company" (RETAIL, 2 locations)
  - "TechConf Events" (EVENTS, 1 location)
- ✅ Each card shows:
  - Account type icon (🛍️ or 🎤)
  - Type (RETAIL / EVENTS)
  - Tier (free)
  - Locations count
  - Admins count
  - Created date
- ✅ "Create Account" button visible
- ✅ "View Details" and "Edit" buttons on each card

**Try:**
- Click "View Details" → TODO page (not yet implemented)
- Click "Create Account" → TODO page (not yet implemented)

---

### Scenario 2: Customer Admin - Acme Coffee

**Goal:** Verify customer admin sees only their account's data

1. Visit **http://localhost:3000/login**
2. Select **"Acme Coffee Admin"**
3. Click **"Login"**
4. Should redirect to **`/app`**

**Expected:**
- ✅ See "Acme Coffee Company" header
- ✅ See subtitle: "RETAIL • free tier"
- ✅ See 3 KPI cards:
  - **Active Events:** 2
  - **Total Responses:** (varies)
  - **Avg Sentiment:** (varies or N/A)
- ✅ See 2 locations:
  - **Downtown San Francisco** (San Francisco, CA)
  - **Midtown Manhattan** (New York, NY)
- ✅ Each location shows nested events:
  - SF: "January Customer Feedback" (ACTIVE, FEEDBACK)
  - NYC: "January Customer Feedback" (ACTIVE, FEEDBACK)
- ✅ "Manage" button for each location
- ✅ "Create Event" button at top
- ✅ "View Dashboard →" button for each event

**Try:**
- Click event name or "View Dashboard" → Should open `/app/events/{eventId}`
- Click "Manage" → TODO page (not yet implemented)
- Click "Create Event" → TODO page (not yet implemented)

**Verify Account Scoping:**
- Should **NOT** see TechConf events
- Try manually visiting `/app/events/techconf-2026` → Should get 404 or access denied

---

### Scenario 3: Event Dashboard - Acme Coffee

**Continuing from Scenario 2...**

1. Click on **"January Customer Feedback"** (SF or NYC event)
2. Should navigate to **`/app/events/{eventId}`**

**Expected:**
- ✅ See event name as header
- ✅ See "Back to Home" button
- ✅ See event status and last updated time
- ✅ See 4 KPI cards:
  - Total Responses
  - Completed
  - Avg Sentiment
  - Total Answers
- ✅ See "Recompute Insights" button

**If event has responses:**
- ✅ See "Executive Summary" card
- ✅ See "Overall Sentiment" card
- ✅ See "Top Themes" card with theme list
- ✅ See "Recommended Actions" card with action items
- ✅ See "View All Responses →" button at bottom

**If event has no responses:**
- ✅ See empty state: "No Data Yet"
- ✅ See "Launch Kiosk" button

**Try:**
- Click "Recompute Insights" → Should reload with updated data
- Click "View All Responses" → TODO page (not yet implemented)
- Click "Launch Kiosk" → Should open kiosk with eventId param
- Click "Back to Home" → Should return to `/app`

---

### Scenario 4: Customer Admin - TechConf Events

**Goal:** Verify different account sees different data

1. Visit **http://localhost:3000/login**
2. Select **"TechConf Events Admin"**
3. Click **"Login"**
4. Should redirect to **`/app`**

**Expected:**
- ✅ See "TechConf Events" header
- ✅ See subtitle: "EVENTS • free tier"
- ✅ See 1 location:
  - **Moscone Convention Center** (San Francisco, CA)
- ✅ See 1 event:
  - **"TechConf 2026 - Attendee Feedback"** (ACTIVE, FEEDBACK)
- ✅ Should **NOT** see Acme Coffee locations/events

**Try:**
- Click event → View dashboard
- Verify can't access Acme Coffee events:
  - Manually visit `/app/events/retail-sf-jan-2026`
  - Should get 404 or "access denied"

---

### Scenario 5: Unauthorized Access

**Goal:** Verify middleware blocks unauthorized access

**Test 1: Customer Admin tries to access Platform Admin**
1. Login as **Acme Coffee Admin**
2. Manually visit **http://localhost:3000/admin**
3. **Expected:** 403 Forbidden or JSON error

**Test 2: Platform Admin tries to access Customer Admin**
1. Login as **Platform Admin (Super Admin)**
2. Manually visit **http://localhost:3000/app**
3. **Expected:** 403 Forbidden (super admin has no accountId)

**Test 3: No Auth tries to access Protected Routes**
1. Clear cookies (open dev tools → Application → Cookies → Delete All)
2. Try visiting `/admin` or `/app`
3. **Expected:** Redirect to `/login?redirect=/admin` (or `/app`)

---

### Scenario 6: Kiosk (Public Access)

**Goal:** Verify kiosk works without authentication

1. Clear all cookies
2. Visit **http://localhost:3000/kiosk**
3. **Expected:** Kiosk loads without auth

**With eventId:**
1. Visit **http://localhost:3000/kiosk?eventId=retail-sf-jan-2026**
2. Should load SF retail event questions
3. Record answers
4. Verify responses saved

---

## 🔍 API Testing (Optional)

### Platform Admin APIs

```bash
# Get all accounts (requires SUPER_ADMIN cookie)
curl -H "Cookie: mock_admin_role=SUPER_ADMIN" \
  http://localhost:3000/api/admin/accounts

# Expected: { success: true, accounts: [...] }
```

### Customer Admin APIs

```bash
# Get account data (requires accountId cookie)
curl -H "Cookie: mock_admin_email=admin@acmecoffee.com; mock_account_id=<ACME_ID>" \
  http://localhost:3000/api/app/account

# Expected: { success: true, account: {...}, locations: [...], metrics: {...} }

# Get event analysis (account-scoped)
curl -H "Cookie: mock_admin_email=admin@acmecoffee.com; mock_account_id=<ACME_ID>" \
  http://localhost:3000/api/app/events/retail-sf-jan-2026/analysis

# Expected: { success: true, data: {...} }
```

### Verify Account Scoping

```bash
# Try accessing TechConf event with Acme Coffee credentials
curl -H "Cookie: mock_admin_email=admin@acmecoffee.com; mock_account_id=<ACME_ID>" \
  http://localhost:3000/api/app/events/techconf-2026/analysis

# Expected: { success: false, message: "Event not found or access denied" }
```

---

## 🐛 Common Issues

### Issue: "No account access" error

**Cause:** Cookies not set correctly

**Fix:**
1. Clear all cookies
2. Go to `/login`
3. Select account and login again

### Issue: Blank page or redirect loop

**Cause:** Middleware not running or cookies malformed

**Fix:**
1. Check browser console for errors
2. Clear `.next` cache: `rm -rf .next`
3. Restart dev server: `npm run dev`

### Issue: "Account not found" in customer admin

**Cause:** Database not seeded or accountId cookie doesn't match

**Fix:**
1. Verify database seeded: `npm run db:seed:multi-tenant`
2. Check accountId in cookie matches database Account.id
3. Use Prisma Studio to verify: `npx prisma studio`

### Issue: 404 on event dashboard

**Cause:** Event doesn't exist or doesn't belong to account

**Fix:**
1. Check event exists: `npx prisma studio` → Event table
2. Verify event's Location → Account matches logged-in account
3. Check console logs for API errors

---

## ✅ Success Checklist

- [ ] Platform admin can see all accounts
- [ ] Customer admin (Acme) sees only Acme data
- [ ] Customer admin (TechConf) sees only TechConf data
- [ ] Event dashboard loads with correct data
- [ ] Account scoping prevents cross-account access
- [ ] Middleware blocks unauthorized access
- [ ] Kiosk works without authentication
- [ ] Login page shows all test accounts
- [ ] Redirects work correctly (/ → /login, login → /admin or /app)

---

## 📸 Expected Screenshots

### Platform Admin (`/admin`)
- Clean account list
- 2 account cards (Acme Coffee, TechConf)
- No event-specific content

### Customer Admin Home (`/app`)
- Account name as header
- KPI metrics at top
- Locations with nested events
- No cross-account data visible

### Event Dashboard (`/app/events/[eventId]`)
- Event name as header
- KPIs showing response/sentiment data
- Insight cards with themes/actions
- Back to home button

---

## 🎯 Next Testing Phase

After verifying basic surface split works:

1. **Implement Event Responses Page**
   - Copy from `/admin/events/[eventId]/responses`
   - Add account scoping
   - Test drilldown

2. **Implement Account Details** (`/admin/accounts/[accountId]`)
   - Platform admin view of single account
   - Show locations, events, admins
   - Test edit capabilities

3. **Implement Create Forms**
   - Create event with location selection
   - Create location
   - Test form validation

4. **Replace Mock Auth**
   - Install NextAuth or Clerk
   - Migrate test accounts to real auth
   - Test login/logout flows

---

**Ready to test!** Start with Scenario 1 and work through each one. 🚀
