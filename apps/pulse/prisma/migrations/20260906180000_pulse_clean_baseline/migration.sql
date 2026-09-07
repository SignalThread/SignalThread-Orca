-- Pulse clean current-state database baseline.
--
-- This single migration initialises a brand-new, empty Pulse operational PostgreSQL
-- database (Supabase project signalthread-pulse, ref konpdhvxooxsbjaisqih). It is NOT
-- part of the legacy 55-migration chain and must never be applied on top of it. That
-- chain now lives at `test-fixtures/legacy-pulse-migrations/` as historical evidence and
-- regression-test fixtures only.
--
-- Provenance
--   Derived from a PostgreSQL-native `pg_dump --schema-only --no-owner --no-privileges
--   --schema=public` (client 18.6) of the previous Pulse production database
--   (Voice_App_SMB, ref tsoquobpingfqezolvgp, PostgreSQL 17.6), captured read-only on
--   2026-09-06 immediately before generation. Prisma-generated SQL was deliberately NOT
--   used as the source: it omits functions and triggers.
--
-- Removed from the dump
--   * `CREATE SCHEMA public`             - the target database already has it
--   * `_prisma_migrations`               - the new database gets a fresh ledger
--   * session SET / psql meta-commands   - every object below is schema-qualified
--
-- Deliberate differences from the previous production schema (canonical apps/pulse wins)
--   * `Event.conversationMode` is NOT created. Production-only drift: absent from every
--     canonical migration and from all runtime code, and every production row held the
--     column default (false), so no data is lost.
--   * `Event.ttsVoice` defaults to 'en-US-Neural2-F' (canonical migration
--     20260504234500_add_event_tts_settings and schema.prisma); production had drifted
--     to 'en-US-Standard-C'. Existing row values are copied unchanged.
--   * `EventClosingBriefSnapshot.lifecyclePhase` (text NOT NULL) and the unique index
--     ("eventId","lifecyclePhase") replacing ("eventId"): canonical migration
--     20260905160000_scope_event_briefs_by_lifecycle, which production had not received.
--     Copied rows are backfilled with 'POST_EVENT', exactly as that migration does.
--
-- Security hardening carried over verbatim from canonical
--   20260905180000_lock_down_data_api_access: row level security enabled with no
--   policies on all 43 model tables (in the dump) plus the Data API privilege
--   revocation block for `anon` / `authenticated` (appended at the end).
--
-- Contents: 43 tables, 35 enums, 43 primary keys, 114 foreign keys, 251 indexes
--           (47 unique), 1 function, 1 trigger, 43 RLS-enabled tables, 0 policies.

--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: AccountType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountType" AS ENUM (
    'RETAIL',
    'EVENTS',
    'HOSPITALITY'
);

--
-- Name: AdminRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdminRole" AS ENUM (
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER',
    'VIEWER'
);

--
-- Name: AnswerStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AnswerStatus" AS ENUM (
    'CREATED',
    'UPLOADING',
    'UPLOADED',
    'PROCESSING_TRANSCRIPT',
    'PROCESSING_ANALYSIS',
    'COMPLETED',
    'FAILED'
);

--
-- Name: CollectionPhase; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CollectionPhase" AS ENUM (
    'PRE',
    'DURING',
    'POST'
);

--
-- Name: EventActionClassification; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionClassification" AS ENUM (
    'DURING_EVENT',
    'AFTER_EVENT_FOLLOW_UP',
    'NEXT_EVENT_LEARNING',
    'INFORMATIONAL'
);

--
-- Name: EventActionDeliveryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionDeliveryStatus" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED'
);

--
-- Name: EventActionHistoryType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionHistoryType" AS ENUM (
    'CONVERTED',
    'NO_CHANGE',
    'ASSIGNED',
    'REASSIGNED',
    'UNASSIGNED',
    'STATUS_CHANGED',
    'DUE_DATE_CHANGED',
    'PRIORITY_CHANGED',
    'CLASSIFICATION_CHANGED',
    'UPDATE_ADDED'
);

--
-- Name: EventActionNotificationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionNotificationType" AS ENUM (
    'ACTION_ASSIGNED'
);

--
-- Name: EventActionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionStatus" AS ENUM (
    'UNASSIGNED',
    'OPEN',
    'WORKING',
    'BLOCKED',
    'COMPLETE',
    'DISMISSED',
    'CANCELLED'
);

--
-- Name: EventActionUpdateKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionUpdateKind" AS ENUM (
    'WRITTEN',
    'VOICE'
);

--
-- Name: EventActionVoiceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActionVoiceStatus" AS ENUM (
    'UPLOADED',
    'TRANSCRIBING',
    'COMPLETED',
    'FAILED'
);

--
-- Name: EventAgendaImportConflictType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAgendaImportConflictType" AS ENUM (
    'EXACT_DUPLICATE',
    'EXTERNAL_ID_MATCH',
    'POSSIBLE_DUPLICATE',
    'POSSIBLE_OVERLAP',
    'AMBIGUOUS_SPEAKER_MATCH'
);

--
-- Name: EventAgendaImportResolution; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAgendaImportResolution" AS ENUM (
    'SKIP',
    'REPLACE_EXISTING',
    'KEEP_BOTH',
    'REVIEW'
);

--
-- Name: EventAgendaImportRowResult; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAgendaImportRowResult" AS ENUM (
    'CREATED',
    'UPDATED',
    'SKIPPED',
    'FAILED'
);

--
-- Name: EventAgendaImportRowStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAgendaImportRowStatus" AS ENUM (
    'PENDING',
    'READY',
    'NEEDS_REVIEW',
    'DUPLICATE',
    'INVALID',
    'IGNORED',
    'CONFIRMED',
    'FAILED'
);

--
-- Name: EventAgendaImportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAgendaImportStatus" AS ENUM (
    'UPLOADED',
    'MAPPING',
    'NEEDS_REVIEW',
    'READY',
    'CONFIRMING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);

--
-- Name: EventSpeakerHeadshotState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventSpeakerHeadshotState" AS ENUM (
    'NONE',
    'PENDING',
    'READY',
    'FAILED'
);

--
-- Name: EventSpeakerRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventSpeakerRole" AS ENUM (
    'SPEAKER',
    'MODERATOR',
    'HOST',
    'PANELIST'
);

--
-- Name: EventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'ARCHIVED'
);

--
-- Name: EventStructureItemKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventStructureItemKind" AS ENUM (
    'EVENT',
    'SESSION',
    'AREA',
    'SPONSOR_ACTIVATION',
    'CUSTOM_TOUCHPOINT'
);

--
-- Name: EventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventType" AS ENUM (
    'FEEDBACK',
    'SURVEY',
    'INTERVIEW',
    'KIOSK',
    'TEMPLATE',
    'BLANK',
    'ADVANCED'
);

--
-- Name: InsightSection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InsightSection" AS ENUM (
    'WORKING',
    'OPPORTUNITY'
);

--
-- Name: PlatformUserActionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PlatformUserActionType" AS ENUM (
    'OTP_GENERATED',
    'INVITE_RESENT',
    'ROLE_CHANGED',
    'USER_DEACTIVATED',
    'USER_REACTIVATED'
);

--
-- Name: ProcessingStep; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProcessingStep" AS ENUM (
    'UPLOAD',
    'TRANSCRIBE',
    'ANALYZE',
    'TEXT_ENTRY'
);

--
-- Name: QuestionResponseTarget; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionResponseTarget" AS ENUM (
    'GENERAL',
    'SESSION',
    'SPEAKERS'
);

--
-- Name: QuestionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuestionType" AS ENUM (
    'VOICE',
    'RATING_1_TO_5',
    'RECOMMENDATION_0_TO_10',
    'OPEN_RESPONSE',
    'YES_NO',
    'SINGLE_CHOICE',
    'SPEAKER_FEEDBACK'
);

--
-- Name: ResponseMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ResponseMode" AS ENUM (
    'VOICE_ONLY',
    'TEXT_ONLY',
    'VOICE_AND_TEXT'
);

--
-- Name: ResponseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ResponseStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ABANDONED'
);

--
-- Name: SessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionStatus" AS ENUM (
    'CREATED',
    'UPLOADING',
    'UPLOADED',
    'PROCESSING_TRANSCRIPT',
    'PROCESSING_ANALYSIS',
    'COMPLETED',
    'FAILED'
);

--
-- Name: SurveyAvailabilityAnchor; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SurveyAvailabilityAnchor" AS ENUM (
    'START',
    'END'
);

--
-- Name: SurveyAvailabilityMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SurveyAvailabilityMode" AS ENUM (
    'OPEN_IMMEDIATELY',
    'CUSTOM_WINDOW',
    'RELATIVE_TO_EVENT_AREA'
);

--
-- Name: SurveyAvailabilityOverride; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SurveyAvailabilityOverride" AS ENUM (
    'FORCE_OPEN',
    'FORCE_CLOSED'
);

--
-- Name: SurveyPresentationMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SurveyPresentationMode" AS ENUM (
    'SCREEN',
    'READ_ALOUD',
    'ATTENDEE_CHOOSES'
);

--
-- Name: SurveyTargetCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SurveyTargetCategory" AS ENUM (
    'EVENT',
    'SESSION',
    'LOCATION',
    'CUSTOM',
    'SPEAKER'
);

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER',
    'VIEWER'
);

--
-- Name: prevent_response_collection_phase_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_response_collection_phase_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Permit one deliberate NULL -> phase classification for legacy rows. New
  -- Event responses are never created NULL, and any classified value is fixed.
  IF OLD."collectionPhase" IS NOT NULL
     AND OLD."collectionPhase" IS DISTINCT FROM NEW."collectionPhase" THEN
    RAISE EXCEPTION 'Response.collectionPhase is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "accountType" public."AccountType" DEFAULT 'RETAIL'::public."AccountType" NOT NULL,
    tier text DEFAULT 'starter'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    email text,
    phone text,
    "billingJson" jsonb,
    "settingsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "trialEndsAt" timestamp(3) without time zone,
    "stripeCustomerId" text,
    "stripeSubscriptionId" text,
    "platformOrganizationId" uuid
);

--
-- Name: AccountUserMembership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AccountUserMembership" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "accountId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Admin" (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    password text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text,
    role public."AdminRole" DEFAULT 'ADMIN'::public."AdminRole" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);

--
-- Name: Analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Analysis" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    "promptVersion" text NOT NULL,
    summary text NOT NULL,
    "sentimentScore" double precision,
    "sentimentLabel" text,
    "themesJson" jsonb,
    "entitiesJson" jsonb,
    "actionsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Answer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Answer" (
    id text NOT NULL,
    "responseId" text NOT NULL,
    "questionKey" text NOT NULL,
    "promptLabel" text NOT NULL,
    "objectKey" text,
    "objectEtag" text,
    "mimeType" text,
    "fileSizeBytes" integer,
    "durationMs" integer,
    status public."AnswerStatus" DEFAULT 'CREATED'::public."AnswerStatus" NOT NULL,
    "statusReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "questionId" text,
    "numericValue" integer,
    "speakerId" text
);

