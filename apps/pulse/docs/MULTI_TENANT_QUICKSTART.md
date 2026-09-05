# Multi-Tenant Quick Start

## Setup

### 1. Apply Migration
```bash
# Development
npm run db:migrate

# Production
npm run db:prod:migrate
```

### 2. Seed Sample Data
```bash
npm run db:seed:multi-tenant
```

This creates:
- 2 Accounts (Acme Coffee - Retail, TechConf - Events)
- 3 Locations (SF, NYC, Moscone Center)
- 3 Events (2 retail feedback, 1 conference survey)
- 3 Admin users

## Data Model Quick Reference

```
Account (Tenant)
├── Location (Store/Venue)
│   ├── Event (Feedback Campaign)
│   │   ├── Response (Individual Session)
│   │   │   └── Answer (Audio Response)
│   │   │       ├── AnswerTranscript
│   │   │       ├── AnswerAnalysis
│   │   │       └── AnswerProcessingLog[]
│   └── Session[] (Legacy - backward compatible)
└── Admin[] (Account-scoped admins)
```

## Common Queries

### Get all locations for an account
```typescript
const locations = await prisma.location.findMany({
  where: { 
    accountId: accountId,
    isActive: true 
  },
  orderBy: { name: 'asc' }
});
```

### Get all events for a location
```typescript
const events = await prisma.event.findMany({
  where: { 
    locationId: locationId,
    status: 'ACTIVE'
  },
  include: {
    location: {
      include: { account: true }
    }
  }
});
```

### Get responses for an event (with answers)
```typescript
const responses = await prisma.response.findMany({
  where: { 
    eventId: eventId,
    status: 'COMPLETED'
  },
  include: {
    answers: {
      include: {
        answerTranscript: true,
        answerAnalysis: true
      }
    }
  },
  orderBy: { startedAt: 'desc' }
});
```

### Get all responses for a location (data isolation)
```typescript
// ✅ CORRECT: Filtered by location
const responses = await prisma.response.findMany({
  where: {
    event: {
      locationId: locationId // Enforce tenant isolation
    },
    status: 'COMPLETED'
  },
  include: {
    event: true,
    answers: {
      include: {
        answerTranscript: true,
        answerAnalysis: true
      }
    }
  }
});
```

### Account-level aggregation
```typescript
// Get stats across all locations in an account
const accountStats = await prisma.account.findUnique({
  where: { id: accountId },
  include: {
    locations: {
      include: {
        events: {
          include: {
            _count: {
              select: { 
                responses: {
                  where: { status: 'COMPLETED' }
                }
              }
            }
          }
        }
      }
    }
  }
});

// Calculate totals
const totalResponses = accountStats.locations.reduce((acc, loc) => {
  return acc + loc.events.reduce((sum, evt) => {
    return sum + evt._count.responses;
  }, 0);
}, 0);
```

## API Route Patterns

### Location-scoped route
```typescript
// app/api/locations/[locationId]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const { locationId } = params;
  
  // Validate location access (implement based on your auth)
  // const hasAccess = await validateLocationAccess(userId, locationId);
  // if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  const events = await prisma.event.findMany({
    where: { 
      locationId: locationId,
      isActive: true
    }
  });
  
  return NextResponse.json({ events });
}
```

### Event-scoped route (with location isolation)
```typescript
// app/api/events/[eventId]/responses/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const { eventId } = params;
  
  // Fetch event to verify location
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { location: true }
  });
  
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  
  // Validate user has access to event's location
  // const hasAccess = await validateLocationAccess(userId, event.locationId);
  // if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  const responses = await prisma.response.findMany({
    where: { eventId: eventId },
    include: {
      answers: {
        include: {
          answerTranscript: true,
          answerAnalysis: true
        }
      }
    }
  });
  
  return NextResponse.json({ responses });
}
```

## Admin Authorization Helper

