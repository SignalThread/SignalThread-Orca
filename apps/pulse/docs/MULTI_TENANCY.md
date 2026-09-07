# Multi-Tenant Architecture

## Overview

This application uses a hierarchical multi-tenant model designed for retail and event feedback collection:

```
Account → Location → Event → Response → Answer
```

## Data Model Hierarchy

### 1. Account (Tenant)
The top-level entity representing a customer/organization.

**Fields:**
- `id` - Unique identifier
- `slug` - URL-safe identifier (e.g., "acme-coffee")
- `name` - Display name (e.g., "Acme Coffee Co.")
- `accountType` - RETAIL | EVENTS | HOSPITALITY
- `tier` - Billing tier (free, starter, pro, enterprise)
- `isActive` - Account status flag
- `email`, `phone` - Contact information
- `billingJson` - Flexible billing metadata
- `settingsJson` - Account-level preferences

**Relations:**
- Has many `Location`s
- Has many `Admin`s

### 2. Location (Store/Venue)
A physical location belonging to an Account. **Data isolation is enforced at the Location level.**

**Fields:**
- `id` - Unique identifier
- `accountId` - Parent account
- `slug` - URL-safe identifier within account (e.g., "downtown-sf")
- `name` - Display name (e.g., "Downtown San Francisco")
- `address`, `city`, `state`, `postalCode`, `country` - Physical location
- `timezone` - Timezone for scheduling (default: America/New_York)
- `isActive` - Location status flag
- `settingsJson` - Location-specific preferences

**Relations:**
- Belongs to one `Account`
- Has many `Event`s
- Has many `Session`s (backward compatibility)

**Key Constraint:**
- `(accountId, slug)` is unique - slugs are unique within an account

### 3. Event (Feedback Campaign)
A feedback collection campaign at a specific location.

**Fields:**
- `id` - Unique identifier
- `locationId` - Parent location
- `name` - Display name (e.g., "January Customer Feedback")
- `description` - Optional description
- `eventType` - FEEDBACK | SURVEY | INTERVIEW | KIOSK
- `status` - DRAFT | ACTIVE | PAUSED | COMPLETED | ARCHIVED
- `isActive` - Active flag
- `startDate`, `endDate` - Optional scheduling
- `questionsJson` - Array of question objects

**Relations:**
- Belongs to one `Location`
- Has many `Response`s

### 4. Response (Session)
An individual respondent's journey through an event's questions.

**Fields:**
- `id` - Unique identifier
- `eventId` - Parent event
- `anonymousId` - Anonymous identifier (no PII)
- `status` - IN_PROGRESS | COMPLETED | ABANDONED
- `startedAt`, `completedAt` - Timestamps
- `metadata` - Device info, user agent, etc.

**Relations:**
- Belongs to one `Event`
- Has many `Answer`s

### 5. Answer (Audio Response)
A single audio answer to a question within a response.

**Fields:**
- `id` - Unique identifier
- `responseId` - Parent response
- `questionKey` - Stable key (e.g., "q1_food_quality")
- `promptLabel` - Display label shown to user
- `objectKey` - S3 object key (unique)
- `objectEtag`, `mimeType`, `fileSizeBytes`, `durationMs` - File metadata
- `status` - CREATED | UPLOADING | UPLOADED | PROCESSING_TRANSCRIPT | PROCESSING_ANALYSIS | COMPLETED | FAILED
- `statusReason` - Error message if failed

**Relations:**
- Belongs to one `Response`
- Has one `AnswerTranscript` (optional)
- Has one `AnswerAnalysis` (optional)
- Has many `AnswerProcessingLog`s

### 6. AnswerTranscript
Transcription of an audio answer.

**Fields:**
- `answerId` - Parent answer (unique)
- `provider`, `model` - AI service details
- `text` - Full transcript
- `wordsJson` - Word-level timing data (optional)

### 7. AnswerAnalysis
AI analysis of an audio answer's transcript.

**Fields:**
- `answerId` - Parent answer (unique)
- `provider`, `model`, `promptVersion` - AI service details
- `summary` - Text summary
- `sentimentScore`, `sentimentLabel` - Sentiment analysis
- `themesJson` - Extracted themes
- `actionsJson` - Recommended actions
- `entitiesJson` - Named entities