--
-- Name: AnswerAnalysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerAnalysis" (
    id text NOT NULL,
    "answerId" text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    "promptVersion" text NOT NULL,
    summary text NOT NULL,
    "sentimentScore" double precision,
    "sentimentLabel" text,
    "themesJson" jsonb,
    "actionsJson" jsonb,
    "entitiesJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AnswerEventAction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerEventAction" (
    id text NOT NULL,
    "intelligenceId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "answerId" text NOT NULL,
    title text NOT NULL,
    description text,
    priority text NOT NULL,
    urgency text NOT NULL,
    "actionWindow" text,
    status text DEFAULT 'OPEN'::text NOT NULL,
    confidence double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: AnswerEventEntity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerEventEntity" (
    id text NOT NULL,
    "intelligenceId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "answerId" text NOT NULL,
    "entityType" text NOT NULL,
    label text NOT NULL,
    confidence double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AnswerEventIntelligence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerEventIntelligence" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "locationId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "responseId" text NOT NULL,
    "answerId" text NOT NULL,
    "questionId" text,
    "sentimentLabel" text NOT NULL,
    "sentimentScore" double precision,
    urgency text NOT NULL,
    "frictionCategory" text,
    "actionWindow" text,
    "recommendedAction" text,
    confidence double precision,
    "promptVersion" text NOT NULL,
    model text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: AnswerEventTheme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerEventTheme" (
    id text NOT NULL,
    "intelligenceId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "answerId" text NOT NULL,
    "themeKey" text NOT NULL,
    label text NOT NULL,
    "sentimentLabel" text,
    confidence double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AnswerProcessingLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerProcessingLog" (
    id text NOT NULL,
    "answerId" text NOT NULL,
    step public."ProcessingStep" NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "errorCode" text,
    "errorMessage" text,
    metadata jsonb
);

--
-- Name: AnswerTranscript; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AnswerTranscript" (
    id text NOT NULL,
    "answerId" text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    text text NOT NULL,
    "wordsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Event" (
    id text NOT NULL,
    "locationId" text NOT NULL,
    name text NOT NULL,
    description text,
    "eventType" public."EventType" DEFAULT 'FEEDBACK'::public."EventType" NOT NULL,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    status public."EventStatus" DEFAULT 'DRAFT'::public."EventStatus" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "questionsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "ttsProvider" text DEFAULT 'google'::text NOT NULL,
    "ttsVoice" text DEFAULT 'en-US-Neural2-F'::text NOT NULL,
    "ttsLocale" text DEFAULT 'en-US'::text NOT NULL,
    "responseMode" public."ResponseMode" DEFAULT 'VOICE_ONLY'::public."ResponseMode" NOT NULL,
    "templateKey" text,
    venue text,
    "listeningWindowOpensAt" timestamp(3) without time zone,
    "listeningWindowClosesAt" timestamp(3) without time zone,
    "platformEventId" uuid
);

--
-- Name: EventActionAssignmentDelivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventActionAssignmentDelivery" (
    id text NOT NULL,
    "clusterId" text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "recipientUserId" text NOT NULL,
    "recipientEmail" text NOT NULL,
    "recipientName" text,
    "assignedByUserId" text NOT NULL,
    "notificationType" public."EventActionNotificationType" DEFAULT 'ACTION_ASSIGNED'::public."EventActionNotificationType" NOT NULL,
    "idempotencyKey" text NOT NULL,
    "deepLink" text NOT NULL,
    "actionTitle" text NOT NULL,
    "actionPriority" text NOT NULL,
    "actionDueAt" timestamp(3) without time zone,
    provider text,
    status public."EventActionDeliveryStatus" DEFAULT 'PENDING'::public."EventActionDeliveryStatus" NOT NULL,
    "providerMessageId" text,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    "lastAttemptAt" timestamp(3) without time zone,
    "sentAt" timestamp(3) without time zone,
    "failureCode" text,
    "failureMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventActionDeliveryAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventActionDeliveryAttempt" (
    id text NOT NULL,
    "deliveryId" text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "idempotencyKey" text NOT NULL,
    "attemptNumber" integer NOT NULL,
    status public."EventActionDeliveryStatus" DEFAULT 'PENDING'::public."EventActionDeliveryStatus" NOT NULL,
    provider text,
    "providerMessageId" text,
    "failureCode" text,
    "failureMessage" text,
    "attemptedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone
);

--
-- Name: EventActionHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventActionHistory" (
    id text NOT NULL,
    "clusterId" text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "actorUserId" text NOT NULL,
    "idempotencyKey" text NOT NULL,
    type public."EventActionHistoryType" NOT NULL,
    "fromValue" text,
    "toValue" text,
    "detailsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventActionUpdate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventActionUpdate" (
    id text NOT NULL,
    "clusterId" text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "authorUserId" text NOT NULL,
    "idempotencyKey" text NOT NULL,
    kind public."EventActionUpdateKind" NOT NULL,
    body text,
    "voiceObjectKey" text,
    "voiceMimeType" text,
    "voiceDurationMs" integer,
    "voiceTranscript" text,
    "voiceTranscriptionStatus" public."EventActionVoiceStatus",
    "voiceFailureReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventAgendaImportJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventAgendaImportJob" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "createdByUserId" text,
    "confirmedByUserId" text,
    status public."EventAgendaImportStatus" DEFAULT 'UPLOADED'::public."EventAgendaImportStatus" NOT NULL,
    "idempotencyKey" text NOT NULL,
    "sourceFileName" text NOT NULL,
    "sourceMimeType" text NOT NULL,
    "sourceFileSizeBytes" integer NOT NULL,
    "sourceChecksumSha256" text NOT NULL,
    "sourceObjectKey" text,
    "worksheetName" text,
    "worksheetIndex" integer,
    "mappingSnapshot" jsonb,
    "failureCode" text,
    "failureMessage" text,
    "createdSessionCount" integer DEFAULT 0 NOT NULL,
    "updatedSessionCount" integer DEFAULT 0 NOT NULL,
    "skippedRowCount" integer DEFAULT 0 NOT NULL,
    "duplicateRowCount" integer DEFAULT 0 NOT NULL,
    "failedRowCount" integer DEFAULT 0 NOT NULL,
    "createdSpeakerCount" integer DEFAULT 0 NOT NULL,
    "matchedSpeakerCount" integer DEFAULT 0 NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventAgendaImportRow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventAgendaImportRow" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    "importJobId" text NOT NULL,
    "sourceRowNumber" integer NOT NULL,
    "stableSourceKey" text NOT NULL,
    "sourceExternalId" text,
    "rawRowSnapshot" jsonb NOT NULL,
    "normalizedRowSnapshot" jsonb,
    "validationIssues" jsonb,
    status public."EventAgendaImportRowStatus" DEFAULT 'PENDING'::public."EventAgendaImportRowStatus" NOT NULL,
    "conflictType" public."EventAgendaImportConflictType",
    resolution public."EventAgendaImportResolution",
    "speakerResolutionSnapshot" jsonb,
    "existingSessionId" text,
    result public."EventAgendaImportRowResult",
    "resultSessionId" text,
    "resultMessage" text,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventAlertNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventAlertNote" (
    id text NOT NULL,
    "clusterId" text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "authorUserId" text NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventClosingBriefSnapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventClosingBriefSnapshot" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "sourceHash" text NOT NULL,
    "briefHash" text NOT NULL,
    "briefJson" jsonb NOT NULL,
    "generatedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lifecyclePhase" text NOT NULL
);

--
-- Name: EventIntelligenceAggregate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventIntelligenceAggregate" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "locationId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "questionId" text,
    "bucketType" text NOT NULL,
    "bucketKey" text NOT NULL,
    "windowStart" timestamp(3) without time zone,
    "windowEnd" timestamp(3) without time zone,
    "responseCount" integer DEFAULT 0 NOT NULL,
    "answerCount" integer DEFAULT 0 NOT NULL,
    "avgSentiment" double precision,
    "highUrgencyCount" integer DEFAULT 0 NOT NULL,
    "topThemesJson" jsonb,
    "topEntitiesJson" jsonb,
    "topActionsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventIssueCluster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventIssueCluster" (
    id text NOT NULL,
    "clusterKey" text NOT NULL,
    "accountId" text NOT NULL,
    "locationId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "questionId" text,
    "taxonomyKey" text NOT NULL,
    title text NOT NULL,
    summary text,
    "priorityLevel" text NOT NULL,
    "legacyUrgency" text,
    "impactScore" double precision,
    "timeSensitivityScore" double precision,
    confidence double precision,
    "evidenceCount" integer DEFAULT 0 NOT NULL,
    "firstSeenAt" timestamp(3) without time zone NOT NULL,
    "lastSeenAt" timestamp(3) without time zone NOT NULL,
    "recommendedNextStep" text,
    status text DEFAULT 'NEW'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "ruleType" text DEFAULT 'VOICE_OPERATIONAL'::text NOT NULL,
    "metricSnapshotJson" jsonb,
    "ownerUserId" text,
    "ownerAssignedAt" timestamp(3) without time zone,
    "ownerAssignedByUserId" text,
    "acknowledgedAt" timestamp(3) without time zone,
    "acknowledgedByUserId" text,
    "actingAt" timestamp(3) without time zone,
    "actingByUserId" text,
    "resolvedAt" timestamp(3) without time zone,
    "resolvedByUserId" text,
    "resolutionReason" text,
    "dismissedAt" timestamp(3) without time zone,
    "dismissedByUserId" text,
    "dismissalReason" text,
    "reopenedAt" timestamp(3) without time zone,
    "reopenedByUserId" text,
    "occurrenceCount" integer DEFAULT 1 NOT NULL,
    "statusChangedAt" timestamp(3) without time zone,
    "actionClassification" public."EventActionClassification",
    "actionStatus" public."EventActionStatus",
    "actionDueAt" timestamp(3) without time zone,
    "actionBlockedReason" text,
    "actionResolution" text,
    "actionConvertedAt" timestamp(3) without time zone,
    "actionConvertedByUserId" text,
    "actionUrgent" boolean DEFAULT false NOT NULL,
    "actionReminderEnabled" boolean DEFAULT true NOT NULL
);

