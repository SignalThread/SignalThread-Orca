# SaaS Data Model Migration Guide

## Overview

SignalThread supports a multi-tenant SaaS data model with proper event-based organization.

## 🏗️ New Data Structure

```
Event (Survey Campaign)
  ↓
├─ Question (Predefined questions)
│
├─ Attendee (Anonymous participant)
│     ↓
│   Response (Recording session)
│        ↓
│      Answer (Individual audio recording)
│         ├─ Transcript
│         ├─ Analysis
│         └─ ProcessingLog
```

## 📊 Core Models

### Event
Top-level entity representing a survey campaign or event.

```typescript
{
  id: string
  name: string
  description?: string
  startDate?: DateTime
  endDate?: DateTime
  status: EventStatus  // DRAFT, ACTIVE, PAUSED, COMPLETED, ARCHIVED
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Purpose**: Organize surveys into events/campaigns for multi-tenant usage.

### Attendee
Anonymous participant in an event (no PII yet).

```typescript
{
  id: string
  eventId: string
  anonymousId: string  // Unique anonymous identifier
  createdAt: DateTime
}
```

**Purpose**: Track individual participants across multiple responses without requiring authentication.

### Question
Predefined questions for an event.

```typescript
{
  id: string
  eventId: string
  text: string
  order: number
  isRequired: boolean
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Purpose**: Create structured surveys with specific questions.

### Response
A recording session from an attendee.

```typescript
{
  id: string
  eventId: string
  attendeeId: string
  status: ResponseStatus  // IN_PROGRESS, COMPLETED, ABANDONED
  startedAt: DateTime
  completedAt?: DateTime
}
```

**Purpose**: Group multiple answers from a single participant session.

### Answer
Individual audio recording (replaces Session).

```typescript
{
  id: string
  responseId: string
  questionId?: string  // Null for FREEFORM
  
  answerType: AnswerType  // QUESTION or FREEFORM
  promptLabel: string  // Always required, no null freeform
  
  objectKey: string  // S3 storage key
  objectEtag?: string
  mimeType: string
  fileSizeBytes: number
  durationMs?: number
  language?: string
  
  status: AnswerStatus
  statusReason?: string
  
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Purpose**: Store individual audio recordings with flexible question/freeform structure.

## 🔄 Answer Types

### QUESTION Type
Answer to a predefined question.

```typescript
{
  answerType: 'QUESTION',
  questionId: 'question-id-here',
  promptLabel: 'How satisfied are you with our service?',
  // ... audio data
}
```

### FREEFORM Type
Open-ended answer without a specific question.

```typescript
{
  answerType: 'FREEFORM',
  questionId: null,
  promptLabel: 'Additional feedback',  // Still required!
  // ... audio data
}
```

**Important**: `promptLabel` is **always required**, even for freeform answers. No null freeform!

## 📊 Answer Status Pipeline

```
CREATED 
  ↓
UPLOADING 
  ↓
UPLOADED 
  ↓
PROCESSING_TRANSCRIPT 
  ↓
PROCESSING_ANALYSIS 
  ↓
COMPLETED | FAILED
```

## 🔗 Model Relationships

### Transcript
Supports both **Answer** (new) and **Session** (legacy).

```typescript
{
  id: string
  answerId?: string   // For new Answer model
  sessionId?: string  // For legacy Session model
  provider: string
  model: string
  text: string
  wordsJson?: Json
  createdAt: DateTime
}
```

### Analysis
Supports both **Answer** (new) and **Session** (legacy).

```typescript
{
  id: string
  answerId?: string   // For new Answer model
  sessionId?: string  // For legacy Session model
  provider: string
  model: string
  promptVersion: string
  summary: string
  sentimentScore?: number
  sentimentLabel?: string
  themesJson?: Json
  entitiesJson?: Json
  actionsJson?: Json
  createdAt: DateTime
}
```

### ProcessingLog
Supports both **Answer** (new) and **Session** (legacy).

```typescript
{
  id: string
  answerId?: string   // For new Answer model
  sessionId?: string  // For legacy Session model
  step: ProcessingStep
  attempt: number
  startedAt: DateTime
  endedAt?: DateTime
  errorCode?: string
  errorMessage?: string
  metadata?: Json
}
```

## 🚀 Usage Example

### Creating a Complete Flow

```typescript
// 1. Create or get Event
const event = await prisma.event.create({
  data: {
    name: 'Customer Feedback 2024',
    description: 'Post-purchase feedback survey',
    status: 'ACTIVE',
  }
})

// 2. Create Questions
const question1 = await prisma.question.create({
  data: {
    eventId: event.id,
    text: 'How satisfied are you with your purchase?',
    order: 1,
    isRequired: true,
  }
})

// 3. Create/Get Attendee (auto-generated on first response)
const attendee = await prisma.attendee.create({
  data: {
    eventId: event.id,
    anonymousId: generateCuid(), // Auto-generated
  }
})

// 4. Create Response
const response = await prisma.response.create({
  data: {
    eventId: event.id,
    attendeeId: attendee.id,
    status: 'IN_PROGRESS',
  }
})

// 5. Create Answer (when recording starts)
const answer = await prisma.answer.create({
  data: {
    responseId: response.id,
    questionId: question1.id,
    answerType: 'QUESTION',
    promptLabel: question1.text,
    objectKey: generateObjectKey(),
    mimeType: 'audio/webm',
    fileSizeBytes: 0,
    status: 'CREATED',
  }
})

// 6. After upload, update and process
await prisma.answer.update({
  where: { id: answer.id },
  data: {
    status: 'UPLOADED',
    objectEtag: etag,
    fileSizeBytes: size,
    durationMs: duration,
  }
})

// 7. Create Transcript
await prisma.transcript.create({
  data: {
    answerId: answer.id,  // Link to Answer, not Session
    provider: 'openai',
    model: 'whisper-1',
    text: transcriptionResult.text,
  }
})

// 8. Create Analysis
await prisma.analysis.create({
  data: {
    answerId: answer.id,  // Link to Answer, not Session
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    promptVersion: 'v1.0',
    summary: analysisResult.summary,
    sentimentLabel: analysisResult.sentiment,
    sentimentScore: analysisResult.sentimentScore,
    themesJson: { themes: analysisResult.themes },
    actionsJson: { actionItems: analysisResult.actionItems },
  }
})

// 9. Mark Response as complete
await prisma.response.update({
  where: { id: response.id },
  data: {
    status: 'COMPLETED',
    completedAt: new Date(),
  }
})
```

## 🔀 Migration Strategy

### Phase 1: Database Schema ✅ (Current)
- Add new models (Event, Attendee, Question, Response, Answer)
- Update Transcript/Analysis/ProcessingLog to support both models
- Keep Session model for backward compatibility

### Phase 2: Backend Refactor (Next)
- Update `/api/recording/*` endpoints to use Answer model
- Add default Event for kiosk mode
- Auto-create Attendee per Response
- Migrate confirm endpoint to work with Answer

### Phase 3: UI Updates (Minimal)
- Pass eventId from kiosk page (or use default)
- No visible changes to end-user experience
- Maintain same recording flow

### Phase 4: Admin Dashboard (Future)
- Event management UI
- Question builder
- Response/Answer analytics by event
- Attendee journey tracking

## 🎯 Benefits

1. **Multi-Tenancy Ready**: Events can belong to different organizations
2. **Structured Surveys**: Predefined questions with order and requirements
3. **Anonymous Tracking**: Track participants without PII
4. **Flexible Answers**: Support both question-based and freeform responses
5. **Session Grouping**: Multiple answers grouped into responses
6. **Backward Compatible**: Legacy Session model still works
7. **Extensible**: Easy to add authentication, organizations, etc.

## 📝 API Changes Required

### Before (Legacy Session)
```typescript
POST /api/recording/presign
{
  fileName: string
  fileSize: number
  mimeType: string
  consentVersion: string
}
→ { sessionId, uploadUrl, objectKey }
```

### After (New Answer)
```typescript
POST /api/recording/presign
{
  fileName: string
  fileSize: number
  mimeType: string
  eventId?: string  // Optional, use default if not provided
  responseId?: string  // Optional, create new if not provided
  questionId?: string  // Optional, for QUESTION type
  promptLabel: string  // Required
  answerType: 'QUESTION' | 'FREEFORM'
}
→ { answerId, uploadUrl, objectKey, responseId }
```

## 🚧 Legacy Support

The **Session** model remains functional for backward compatibility. All existing code using Session will continue to work. New features should use the Answer model.

---

**Status**: Schema Complete ✅  
**Next**: Refactor backend endpoints to use Answer model  
**Migration Applied**: `20260114163539_add_saas_data_model`