## Admin Roles

### AdminRole Enum
- `SUPER_ADMIN` - Full system access (accountId = null)
- `ADMIN` - Account-level admin (can manage all locations)
- `MANAGER` - Location-level manager (limited to specific locations)
- `VIEWER` - Read-only access

### Admin Model
**Fields:**
- `accountId` - NULL for global admins, set for account-scoped admins
- `role` - AdminRole enum
- `isActive` - Status flag

## Data Isolation Strategy

### Retail Multi-Tenancy
**Isolation Level: Location**

All queries must filter by `locationId` to enforce tenant isolation:

```typescript
// ✅ CORRECT: Filter by locationId
const events = await prisma.event.findMany({
  where: { locationId: userLocationId }
});

// ❌ INCORRECT: No location filter - exposes all tenants
const events = await prisma.event.findMany();
```

### Query Patterns

**1. Get all events for a location:**
```typescript
const events = await prisma.event.findMany({
  where: { 
    locationId: locationId,
    isActive: true 
  },
  include: { location: true }
});
```

**2. Get responses with full hierarchy:**
```typescript
const responses = await prisma.response.findMany({
  where: {
    event: {
      locationId: locationId
    }
  },
  include: {
    event: {
      include: { location: true }
    },
    answers: {
      include: {
        answerTranscript: true,
        answerAnalysis: true
      }
    }
  }
});
```

**3. Account-level aggregation:**
```typescript
const accountStats = await prisma.location.findMany({
  where: { accountId: accountId },
  include: {
    events: {
      include: {
        _count: {
          select: { responses: true }
        }
      }
    }
  }
});
```

## Backward Compatibility

### Legacy Session Model
The existing `Session` model remains unchanged for backward compatibility:
- Added optional `locationId` field
- Existing sessions without `locationId` continue to work
- New sessions should set `locationId` for multi-tenant isolation

### Migration Strategy
1. New retail customers → Use Account/Location/Event model
2. Existing kiosk deployments → Continue using Session model
3. Gradual migration → Link sessions to locations over time

## Security Considerations

### Row-Level Security (RLS)
When deploying to Supabase, enable RLS policies:

```sql
-- Example: Enforce location-based isolation
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see only their location's events"
  ON "Event"
  FOR SELECT
  USING (
    locationId IN (
      SELECT id FROM "Location" 
      WHERE accountId = current_setting('app.current_account_id')::text
    )
  );
```

### Application-Level Checks
Always validate location access in API routes:

```typescript
// middleware/auth.ts
export async function validateLocationAccess(
  userId: string,
  locationId: string
): Promise<boolean> {
  const admin = await prisma.admin.findUnique({
    where: { id: userId },
    include: { account: { include: { locations: true } } }
  });
  
  if (admin.role === 'SUPER_ADMIN') return true;
  
  return admin.account.locations.some(loc => loc.id === locationId);
}
```

## API Design Patterns

### RESTful Routes
```
/api/accounts/:accountId/locations
/api/accounts/:accountId/locations/:locationId
/api/locations/:locationId/events
/api/locations/:locationId/events/:eventId
/api/events/:eventId/responses
/api/events/:eventId/responses/:responseId
/api/responses/:responseId/answers
/api/answers/:answerId/transcript
/api/answers/:answerId/analysis
```

### Query Parameters
- `accountId` - Filter by account (admin only)
- `locationId` - Filter by location (required for most queries)
- `eventId` - Filter by event
- `status` - Filter by status (ACTIVE, COMPLETED, etc.)
- `startDate`, `endDate` - Date range filters

## Next Steps

1. **Implement Auth Middleware**
   - JWT/session-based authentication
   - Location access validation
   - Role-based authorization

2. **Create Seed Script**
   - Sample accounts, locations, events
   - Test data for development

3. **Build Admin API Routes**
   - Account management
   - Location management
   - Event management

4. **Update Frontend**
   - Location selector in admin UI
   - Account switcher for multi-location admins
   - Scoped data tables and dashboards

5. **Add RLS Policies** (if using Supabase)
   - Row-level security for all tables
   - Policy testing scripts