--
-- Name: EventIssueEvidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventIssueEvidence" (
    id text NOT NULL,
    "clusterId" text NOT NULL,
    "accountId" text NOT NULL,
    "locationId" text NOT NULL,
    "eventId" text NOT NULL,
    "surveyId" text,
    "surveyTargetId" text,
    "responseId" text NOT NULL,
    "answerId" text NOT NULL,
    "questionId" text,
    "transcriptSnippet" text NOT NULL,
    "sentimentScore" double precision,
    "priorityLevel" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventSessionSpeakerAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventSessionSpeakerAssignment" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "eventId" text NOT NULL,
    "sessionId" text,
    "speakerId" text NOT NULL,
    role public."EventSpeakerRole" DEFAULT 'SPEAKER'::public."EventSpeakerRole" NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventSpeakerProfile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventSpeakerProfile" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    title text,
    organization text,
    email text,
    phone text,
    biography text,
    "headshotState" public."EventSpeakerHeadshotState" DEFAULT 'NONE'::public."EventSpeakerHeadshotState" NOT NULL,
    "headshotObjectKey" text,
    "headshotMimeType" text,
    "normalizedName" text NOT NULL,
    "normalizedEmail" text,
    "isArchived" boolean DEFAULT false NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventStructureItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventStructureItem" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    kind public."EventStructureItemKind" NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "parentId" text,
    "locationId" text,
    "startsAt" timestamp(3) without time zone,
    "endsAt" timestamp(3) without time zone,
    timezone text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Insight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Insight" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    "themeKey" text NOT NULL,
    section public."InsightSection" NOT NULL,
    title text NOT NULL,
    "bodyText" text,
    "isAction" boolean DEFAULT false NOT NULL,
    "impactScore" integer,
    priority text,
    "windowDays" integer NOT NULL,
    "periodEnd" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: InsightSourceAnswer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InsightSourceAnswer" (
    id text NOT NULL,
    "insightId" text NOT NULL,
    "answerId" text NOT NULL
);

--
-- Name: Location; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Location" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    address text,
    city text,
    state text,
    "postalCode" text,
    country text DEFAULT 'US'::text NOT NULL,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "settingsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "googleReviewUrl" text
);

--
-- Name: PendingProvision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PendingProvision" (
    id text NOT NULL,
    email text NOT NULL,
    "accountId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "usedAt" timestamp(3) without time zone,
    role public."UserRole" DEFAULT 'ADMIN'::public."UserRole" NOT NULL,
    "firstName" text,
    "lastName" text
);

--
-- Name: PlatformUserActionAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlatformUserActionAudit" (
    id text NOT NULL,
    "actorUserId" text NOT NULL,
    action public."PlatformUserActionType" NOT NULL,
    "targetUserId" text,
    "targetEmail" text NOT NULL,
    "accountId" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ProcessingLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProcessingLog" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    step public."ProcessingStep" NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "errorCode" text,
    "errorMessage" text,
    metadata jsonb
);

--
-- Name: PublicSurveyLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PublicSurveyLink" (
    id text NOT NULL,
    "surveyId" text NOT NULL,
    token text NOT NULL,
    slug text,
    "isActive" boolean DEFAULT true NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "surveyTargetId" text,
    "speakerAssignmentId" text
);

--
-- Name: Question; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Question" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    "ttsText" text,
    "order" integer NOT NULL,
    required boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "surveyId" text,
    type public."QuestionType" DEFAULT 'VOICE'::public."QuestionType" NOT NULL,
    "responseTarget" public."QuestionResponseTarget" DEFAULT 'GENERAL'::public."QuestionResponseTarget" NOT NULL,
    "configurationJson" jsonb
);

--
-- Name: QuestionAudioAsset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuestionAudioAsset" (
    id text NOT NULL,
    "questionId" text NOT NULL,
    provider text NOT NULL,
    voice text NOT NULL,
    language text DEFAULT ''::text NOT NULL,
    locale text DEFAULT ''::text NOT NULL,
    "textHash" text NOT NULL,
    "sourceText" text NOT NULL,
    "objectKey" text NOT NULL,
    "storageUrl" text,
    "mimeType" text DEFAULT 'audio/mpeg'::text NOT NULL,
    "durationMs" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Response" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    "anonymousId" text NOT NULL,
    status public."ResponseStatus" DEFAULT 'IN_PROGRESS'::public."ResponseStatus" NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    metadata jsonb,
    "publicSurveyLinkId" text,
    "surveyId" text,
    "surveyTargetId" text,
    "speakerAssignmentId" text,
    "responseMode" public."ResponseMode" DEFAULT 'VOICE_ONLY'::public."ResponseMode" NOT NULL,
    "collectionPhase" public."CollectionPhase"
);

--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "boothId" text,
    "eventId" text,
    "consentVersion" text NOT NULL,
    "consentAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    language text,
    "durationMs" integer,
    "fileSizeBytes" integer DEFAULT 0 NOT NULL,
    "mimeType" text DEFAULT 'unknown'::text NOT NULL,
    "objectKey" text,
    "objectEtag" text,
    status public."SessionStatus" DEFAULT 'CREATED'::public."SessionStatus" NOT NULL,
    "statusReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "locationId" text
);

--
-- Name: Survey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Survey" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    "surveyTargetId" text,
    name text NOT NULL,
    description text,
    "responseMode" public."ResponseMode" DEFAULT 'VOICE_ONLY'::public."ResponseMode" NOT NULL,
    status public."EventStatus" DEFAULT 'DRAFT'::public."EventStatus" NOT NULL,
    "settingsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "ttsProvider" text,
    "ttsVoice" text,
    "ttsLocale" text,
    "availabilityMode" public."SurveyAvailabilityMode" DEFAULT 'OPEN_IMMEDIATELY'::public."SurveyAvailabilityMode" NOT NULL,
    "availabilityTimezone" text,
    "availabilityOpensAt" timestamp(3) without time zone,
    "availabilityClosesAt" timestamp(3) without time zone,
    "availabilityOpenAnchor" public."SurveyAvailabilityAnchor",
    "availabilityCloseAnchor" public."SurveyAvailabilityAnchor",
    "availabilityOpenOffsetMinutes" integer,
    "availabilityCloseOffsetMinutes" integer,
    "availabilityOverride" public."SurveyAvailabilityOverride",
    "creationRequestId" text,
    "presentationMode" public."SurveyPresentationMode" DEFAULT 'ATTENDEE_CHOOSES'::public."SurveyPresentationMode" NOT NULL,
    "collectionPhase" public."CollectionPhase"
);

--
-- Name: SurveyTarget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SurveyTarget" (
    id text NOT NULL,
    "eventId" text NOT NULL,
    "locationId" text,
    category public."SurveyTargetCategory" NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    metadata jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "eventStructureItemId" text,
    "speakerAssignmentId" text,
    "speakerId" text
);

--
-- Name: TestSignupToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TestSignupToken" (
    id text NOT NULL,
    "tokenHash" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Transcript; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transcript" (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    text text NOT NULL,
    "wordsJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    role public."UserRole" DEFAULT 'ADMIN'::public."UserRole" NOT NULL,
    "accountId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "firstName" text,
    "lastName" text,
    "platformUserId" uuid
);

--
-- Name: AccountUserMembership AccountUserMembership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountUserMembership"
    ADD CONSTRAINT "AccountUserMembership_pkey" PRIMARY KEY (id);

--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);

--
-- Name: Admin Admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin"
    ADD CONSTRAINT "Admin_pkey" PRIMARY KEY (id);

--
-- Name: Analysis Analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Analysis"
    ADD CONSTRAINT "Analysis_pkey" PRIMARY KEY (id);

--
-- Name: AnswerAnalysis AnswerAnalysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerAnalysis"
    ADD CONSTRAINT "AnswerAnalysis_pkey" PRIMARY KEY (id);

--
-- Name: AnswerEventAction AnswerEventAction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventAction"
    ADD CONSTRAINT "AnswerEventAction_pkey" PRIMARY KEY (id);

--
-- Name: AnswerEventEntity AnswerEventEntity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventEntity"
    ADD CONSTRAINT "AnswerEventEntity_pkey" PRIMARY KEY (id);

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_pkey" PRIMARY KEY (id);

--
-- Name: AnswerEventTheme AnswerEventTheme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventTheme"
    ADD CONSTRAINT "AnswerEventTheme_pkey" PRIMARY KEY (id);

--
-- Name: AnswerProcessingLog AnswerProcessingLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerProcessingLog"
    ADD CONSTRAINT "AnswerProcessingLog_pkey" PRIMARY KEY (id);

--
-- Name: AnswerTranscript AnswerTranscript_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerTranscript"
    ADD CONSTRAINT "AnswerTranscript_pkey" PRIMARY KEY (id);

--
-- Name: Answer Answer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Answer"
    ADD CONSTRAINT "Answer_pkey" PRIMARY KEY (id);

--
-- Name: EventActionAssignmentDelivery EventActionAssignmentDelivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionAssignmentDelivery"
    ADD CONSTRAINT "EventActionAssignmentDelivery_pkey" PRIMARY KEY (id);

--
-- Name: EventActionDeliveryAttempt EventActionDeliveryAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionDeliveryAttempt"
    ADD CONSTRAINT "EventActionDeliveryAttempt_pkey" PRIMARY KEY (id);

--
-- Name: EventActionHistory EventActionHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionHistory"
    ADD CONSTRAINT "EventActionHistory_pkey" PRIMARY KEY (id);

--
-- Name: EventActionUpdate EventActionUpdate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionUpdate"
    ADD CONSTRAINT "EventActionUpdate_pkey" PRIMARY KEY (id);

--
-- Name: EventAgendaImportJob EventAgendaImportJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportJob"
    ADD CONSTRAINT "EventAgendaImportJob_pkey" PRIMARY KEY (id);

--
-- Name: EventAgendaImportRow EventAgendaImportRow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportRow"
    ADD CONSTRAINT "EventAgendaImportRow_pkey" PRIMARY KEY (id);

--
-- Name: EventAlertNote EventAlertNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAlertNote"
    ADD CONSTRAINT "EventAlertNote_pkey" PRIMARY KEY (id);

--
-- Name: EventClosingBriefSnapshot EventClosingBriefSnapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventClosingBriefSnapshot"
    ADD CONSTRAINT "EventClosingBriefSnapshot_pkey" PRIMARY KEY (id);

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_pkey" PRIMARY KEY (id);

--
-- Name: EventIssueCluster EventIssueCluster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_pkey" PRIMARY KEY (id);

--
-- Name: EventIssueEvidence EventIssueEvidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_pkey" PRIMARY KEY (id);

--
-- Name: EventSessionSpeakerAssignment EventSessionSpeakerAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSessionSpeakerAssignment"
    ADD CONSTRAINT "EventSessionSpeakerAssignment_pkey" PRIMARY KEY (id);

--
-- Name: EventSpeakerProfile EventSpeakerProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSpeakerProfile"
    ADD CONSTRAINT "EventSpeakerProfile_pkey" PRIMARY KEY (id);

--
-- Name: EventStructureItem EventStructureItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventStructureItem"
    ADD CONSTRAINT "EventStructureItem_pkey" PRIMARY KEY (id);

--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);

--
-- Name: InsightSourceAnswer InsightSourceAnswer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InsightSourceAnswer"
    ADD CONSTRAINT "InsightSourceAnswer_pkey" PRIMARY KEY (id);

--
-- Name: Insight Insight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Insight"
    ADD CONSTRAINT "Insight_pkey" PRIMARY KEY (id);

--
-- Name: Location Location_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_pkey" PRIMARY KEY (id);