```typescript
// lib/auth-helpers.ts
import { prisma } from '@/lib/prisma';

export async function validateLocationAccess(
  adminId: string,
  locationId: string
): Promise<boolean> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    include: { 
      account: { 
        include: { locations: true } 
      } 
    }
  });
  
  if (!admin || !admin.isActive) return false;
  
  // Super admins have access to everything
  if (admin.role === 'SUPER_ADMIN') return true;
  
  // Account admins have access to their account's locations
  if (admin.account) {
    return admin.account.locations.some(loc => loc.id === locationId);
  }
  
  return false;
}

export async function getAccessibleLocations(
  adminId: string
): Promise<string[]> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    include: { 
      account: { 
        include: { locations: { where: { isActive: true } } } 
      } 
    }
  });
  
  if (!admin || !admin.isActive) return [];
  
  // Super admins see all active locations
  if (admin.role === 'SUPER_ADMIN') {
    const allLocations = await prisma.location.findMany({
      where: { isActive: true },
      select: { id: true }
    });
    return allLocations.map(loc => loc.id);
  }
  
  // Account admins see their account's locations
  if (admin.account) {
    return admin.account.locations.map(loc => loc.id);
  }
  
  return [];
}
```

## Kiosk URL Pattern

```
/kiosk?eventId=retail-sf-jan-2026
/kiosk?eventId=retail-nyc-jan-2026
/kiosk?eventId=techconf-2026
```

## Admin Dashboard URL Pattern

```
/admin/accounts
/admin/accounts/acme-coffee
/admin/accounts/acme-coffee/locations
/admin/locations/downtown-sf
/admin/locations/downtown-sf/events
/admin/events/retail-sf-jan-2026
/admin/events/retail-sf-jan-2026/responses
```

## TypeScript Types

```typescript
import { Account, Location, Event, Response, Answer } from '@prisma/client';

// Full nested response
type ResponseWithAnswers = Response & {
  event: Event & {
    location: Location & {
      account: Account;
    };
  };
  answers: (Answer & {
    answerTranscript: AnswerTranscript | null;
    answerAnalysis: AnswerAnalysis | null;
  })[];
};
```

## Migration Status

To check which migrations have been applied:

```bash
# Development
npx prisma migrate status

# Production
dotenv -e .env.prod -- npx prisma migrate status
```

## Rollback Strategy

If you need to rollback the multi-tenant migration:

```sql
-- WARNING: This will delete all multi-tenant data
DROP TABLE IF EXISTS "AnswerProcessingLog" CASCADE;
DROP TABLE IF EXISTS "AnswerAnalysis" CASCADE;
DROP TABLE IF EXISTS "AnswerTranscript" CASCADE;
DROP TABLE IF EXISTS "Answer" CASCADE;
DROP TABLE IF EXISTS "Response" CASCADE;
DROP TABLE IF EXISTS "Event" CASCADE;
DROP TABLE IF EXISTS "Location" CASCADE;
DROP TABLE IF EXISTS "Account" CASCADE;

-- Remove added columns
ALTER TABLE "Session" DROP COLUMN IF EXISTS "locationId";
ALTER TABLE "Admin" DROP COLUMN IF EXISTS "accountId";
ALTER TABLE "Admin" DROP COLUMN IF EXISTS "role";
ALTER TABLE "Admin" DROP COLUMN IF EXISTS "isActive";

-- Drop enums
DROP TYPE IF EXISTS "AdminRole";
DROP TYPE IF EXISTS "AnswerStatus";
DROP TYPE IF EXISTS "ResponseStatus";
DROP TYPE IF EXISTS "EventStatus";
DROP TYPE IF EXISTS "EventType";
DROP TYPE IF EXISTS "AccountType";
```

## Next Steps

1. **Implement Authentication**
   - Add JWT/session-based auth
   - Implement `validateLocationAccess()` middleware
   - Add role-based authorization

2. **Build Frontend Routes**
   - Account selector
   - Location dashboard
   - Event management UI

3. **Add Business Logic**
   - Event analytics aggregation
   - Location-level reporting
   - Account-level billing/usage tracking

4. **Production Deployment**
   - Run migration: `npm run db:prod:migrate`
   - Seed initial account data
   - Configure RLS policies (if using Supabase)
