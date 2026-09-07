-- Lock Pulse operational tables away from the Supabase Data API.
--
-- Pulse reaches its database only through Prisma, which connects as the table
-- owner (the `postgres` role on Supabase). Browsers hold the publishable key for
-- Supabase Auth only; no Pulse client code queries tables through PostgREST.
-- Supabase's defaults nevertheless grant `anon` and `authenticated` full access
-- to every table Prisma creates in `public`, which would expose Account, User,
-- Response and every other table at /rest/v1/<Table> to anyone holding the
-- public key. Attendee collection goes through Pulse server routes, never
-- through a direct database connection, so nothing legitimate needs these grants.
--
-- Two independent controls, so that undoing either one alone still denies:
--   1. Revoke every privilege the API roles hold on `public` (tables, sequences,
--      functions and schema usage) and drop the default-privilege grants that
--      would re-expose tables created by future migrations.
--   2. Enable row level security on every Pulse table with no policies. The
--      owner bypasses RLS, so Prisma is unaffected, while the API roles would be
--      denied every row even if a grant came back.
--
-- `service_role` is deliberately untouched: it is a server-only secret used for
-- Supabase Auth admin calls, and Pulse never reads tables with it. The role
-- lookup keeps this migration valid on plain PostgreSQL (CI, docker-compose),
-- where the Supabase API roles do not exist.

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

-- Row level security with no policies: deny-by-default for every non-owner role.
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventClosingBriefSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionAudioAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventStructureItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventSpeakerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventSessionSpeakerAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventAgendaImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventAgendaImportRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SurveyTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Survey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicSurveyLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Answer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerTranscript" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerEventIntelligence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerEventTheme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerEventEntity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerEventAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventIntelligenceAggregate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventIssueCluster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventActionHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventActionUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventActionAssignmentDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventActionDeliveryAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventIssueEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventAlertNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnswerProcessingLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Insight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsightSourceAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transcript" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Analysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessingLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountUserMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformUserActionAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingProvision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TestSignupToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Admin" ENABLE ROW LEVEL SECURITY;