--
-- Name: PendingProvision PendingProvision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PendingProvision"
    ADD CONSTRAINT "PendingProvision_pkey" PRIMARY KEY (id);

--
-- Name: PlatformUserActionAudit PlatformUserActionAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlatformUserActionAudit"
    ADD CONSTRAINT "PlatformUserActionAudit_pkey" PRIMARY KEY (id);

--
-- Name: ProcessingLog ProcessingLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProcessingLog"
    ADD CONSTRAINT "ProcessingLog_pkey" PRIMARY KEY (id);

--
-- Name: PublicSurveyLink PublicSurveyLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PublicSurveyLink"
    ADD CONSTRAINT "PublicSurveyLink_pkey" PRIMARY KEY (id);

--
-- Name: QuestionAudioAsset QuestionAudioAsset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionAudioAsset"
    ADD CONSTRAINT "QuestionAudioAsset_pkey" PRIMARY KEY (id);

--
-- Name: Question Question_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Question"
    ADD CONSTRAINT "Question_pkey" PRIMARY KEY (id);

--
-- Name: Response Response_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_pkey" PRIMARY KEY (id);

--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);

--
-- Name: SurveyTarget SurveyTarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_pkey" PRIMARY KEY (id);

--
-- Name: Survey Survey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Survey"
    ADD CONSTRAINT "Survey_pkey" PRIMARY KEY (id);

--
-- Name: TestSignupToken TestSignupToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TestSignupToken"
    ADD CONSTRAINT "TestSignupToken_pkey" PRIMARY KEY (id);

--
-- Name: Transcript Transcript_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transcript"
    ADD CONSTRAINT "Transcript_pkey" PRIMARY KEY (id);

--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

--
-- Name: AccountUserMembership_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccountUserMembership_accountId_idx" ON public."AccountUserMembership" USING btree ("accountId");

--
-- Name: AccountUserMembership_userId_accountId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AccountUserMembership_userId_accountId_key" ON public."AccountUserMembership" USING btree ("userId", "accountId");

--
-- Name: AccountUserMembership_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccountUserMembership_userId_idx" ON public."AccountUserMembership" USING btree ("userId");

--
-- Name: Account_accountType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Account_accountType_idx" ON public."Account" USING btree ("accountType");

--
-- Name: Account_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Account_isActive_idx" ON public."Account" USING btree ("isActive");

--
-- Name: Account_platformOrganizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Account_platformOrganizationId_idx" ON public."Account" USING btree ("platformOrganizationId");

--
-- Name: Account_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Account_slug_idx" ON public."Account" USING btree (slug);

--
-- Name: Account_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Account_slug_key" ON public."Account" USING btree (slug);

--
-- Name: Account_stripeCustomerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Account_stripeCustomerId_key" ON public."Account" USING btree ("stripeCustomerId");

--
-- Name: Admin_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Admin_accountId_idx" ON public."Admin" USING btree ("accountId");

--
-- Name: Admin_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Admin_email_idx" ON public."Admin" USING btree (email);

--
-- Name: Admin_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Admin_email_key" ON public."Admin" USING btree (email);

--
-- Name: Admin_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Admin_role_idx" ON public."Admin" USING btree (role);

--
-- Name: Analysis_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Analysis_provider_idx" ON public."Analysis" USING btree (provider);

--
-- Name: Analysis_sentimentLabel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Analysis_sentimentLabel_idx" ON public."Analysis" USING btree ("sentimentLabel");

--
-- Name: Analysis_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Analysis_sessionId_idx" ON public."Analysis" USING btree ("sessionId");

--
-- Name: Analysis_sessionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Analysis_sessionId_key" ON public."Analysis" USING btree ("sessionId");

--
-- Name: AnswerAnalysis_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerAnalysis_answerId_idx" ON public."AnswerAnalysis" USING btree ("answerId");

--
-- Name: AnswerAnalysis_answerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AnswerAnalysis_answerId_key" ON public."AnswerAnalysis" USING btree ("answerId");

--
-- Name: AnswerAnalysis_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerAnalysis_provider_idx" ON public."AnswerAnalysis" USING btree (provider);

--
-- Name: AnswerAnalysis_sentimentLabel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerAnalysis_sentimentLabel_idx" ON public."AnswerAnalysis" USING btree ("sentimentLabel");

--
-- Name: AnswerEventAction_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_answerId_idx" ON public."AnswerEventAction" USING btree ("answerId");

--
-- Name: AnswerEventAction_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_eventId_idx" ON public."AnswerEventAction" USING btree ("eventId");

--
-- Name: AnswerEventAction_eventId_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_eventId_surveyId_idx" ON public."AnswerEventAction" USING btree ("eventId", "surveyId");

--
-- Name: AnswerEventAction_eventId_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_eventId_surveyTargetId_idx" ON public."AnswerEventAction" USING btree ("eventId", "surveyTargetId");

--
-- Name: AnswerEventAction_intelligenceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_intelligenceId_idx" ON public."AnswerEventAction" USING btree ("intelligenceId");

--
-- Name: AnswerEventAction_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_priority_idx" ON public."AnswerEventAction" USING btree (priority);

--
-- Name: AnswerEventAction_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_status_idx" ON public."AnswerEventAction" USING btree (status);

--
-- Name: AnswerEventAction_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_surveyId_idx" ON public."AnswerEventAction" USING btree ("surveyId");

--
-- Name: AnswerEventAction_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_surveyTargetId_idx" ON public."AnswerEventAction" USING btree ("surveyTargetId");

--
-- Name: AnswerEventAction_urgency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventAction_urgency_idx" ON public."AnswerEventAction" USING btree (urgency);

--
-- Name: AnswerEventEntity_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_answerId_idx" ON public."AnswerEventEntity" USING btree ("answerId");

--
-- Name: AnswerEventEntity_entityType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_entityType_idx" ON public."AnswerEventEntity" USING btree ("entityType");

--
-- Name: AnswerEventEntity_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_eventId_idx" ON public."AnswerEventEntity" USING btree ("eventId");

--
-- Name: AnswerEventEntity_eventId_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_eventId_surveyId_idx" ON public."AnswerEventEntity" USING btree ("eventId", "surveyId");

--
-- Name: AnswerEventEntity_eventId_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_eventId_surveyTargetId_idx" ON public."AnswerEventEntity" USING btree ("eventId", "surveyTargetId");

--
-- Name: AnswerEventEntity_intelligenceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_intelligenceId_idx" ON public."AnswerEventEntity" USING btree ("intelligenceId");

--
-- Name: AnswerEventEntity_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_label_idx" ON public."AnswerEventEntity" USING btree (label);

--
-- Name: AnswerEventEntity_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_surveyId_idx" ON public."AnswerEventEntity" USING btree ("surveyId");

--
-- Name: AnswerEventEntity_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventEntity_surveyTargetId_idx" ON public."AnswerEventEntity" USING btree ("surveyTargetId");

--
-- Name: AnswerEventIntelligence_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_accountId_idx" ON public."AnswerEventIntelligence" USING btree ("accountId");

--
-- Name: AnswerEventIntelligence_answerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AnswerEventIntelligence_answerId_key" ON public."AnswerEventIntelligence" USING btree ("answerId");

--
-- Name: AnswerEventIntelligence_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_eventId_idx" ON public."AnswerEventIntelligence" USING btree ("eventId");

--
-- Name: AnswerEventIntelligence_eventId_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_eventId_surveyId_idx" ON public."AnswerEventIntelligence" USING btree ("eventId", "surveyId");

--
-- Name: AnswerEventIntelligence_eventId_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_eventId_surveyTargetId_idx" ON public."AnswerEventIntelligence" USING btree ("eventId", "surveyTargetId");

--
-- Name: AnswerEventIntelligence_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_locationId_idx" ON public."AnswerEventIntelligence" USING btree ("locationId");

--
-- Name: AnswerEventIntelligence_questionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_questionId_idx" ON public."AnswerEventIntelligence" USING btree ("questionId");

--
-- Name: AnswerEventIntelligence_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_responseId_idx" ON public."AnswerEventIntelligence" USING btree ("responseId");

--
-- Name: AnswerEventIntelligence_sentimentLabel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_sentimentLabel_idx" ON public."AnswerEventIntelligence" USING btree ("sentimentLabel");

--
-- Name: AnswerEventIntelligence_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_surveyId_idx" ON public."AnswerEventIntelligence" USING btree ("surveyId");

--
-- Name: AnswerEventIntelligence_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_surveyTargetId_idx" ON public."AnswerEventIntelligence" USING btree ("surveyTargetId");

--
-- Name: AnswerEventIntelligence_urgency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventIntelligence_urgency_idx" ON public."AnswerEventIntelligence" USING btree (urgency);

--
-- Name: AnswerEventTheme_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_answerId_idx" ON public."AnswerEventTheme" USING btree ("answerId");

--
-- Name: AnswerEventTheme_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_eventId_idx" ON public."AnswerEventTheme" USING btree ("eventId");

--
-- Name: AnswerEventTheme_eventId_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_eventId_surveyId_idx" ON public."AnswerEventTheme" USING btree ("eventId", "surveyId");

--
-- Name: AnswerEventTheme_eventId_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_eventId_surveyTargetId_idx" ON public."AnswerEventTheme" USING btree ("eventId", "surveyTargetId");

--
-- Name: AnswerEventTheme_intelligenceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_intelligenceId_idx" ON public."AnswerEventTheme" USING btree ("intelligenceId");

--
-- Name: AnswerEventTheme_sentimentLabel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_sentimentLabel_idx" ON public."AnswerEventTheme" USING btree ("sentimentLabel");

--
-- Name: AnswerEventTheme_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_surveyId_idx" ON public."AnswerEventTheme" USING btree ("surveyId");

--
-- Name: AnswerEventTheme_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_surveyTargetId_idx" ON public."AnswerEventTheme" USING btree ("surveyTargetId");

--
-- Name: AnswerEventTheme_themeKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerEventTheme_themeKey_idx" ON public."AnswerEventTheme" USING btree ("themeKey");

--
-- Name: AnswerProcessingLog_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerProcessingLog_answerId_idx" ON public."AnswerProcessingLog" USING btree ("answerId");

--
-- Name: AnswerProcessingLog_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerProcessingLog_startedAt_idx" ON public."AnswerProcessingLog" USING btree ("startedAt");

--
-- Name: AnswerProcessingLog_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerProcessingLog_step_idx" ON public."AnswerProcessingLog" USING btree (step);

--
-- Name: AnswerTranscript_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerTranscript_answerId_idx" ON public."AnswerTranscript" USING btree ("answerId");

--
-- Name: AnswerTranscript_answerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AnswerTranscript_answerId_key" ON public."AnswerTranscript" USING btree ("answerId");

--
-- Name: AnswerTranscript_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AnswerTranscript_provider_idx" ON public."AnswerTranscript" USING btree (provider);

--
-- Name: Answer_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_createdAt_idx" ON public."Answer" USING btree ("createdAt");

--
-- Name: Answer_objectKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Answer_objectKey_key" ON public."Answer" USING btree ("objectKey");

--
-- Name: Answer_questionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_questionId_idx" ON public."Answer" USING btree ("questionId");

--
-- Name: Answer_questionId_numericValue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_questionId_numericValue_idx" ON public."Answer" USING btree ("questionId", "numericValue");

--
-- Name: Answer_questionId_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_questionId_speakerId_idx" ON public."Answer" USING btree ("questionId", "speakerId");

--
-- Name: Answer_questionKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_questionKey_idx" ON public."Answer" USING btree ("questionKey");

--
-- Name: Answer_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_responseId_idx" ON public."Answer" USING btree ("responseId");

--
-- Name: Answer_responseId_questionId_speakerId_presenter_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Answer_responseId_questionId_speakerId_presenter_key" ON public."Answer" USING btree ("responseId", "questionId", "speakerId") WHERE (("numericValue" IS NOT NULL) AND ("speakerId" IS NOT NULL));

--
-- Name: Answer_responseId_questionId_structured_general_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Answer_responseId_questionId_structured_general_key" ON public."Answer" USING btree ("responseId", "questionId") WHERE (("numericValue" IS NOT NULL) AND ("speakerId" IS NULL));

--
-- Name: Answer_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_speakerId_idx" ON public."Answer" USING btree ("speakerId");

--
-- Name: Answer_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Answer_status_idx" ON public."Answer" USING btree (status);

--
-- Name: EventActionAssignmentDelivery_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionAssignmentDelivery_accountId_idx" ON public."EventActionAssignmentDelivery" USING btree ("accountId");

--
-- Name: EventActionAssignmentDelivery_clusterId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionAssignmentDelivery_clusterId_createdAt_idx" ON public."EventActionAssignmentDelivery" USING btree ("clusterId", "createdAt");

--
-- Name: EventActionAssignmentDelivery_clusterId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventActionAssignmentDelivery_clusterId_idempotencyKey_key" ON public."EventActionAssignmentDelivery" USING btree ("clusterId", "idempotencyKey");

--
-- Name: EventActionAssignmentDelivery_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionAssignmentDelivery_eventId_idx" ON public."EventActionAssignmentDelivery" USING btree ("eventId");

--
-- Name: EventActionAssignmentDelivery_recipientUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionAssignmentDelivery_recipientUserId_idx" ON public."EventActionAssignmentDelivery" USING btree ("recipientUserId");

--
-- Name: EventActionAssignmentDelivery_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionAssignmentDelivery_status_idx" ON public."EventActionAssignmentDelivery" USING btree (status);

--
-- Name: EventActionDeliveryAttempt_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionDeliveryAttempt_accountId_idx" ON public."EventActionDeliveryAttempt" USING btree ("accountId");

--
-- Name: EventActionDeliveryAttempt_deliveryId_attemptNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventActionDeliveryAttempt_deliveryId_attemptNumber_key" ON public."EventActionDeliveryAttempt" USING btree ("deliveryId", "attemptNumber");

--
-- Name: EventActionDeliveryAttempt_deliveryId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventActionDeliveryAttempt_deliveryId_idempotencyKey_key" ON public."EventActionDeliveryAttempt" USING btree ("deliveryId", "idempotencyKey");

--
-- Name: EventActionDeliveryAttempt_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionDeliveryAttempt_eventId_idx" ON public."EventActionDeliveryAttempt" USING btree ("eventId");

--
-- Name: EventActionDeliveryAttempt_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionDeliveryAttempt_status_idx" ON public."EventActionDeliveryAttempt" USING btree (status);

--
-- Name: EventActionHistory_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionHistory_accountId_idx" ON public."EventActionHistory" USING btree ("accountId");

--
-- Name: EventActionHistory_actorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionHistory_actorUserId_idx" ON public."EventActionHistory" USING btree ("actorUserId");

--
-- Name: EventActionHistory_clusterId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionHistory_clusterId_createdAt_idx" ON public."EventActionHistory" USING btree ("clusterId", "createdAt");

--
-- Name: EventActionHistory_clusterId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventActionHistory_clusterId_idempotencyKey_key" ON public."EventActionHistory" USING btree ("clusterId", "idempotencyKey");

--
-- Name: EventActionHistory_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionHistory_eventId_idx" ON public."EventActionHistory" USING btree ("eventId");

--
-- Name: EventActionUpdate_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionUpdate_accountId_idx" ON public."EventActionUpdate" USING btree ("accountId");

--
-- Name: EventActionUpdate_authorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionUpdate_authorUserId_idx" ON public."EventActionUpdate" USING btree ("authorUserId");

--
-- Name: EventActionUpdate_clusterId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionUpdate_clusterId_createdAt_idx" ON public."EventActionUpdate" USING btree ("clusterId", "createdAt");

--
-- Name: EventActionUpdate_clusterId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventActionUpdate_clusterId_idempotencyKey_key" ON public."EventActionUpdate" USING btree ("clusterId", "idempotencyKey");

--
-- Name: EventActionUpdate_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionUpdate_eventId_idx" ON public."EventActionUpdate" USING btree ("eventId");

--
-- Name: EventActionUpdate_voiceTranscriptionStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActionUpdate_voiceTranscriptionStatus_idx" ON public."EventActionUpdate" USING btree ("voiceTranscriptionStatus");

--
-- Name: EventAgendaImportJob_accountId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportJob_accountId_createdAt_idx" ON public."EventAgendaImportJob" USING btree ("accountId", "createdAt");

--
-- Name: EventAgendaImportJob_confirmedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportJob_confirmedByUserId_idx" ON public."EventAgendaImportJob" USING btree ("confirmedByUserId");

--
-- Name: EventAgendaImportJob_createdByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportJob_createdByUserId_idx" ON public."EventAgendaImportJob" USING btree ("createdByUserId");

--
-- Name: EventAgendaImportJob_eventId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAgendaImportJob_eventId_id_key" ON public."EventAgendaImportJob" USING btree ("eventId", id);

--
-- Name: EventAgendaImportJob_eventId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAgendaImportJob_eventId_idempotencyKey_key" ON public."EventAgendaImportJob" USING btree ("eventId", "idempotencyKey");

--
-- Name: EventAgendaImportJob_eventId_sourceChecksumSha256_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportJob_eventId_sourceChecksumSha256_idx" ON public."EventAgendaImportJob" USING btree ("eventId", "sourceChecksumSha256");

--
-- Name: EventAgendaImportJob_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportJob_eventId_status_idx" ON public."EventAgendaImportJob" USING btree ("eventId", status);

--
-- Name: EventAgendaImportJob_sourceObjectKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAgendaImportJob_sourceObjectKey_key" ON public."EventAgendaImportJob" USING btree ("sourceObjectKey");

--
-- Name: EventAgendaImportRow_eventId_existingSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportRow_eventId_existingSessionId_idx" ON public."EventAgendaImportRow" USING btree ("eventId", "existingSessionId");

--
-- Name: EventAgendaImportRow_eventId_resultSessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportRow_eventId_resultSessionId_idx" ON public."EventAgendaImportRow" USING btree ("eventId", "resultSessionId");

--
-- Name: EventAgendaImportRow_eventId_sourceExternalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportRow_eventId_sourceExternalId_idx" ON public."EventAgendaImportRow" USING btree ("eventId", "sourceExternalId");

--
-- Name: EventAgendaImportRow_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAgendaImportRow_eventId_status_idx" ON public."EventAgendaImportRow" USING btree ("eventId", status);

--
-- Name: EventAgendaImportRow_importJobId_sourceRowNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAgendaImportRow_importJobId_sourceRowNumber_key" ON public."EventAgendaImportRow" USING btree ("importJobId", "sourceRowNumber");

--
-- Name: EventAgendaImportRow_importJobId_stableSourceKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAgendaImportRow_importJobId_stableSourceKey_key" ON public."EventAgendaImportRow" USING btree ("importJobId", "stableSourceKey");

--
-- Name: EventAlertNote_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAlertNote_accountId_idx" ON public."EventAlertNote" USING btree ("accountId");

--
-- Name: EventAlertNote_authorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAlertNote_authorUserId_idx" ON public."EventAlertNote" USING btree ("authorUserId");

--
-- Name: EventAlertNote_clusterId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAlertNote_clusterId_createdAt_idx" ON public."EventAlertNote" USING btree ("clusterId", "createdAt");

--
-- Name: EventAlertNote_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAlertNote_eventId_idx" ON public."EventAlertNote" USING btree ("eventId");

--
-- Name: EventClosingBriefSnapshot_accountId_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventClosingBriefSnapshot_accountId_eventId_idx" ON public."EventClosingBriefSnapshot" USING btree ("accountId", "eventId");

--
-- Name: EventClosingBriefSnapshot_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventClosingBriefSnapshot_accountId_idx" ON public."EventClosingBriefSnapshot" USING btree ("accountId");

--
-- Name: EventClosingBriefSnapshot_briefHash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventClosingBriefSnapshot_briefHash_idx" ON public."EventClosingBriefSnapshot" USING btree ("briefHash");

--
-- Name: EventClosingBriefSnapshot_eventId_lifecyclePhase_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventClosingBriefSnapshot_eventId_lifecyclePhase_key" ON public."EventClosingBriefSnapshot" USING btree ("eventId", "lifecyclePhase");

--
-- Name: EventIntelligenceAggregate_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_accountId_idx" ON public."EventIntelligenceAggregate" USING btree ("accountId");

--
-- Name: EventIntelligenceAggregate_bucketType_bucketKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_bucketType_bucketKey_idx" ON public."EventIntelligenceAggregate" USING btree ("bucketType", "bucketKey");

--
-- Name: EventIntelligenceAggregate_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_eventId_idx" ON public."EventIntelligenceAggregate" USING btree ("eventId");

--
-- Name: EventIntelligenceAggregate_eventId_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_eventId_surveyId_idx" ON public."EventIntelligenceAggregate" USING btree ("eventId", "surveyId");

--
-- Name: EventIntelligenceAggregate_eventId_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_eventId_surveyTargetId_idx" ON public."EventIntelligenceAggregate" USING btree ("eventId", "surveyTargetId");

--
-- Name: EventIntelligenceAggregate_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_locationId_idx" ON public."EventIntelligenceAggregate" USING btree ("locationId");

--
-- Name: EventIntelligenceAggregate_questionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_questionId_idx" ON public."EventIntelligenceAggregate" USING btree ("questionId");

--
-- Name: EventIntelligenceAggregate_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_surveyId_idx" ON public."EventIntelligenceAggregate" USING btree ("surveyId");

--
-- Name: EventIntelligenceAggregate_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntelligenceAggregate_surveyTargetId_idx" ON public."EventIntelligenceAggregate" USING btree ("surveyTargetId");

--
-- Name: EventIssueCluster_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_accountId_idx" ON public."EventIssueCluster" USING btree ("accountId");

--
-- Name: EventIssueCluster_clusterKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventIssueCluster_clusterKey_key" ON public."EventIssueCluster" USING btree ("clusterKey");

--
-- Name: EventIssueCluster_eventId_actionClassification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_eventId_actionClassification_idx" ON public."EventIssueCluster" USING btree ("eventId", "actionClassification");

--
-- Name: EventIssueCluster_eventId_actionStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_eventId_actionStatus_idx" ON public."EventIssueCluster" USING btree ("eventId", "actionStatus");

--
-- Name: EventIssueCluster_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_eventId_idx" ON public."EventIssueCluster" USING btree ("eventId");

--
-- Name: EventIssueCluster_eventId_ruleType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_eventId_ruleType_idx" ON public."EventIssueCluster" USING btree ("eventId", "ruleType");

--
-- Name: EventIssueCluster_eventId_status_priorityLevel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_eventId_status_priorityLevel_idx" ON public."EventIssueCluster" USING btree ("eventId", status, "priorityLevel");

--
-- Name: EventIssueCluster_eventId_taxonomyKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_eventId_taxonomyKey_idx" ON public."EventIssueCluster" USING btree ("eventId", "taxonomyKey");

--
-- Name: EventIssueCluster_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_locationId_idx" ON public."EventIssueCluster" USING btree ("locationId");

--
-- Name: EventIssueCluster_ownerUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_ownerUserId_idx" ON public."EventIssueCluster" USING btree ("ownerUserId");

--
-- Name: EventIssueCluster_priorityLevel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_priorityLevel_idx" ON public."EventIssueCluster" USING btree ("priorityLevel");

--
-- Name: EventIssueCluster_questionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_questionId_idx" ON public."EventIssueCluster" USING btree ("questionId");

--
-- Name: EventIssueCluster_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_status_idx" ON public."EventIssueCluster" USING btree (status);

--
-- Name: EventIssueCluster_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_surveyId_idx" ON public."EventIssueCluster" USING btree ("surveyId");

--
-- Name: EventIssueCluster_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueCluster_surveyTargetId_idx" ON public."EventIssueCluster" USING btree ("surveyTargetId");

--
-- Name: EventIssueEvidence_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_accountId_idx" ON public."EventIssueEvidence" USING btree ("accountId");

--
-- Name: EventIssueEvidence_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_answerId_idx" ON public."EventIssueEvidence" USING btree ("answerId");

--
-- Name: EventIssueEvidence_clusterId_answerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventIssueEvidence_clusterId_answerId_key" ON public."EventIssueEvidence" USING btree ("clusterId", "answerId");

--
-- Name: EventIssueEvidence_clusterId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_clusterId_idx" ON public."EventIssueEvidence" USING btree ("clusterId");

--
-- Name: EventIssueEvidence_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_eventId_idx" ON public."EventIssueEvidence" USING btree ("eventId");

--
-- Name: EventIssueEvidence_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_locationId_idx" ON public."EventIssueEvidence" USING btree ("locationId");

--
-- Name: EventIssueEvidence_priorityLevel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_priorityLevel_idx" ON public."EventIssueEvidence" USING btree ("priorityLevel");

--
-- Name: EventIssueEvidence_questionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_questionId_idx" ON public."EventIssueEvidence" USING btree ("questionId");

--
-- Name: EventIssueEvidence_responseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_responseId_idx" ON public."EventIssueEvidence" USING btree ("responseId");

--
-- Name: EventIssueEvidence_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_surveyId_idx" ON public."EventIssueEvidence" USING btree ("surveyId");

--
-- Name: EventIssueEvidence_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIssueEvidence_surveyTargetId_idx" ON public."EventIssueEvidence" USING btree ("surveyTargetId");

--
-- Name: EventSessionSpeakerAssignment_accountId_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventSessionSpeakerAssignment_accountId_speakerId_idx" ON public."EventSessionSpeakerAssignment" USING btree ("accountId", "speakerId");

--
-- Name: EventSessionSpeakerAssignment_eventId_sessionId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventSessionSpeakerAssignment_eventId_sessionId_sortOrder_idx" ON public."EventSessionSpeakerAssignment" USING btree ("eventId", "sessionId", "sortOrder");

--
-- Name: EventSessionSpeakerAssignment_eventId_speakerId_roster_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventSessionSpeakerAssignment_eventId_speakerId_roster_key" ON public."EventSessionSpeakerAssignment" USING btree ("eventId", "speakerId") WHERE ("sessionId" IS NULL);

--
-- Name: EventSessionSpeakerAssignment_sessionId_speakerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventSessionSpeakerAssignment_sessionId_speakerId_key" ON public."EventSessionSpeakerAssignment" USING btree ("sessionId", "speakerId");

--
-- Name: EventSpeakerProfile_accountId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventSpeakerProfile_accountId_id_key" ON public."EventSpeakerProfile" USING btree ("accountId", id);

--
-- Name: EventSpeakerProfile_accountId_isArchived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventSpeakerProfile_accountId_isArchived_idx" ON public."EventSpeakerProfile" USING btree ("accountId", "isArchived");

--
-- Name: EventSpeakerProfile_accountId_normalizedEmail_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventSpeakerProfile_accountId_normalizedEmail_idx" ON public."EventSpeakerProfile" USING btree ("accountId", "normalizedEmail");

--
-- Name: EventSpeakerProfile_accountId_normalizedName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventSpeakerProfile_accountId_normalizedName_idx" ON public."EventSpeakerProfile" USING btree ("accountId", "normalizedName");

--
-- Name: EventStructureItem_eventId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventStructureItem_eventId_id_key" ON public."EventStructureItem" USING btree ("eventId", id);

--
-- Name: EventStructureItem_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventStructureItem_eventId_idx" ON public."EventStructureItem" USING btree ("eventId");

--
-- Name: EventStructureItem_eventId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventStructureItem_eventId_slug_key" ON public."EventStructureItem" USING btree ("eventId", slug);

--
-- Name: EventStructureItem_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventStructureItem_kind_idx" ON public."EventStructureItem" USING btree (kind);

--
-- Name: EventStructureItem_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventStructureItem_locationId_idx" ON public."EventStructureItem" USING btree ("locationId");

--
-- Name: EventStructureItem_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventStructureItem_parentId_idx" ON public."EventStructureItem" USING btree ("parentId");

--
-- Name: Event_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_eventType_idx" ON public."Event" USING btree ("eventType");

--
-- Name: Event_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_isActive_idx" ON public."Event" USING btree ("isActive");

--
-- Name: Event_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_locationId_idx" ON public."Event" USING btree ("locationId");

--
-- Name: Event_platformEventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Event_platformEventId_key" ON public."Event" USING btree ("platformEventId");

--
-- Name: Event_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_startDate_idx" ON public."Event" USING btree ("startDate");

--
-- Name: Event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_status_idx" ON public."Event" USING btree (status);

--
-- Name: InsightSourceAnswer_answerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InsightSourceAnswer_answerId_idx" ON public."InsightSourceAnswer" USING btree ("answerId");

--
-- Name: InsightSourceAnswer_insightId_answerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InsightSourceAnswer_insightId_answerId_key" ON public."InsightSourceAnswer" USING btree ("insightId", "answerId");

--
-- Name: Insight_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Insight_eventId_idx" ON public."Insight" USING btree ("eventId");

--
-- Name: Insight_eventId_themeKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Insight_eventId_themeKey_key" ON public."Insight" USING btree ("eventId", "themeKey");

--
-- Name: Location_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Location_accountId_idx" ON public."Location" USING btree ("accountId");

--
-- Name: Location_accountId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Location_accountId_slug_key" ON public."Location" USING btree ("accountId", slug);

--
-- Name: Location_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Location_isActive_idx" ON public."Location" USING btree ("isActive");

--
-- Name: Location_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Location_slug_idx" ON public."Location" USING btree (slug);

--
-- Name: PendingProvision_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PendingProvision_accountId_idx" ON public."PendingProvision" USING btree ("accountId");

--
-- Name: PendingProvision_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PendingProvision_email_idx" ON public."PendingProvision" USING btree (email);

--
-- Name: PendingProvision_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PendingProvision_email_key" ON public."PendingProvision" USING btree (email);

--
-- Name: PendingProvision_usedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PendingProvision_usedAt_idx" ON public."PendingProvision" USING btree ("usedAt");

--
-- Name: PlatformUserActionAudit_accountId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlatformUserActionAudit_accountId_createdAt_idx" ON public."PlatformUserActionAudit" USING btree ("accountId", "createdAt");

--
-- Name: PlatformUserActionAudit_actorUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlatformUserActionAudit_actorUserId_createdAt_idx" ON public."PlatformUserActionAudit" USING btree ("actorUserId", "createdAt");

--
-- Name: PlatformUserActionAudit_targetEmail_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlatformUserActionAudit_targetEmail_idx" ON public."PlatformUserActionAudit" USING btree ("targetEmail");

--
-- Name: PlatformUserActionAudit_targetUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlatformUserActionAudit_targetUserId_createdAt_idx" ON public."PlatformUserActionAudit" USING btree ("targetUserId", "createdAt");

--
-- Name: ProcessingLog_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProcessingLog_sessionId_idx" ON public."ProcessingLog" USING btree ("sessionId");

--
-- Name: ProcessingLog_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProcessingLog_startedAt_idx" ON public."ProcessingLog" USING btree ("startedAt");

--
-- Name: ProcessingLog_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProcessingLog_step_idx" ON public."ProcessingLog" USING btree (step);

--
-- Name: PublicSurveyLink_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicSurveyLink_isActive_idx" ON public."PublicSurveyLink" USING btree ("isActive");

--
-- Name: PublicSurveyLink_speakerAssignmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicSurveyLink_speakerAssignmentId_idx" ON public."PublicSurveyLink" USING btree ("speakerAssignmentId");

--
-- Name: PublicSurveyLink_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicSurveyLink_surveyId_idx" ON public."PublicSurveyLink" USING btree ("surveyId");

--
-- Name: PublicSurveyLink_surveyId_surveyTargetId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicSurveyLink_surveyId_surveyTargetId_isActive_idx" ON public."PublicSurveyLink" USING btree ("surveyId", "surveyTargetId", "isActive");

--
-- Name: PublicSurveyLink_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicSurveyLink_surveyTargetId_idx" ON public."PublicSurveyLink" USING btree ("surveyTargetId");

--
-- Name: PublicSurveyLink_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PublicSurveyLink_token_key" ON public."PublicSurveyLink" USING btree (token);

--
-- Name: QuestionAudioAsset_objectKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionAudioAsset_objectKey_key" ON public."QuestionAudioAsset" USING btree ("objectKey");

--
-- Name: QuestionAudioAsset_questionId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionAudioAsset_questionId_createdAt_idx" ON public."QuestionAudioAsset" USING btree ("questionId", "createdAt");

--
-- Name: QuestionAudioAsset_questionId_provider_voice_language_local_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "QuestionAudioAsset_questionId_provider_voice_language_local_idx" ON public."QuestionAudioAsset" USING btree ("questionId", provider, voice, language, locale);

--
-- Name: QuestionAudioAsset_questionId_provider_voice_language_local_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "QuestionAudioAsset_questionId_provider_voice_language_local_key" ON public."QuestionAudioAsset" USING btree ("questionId", provider, voice, language, locale, "textHash");

--
-- Name: Question_eventId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Question_eventId_key_key" ON public."Question" USING btree ("eventId", key);

--
-- Name: Question_eventId_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Question_eventId_order_idx" ON public."Question" USING btree ("eventId", "order");

--
-- Name: Question_eventId_order_legacy_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Question_eventId_order_legacy_key" ON public."Question" USING btree ("eventId", "order") WHERE ("surveyId" IS NULL);

--
-- Name: Question_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Question_surveyId_idx" ON public."Question" USING btree ("surveyId");

--
-- Name: Question_surveyId_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Question_surveyId_order_key" ON public."Question" USING btree ("surveyId", "order");

--
-- Name: Question_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Question_type_idx" ON public."Question" USING btree (type);

--
-- Name: Response_anonymousId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_anonymousId_idx" ON public."Response" USING btree ("anonymousId");

--
-- Name: Response_eventId_collectionPhase_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_eventId_collectionPhase_status_idx" ON public."Response" USING btree ("eventId", "collectionPhase", status);

--
-- Name: Response_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_eventId_idx" ON public."Response" USING btree ("eventId");

--
-- Name: Response_publicSurveyLinkId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_publicSurveyLinkId_idx" ON public."Response" USING btree ("publicSurveyLinkId");

--
-- Name: Response_speakerAssignmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_speakerAssignmentId_idx" ON public."Response" USING btree ("speakerAssignmentId");

--
-- Name: Response_startedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_startedAt_idx" ON public."Response" USING btree ("startedAt");

--
-- Name: Response_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_status_idx" ON public."Response" USING btree (status);

--
-- Name: Response_surveyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_surveyId_idx" ON public."Response" USING btree ("surveyId");

--
-- Name: Response_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Response_surveyTargetId_idx" ON public."Response" USING btree ("surveyTargetId");

--
-- Name: Session_boothId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_boothId_idx" ON public."Session" USING btree ("boothId");

--
-- Name: Session_consentAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_consentAt_idx" ON public."Session" USING btree ("consentAt");

--
-- Name: Session_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_createdAt_idx" ON public."Session" USING btree ("createdAt");

--
-- Name: Session_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_eventId_idx" ON public."Session" USING btree ("eventId");

--
-- Name: Session_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_locationId_idx" ON public."Session" USING btree ("locationId");

--
-- Name: Session_objectKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Session_objectKey_key" ON public."Session" USING btree ("objectKey");

--
-- Name: Session_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_status_idx" ON public."Session" USING btree (status);

--
-- Name: SurveyTarget_eventId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SurveyTarget_eventId_category_idx" ON public."SurveyTarget" USING btree ("eventId", category);

--
-- Name: SurveyTarget_eventId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SurveyTarget_eventId_slug_key" ON public."SurveyTarget" USING btree ("eventId", slug);

--
-- Name: SurveyTarget_eventId_speakerId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SurveyTarget_eventId_speakerId_category_idx" ON public."SurveyTarget" USING btree ("eventId", "speakerId", category);

--
-- Name: SurveyTarget_eventStructureItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SurveyTarget_eventStructureItemId_idx" ON public."SurveyTarget" USING btree ("eventStructureItemId");

--
-- Name: SurveyTarget_locationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SurveyTarget_locationId_idx" ON public."SurveyTarget" USING btree ("locationId");

--
-- Name: SurveyTarget_speakerAssignmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SurveyTarget_speakerAssignmentId_idx" ON public."SurveyTarget" USING btree ("speakerAssignmentId");

--
-- Name: Survey_availabilityMode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Survey_availabilityMode_idx" ON public."Survey" USING btree ("availabilityMode");

--
-- Name: Survey_eventId_collectionPhase_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Survey_eventId_collectionPhase_idx" ON public."Survey" USING btree ("eventId", "collectionPhase");

--
-- Name: Survey_eventId_creationRequestId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Survey_eventId_creationRequestId_key" ON public."Survey" USING btree ("eventId", "creationRequestId");

--
-- Name: Survey_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Survey_eventId_idx" ON public."Survey" USING btree ("eventId");

--
-- Name: Survey_surveyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Survey_surveyTargetId_idx" ON public."Survey" USING btree ("surveyTargetId");

--
-- Name: TestSignupToken_createdByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TestSignupToken_createdByUserId_idx" ON public."TestSignupToken" USING btree ("createdByUserId");

--
-- Name: TestSignupToken_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TestSignupToken_expiresAt_idx" ON public."TestSignupToken" USING btree ("expiresAt");

--
-- Name: TestSignupToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TestSignupToken_tokenHash_key" ON public."TestSignupToken" USING btree ("tokenHash");

--
-- Name: TestSignupToken_usedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TestSignupToken_usedAt_idx" ON public."TestSignupToken" USING btree ("usedAt");

--
-- Name: Transcript_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transcript_provider_idx" ON public."Transcript" USING btree (provider);

--
-- Name: Transcript_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transcript_sessionId_idx" ON public."Transcript" USING btree ("sessionId");

--
-- Name: Transcript_sessionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Transcript_sessionId_key" ON public."Transcript" USING btree ("sessionId");

--
-- Name: User_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_accountId_idx" ON public."User" USING btree ("accountId");

--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);

--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

--
-- Name: User_platformUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_platformUserId_key" ON public."User" USING btree ("platformUserId");

--
-- Name: User_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_role_idx" ON public."User" USING btree (role);

--
-- Name: Response Response_collectionPhase_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Response_collectionPhase_immutable" BEFORE UPDATE OF "collectionPhase" ON public."Response" FOR EACH ROW EXECUTE FUNCTION public.prevent_response_collection_phase_change();

--
-- Name: AccountUserMembership AccountUserMembership_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountUserMembership"
    ADD CONSTRAINT "AccountUserMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AccountUserMembership AccountUserMembership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountUserMembership"
    ADD CONSTRAINT "AccountUserMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Admin Admin_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin"
    ADD CONSTRAINT "Admin_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Analysis Analysis_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Analysis"
    ADD CONSTRAINT "Analysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."Session"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerAnalysis AnswerAnalysis_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerAnalysis"
    ADD CONSTRAINT "AnswerAnalysis_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventAction AnswerEventAction_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventAction"
    ADD CONSTRAINT "AnswerEventAction_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventAction AnswerEventAction_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventAction"
    ADD CONSTRAINT "AnswerEventAction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventAction AnswerEventAction_intelligenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventAction"
    ADD CONSTRAINT "AnswerEventAction_intelligenceId_fkey" FOREIGN KEY ("intelligenceId") REFERENCES public."AnswerEventIntelligence"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventAction AnswerEventAction_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventAction"
    ADD CONSTRAINT "AnswerEventAction_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventAction AnswerEventAction_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventAction"
    ADD CONSTRAINT "AnswerEventAction_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventEntity AnswerEventEntity_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventEntity"
    ADD CONSTRAINT "AnswerEventEntity_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventEntity AnswerEventEntity_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventEntity"
    ADD CONSTRAINT "AnswerEventEntity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventEntity AnswerEventEntity_intelligenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventEntity"
    ADD CONSTRAINT "AnswerEventEntity_intelligenceId_fkey" FOREIGN KEY ("intelligenceId") REFERENCES public."AnswerEventIntelligence"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventEntity AnswerEventEntity_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventEntity"
    ADD CONSTRAINT "AnswerEventEntity_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventEntity AnswerEventEntity_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventEntity"
    ADD CONSTRAINT "AnswerEventEntity_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_questionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES public."Question"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES public."Response"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventIntelligence AnswerEventIntelligence_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventIntelligence"
    ADD CONSTRAINT "AnswerEventIntelligence_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventTheme AnswerEventTheme_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventTheme"
    ADD CONSTRAINT "AnswerEventTheme_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventTheme AnswerEventTheme_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventTheme"
    ADD CONSTRAINT "AnswerEventTheme_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventTheme AnswerEventTheme_intelligenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventTheme"
    ADD CONSTRAINT "AnswerEventTheme_intelligenceId_fkey" FOREIGN KEY ("intelligenceId") REFERENCES public."AnswerEventIntelligence"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerEventTheme AnswerEventTheme_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventTheme"
    ADD CONSTRAINT "AnswerEventTheme_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerEventTheme AnswerEventTheme_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerEventTheme"
    ADD CONSTRAINT "AnswerEventTheme_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AnswerProcessingLog AnswerProcessingLog_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerProcessingLog"
    ADD CONSTRAINT "AnswerProcessingLog_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: AnswerTranscript AnswerTranscript_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AnswerTranscript"
    ADD CONSTRAINT "AnswerTranscript_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Answer Answer_questionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Answer"
    ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES public."Question"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Answer Answer_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Answer"
    ADD CONSTRAINT "Answer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES public."Response"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionAssignmentDelivery EventActionAssignmentDelivery_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionAssignmentDelivery"
    ADD CONSTRAINT "EventActionAssignmentDelivery_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionAssignmentDelivery EventActionAssignmentDelivery_clusterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionAssignmentDelivery"
    ADD CONSTRAINT "EventActionAssignmentDelivery_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES public."EventIssueCluster"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionAssignmentDelivery EventActionAssignmentDelivery_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionAssignmentDelivery"
    ADD CONSTRAINT "EventActionAssignmentDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionDeliveryAttempt EventActionDeliveryAttempt_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionDeliveryAttempt"
    ADD CONSTRAINT "EventActionDeliveryAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionDeliveryAttempt EventActionDeliveryAttempt_deliveryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionDeliveryAttempt"
    ADD CONSTRAINT "EventActionDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES public."EventActionAssignmentDelivery"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionDeliveryAttempt EventActionDeliveryAttempt_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionDeliveryAttempt"
    ADD CONSTRAINT "EventActionDeliveryAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionHistory EventActionHistory_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionHistory"
    ADD CONSTRAINT "EventActionHistory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionHistory EventActionHistory_clusterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionHistory"
    ADD CONSTRAINT "EventActionHistory_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES public."EventIssueCluster"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionHistory EventActionHistory_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionHistory"
    ADD CONSTRAINT "EventActionHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionUpdate EventActionUpdate_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionUpdate"
    ADD CONSTRAINT "EventActionUpdate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionUpdate EventActionUpdate_clusterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionUpdate"
    ADD CONSTRAINT "EventActionUpdate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES public."EventIssueCluster"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventActionUpdate EventActionUpdate_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActionUpdate"
    ADD CONSTRAINT "EventActionUpdate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAgendaImportJob EventAgendaImportJob_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportJob"
    ADD CONSTRAINT "EventAgendaImportJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAgendaImportJob EventAgendaImportJob_confirmedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportJob"
    ADD CONSTRAINT "EventAgendaImportJob_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventAgendaImportJob EventAgendaImportJob_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportJob"
    ADD CONSTRAINT "EventAgendaImportJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventAgendaImportJob EventAgendaImportJob_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportJob"
    ADD CONSTRAINT "EventAgendaImportJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAgendaImportRow EventAgendaImportRow_eventId_importJobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportRow"
    ADD CONSTRAINT "EventAgendaImportRow_eventId_importJobId_fkey" FOREIGN KEY ("eventId", "importJobId") REFERENCES public."EventAgendaImportJob"("eventId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAgendaImportRow EventAgendaImportRow_existingSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportRow"
    ADD CONSTRAINT "EventAgendaImportRow_existingSessionId_fkey" FOREIGN KEY ("existingSessionId") REFERENCES public."EventStructureItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventAgendaImportRow EventAgendaImportRow_resultSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAgendaImportRow"
    ADD CONSTRAINT "EventAgendaImportRow_resultSessionId_fkey" FOREIGN KEY ("resultSessionId") REFERENCES public."EventStructureItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventAlertNote EventAlertNote_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAlertNote"
    ADD CONSTRAINT "EventAlertNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAlertNote EventAlertNote_clusterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAlertNote"
    ADD CONSTRAINT "EventAlertNote_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES public."EventIssueCluster"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAlertNote EventAlertNote_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAlertNote"
    ADD CONSTRAINT "EventAlertNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventClosingBriefSnapshot EventClosingBriefSnapshot_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventClosingBriefSnapshot"
    ADD CONSTRAINT "EventClosingBriefSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventClosingBriefSnapshot EventClosingBriefSnapshot_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventClosingBriefSnapshot"
    ADD CONSTRAINT "EventClosingBriefSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_questionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES public."Question"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIntelligenceAggregate EventIntelligenceAggregate_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntelligenceAggregate"
    ADD CONSTRAINT "EventIntelligenceAggregate_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIssueCluster EventIssueCluster_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueCluster EventIssueCluster_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueCluster EventIssueCluster_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueCluster EventIssueCluster_questionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES public."Question"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIssueCluster EventIssueCluster_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIssueCluster EventIssueCluster_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueCluster"
    ADD CONSTRAINT "EventIssueCluster_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIssueEvidence EventIssueEvidence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueEvidence EventIssueEvidence_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueEvidence EventIssueEvidence_clusterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES public."EventIssueCluster"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueEvidence EventIssueEvidence_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueEvidence EventIssueEvidence_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueEvidence EventIssueEvidence_questionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES public."Question"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIssueEvidence EventIssueEvidence_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES public."Response"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIssueEvidence EventIssueEvidence_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventIssueEvidence EventIssueEvidence_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIssueEvidence"
    ADD CONSTRAINT "EventIssueEvidence_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventSessionSpeakerAssignment EventSessionSpeakerAssignment_accountId_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSessionSpeakerAssignment"
    ADD CONSTRAINT "EventSessionSpeakerAssignment_accountId_speakerId_fkey" FOREIGN KEY ("accountId", "speakerId") REFERENCES public."EventSpeakerProfile"("accountId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventSessionSpeakerAssignment EventSessionSpeakerAssignment_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSessionSpeakerAssignment"
    ADD CONSTRAINT "EventSessionSpeakerAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventSessionSpeakerAssignment EventSessionSpeakerAssignment_eventId_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSessionSpeakerAssignment"
    ADD CONSTRAINT "EventSessionSpeakerAssignment_eventId_sessionId_fkey" FOREIGN KEY ("eventId", "sessionId") REFERENCES public."EventStructureItem"("eventId", id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventSpeakerProfile EventSpeakerProfile_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventSpeakerProfile"
    ADD CONSTRAINT "EventSpeakerProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventStructureItem EventStructureItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventStructureItem"
    ADD CONSTRAINT "EventStructureItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventStructureItem EventStructureItem_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventStructureItem"
    ADD CONSTRAINT "EventStructureItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventStructureItem EventStructureItem_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventStructureItem"
    ADD CONSTRAINT "EventStructureItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."EventStructureItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Event Event_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: InsightSourceAnswer InsightSourceAnswer_answerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InsightSourceAnswer"
    ADD CONSTRAINT "InsightSourceAnswer_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES public."Answer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: InsightSourceAnswer InsightSourceAnswer_insightId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InsightSourceAnswer"
    ADD CONSTRAINT "InsightSourceAnswer_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES public."Insight"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Insight Insight_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Insight"
    ADD CONSTRAINT "Insight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Location Location_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Location"
    ADD CONSTRAINT "Location_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PendingProvision PendingProvision_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PendingProvision"
    ADD CONSTRAINT "PendingProvision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PlatformUserActionAudit PlatformUserActionAudit_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlatformUserActionAudit"
    ADD CONSTRAINT "PlatformUserActionAudit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: ProcessingLog ProcessingLog_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProcessingLog"
    ADD CONSTRAINT "ProcessingLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."Session"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PublicSurveyLink PublicSurveyLink_speakerAssignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PublicSurveyLink"
    ADD CONSTRAINT "PublicSurveyLink_speakerAssignmentId_fkey" FOREIGN KEY ("speakerAssignmentId") REFERENCES public."EventSessionSpeakerAssignment"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: PublicSurveyLink PublicSurveyLink_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PublicSurveyLink"
    ADD CONSTRAINT "PublicSurveyLink_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PublicSurveyLink PublicSurveyLink_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PublicSurveyLink"
    ADD CONSTRAINT "PublicSurveyLink_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: QuestionAudioAsset QuestionAudioAsset_questionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuestionAudioAsset"
    ADD CONSTRAINT "QuestionAudioAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES public."Question"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Question Question_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Question"
    ADD CONSTRAINT "Question_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Question Question_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Question"
    ADD CONSTRAINT "Question_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Response Response_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Response Response_publicSurveyLinkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_publicSurveyLinkId_fkey" FOREIGN KEY ("publicSurveyLinkId") REFERENCES public."PublicSurveyLink"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Response Response_speakerAssignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_speakerAssignmentId_fkey" FOREIGN KEY ("speakerAssignmentId") REFERENCES public."EventSessionSpeakerAssignment"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Response Response_surveyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES public."Survey"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Response Response_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Response"
    ADD CONSTRAINT "Response_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Session Session_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SurveyTarget SurveyTarget_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SurveyTarget SurveyTarget_eventStructureItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_eventStructureItemId_fkey" FOREIGN KEY ("eventStructureItemId") REFERENCES public."EventStructureItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SurveyTarget SurveyTarget_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public."Location"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SurveyTarget SurveyTarget_speakerAssignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_speakerAssignmentId_fkey" FOREIGN KEY ("speakerAssignmentId") REFERENCES public."EventSessionSpeakerAssignment"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SurveyTarget SurveyTarget_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."EventSpeakerProfile"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Survey Survey_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Survey"
    ADD CONSTRAINT "Survey_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Survey Survey_surveyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Survey"
    ADD CONSTRAINT "Survey_surveyTargetId_fkey" FOREIGN KEY ("surveyTargetId") REFERENCES public."SurveyTarget"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TestSignupToken TestSignupToken_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TestSignupToken"
    ADD CONSTRAINT "TestSignupToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Transcript Transcript_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transcript"
    ADD CONSTRAINT "Transcript_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."Session"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: User User_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Account; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Account" ENABLE ROW LEVEL SECURITY;

--
-- Name: AccountUserMembership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AccountUserMembership" ENABLE ROW LEVEL SECURITY;

--
-- Name: Admin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Admin" ENABLE ROW LEVEL SECURITY;

--
-- Name: Analysis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Analysis" ENABLE ROW LEVEL SECURITY;

--
-- Name: Answer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Answer" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerAnalysis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerAnalysis" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerEventAction; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerEventAction" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerEventEntity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerEventEntity" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerEventIntelligence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerEventIntelligence" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerEventTheme; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerEventTheme" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerProcessingLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerProcessingLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: AnswerTranscript; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AnswerTranscript" ENABLE ROW LEVEL SECURITY;

--
-- Name: Event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Event" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventActionAssignmentDelivery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventActionAssignmentDelivery" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventActionDeliveryAttempt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventActionDeliveryAttempt" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventActionHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventActionHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventActionUpdate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventActionUpdate" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventAgendaImportJob; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventAgendaImportJob" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventAgendaImportRow; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventAgendaImportRow" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventAlertNote; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventAlertNote" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventClosingBriefSnapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventClosingBriefSnapshot" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventIntelligenceAggregate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventIntelligenceAggregate" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventIssueCluster; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventIssueCluster" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventIssueEvidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventIssueEvidence" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventSessionSpeakerAssignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventSessionSpeakerAssignment" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventSpeakerProfile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventSpeakerProfile" ENABLE ROW LEVEL SECURITY;

--
-- Name: EventStructureItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EventStructureItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: Insight; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Insight" ENABLE ROW LEVEL SECURITY;

--
-- Name: InsightSourceAnswer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."InsightSourceAnswer" ENABLE ROW LEVEL SECURITY;

--
-- Name: Location; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Location" ENABLE ROW LEVEL SECURITY;

--
-- Name: PendingProvision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PendingProvision" ENABLE ROW LEVEL SECURITY;

--
-- Name: PlatformUserActionAudit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PlatformUserActionAudit" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProcessingLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProcessingLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: PublicSurveyLink; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PublicSurveyLink" ENABLE ROW LEVEL SECURITY;

--
-- Name: Question; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Question" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuestionAudioAsset; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuestionAudioAsset" ENABLE ROW LEVEL SECURITY;

--
-- Name: Response; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Response" ENABLE ROW LEVEL SECURITY;

--
-- Name: Session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;

--
-- Name: Survey; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Survey" ENABLE ROW LEVEL SECURITY;

--
-- Name: SurveyTarget; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SurveyTarget" ENABLE ROW LEVEL SECURITY;

--
-- Name: TestSignupToken; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TestSignupToken" ENABLE ROW LEVEL SECURITY;

--
-- Name: Transcript; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Transcript" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

--
-- Data API lockdown (verbatim from 20260905180000_lock_down_data_api_access)
--

DO $$
DECLARE
  api_roles text;
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ')
    INTO api_roles
    FROM pg_roles
   WHERE rolname IN ('anon', 'authenticated');

  IF api_roles IS NULL THEN
    RAISE NOTICE 'Supabase API roles are absent; skipping Data API privilege revocation';
    RETURN;
  END IF;

  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %s', api_roles);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %s', api_roles);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %s', api_roles);
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %s', api_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %s', api_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %s', api_roles);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %s', api_roles);
END
$$;
