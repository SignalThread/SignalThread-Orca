-- Orca clean current-state database baseline.
--
-- This single migration initialises a brand-new, empty Orca operational PostgreSQL
-- database. It is NOT part of the legacy 84-migration chain and must never be applied
-- on top of it.
--
-- Provenance
--   Derived from a PostgreSQL-native `pg_dump --schema-only --no-owner --no-privileges
--   --schema=public` of the working legacy Orca database (PostgreSQL 17.6), captured
--   fresh immediately before generation. Prisma-generated SQL was deliberately NOT used
--   as the source: it drops partial-index predicates and omits check constraints,
--   functions and triggers.
--
-- Removed from the dump
--   * `CREATE SCHEMA public`      - the target database already has it
--   * `_prisma_migrations`        - the new database gets a fresh ledger
--   * session SET / psql meta-commands - every object below is schema-qualified
--
-- Added deliberately (the only intentional divergence from the legacy live schema)
--   * `User.platformUserId` + its unique and secondary indexes. Required by the
--     already-merged Platform Core Phase 1/2 identity resolution; the legacy database
--     predates that work.
--
-- Contents: 124 tables, 112 enums, 124 primary keys, 278 foreign keys,
--           13 unique constraints, 27 check constraints, 364 indexes
--           (6 of them partial unique), 2 functions, 2 triggers.
--
-- Requires: PostgreSQL with `gen_random_uuid()` (PostgreSQL 13+).


--
-- Name: BudgetActivityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetActivityType" AS ENUM (
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'REVISED'
);

--
-- Name: BudgetApprovalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetApprovalStatus" AS ENUM (
    'SUBMITTED',
    'APPROVED',
    'REJECTED'
);

--
-- Name: BudgetItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetItemStatus" AS ENUM (
    'PLANNED',
    'COMMITTED',
    'PAID',
    'CANCELED'
);

--
-- Name: BudgetLineItemApproval; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetLineItemApproval" AS ENUM (
    'PENDING',
    'APPROVED'
);

--
-- Name: BudgetLineItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetLineItemStatus" AS ENUM (
    'PLANNED',
    'COMMITTED',
    'PAID'
);

--
-- Name: BudgetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED'
);

--
-- Name: BudgetSubmissionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetSubmissionStatus" AS ENUM (
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'PULLED_BACK'
);

--
-- Name: CopilotActionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CopilotActionStatus" AS ENUM (
    'PROPOSED',
    'APPROVED',
    'REJECTED',
    'EXECUTED',
    'FAILED'
);

--
-- Name: CopilotMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CopilotMode" AS ENUM (
    'ASK',
    'DO'
);

--
-- Name: DeadlineCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DeadlineCategory" AS ENUM (
    'FNB',
    'AV',
    'HOUSING',
    'REGISTRATION',
    'LOGISTICS',
    'OTHER'
);

--
-- Name: DeadlineStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DeadlineStatus" AS ENUM (
    'OPEN',
    'DONE',
    'BLOCKED',
    'CANCELED'
);

--
-- Name: DocumentApprovalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentApprovalStatus" AS ENUM (
    'IN_REVIEW',
    'APPROVED',
    'REJECTED'
);

--
-- Name: DocumentLinkType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentLinkType" AS ENUM (
    'BUDGET_ITEM',
    'DEADLINE',
    'MATRIX_SESSION',
    'EVENT',
    'SPEAKER'
);

--
-- Name: DocumentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentStatus" AS ENUM (
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED'
);

--
-- Name: DocumentVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentVisibility" AS ENUM (
    'INTERNAL_ONLY',
    'CLIENT_VISIBLE'
);

--
-- Name: EventActivityAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActivityAction" AS ENUM (
    'CREATED',
    'UPDATED',
    'DELETED',
    'ASSIGNED',
    'UNASSIGNED',
    'IMPORTED',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'REOPENED',
    'STATUS_CHANGED',
    'LINKED',
    'UNLINKED',
    'MERGED',
    'UPLOADED',
    'SENT',
    'SCHEDULED',
    'RESCHEDULED',
    'CANCELED',
    'RETRIED',
    'SYNCED',
    'GENERATED'
);

--
-- Name: EventActivityActorKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActivityActorKind" AS ENUM (
    'USER',
    'SYSTEM',
    'INTEGRATION',
    'PORTAL'
);

--
-- Name: EventActivityModule; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActivityModule" AS ENUM (
    'ROADMAP',
    'BUDGET',
    'RUN_OF_SHOW',
    'DOCUMENTS',
    'EVENT_DIRECTORY',
    'MARKETING',
    'EVENT_SETTINGS',
    'SPEAKERS',
    'INTEGRATIONS',
    'REPORTS'
);

--
-- Name: EventActivityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventActivityType" AS ENUM (
    'EVENT_CREATED',
    'EVENT_UPDATED',
    'DEADLINE_CREATED',
    'DEADLINE_UPDATED',
    'BUDGET_SUBMITTED',
    'BUDGET_APPROVED',
    'BUDGET_REJECTED',
    'MATRIX_UPDATED',
    'SEATING_UPDATED',
    'REPORT_GENERATED',
    'INTEGRATION_SYNCED',
    'SPEAKER_UPDATED'
);

--
-- Name: EventAttendeeAttendanceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeeAttendanceStatus" AS ENUM (
    'EXPECTED',
    'CONFIRMED',
    'ATTENDED',
    'CANCELLED',
    'NO_SHOW'
);

--
-- Name: EventAttendeePortalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeePortalStatus" AS ENUM (
    'NOT_INVITED',
    'INVITED',
    'ACTIVE'
);

--
-- Name: EventAttendeeRegistrationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeeRegistrationStatus" AS ENUM (
    'NOT_REGISTERED',
    'INVITED',
    'REGISTERED',
    'PENDING_APPROVAL',
    'WAITLISTED',
    'CANCELLED',
    'TRANSFERRED',
    'CHECKED_IN',
    'NO_SHOW'
);

--
-- Name: EventAttendeeSessionEnrollmentSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeeSessionEnrollmentSource" AS ENUM (
    'REGISTRATION_INTEGRATION',
    'CSV_IMPORT',
    'MANUAL',
    'PORTAL',
    'SYSTEM'
);

--
-- Name: EventAttendeeSessionEnrollmentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeeSessionEnrollmentStatus" AS ENUM (
    'REGISTERED',
    'SELECTED',
    'WAITLISTED',
    'CANCELLED',
    'CHECKED_IN',
    'NO_SHOW'
);

--
-- Name: EventAttendeeSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeeSource" AS ENUM (
    'MANUAL',
    'CSV_IMPORT',
    'REGISTRATION_INTEGRATION',
    'MARKETING_CAMPAIGN',
    'SPEAKER_INTAKE',
    'EXHIBITOR_PORTAL',
    'SPONSOR_UPLOAD',
    'BACKFILLED',
    'PORTAL_SELF_UPDATE'
);

--
-- Name: EventAttendeeSyncStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventAttendeeSyncStatus" AS ENUM (
    'LOCAL_ONLY',
    'SYNCED',
    'PENDING_WRITEBACK',
    'WRITEBACK_FAILED',
    'CONFLICT',
    'READ_ONLY_EXTERNAL',
    'STALE'
);

--
-- Name: EventDashboardViewStarterKey; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDashboardViewStarterKey" AS ENUM (
    'EXECUTIVE',
    'EVENT_LEAD',
    'FUNCTIONAL',
    'CUSTOM',
    'MIGRATED'
);

--
-- Name: EventDashboardViewVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDashboardViewVisibility" AS ENUM (
    'PRIVATE',
    'TEAM'
);

--
-- Name: EventDirectoryImportRowResult; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectoryImportRowResult" AS ENUM (
    'CREATED',
    'UPDATED',
    'DUPLICATE_REVIEW',
    'INVALID',
    'SKIPPED'
);

--
-- Name: EventDirectoryImportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectoryImportStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETE',
    'FAILED'
);

--
-- Name: EventDirectoryModuleType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectoryModuleType" AS ENUM (
    'SPEAKER',
    'SEATING_ATTENDEE',
    'EVENT_PERSON',
    'MARKETING_RECIPIENT',
    'EXHIBITOR_CONTACT',
    'SPONSOR_CONTACT'
);

--
-- Name: EventDirectoryPersonStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectoryPersonStatus" AS ENUM (
    'ACTIVE',
    'NEEDS_REVIEW',
    'DUPLICATE_REVIEW',
    'REMOVED',
    'MERGED'
);

--
-- Name: EventDirectoryRoleType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectoryRoleType" AS ENUM (
    'ATTENDEE',
    'REGISTRANT',
    'SPEAKER',
    'EXHIBITOR_CONTACT',
    'SPONSOR_CONTACT',
    'STAFF',
    'VIP',
    'PRESS',
    'PROSPECT',
    'MARKETING_CONTACT',
    'SEATING_GUEST',
    'VENDOR'
);

--
-- Name: EventDirectorySourceType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectorySourceType" AS ENUM (
    'MANUAL',
    'CSV_IMPORT',
    'REGISTRATION_INTEGRATION',
    'SPEAKER_INTAKE',
    'SPEAKER_MODULE',
    'SEATING_MODULE',
    'STAFFING_MODULE',
    'MARKETING_AUDIENCE',
    'EXHIBITOR_PORTAL',
    'SPONSOR_IMPORT'
);

--
-- Name: EventDirectorySyncStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventDirectorySyncStatus" AS ENUM (
    'LINKED',
    'PULLED',
    'PUSHED',
    'CONFLICT',
    'ERROR',
    'READ_ONLY'
);

--
-- Name: EventFnbSourceMenuParseJobStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventFnbSourceMenuParseJobStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'COMPLETE',
    'FAILED',
    'CANCELLED'
);

--
-- Name: EventFnbSourceMenuParseTargetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventFnbSourceMenuParseTargetStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETE',
    'FAILED'
);

--
-- Name: EventFnbSourceMenuSourceType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventFnbSourceMenuSourceType" AS ENUM (
    'ORIGINAL',
    'AMENDMENT',
    'REPLACEMENT'
);

--
-- Name: EventFnbSourceMenuStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventFnbSourceMenuStatus" AS ENUM (
    'UPLOADED',
    'READING_PDF',
    'MAPPING_SECTIONS',
    'EXTRACTING_ITEMS',
    'REVIEW_NEEDED',
    'COMPLETE',
    'FAILED',
    'ARCHIVED'
);

--
-- Name: EventImportIntentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventImportIntentStatus" AS ENUM (
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'CANCELED'
);

--
-- Name: EventImportResultStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventImportResultStatus" AS ENUM (
    'SUCCEEDED',
    'FAILED',
    'CANCELED'
);

--
-- Name: EventIntegrationConnectionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventIntegrationConnectionStatus" AS ENUM (
    'NOT_CONNECTED',
    'CONNECTED',
    'ERROR',
    'DISABLED'
);

--
-- Name: EventIntegrationMetricType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventIntegrationMetricType" AS ENUM (
    'REGISTRATION',
    'HOUSING'
);

--
-- Name: EventIntegrationSyncMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventIntegrationSyncMode" AS ENUM (
    'READ_ONLY',
    'READ_WRITE',
    'MANUAL'
);

--
-- Name: EventMemberRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventMemberRole" AS ENUM (
    'EVENT_ADMIN',
    'EVENT_EDITOR',
    'EVENT_VIEWER'
);

--
-- Name: EventPersonRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventPersonRole" AS ENUM (
    'SPEAKER',
    'STAFF',
    'VENDOR'
);

--
-- Name: EventRegistrationWritebackStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventRegistrationWritebackStatus" AS ENUM (
    'NOT_APPLICABLE',
    'SUPPORTED',
    'PENDING',
    'FAILED',
    'READ_ONLY'
);

--
-- Name: EventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'COMPLETED',
    'CANCELED'
);

--
-- Name: ExpectedAttendanceSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExpectedAttendanceSource" AS ENUM (
    'PLANNER_ESTIMATE',
    'REGISTRATION_RSVP',
    'IMPORTED'
);

--
-- Name: FnbClaimKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbClaimKind" AS ENUM (
    'SUITABILITY',
    'CONTAINS',
    'FREE_OF'
);

--
-- Name: FnbCompatibilityOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbCompatibilityOutcome" AS ENUM (
    'VERIFIED_MATCH',
    'POSSIBLE_MATCH',
    'CONFLICT',
    'INSUFFICIENT_INFORMATION',
    'STALE_VERIFICATION'
);

--
-- Name: FnbExportRecipient; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbExportRecipient" AS ENUM (
    'INTERNAL',
    'HOTEL',
    'CATERER',
    'AV',
    'PUBLIC'
);

--
-- Name: FnbOperationalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbOperationalStatus" AS ENUM (
    'OUTSTANDING',
    'RECEIVED',
    'CODED',
    'CONFIRMED',
    'NEEDS_REVIEW'
);

--
-- Name: FnbPricingUnit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbPricingUnit" AS ENUM (
    'PER_PERSON',
    'PER_ITEM',
    'PER_DOZEN',
    'FLAT'
);

--
-- Name: FnbRequirementKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbRequirementKind" AS ENUM (
    'DIETARY',
    'ALLERGEN',
    'ACCESSIBILITY'
);

--
-- Name: FnbVerificationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FnbVerificationStatus" AS ENUM (
    'UNVERIFIED',
    'NEEDS_REVIEW',
    'VERIFIED',
    'REJECTED',
    'STALE'
);

--
-- Name: MarketingCampaignStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MarketingCampaignStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'ARCHIVED'
);

--
-- Name: MarketingEmailEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MarketingEmailEventType" AS ENUM (
    'PROCESSED',
    'DELIVERED',
    'OPEN',
    'CLICK',
    'BOUNCE',
    'DROPPED',
    'SPAMREPORT',
    'UNSUBSCRIBE',
    'GROUP_UNSUBSCRIBE',
    'DEFERRED'
);

--
-- Name: MarketingEmailRecipientStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MarketingEmailRecipientStatus" AS ENUM (
    'PENDING',
    'SENT',
    'DELIVERED',
    'OPENED',
    'CLICKED',
    'BOUNCED',
    'DROPPED',
    'SPAM_REPORTED',
    'UNSUBSCRIBED',
    'FAILED',
    'SUPPRESSED'
);

--
-- Name: MarketingEmailSendStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MarketingEmailSendStatus" AS ENUM (
    'DRAFT',
    'READY',
    'SCHEDULED',
    'SENDING',
    'SENT',
    'PARTIALLY_SENT',
    'FAILED',
    'CANCELED'
);

--
-- Name: MarketingSuppressionReason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MarketingSuppressionReason" AS ENUM (
    'BOUNCE',
    'DROPPED',
    'SPAM_REPORT',
    'UNSUBSCRIBE',
    'GROUP_UNSUBSCRIBE',
    'MANUAL'
);

--
-- Name: MarketingSuppressionSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MarketingSuppressionSource" AS ENUM (
    'SENDGRID_WEBHOOK',
    'MANUAL',
    'IMPORT'
);

--
-- Name: MealPeriod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MealPeriod" AS ENUM (
    'NONE',
    'BREAKFAST',
    'BREAK',
    'LUNCH',
    'RECEPTION',
    'DINNER',
    'OTHER'
);

--
-- Name: RequirementDisposition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RequirementDisposition" AS ENUM (
    'REQUIRED',
    'COMPLETE',
    'AT_RISK',
    'MISSING',
    'NOT_NEEDED'
);

--
-- Name: SessionShowFlowCueType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionShowFlowCueType" AS ENUM (
    'PRE_FUNCTION',
    'DOORS_OPEN',
    'GUEST_ARRIVAL',
    'CONTENT_PRESENTATION',
    'SPEAKER_HANDOFF',
    'AV_TECHNICAL',
    'FNB_SERVICE',
    'BREAK',
    'AUDIENCE_INTERACTION',
    'SAFETY_ANNOUNCEMENT',
    'TRANSITION_TURNOVER',
    'CLOSE_STRIKE',
    'CUSTOM'
);

--
-- Name: SessionShowFlowStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionShowFlowStatus" AS ENUM (
    'DRAFT',
    'APPROVED'
);

--
-- Name: SessionShowFlowTimingMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionShowFlowTimingMode" AS ENUM (
    'ABSOLUTE',
    'OFFSET'
);

--
-- Name: SessionShowFlowVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SessionShowFlowVisibility" AS ENUM (
    'INTERNAL',
    'PUBLIC'
);

--
-- Name: SignageApprovalState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageApprovalState" AS ENUM (
    'PENDING',
    'APPROVED',
    'CHANGES_REQUESTED'
);

--
-- Name: SignageAssetKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageAssetKind" AS ENUM (
    'LOGO',
    'ARTWORK',
    'PROOF',
    'FINAL_FILE',
    'INSTALL_PROOF',
    'PLACEMENT_REFERENCE'
);

--
-- Name: SignageBrandingDecision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageBrandingDecision" AS ENUM (
    'NEEDS_DECISION',
    'NO_LOGO',
    'EVENT_BRAND',
    'SPONSOR_LOGO',
    'CUSTOM_ASSET'
);

--
-- Name: SignageDimensionUnit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageDimensionUnit" AS ENUM (
    'INCHES',
    'FEET',
    'CENTIMETERS'
);

--
-- Name: SignageImpactSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageImpactSource" AS ENUM (
    'SESSION',
    'ROOM',
    'SPEAKER',
    'SPONSOR',
    'FNB',
    'VENUE',
    'LOCATION'
);

--
-- Name: SignageInstallProofStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageInstallProofStatus" AS ENUM (
    'NOT_RECORDED',
    'CONFIRMED_WITHOUT_PHOTO'
);

--
-- Name: SignageInstallState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageInstallState" AS ENUM (
    'NOT_SCHEDULED',
    'READY',
    'INSTALLED',
    'REMOVED'
);

--
-- Name: SignageIssueStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageIssueStatus" AS ENUM (
    'NONE',
    'OPEN',
    'IN_PROGRESS',
    'RESOLVED'
);

--
-- Name: SignageIssueType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageIssueType" AS ENUM (
    'MISSING',
    'DAMAGED',
    'WRONG_PLACEMENT',
    'REPLACEMENT_NEEDED',
    'OTHER'
);

--
-- Name: SignageLogoRequirement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageLogoRequirement" AS ENUM (
    'TO_BE_DECIDED',
    'REQUIRED',
    'OPTIONAL',
    'NOT_REQUIRED'
);

--
-- Name: SignageMaterial; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageMaterial" AS ENUM (
    'FOAM_BOARD',
    'GATORBOARD',
    'VINYL',
    'FABRIC',
    'TENSION_FABRIC',
    'PAPER',
    'ACRYLIC',
    'COROPLAST',
    'METAL',
    'OTHER'
);

--
-- Name: SignageOrientation; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageOrientation" AS ENUM (
    'PORTRAIT',
    'LANDSCAPE',
    'SQUARE'
);

--
-- Name: SignagePriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignagePriority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
);

--
-- Name: SignageSidedness; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageSidedness" AS ENUM (
    'SINGLE',
    'DOUBLE'
);

--
-- Name: SignageSignType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageSignType" AS ENUM (
    'WELCOME_ARRIVAL',
    'REGISTRATION',
    'SESSION_ROOM_ID',
    'DIRECTIONAL',
    'SPONSOR_EXHIBITOR',
    'FOOD_BEVERAGE',
    'RESERVED_VIP',
    'EMERGENCY_SAFETY',
    'STAFF_BACK_OF_HOUSE',
    'CUSTOM'
);

--
-- Name: SignageWorkflowState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SignageWorkflowState" AS ENUM (
    'NOT_NEEDED',
    'NEEDS_INFO',
    'READY_FOR_DESIGN',
    'IN_DESIGN',
    'AWAITING_APPROVAL',
    'APPROVED',
    'IN_PRODUCTION',
    'READY_FOR_INSTALL',
    'INSTALLED',
    'REMOVED_CLOSED'
);

--
-- Name: SpeakerEmailStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerEmailStatus" AS ENUM (
    'SENT',
    'FAILED',
    'SKIPPED_NO_PROVIDER'
);

--
-- Name: SpeakerFileKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerFileKind" AS ENUM (
    'SLIDES',
    'AGREEMENT',
    'OTHER'
);

--
-- Name: SpeakerFileReviewStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerFileReviewStatus" AS ENUM (
    'RECEIVED',
    'NEEDS_CHANGES',
    'APPROVED',
    'FINAL'
);

--
-- Name: SpeakerMessageSender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerMessageSender" AS ENUM (
    'PLANNER',
    'SPEAKER'
);

--
-- Name: SpeakerReminderKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerReminderKind" AS ENUM (
    'INCOMPLETE_PROFILE',
    'MISSING_DECK',
    'MISSING_DOCUMENT'
);

--
-- Name: SpeakerStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerStatus" AS ENUM (
    'NEEDS_INFO',
    'INVITED',
    'CONFIRMED',
    'CANCELLED'
);

--
-- Name: SpeakerSubmissionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SpeakerSubmissionStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

--
-- Name: SupplyAllocationState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplyAllocationState" AS ENUM (
    'ACTIVE',
    'CANCELLED'
);

--
-- Name: SupplyDependencyType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplyDependencyType" AS ENUM (
    'SHOW_FLOW',
    'STAFFING',
    'FNB',
    'AV',
    'SIGNAGE',
    'VENDOR',
    'OTHER'
);

--
-- Name: SupplyFulfillmentState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplyFulfillmentState" AS ENUM (
    'PLANNED',
    'CONFIRMED',
    'PACKED',
    'DELIVERED',
    'SET'
);

--
-- Name: SupplyQuantityRule; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplyQuantityRule" AS ENUM (
    'PER_ATTENDEE',
    'PER_TABLE',
    'PER_STATION',
    'FIXED',
    'MANUAL'
);

--
-- Name: TaskActivityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskActivityType" AS ENUM (
    'CREATED',
    'UPDATED',
    'STATUS_CHANGED',
    'ASSIGNED',
    'UNASSIGNED',
    'COMMENTED',
    'LINKED',
    'UNLINKED',
    'WATCHED',
    'UNWATCHED'
);

--
-- Name: TaskAssignmentRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskAssignmentRole" AS ENUM (
    'OWNER',
    'CONTRIBUTOR'
);

--
-- Name: TaskLinkObjectType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskLinkObjectType" AS ENUM (
    'EVENT',
    'BUDGET',
    'BUDGET_LINE_ITEM',
    'BUDGET_SUBMISSION',
    'DOCUMENT',
    'DOCUMENT_VERSION',
    'DEADLINE',
    'TIMELINE_ITEM',
    'MATRIX_ROW',
    'SESSION_REQUIREMENT_SELECTION',
    'SESSION_FNB_CATALOG_ASSIGNMENT',
    'SEATING_PLAN',
    'SEATING_TABLE',
    'SEATING_ASSIGNMENT',
    'SPEAKER',
    'SPEAKER_PROFILE_SUBMISSION',
    'SPEAKER_DOCUMENT_REQUEST',
    'SPEAKER_FILE'
);

--
-- Name: TaskPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

--
-- Name: TaskSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskSource" AS ENUM (
    'MANUAL'
);

--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'BLOCKED',
    'DONE',
    'CANCELED'
);

--
-- Name: TaskType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskType" AS ENUM (
    'EVENT',
    'OBJECT_LINKED'
);

--
-- Name: TaskVisibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskVisibility" AS ENUM (
    'INTERNAL'
);

--
-- Name: TimelineDependencyType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelineDependencyType" AS ENUM (
    'FINISH_TO_START'
);

--
-- Name: TimelineItemDisposition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelineItemDisposition" AS ENUM (
    'ACTIVE',
    'NOT_NEEDED'
);

--
-- Name: TimelineItemPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelineItemPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

--
-- Name: TimelineItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelineItemStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'AT_RISK',
    'COMPLETE'
);

--
-- Name: TimelinePlanningStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelinePlanningStage" AS ENUM (
    'PRE_PLANNING',
    'PLANNING',
    'BUILD',
    'SHOW_WEEK',
    'CLOSE'
);

--
-- Name: TimelinePriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelinePriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

--
-- Name: TimelineStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelineStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'AT_RISK',
    'COMPLETE'
);

--
-- Name: TimelineWorkstream; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimelineWorkstream" AS ENUM (
    'VENUE',
    'HOUSING',
    'REGISTRATION',
    'SPEAKERS',
    'SPONSORS',
    'FNB',
    'PRODUCTION',
    'MARKETING'
);

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'MEMBER',
    'VIEWER',
    'SUPER_ADMIN'
);

--
-- Name: enforce_supply_event_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_supply_event_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MatrixRow" WHERE id = NEW."sessionId" AND "eventId" = NEW."eventId") THEN
    RAISE EXCEPTION 'Supply allocation session must belong to event';
  END IF;
  IF NEW."supplyItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SupplyItem" WHERE id = NEW."supplyItemId" AND "eventId" = NEW."eventId") THEN
    RAISE EXCEPTION 'Supply catalog item must belong to event';
  END IF;
  IF NEW."responsibleUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "EventMember"
    WHERE "eventId" = NEW."eventId" AND "userId" = NEW."responsibleUserId"
  ) THEN
    RAISE EXCEPTION 'Supply responsible person must be an event member';
  END IF;
  IF NEW."budgetLineItemId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "BudgetLineItem" bli JOIN "Budget" b ON b.id = bli."budgetId"
    WHERE bli.id = NEW."budgetLineItemId" AND b."eventId" = NEW."eventId"
  ) THEN
    RAISE EXCEPTION 'Supply financial reference must belong to event';
  END IF;
  RETURN NEW;
END; $$;

--
-- Name: protect_system_supply_templates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_system_supply_templates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD."isSystem" THEN RAISE EXCEPTION 'System supply templates are read-only'; END IF;
  RETURN OLD;
END; $$;

--
-- Name: Budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Budget" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    status public."BudgetStatus" DEFAULT 'DRAFT'::public."BudgetStatus" NOT NULL,
    "currentVersionId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "submittedByUserId" uuid,
    "approvedAt" timestamp(3) without time zone,
    "approvedByUserId" uuid,
    "rejectedAt" timestamp(3) without time zone,
    "rejectedByUserId" uuid,
    "rejectionReason" text,
    "lockedAt" timestamp(3) without time zone
);

--
-- Name: BudgetActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetActivity" (
    id uuid NOT NULL,
    "budgetId" uuid NOT NULL,
    type public."BudgetActivityType" NOT NULL,
    "actorUserId" uuid,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: BudgetApproval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetApproval" (
    id uuid NOT NULL,
    "budgetVersionId" uuid NOT NULL,
    status public."BudgetApprovalStatus" NOT NULL,
    "actedByUserId" uuid NOT NULL,
    "actedAt" timestamp(3) without time zone NOT NULL,
    comment text
);

--
-- Name: BudgetCategoryTarget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetCategoryTarget" (
    id uuid NOT NULL,
    "budgetId" uuid NOT NULL,
    "categoryKey" text NOT NULL,
    "categoryLabel" text,
    "targetAmountCents" integer DEFAULT 0 NOT NULL,
    "createdByUserId" uuid,
    "updatedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: BudgetGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetGroup" (
    id uuid NOT NULL,
    "budgetId" uuid NOT NULL,
    name text NOT NULL,
    "normalizedName" text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    color text
);

--
-- Name: BudgetItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetItem" (
    id uuid NOT NULL,
    category text NOT NULL,
    subcategory text,
    name text NOT NULL,
    vendor text,
    notes text,
    "forecastCents" integer DEFAULT 0 NOT NULL,
    "actualCents" integer DEFAULT 0 NOT NULL,
    status public."BudgetItemStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "budgetVersionId" uuid NOT NULL
);

--
-- Name: BudgetLineItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetLineItem" (
    id uuid NOT NULL,
    "budgetId" uuid NOT NULL,
    category text NOT NULL,
    subcategory text NOT NULL,
    "lineItem" text NOT NULL,
    vendor text,
    "forecastCents" integer DEFAULT 0 NOT NULL,
    "actualCents" integer DEFAULT 0 NOT NULL,
    status public."BudgetLineItemStatus" DEFAULT 'PLANNED'::public."BudgetLineItemStatus" NOT NULL,
    approval public."BudgetLineItemApproval" DEFAULT 'PENDING'::public."BudgetLineItemApproval" NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "matrixRowId" uuid,
    "groupId" uuid
);

--
-- Name: BudgetSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetSubmission" (
    id uuid NOT NULL,
    "budgetId" uuid NOT NULL,
    "budgetVersionId" uuid NOT NULL,
    "submittedByUserId" uuid NOT NULL,
    "pulledBackByUserId" uuid,
    status public."BudgetSubmissionStatus" DEFAULT 'SUBMITTED'::public."BudgetSubmissionStatus" NOT NULL,
    message text,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "pulledBackAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: BudgetSubmissionLineItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetSubmissionLineItem" (
    "submissionId" uuid NOT NULL,
    "budgetLineItemId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: BudgetSubmissionRecipient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetSubmissionRecipient" (
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "submissionId" uuid NOT NULL
);

--
-- Name: BudgetVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BudgetVersion" (
    id uuid NOT NULL,
    "budgetId" uuid NOT NULL,
    "versionNumber" integer NOT NULL,
    "createdByUserId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Client" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: CopilotAuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CopilotAuditLog" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid,
    "userId" uuid NOT NULL,
    mode public."CopilotMode" NOT NULL,
    "actionType" text,
    status public."CopilotActionStatus" DEFAULT 'PROPOSED'::public."CopilotActionStatus" NOT NULL,
    "proposedActionJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "orgId" uuid NOT NULL,
    "rawPrompt" text NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    executed boolean DEFAULT false NOT NULL,
    "resultSummary" text,
    "errorMessage" text
);

--
-- Name: Deadline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Deadline" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    title text NOT NULL,
    description text,
    "dueAt" timestamp(3) without time zone NOT NULL,
    category public."DeadlineCategory" NOT NULL,
    status public."DeadlineStatus" NOT NULL,
    "ownerUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "dependsOnDeadlineId" uuid
);

--
-- Name: Document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Document" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    title text NOT NULL,
    "categoryId" uuid NOT NULL,
    visibility public."DocumentVisibility" DEFAULT 'INTERNAL_ONLY'::public."DocumentVisibility" NOT NULL,
    status public."DocumentStatus" DEFAULT 'DRAFT'::public."DocumentStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: DocumentApproval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentApproval" (
    id uuid NOT NULL,
    "documentId" uuid NOT NULL,
    status public."DocumentApprovalStatus" NOT NULL,
    "actedByUserId" uuid NOT NULL,
    "actedAt" timestamp(3) without time zone NOT NULL,
    note text
);

--
-- Name: DocumentApprovalRecipient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentApprovalRecipient" (
    "approvalId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: DocumentCategory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentCategory" (
    id uuid NOT NULL,
    name text NOT NULL,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "eventId" uuid NOT NULL,
    slug text NOT NULL
);

--
-- Name: DocumentLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentLink" (
    id uuid NOT NULL,
    "documentId" uuid NOT NULL,
    "linkType" public."DocumentLinkType" NOT NULL,
    "linkedId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: DocumentTag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentTag" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    name text NOT NULL,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: DocumentTagOnDocument; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentTagOnDocument" (
    "documentId" uuid NOT NULL,
    "tagId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: DocumentVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentVersion" (
    id uuid NOT NULL,
    "documentId" uuid NOT NULL,
    "versionNumber" integer NOT NULL,
    "objectKey" text NOT NULL,
    "objectEtag" text,
    "mimeType" text NOT NULL,
    "fileSizeBytes" integer NOT NULL,
    "originalFilename" text NOT NULL,
    "uploadedByUserId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Event" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    name text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    "venueName" text,
    city text,
    state text,
    status public."EventStatus" NOT NULL,
    "createdByUserId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "clientId" uuid,
    "sessionRequirementTemplateId" uuid,
    "budgetApprovalsEnabled" boolean DEFAULT true NOT NULL,
    "documentApprovalsEnabled" boolean DEFAULT true NOT NULL,
    "agendaTerm" text,
    "runOfShowTerm" text,
    "matrixTerm" text,
    "showFlowTerm" text,
    CONSTRAINT "Event_agendaTerm_approved_check" CHECK ((("agendaTerm" IS NULL) OR ("agendaTerm" = ANY (ARRAY['Agenda'::text, 'Run of Show'::text, 'Matrix'::text, 'Show Flow'::text])))),
    CONSTRAINT "Event_matrixTerm_approved_check" CHECK ((("matrixTerm" IS NULL) OR ("matrixTerm" = ANY (ARRAY['Agenda'::text, 'Run of Show'::text, 'Matrix'::text, 'Show Flow'::text])))),
    CONSTRAINT "Event_runOfShowTerm_approved_check" CHECK ((("runOfShowTerm" IS NULL) OR ("runOfShowTerm" = ANY (ARRAY['Agenda'::text, 'Run of Show'::text, 'Matrix'::text, 'Show Flow'::text])))),
    CONSTRAINT "Event_showFlowTerm_approved_check" CHECK ((("showFlowTerm" IS NULL) OR ("showFlowTerm" = ANY (ARRAY['Agenda'::text, 'Run of Show'::text, 'Matrix'::text, 'Show Flow'::text]))))
);

--
-- Name: EventActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventActivity" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "actorUserId" uuid,
    type public."EventActivityType",
    message text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actorKind" public."EventActivityActorKind" DEFAULT 'USER'::public."EventActivityActorKind" NOT NULL,
    "actorLabel" text,
    module public."EventActivityModule",
    "actionType" public."EventActivityAction",
    "entityType" text,
    "entityId" text,
    "entityLabel" text,
    changes jsonb,
    "sourceRecordType" text,
    "sourceRecordId" text
);

--
-- Name: EventAttendee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventAttendee" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "directoryPersonId" uuid NOT NULL,
    "attendanceStatus" public."EventAttendeeAttendanceStatus" DEFAULT 'EXPECTED'::public."EventAttendeeAttendanceStatus" NOT NULL,
    "registrationStatus" public."EventAttendeeRegistrationStatus" DEFAULT 'NOT_REGISTERED'::public."EventAttendeeRegistrationStatus" NOT NULL,
    "registrationType" text,
    "badgeType" text,
    "ticketType" text,
    source public."EventAttendeeSource" DEFAULT 'MANUAL'::public."EventAttendeeSource" NOT NULL,
    "syncStatus" public."EventAttendeeSyncStatus" DEFAULT 'LOCAL_ONLY'::public."EventAttendeeSyncStatus" NOT NULL,
    "portalAccessStatus" public."EventAttendeePortalStatus" DEFAULT 'NOT_INVITED'::public."EventAttendeePortalStatus" NOT NULL,
    notes text,
    "registeredAt" timestamp(3) without time zone,
    "waitlistedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "checkedInAt" timestamp(3) without time zone,
    "lastSyncedAt" timestamp(3) without time zone,
    "createdByUserId" uuid,
    "importedByUserId" uuid,
    "syncedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventAttendeeSessionEnrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventAttendeeSessionEnrollment" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "attendeeId" uuid NOT NULL,
    "matrixRowId" uuid NOT NULL,
    "enrollmentStatus" public."EventAttendeeSessionEnrollmentStatus" DEFAULT 'REGISTERED'::public."EventAttendeeSessionEnrollmentStatus" NOT NULL,
    source public."EventAttendeeSessionEnrollmentSource" DEFAULT 'MANUAL'::public."EventAttendeeSessionEnrollmentSource" NOT NULL,
    "externalSessionRegistrationId" text,
    "integrationConnectionId" uuid,
    "registrationRecordId" uuid,
    "waitlistedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "checkedInAt" timestamp(3) without time zone,
    "createdByUserId" uuid,
    "updatedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventDashboardLayoutMigration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDashboardLayoutMigration" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "sourceKey" text NOT NULL,
    "viewId" uuid,
    outcome text NOT NULL,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventDashboardView; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDashboardView" (
    id uuid NOT NULL,
    "organizationId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "ownerUserId" uuid NOT NULL,
    name text NOT NULL,
    description text,
    "starterKey" public."EventDashboardViewStarterKey" NOT NULL,
    visibility public."EventDashboardViewVisibility" DEFAULT 'PRIVATE'::public."EventDashboardViewVisibility" NOT NULL,
    "isTeamDefault" boolean DEFAULT false NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "layoutVersion" integer DEFAULT 1 NOT NULL,
    configuration jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventDashboardViewPreference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDashboardViewPreference" (
    id uuid NOT NULL,
    "viewId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "isPersonalDefault" boolean DEFAULT false NOT NULL,
    "lastUsedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventDirectoryExternalIdentity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectoryExternalIdentity" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "personId" uuid NOT NULL,
    provider text NOT NULL,
    "externalPersonId" text NOT NULL,
    "externalRegistrationId" text,
    "externalAccountId" text,
    "externalEventId" text,
    "syncStatus" public."EventDirectorySyncStatus" DEFAULT 'LINKED'::public."EventDirectorySyncStatus" NOT NULL,
    "lastPulledAt" timestamp(3) without time zone,
    "lastPushedAt" timestamp(3) without time zone,
    "externalUpdatedAt" timestamp(3) without time zone,
    "syncError" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventDirectoryImportBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectoryImportBatch" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "sourceId" uuid,
    "fileName" text,
    "uploadedByUserId" uuid,
    "uploadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "targetRole" public."EventDirectoryRoleType",
    "sourceLabel" text,
    "totalRows" integer DEFAULT 0 NOT NULL,
    "createdCount" integer DEFAULT 0 NOT NULL,
    "updatedCount" integer DEFAULT 0 NOT NULL,
    "duplicateCount" integer DEFAULT 0 NOT NULL,
    "invalidCount" integer DEFAULT 0 NOT NULL,
    "skippedCount" integer DEFAULT 0 NOT NULL,
    status public."EventDirectoryImportStatus" DEFAULT 'PENDING'::public."EventDirectoryImportStatus" NOT NULL
);

--
-- Name: EventDirectoryImportRow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectoryImportRow" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "batchId" uuid NOT NULL,
    "rowNumber" integer NOT NULL,
    "rawName" text,
    "rawEmail" text,
    "rawCompany" text,
    "parsedFirstName" text,
    "parsedLastName" text,
    "parsedEmail" text,
    result public."EventDirectoryImportRowResult" NOT NULL,
    "matchedPersonId" uuid,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventDirectoryModuleLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectoryModuleLink" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "personId" uuid NOT NULL,
    module public."EventDirectoryModuleType" NOT NULL,
    "moduleRecordId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventDirectoryPerson; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectoryPerson" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    "clientId" uuid,
    "eventId" uuid NOT NULL,
    "firstName" text,
    "lastName" text,
    "displayName" text NOT NULL,
    email text,
    "normalizedEmail" text,
    phone text,
    company text,
    title text,
    status public."EventDirectoryPersonStatus" DEFAULT 'ACTIVE'::public."EventDirectoryPersonStatus" NOT NULL,
    "createdByUserId" uuid,
    "updatedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);

--
-- Name: EventDirectoryRole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectoryRole" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "personId" uuid NOT NULL,
    role public."EventDirectoryRoleType" NOT NULL,
    "sourceId" uuid,
    "createdByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventDirectorySource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventDirectorySource" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    type public."EventDirectorySourceType" NOT NULL,
    label text NOT NULL,
    provider text,
    "createdByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventExternalIdentity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventExternalIdentity" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "directoryPersonId" uuid NOT NULL,
    "attendeeId" uuid,
    provider text NOT NULL,
    "externalObjectType" text NOT NULL,
    "externalObjectId" text NOT NULL,
    "lastSeenAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventFnbCatalogItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbCatalogItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "itemName" text NOT NULL,
    description text,
    price text,
    unit text,
    category text,
    "sourceMenuFileName" text,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "sourceMenuId" uuid,
    "publishedPriceCents" integer,
    "negotiatedPriceCents" integer,
    "discountCents" integer,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    "pricingUnit" public."FnbPricingUnit",
    "minimumQuantity" integer,
    "isCustom" boolean DEFAULT false NOT NULL,
    "crossContactNotes" text,
    "preparationNotes" text,
    "internalNotes" text,
    "verificationStatus" public."FnbVerificationStatus" DEFAULT 'UNVERIFIED'::public."FnbVerificationStatus" NOT NULL,
    "verifiedByUserId" uuid,
    "verifiedAt" timestamp(3) without time zone,
    "verificationSource" text,
    "verificationNotes" text,
    version integer DEFAULT 1 NOT NULL,
    "serviceNotes" text,
    "vendorNotes" text,
    "modificationStatus" public."FnbVerificationStatus",
    "modificationEvidenceSource" text,
    "modificationVerifiedByUserId" uuid,
    "modificationVerifiedAt" timestamp(3) without time zone,
    taxable boolean DEFAULT true NOT NULL,
    CONSTRAINT "EventFnbCatalogItem_price_provenance_check" CHECK (((("publishedPriceCents" IS NULL) OR ("publishedPriceCents" >= 0)) AND (("negotiatedPriceCents" IS NULL) OR ("negotiatedPriceCents" >= 0)) AND (("discountCents" IS NULL) OR ("discountCents" >= 0)) AND (("minimumQuantity" IS NULL) OR ("minimumQuantity" > 0)))),
    CONSTRAINT "EventFnbCatalogItem_verified_modification_evidence_check" CHECK ((("modificationStatus" <> 'VERIFIED'::public."FnbVerificationStatus") OR (("preparationNotes" IS NOT NULL) AND (length(btrim("preparationNotes")) > 0) AND ("modificationEvidenceSource" IS NOT NULL) AND (length(btrim("modificationEvidenceSource")) > 0) AND ("modificationVerifiedByUserId" IS NOT NULL) AND ("modificationVerifiedAt" IS NOT NULL))))
);

--
-- Name: EventFnbCatalogItemClaim; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbCatalogItemClaim" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "itemId" uuid NOT NULL,
    kind public."FnbClaimKind" NOT NULL,
    code text NOT NULL,
    "customLabel" text,
    "verificationStatus" public."FnbVerificationStatus" DEFAULT 'UNVERIFIED'::public."FnbVerificationStatus" NOT NULL,
    "verifiedByUserId" uuid,
    "verifiedAt" timestamp(3) without time zone,
    "evidenceSource" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventFnbCatalogItemSafetyRevision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbCatalogItemSafetyRevision" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "itemId" uuid NOT NULL,
    "actorUserId" uuid NOT NULL,
    reason text,
    snapshot jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventFnbExportRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbExportRecord" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    recipient public."FnbExportRecipient" NOT NULL,
    filters jsonb,
    "sourceDataVersion" text NOT NULL,
    "generatedByUserId" uuid,
    "generatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "projectionKey" text DEFAULT ''::text NOT NULL,
    "projectionVersion" integer DEFAULT 1 NOT NULL,
    format text DEFAULT 'csv'::text NOT NULL,
    "rowCount" integer DEFAULT 0 NOT NULL,
    checksum text DEFAULT ''::text NOT NULL,
    "generatedFilename" text,
    "dataAsOf" timestamp(3) without time zone
);

--
-- Name: EventFnbSourceMenu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbSourceMenu" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "menuName" text NOT NULL,
    "fileName" text,
    "sourceType" public."EventFnbSourceMenuSourceType" DEFAULT 'ORIGINAL'::public."EventFnbSourceMenuSourceType" NOT NULL,
    status public."EventFnbSourceMenuStatus" DEFAULT 'UPLOADED'::public."EventFnbSourceMenuStatus" NOT NULL,
    "objectKey" text,
    "itemsFound" integer DEFAULT 0 NOT NULL,
    "progressSummary" text,
    "lastError" text,
    "baseSourceMenuId" uuid,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "operationalStatus" public."FnbOperationalStatus" DEFAULT 'RECEIVED'::public."FnbOperationalStatus" NOT NULL,
    "venueOrCaterer" text,
    "mealContext" text,
    "expectedAt" timestamp(3) without time zone,
    "receivedAt" timestamp(3) without time zone,
    "effectiveAt" timestamp(3) without time zone,
    "versionLabel" text,
    "ownerUserId" uuid,
    "verificationStatus" public."FnbVerificationStatus" DEFAULT 'UNVERIFIED'::public."FnbVerificationStatus" NOT NULL,
    "verifiedByUserId" uuid,
    "verifiedAt" timestamp(3) without time zone,
    "verificationSource" text,
    "verificationNotes" text,
    "internalNotes" text,
    version integer DEFAULT 1 NOT NULL
);

--
-- Name: EventFnbSourceMenuParseJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbSourceMenuParseJob" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "sourceMenuId" uuid NOT NULL,
    status public."EventFnbSourceMenuParseJobStatus" DEFAULT 'QUEUED'::public."EventFnbSourceMenuParseJobStatus" NOT NULL,
    "workerMode" text DEFAULT 'bounded_menu_map_worker'::text NOT NULL,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    "maxAttempts" integer DEFAULT 1 NOT NULL,
    "runAfter" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lockedAt" timestamp(3) without time zone,
    "lockedBy" text,
    "heartbeatAt" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "failedAt" timestamp(3) without time zone,
    "errorMessage" text,
    "progressSummary" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "totalTargetCount" integer DEFAULT 0 NOT NULL,
    "completedTargetCount" integer DEFAULT 0 NOT NULL,
    "failedTargetCount" integer DEFAULT 0 NOT NULL,
    "mapCreatedAt" timestamp(3) without time zone
);

--
-- Name: EventFnbSourceMenuParseTarget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventFnbSourceMenuParseTarget" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "jobId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "sourceMenuId" uuid NOT NULL,
    "targetKey" text NOT NULL,
    label text NOT NULL,
    "startPage" integer NOT NULL,
    "endPage" integer NOT NULL,
    status public."EventFnbSourceMenuParseTargetStatus" DEFAULT 'PENDING'::public."EventFnbSourceMenuParseTargetStatus" NOT NULL,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    "errorMessage" text,
    "itemsJson" jsonb,
    "ledgerJson" jsonb,
    "usageJson" jsonb,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "failedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventImportIntent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventImportIntent" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    "requestedByUserId" uuid NOT NULL,
    "idempotencyKey" text NOT NULL,
    "sourceType" text NOT NULL,
    status public."EventImportIntentStatus" DEFAULT 'PROCESSING'::public."EventImportIntentStatus" NOT NULL,
    "approvedAt" timestamp(3) without time zone NOT NULL,
    "approvalEvidence" jsonb NOT NULL,
    "reviewedMappings" jsonb NOT NULL,
    "approvedPlan" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "completedAt" timestamp(3) without time zone
);

--
-- Name: EventImportResult; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventImportResult" (
    id uuid NOT NULL,
    "intentId" uuid NOT NULL,
    "orgId" uuid NOT NULL,
    "requestedByUserId" uuid NOT NULL,
    "eventId" uuid,
    status public."EventImportResultStatus" NOT NULL,
    "createdSummary" jsonb,
    "skippedSummary" jsonb,
    warnings jsonb,
    "errorCode" text,
    "errorMessage" text,
    "httpStatus" integer,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventIntegrationConnection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventIntegrationConnection" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    provider text NOT NULL,
    "externalEventId" text,
    "connectionStatus" public."EventIntegrationConnectionStatus" DEFAULT 'NOT_CONNECTED'::public."EventIntegrationConnectionStatus" NOT NULL,
    "syncMode" public."EventIntegrationSyncMode" DEFAULT 'READ_ONLY'::public."EventIntegrationSyncMode" NOT NULL,
    "lastSyncAt" timestamp(3) without time zone,
    "canPullAttendees" boolean DEFAULT false NOT NULL,
    "canCreateAttendees" boolean DEFAULT false NOT NULL,
    "canUpdateAttendees" boolean DEFAULT false NOT NULL,
    "canCancelAttendees" boolean DEFAULT false NOT NULL,
    "canPullSessions" boolean DEFAULT false NOT NULL,
    "canPushSessions" boolean DEFAULT false NOT NULL,
    "canPullSessionRegistrations" boolean DEFAULT false NOT NULL,
    "canPushSessionRegistrations" boolean DEFAULT false NOT NULL,
    "supportsWebhooks" boolean DEFAULT false NOT NULL,
    "supportsOrders" boolean DEFAULT false NOT NULL,
    "supportsBadgeTypes" boolean DEFAULT false NOT NULL,
    "createdByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventIntegrationMetric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventIntegrationMetric" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    type public."EventIntegrationMetricType" NOT NULL,
    "currentValue" integer NOT NULL,
    "goalValue" integer,
    "pacePercent" integer,
    "delta7dPercent" integer,
    "breakdownJson" jsonb,
    "sourceSystem" text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EventMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventMember" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "eventRole" public."EventMemberRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: EventPerson; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventPerson" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    role public."EventPersonRole" NOT NULL,
    company text,
    email text,
    phone text,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

--
-- Name: EventRegistrationRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EventRegistrationRecord" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "attendeeId" uuid NOT NULL,
    "directoryPersonId" uuid NOT NULL,
    provider text DEFAULT 'manual'::text NOT NULL,
    "externalRegistrationId" text,
    "externalPersonId" text,
    "externalOrderId" text,
    "registrationStatus" public."EventAttendeeRegistrationStatus" DEFAULT 'REGISTERED'::public."EventAttendeeRegistrationStatus" NOT NULL,
    "registrationType" text,
    "ticketType" text,
    "badgeType" text,
    "paymentStatus" text,
    "syncStatus" public."EventAttendeeSyncStatus" DEFAULT 'LOCAL_ONLY'::public."EventAttendeeSyncStatus" NOT NULL,
    "writebackStatus" public."EventRegistrationWritebackStatus" DEFAULT 'NOT_APPLICABLE'::public."EventRegistrationWritebackStatus" NOT NULL,
    "registeredAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "lastSyncedAt" timestamp(3) without time zone,
    "providerUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: FnbParserFeedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FnbParserFeedback" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "orgId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "clientId" uuid,
    "documentId" uuid,
    "sourceMenuFileName" text,
    action text NOT NULL,
    "changeFlags" jsonb NOT NULL,
    "originalRow" jsonb NOT NULL,
    "finalRow" jsonb,
    "rejectionReason" text,
    "sourcePageNumber" integer,
    "sourceSection" text,
    "extractionSource" text,
    confidence text,
    "parserVersion" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingAudience; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingAudience" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    "sourceLabel" text,
    "recipientCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingAudienceRecipient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingAudienceRecipient" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "audienceId" uuid NOT NULL,
    email text NOT NULL,
    "normalizedEmail" text NOT NULL,
    "firstName" text,
    "lastName" text,
    company text,
    title text,
    "registrationType" text,
    status text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingCampaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingCampaign" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "marketingPlanId" uuid,
    name text NOT NULL,
    description text,
    "ownerUserId" uuid,
    status public."MarketingCampaignStatus" DEFAULT 'DRAFT'::public."MarketingCampaignStatus" NOT NULL,
    "audienceLabel" text,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingEmailEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingEmailEvent" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "emailSendId" uuid NOT NULL,
    "emailSendRecipientId" uuid NOT NULL,
    type public."MarketingEmailEventType" NOT NULL,
    "sgEventId" text NOT NULL,
    "occurredAt" timestamp(3) without time zone NOT NULL,
    reason text,
    url text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MarketingEmailSend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingEmailSend" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "campaignId" uuid NOT NULL,
    "audienceId" uuid,
    "ownerUserId" uuid,
    subject text NOT NULL,
    "previewText" text,
    "bodyHtml" text,
    "bodyText" text,
    "fromEmail" text NOT NULL,
    "replyTo" text,
    "registrationUrl" text,
    "utmUrl" text,
    status public."MarketingEmailSendStatus" DEFAULT 'DRAFT'::public."MarketingEmailSendStatus" NOT NULL,
    "scheduledSendAt" timestamp(3) without time zone,
    "actualSentAt" timestamp(3) without time zone,
    "sendgridBatchId" text,
    "recipientCount" integer DEFAULT 0 NOT NULL,
    "deliveredCount" integer DEFAULT 0 NOT NULL,
    "openCount" integer DEFAULT 0 NOT NULL,
    "clickCount" integer DEFAULT 0 NOT NULL,
    "bounceCount" integer DEFAULT 0 NOT NULL,
    "unsubscribeCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "canceledAt" timestamp(3) without time zone,
    "canceledByUserId" uuid,
    "failureReason" text,
    "sendAttemptCount" integer DEFAULT 0 NOT NULL,
    "lastAttemptedAt" timestamp(3) without time zone
);

--
-- Name: MarketingEmailSendRecipient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingEmailSendRecipient" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "emailSendId" uuid NOT NULL,
    "sourceAudienceRecipientId" uuid,
    email text NOT NULL,
    "normalizedEmail" text NOT NULL,
    "firstName" text,
    "lastName" text,
    company text,
    title text,
    "registrationType" text,
    "providerStatus" public."MarketingEmailRecipientStatus" DEFAULT 'PENDING'::public."MarketingEmailRecipientStatus" NOT NULL,
    "sendgridMessageId" text,
    "processedAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "openedAt" timestamp(3) without time zone,
    "clickedAt" timestamp(3) without time zone,
    "bouncedAt" timestamp(3) without time zone,
    "unsubscribedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingKpiSnapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingKpiSnapshot" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "campaignId" uuid,
    "emailSendId" uuid,
    "capturedByUserId" uuid,
    "capturedAt" timestamp(3) without time zone NOT NULL,
    "registrationCount" integer,
    "revenueAmountCents" integer,
    "goalValue" integer,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingPlan" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "ownerUserId" uuid,
    summary text,
    goals text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: MarketingSuppression; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MarketingSuppression" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    email text NOT NULL,
    "normalizedEmail" text NOT NULL,
    reason public."MarketingSuppressionReason" NOT NULL,
    source public."MarketingSuppressionSource" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MatrixImportBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MatrixImportBatch" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "requestedByUserId" uuid NOT NULL,
    "idempotencyKey" text NOT NULL,
    "payloadHash" text NOT NULL,
    "importedCount" integer NOT NULL,
    "duplicateCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: MatrixRow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MatrixRow" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "dayDate" date NOT NULL,
    "startTime" time(6) without time zone,
    "endTime" time(6) without time zone,
    "roomName" text,
    "sessionName" text,
    "setupType" text,
    attendance integer,
    "fnbNotes" text,
    "mealPeriod" public."MealPeriod",
    "avNotes" text,
    "avNeeds" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "roomId" uuid,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "fnbTaxPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "fnbServiceChargePercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "publicDescription" text,
    "attendanceSource" public."ExpectedAttendanceSource"
);

--
-- Name: MatrixRowSpeaker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MatrixRowSpeaker" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "matrixRowId" uuid NOT NULL,
    "eventPersonId" uuid NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);

--
-- Name: MatrixRowStaffAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MatrixRowStaffAssignment" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "matrixRowId" uuid NOT NULL,
    "eventPersonId" uuid NOT NULL,
    assignmentrole text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);

--
-- Name: Membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Membership" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    "orgId" uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    "linkUrl" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "readAt" timestamp(3) without time zone,
    "actorUserId" uuid,
    "eventId" uuid,
    "documentId" uuid
);

--
-- Name: Organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Organization" (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "agendaTerm" text,
    "runOfShowTerm" text,
    "matrixTerm" text,
    "showFlowTerm" text
);

--
-- Name: Room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Room" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    capacity integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "roomSetNotes" text,
    "roomSetInternalNotes" text
);

--
-- Name: SeatingAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SeatingAssignment" (
    id uuid NOT NULL,
    "tableId" uuid NOT NULL,
    "attendeeId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "eventId" uuid NOT NULL,
    "seatIndex" integer,
    "seatingPlanId" uuid
);

--
-- Name: SeatingAttendee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SeatingAttendee" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    company text,
    email text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    "eventAttendeeId" uuid
);

--
-- Name: SeatingPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SeatingPlan" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "matrixRowId" uuid,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SeatingTable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SeatingTable" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    capacity integer NOT NULL,
    "sortOrder" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "seatingPlanId" uuid
);

--
-- Name: SessionAVRequirement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionAVRequirement" (
    id uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    "avType" text NOT NULL,
    quantity integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SessionAgendaPublication; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionAgendaPublication" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    version integer NOT NULL,
    "showFlowRevision" integer NOT NULL,
    "sessionUpdatedAt" timestamp(3) without time zone NOT NULL,
    snapshot jsonb NOT NULL,
    "publishedByUserId" uuid NOT NULL,
    "publishedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SessionAgendaPublication_showFlowRevision_check" CHECK (("showFlowRevision" >= 0)),
    CONSTRAINT "SessionAgendaPublication_version_check" CHECK ((version > 0))
);

--
-- Name: SessionFnbAssignmentSafetyResolution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionFnbAssignmentSafetyResolution" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    "assignmentId" uuid NOT NULL,
    "requirementId" uuid NOT NULL,
    outcome public."FnbCompatibilityOutcome" NOT NULL,
    "reasonCodes" jsonb NOT NULL,
    modification text,
    "modificationStatus" public."FnbVerificationStatus",
    "evidenceSource" text,
    "resolvedByUserId" uuid,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "SessionFnbAssignmentSafetyResolution_verified_modification_chec" CHECK ((("modificationStatus" <> 'VERIFIED'::public."FnbVerificationStatus") OR ((modification IS NOT NULL) AND (length(btrim(modification)) > 0) AND ("evidenceSource" IS NOT NULL) AND (length(btrim("evidenceSource")) > 0) AND ("resolvedByUserId" IS NOT NULL) AND ("resolvedAt" IS NOT NULL))))
);

--
-- Name: SessionFnbCatalogAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionFnbCatalogAssignment" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "sessionId" uuid NOT NULL,
    "eventFnbCatalogItemId" uuid NOT NULL,
    quantity integer,
    "serviceTiming" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "budgetLineItemId" uuid,
    "manualPriceCents" integer,
    "catalogItemVersion" integer DEFAULT 1 NOT NULL,
    "catalogItemSnapshot" jsonb
);

--
-- Name: SessionFnbCatalogAssignmentTax; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionFnbCatalogAssignmentTax" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "assignmentId" uuid NOT NULL,
    label text,
    percentage numeric(7,4) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SessionFnbRequirement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionFnbRequirement" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    kind public."FnbRequirementKind" NOT NULL,
    code text NOT NULL,
    "customLabel" text,
    quantity integer,
    disposition public."RequirementDisposition" DEFAULT 'REQUIRED'::public."RequirementDisposition" NOT NULL,
    "dispositionReason" text,
    "dispositionActorUserId" uuid,
    "dispositionAt" timestamp(3) without time zone,
    source text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "SessionFnbRequirement_not_needed_reason_check" CHECK (((disposition <> 'NOT_NEEDED'::public."RequirementDisposition") OR (("dispositionReason" IS NOT NULL) AND (length(btrim("dispositionReason")) > 0)))),
    CONSTRAINT "SessionFnbRequirement_quantity_check" CHECK (((quantity IS NULL) OR (quantity > 0)))
);

--
-- Name: SessionFoodService; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionFoodService" (
    id uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    "serviceType" text NOT NULL,
    "serviceStyle" text,
    headcount integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SessionRequirementItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionRequirementItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "sectionId" uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    "hasQuantity" boolean DEFAULT false NOT NULL,
    "sortOrder" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL
);

--
-- Name: SessionRequirementSection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionRequirementSection" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "templateId" uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    icon text NOT NULL,
    "sortOrder" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: SessionRequirementSelection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionRequirementSelection" (
    "sessionId" uuid NOT NULL,
    "itemId" uuid NOT NULL,
    quantity integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "budgetLineItemId" uuid
);

--
-- Name: SessionRequirementTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionRequirementTemplate" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: SessionShowFlowItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionShowFlowItem" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    "sortOrder" integer NOT NULL,
    "startTime" time(6) without time zone,
    "durationMin" integer,
    label text NOT NULL,
    owner text,
    department text,
    notes text,
    visibility public."SessionShowFlowVisibility" DEFAULT 'INTERNAL'::public."SessionShowFlowVisibility" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "speakerId" uuid,
    "timingMode" public."SessionShowFlowTimingMode" DEFAULT 'ABSOLUTE'::public."SessionShowFlowTimingMode" NOT NULL,
    "offsetMin" integer,
    action text,
    "talentName" text,
    "avNotes" text,
    "audioNotes" text,
    "lightingNotes" text,
    "internalNotes" text,
    "publicDescription" text,
    version integer DEFAULT 1 NOT NULL,
    "cueType" public."SessionShowFlowCueType" DEFAULT 'CUSTOM'::public."SessionShowFlowCueType" NOT NULL,
    "ownerPersonId" uuid,
    CONSTRAINT "SessionShowFlowItem_durationMin_check" CHECK ((("durationMin" IS NULL) OR ("durationMin" > 0))),
    CONSTRAINT "SessionShowFlowItem_offsetMin_check" CHECK ((("offsetMin" IS NULL) OR ("offsetMin" >= 0))),
    CONSTRAINT "SessionShowFlowItem_timingMode_check" CHECK (((("timingMode" = 'ABSOLUTE'::public."SessionShowFlowTimingMode") AND ("offsetMin" IS NULL)) OR (("timingMode" = 'OFFSET'::public."SessionShowFlowTimingMode") AND ("offsetMin" IS NOT NULL)))),
    CONSTRAINT "SessionShowFlowItem_version_check" CHECK ((version > 0))
);

--
-- Name: SessionShowFlowState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionShowFlowState" (
    "sessionId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    status public."SessionShowFlowStatus" DEFAULT 'DRAFT'::public."SessionShowFlowStatus" NOT NULL,
    "templateSourceSessionId" uuid,
    "createdByUserId" uuid,
    "updatedByUserId" uuid,
    "approvedByUserId" uuid,
    "approvedAt" timestamp(3) without time zone,
    CONSTRAINT "SessionShowFlowState_revision_check" CHECK ((revision >= 0)),
    CONSTRAINT "SessionShowFlowState_status_approval_check" CHECK ((((status = 'DRAFT'::public."SessionShowFlowStatus") AND ("approvedAt" IS NULL) AND ("approvedByUserId" IS NULL)) OR ((status = 'APPROVED'::public."SessionShowFlowStatus") AND ("approvedAt" IS NOT NULL) AND ("approvedByUserId" IS NOT NULL))))
);

--
-- Name: SessionSpeakerAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionSpeakerAssignment" (
    "sessionId" uuid NOT NULL,
    "speakerId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SessionStaffAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionStaffAssignment" (
    "sessionId" uuid NOT NULL,
    "personId" uuid NOT NULL,
    role text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SessionSupplyAllocation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionSupplyAllocation" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    "supplyItemId" uuid,
    "oneOffName" text,
    category text NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    quantity integer,
    "suggestedQuantity" integer,
    "quantityRule" public."SupplyQuantityRule" DEFAULT 'MANUAL'::public."SupplyQuantityRule" NOT NULL,
    "quantityOverridden" boolean DEFAULT false NOT NULL,
    source text,
    owner text,
    "setupDeadline" timestamp(3) without time zone,
    placement text,
    fulfillment public."SupplyFulfillmentState" DEFAULT 'PLANNED'::public."SupplyFulfillmentState" NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    notes text,
    "showFlowCueId" uuid,
    state public."SupplyAllocationState" DEFAULT 'ACTIVE'::public."SupplyAllocationState" NOT NULL,
    "idempotencyKey" text,
    revision integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "responsibleUserId" uuid,
    "budgetLineItemId" uuid,
    CONSTRAINT "SessionSupplyAllocation_item_or_name" CHECK ((("supplyItemId" IS NOT NULL) <> ("oneOffName" IS NOT NULL))),
    CONSTRAINT "SessionSupplyAllocation_nonnegative_quantity" CHECK (((quantity IS NULL) OR (quantity >= 0)))
);

--
-- Name: SessionSupplyState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SessionSupplyState" (
    "sessionId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "notNeededAt" timestamp(3) without time zone,
    "notNeededByUserId" uuid,
    revision integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sessionNotes" text,
    "registrationStationCount" integer,
    "registrationVipDesk" boolean,
    "registrationBadgePrintingMethod" text,
    "registrationAccessibilityDesk" boolean,
    CONSTRAINT "SessionSupplyState_badge_printing_method" CHECK ((("registrationBadgePrintingMethod" IS NULL) OR ("registrationBadgePrintingMethod" = ANY (ARRAY['PRE_PRINTED'::text, 'ON_DEMAND'::text, 'HYBRID'::text, 'NONE'::text])))),
    CONSTRAINT "SessionSupplyState_station_count" CHECK ((("registrationStationCount" IS NULL) OR (("registrationStationCount" >= 1) AND ("registrationStationCount" <= 100))))
);

--
-- Name: SignageApproval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageApproval" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "signId" uuid NOT NULL,
    state public."SignageApprovalState" DEFAULT 'PENDING'::public."SignageApprovalState" NOT NULL,
    "assetId" uuid,
    "approverUserId" uuid,
    "dueAt" timestamp(3) without time zone,
    feedback text,
    "actedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SignageAsset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageAsset" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "signId" uuid NOT NULL,
    kind public."SignageAssetKind" NOT NULL,
    label text NOT NULL,
    "storageKey" text,
    "secureUrl" text,
    "mimeType" text,
    version integer DEFAULT 1 NOT NULL,
    "isFinal" boolean DEFAULT false NOT NULL,
    "uploadedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SignageChangeImpact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageChangeImpact" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "signId" uuid NOT NULL,
    "sourceType" public."SignageImpactSource" NOT NULL,
    "sourceId" text NOT NULL,
    "affectedFields" text[] NOT NULL,
    fingerprint text NOT NULL,
    "sourceSnapshot" jsonb,
    "reviewedAt" timestamp(3) without time zone,
    "reviewedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SignageChecklistItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageChecklistItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "ownerUserId" uuid,
    key text NOT NULL,
    label text NOT NULL,
    "isComplete" boolean DEFAULT false NOT NULL,
    "completedByUserId" uuid,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SignageIssue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageIssue" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "signId" uuid NOT NULL,
    type public."SignageIssueType" NOT NULL,
    status public."SignageIssueStatus" DEFAULT 'OPEN'::public."SignageIssueStatus" NOT NULL,
    description text,
    "reportedByUserId" uuid,
    "resolvedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "responsibleOwnerUserId" uuid,
    "replacementNeeded" boolean DEFAULT false NOT NULL
);

--
-- Name: SignageRouteOrder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageRouteOrder" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "signId" uuid NOT NULL,
    "routeKey" text NOT NULL,
    "routeOrder" integer NOT NULL,
    "stopOrder" integer NOT NULL,
    "assignedOwnerUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SignageSign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageSign" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "sessionId" uuid,
    "roomId" uuid,
    "budgetLineItemId" uuid,
    name text NOT NULL,
    "signType" public."SignageSignType" NOT NULL,
    "workflowState" public."SignageWorkflowState" DEFAULT 'NEEDS_INFO'::public."SignageWorkflowState" NOT NULL,
    "lastNormalState" public."SignageWorkflowState" DEFAULT 'NEEDS_INFO'::public."SignageWorkflowState" NOT NULL,
    priority public."SignagePriority" DEFAULT 'NORMAL'::public."SignagePriority" NOT NULL,
    "notNeededReason" text,
    "blockedReason" text,
    "blockingOwnerUserId" uuid,
    "displayCopy" text,
    language text,
    "qrDestination" text,
    "accessibilityNotes" text,
    width numeric(10,2),
    height numeric(10,2),
    "dimensionUnit" public."SignageDimensionUnit" DEFAULT 'INCHES'::public."SignageDimensionUnit" NOT NULL,
    orientation public."SignageOrientation",
    material public."SignageMaterial",
    sidedness public."SignageSidedness" DEFAULT 'SINGLE'::public."SignageSidedness" NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    finishing text,
    "printInstructions" text,
    "logoRequirement" public."SignageLogoRequirement" DEFAULT 'TO_BE_DECIDED'::public."SignageLogoRequirement" NOT NULL,
    "brandingNotes" text,
    "vendorName" text,
    "designOwnerUserId" uuid,
    "installOwnerUserId" uuid,
    "approverUserId" uuid,
    "productionDeadline" timestamp(3) without time zone,
    "neededBy" timestamp(3) without time zone,
    "venueName" text,
    "floorName" text,
    "locationName" text,
    "exactPlacement" text,
    "installWindowStart" timestamp(3) without time zone,
    "installWindowEnd" timestamp(3) without time zone,
    "removalWindowStart" timestamp(3) without time zone,
    "removalWindowEnd" timestamp(3) without time zone,
    "placementNotes" text,
    "referenceImageUrl" text,
    "installState" public."SignageInstallState" DEFAULT 'NOT_SCHEDULED'::public."SignageInstallState" NOT NULL,
    "installedByUserId" uuid,
    "installedAt" timestamp(3) without time zone,
    "issueStatus" public."SignageIssueStatus" DEFAULT 'NONE'::public."SignageIssueStatus" NOT NULL,
    "templateKey" text,
    "templateProvenance" jsonb,
    "sourceProvenance" jsonb,
    revision integer DEFAULT 1 NOT NULL,
    "createdByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "speakerId" uuid,
    "fnbCatalogItemId" uuid,
    "linkedSponsorName" text,
    "productionFormat" text,
    "designerUserId" uuid,
    "installConfirmationNotes" text,
    "installProofStatus" public."SignageInstallProofStatus" DEFAULT 'NOT_RECORDED'::public."SignageInstallProofStatus" NOT NULL,
    "requiredLogos" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "brandingDecision" public."SignageBrandingDecision" DEFAULT 'NEEDS_DECISION'::public."SignageBrandingDecision" NOT NULL,
    CONSTRAINT "SignageSign_blocker_consistent" CHECK ((("blockedReason" IS NULL) OR ("workflowState" <> 'NOT_NEEDED'::public."SignageWorkflowState"))),
    CONSTRAINT "SignageSign_quantity_positive" CHECK ((quantity > 0))
);

--
-- Name: SignageSignSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SignageSignSession" (
    "signId" uuid NOT NULL,
    "sessionId" uuid NOT NULL,
    "linkedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Speaker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Speaker" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    title text,
    company text,
    bio text,
    "headshotUrl" text,
    status public."SpeakerStatus" DEFAULT 'NEEDS_INFO'::public."SpeakerStatus" NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "avNeeds" text,
    "travelNeeds" text,
    "dietaryRestrictions" text,
    topics text[] DEFAULT ARRAY[]::text[],
    "linkedinUrl" text,
    "websiteUrl" text,
    "intakeTokenSentAt" timestamp(3) without time zone,
    "intakeSubmittedAt" timestamp(3) without time zone,
    "reminderSentAt" timestamp(3) without time zone
);

--
-- Name: SpeakerDocumentRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerDocumentRequest" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "speakerId" uuid NOT NULL,
    title text NOT NULL,
    instructions text,
    "requiresSignature" boolean DEFAULT false NOT NULL,
    "speakerFileId" uuid,
    "documentId" uuid,
    "createdByUserId" uuid,
    "submittedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SpeakerEmailLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerEmailLog" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "speakerId" uuid NOT NULL,
    kind public."SpeakerReminderKind" NOT NULL,
    "toEmail" text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    reason text NOT NULL,
    status public."SpeakerEmailStatus" NOT NULL,
    provider text NOT NULL,
    error text,
    "triggeredByUserId" uuid,
    "sentAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SpeakerFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerFile" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "speakerId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    kind public."SpeakerFileKind" NOT NULL,
    filename text NOT NULL,
    "objectKey" text NOT NULL,
    "contentType" text NOT NULL,
    "fileSizeBytes" integer NOT NULL,
    "uploadedViaPortal" boolean DEFAULT false NOT NULL,
    "uploadedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "sessionId" uuid,
    version integer DEFAULT 1 NOT NULL,
    "reviewStatus" public."SpeakerFileReviewStatus" DEFAULT 'RECEIVED'::public."SpeakerFileReviewStatus" NOT NULL,
    "reviewFeedback" text,
    "reviewedAt" timestamp(3) without time zone,
    "reviewedByUserId" uuid
);

--
-- Name: SpeakerIntakeToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerIntakeToken" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "speakerId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SpeakerInternalNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerInternalNote" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "speakerId" uuid NOT NULL,
    "sessionId" uuid,
    "speakerFileId" uuid,
    "authorUserId" uuid NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SpeakerMessage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerMessage" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "speakerId" uuid NOT NULL,
    "sessionId" uuid,
    "speakerFileId" uuid,
    "senderType" public."SpeakerMessageSender" NOT NULL,
    "senderUserId" uuid,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SpeakerOnsiteInfo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerOnsiteInfo" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "greenRoomLocation" text,
    "arrivalInstructions" text,
    "badgePickupInfo" text,
    "onsiteContact" text,
    "avRehearsalInfo" text,
    "updatedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SpeakerProfileSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerProfileSubmission" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "speakerId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "tokenId" uuid,
    status public."SpeakerSubmissionStatus" DEFAULT 'PENDING'::public."SpeakerSubmissionStatus" NOT NULL,
    name text,
    title text,
    company text,
    bio text,
    phone text,
    "headshotUrl" text,
    "avNeeds" text,
    "travelNeeds" text,
    "dietaryRestrictions" text,
    topics text[] DEFAULT ARRAY[]::text[],
    "linkedinUrl" text,
    "websiteUrl" text,
    "noteToPlanner" text,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reviewedAt" timestamp(3) without time zone,
    "reviewedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SpeakerReadinessItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SpeakerReadinessItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "speakerId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SupplyAllocationAudit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplyAllocationAudit" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    "allocationId" uuid NOT NULL,
    "actorUserId" uuid,
    action text NOT NULL,
    changes jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SupplyDependency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplyDependency" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "allocationId" uuid NOT NULL,
    type public."SupplyDependencyType" NOT NULL,
    "linkedSourceRecordId" uuid,
    label text NOT NULL,
    blocking boolean DEFAULT false NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "resolutionNotes" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: SupplyItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplyItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    "committedQuantity" integer,
    "defaultSource" text,
    "defaultOwner" text,
    notes text,
    "externalReference" text,
    revision integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SupplyItem_nonnegative_committed" CHECK ((("committedQuantity" IS NULL) OR ("committedQuantity" >= 0)))
);

--
-- Name: SupplyTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplyTemplate" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "eventId" uuid,
    key text NOT NULL,
    name text NOT NULL,
    "triggerType" text NOT NULL,
    "triggerMeta" jsonb,
    "isSystem" boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SupplyTemplate_system_scope" CHECK ((("isSystem" AND ("eventId" IS NULL)) OR ((NOT "isSystem") AND ("eventId" IS NOT NULL))))
);

--
-- Name: SupplyTemplateItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplyTemplateItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "templateId" uuid NOT NULL,
    "supplyItemId" uuid,
    name text NOT NULL,
    category text NOT NULL,
    unit text DEFAULT 'each'::text NOT NULL,
    rationale text NOT NULL,
    "quantityRule" public."SupplyQuantityRule" NOT NULL,
    "quantityFactor" numeric(12,4),
    "fixedQuantity" integer,
    "defaultSource" text,
    "defaultOwner" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT "SupplyTemplateItem_valid_quantity" CHECK ((("fixedQuantity" IS NULL) OR ("fixedQuantity" >= 0)))
);

--
-- Name: Task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Task" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "clientId" uuid,
    title text NOT NULL,
    description text,
    status public."TaskStatus" DEFAULT 'OPEN'::public."TaskStatus" NOT NULL,
    priority public."TaskPriority" DEFAULT 'MEDIUM'::public."TaskPriority" NOT NULL,
    type public."TaskType" DEFAULT 'EVENT'::public."TaskType" NOT NULL,
    source public."TaskSource" DEFAULT 'MANUAL'::public."TaskSource" NOT NULL,
    visibility public."TaskVisibility" DEFAULT 'INTERNAL'::public."TaskVisibility" NOT NULL,
    "dueAt" timestamp(3) without time zone,
    "createdByUserId" uuid NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "completedByUserId" uuid,
    "canceledAt" timestamp(3) without time zone,
    "canceledByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: TaskActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskActivity" (
    id uuid NOT NULL,
    "taskId" uuid NOT NULL,
    "actorUserId" uuid,
    type public."TaskActivityType" NOT NULL,
    message text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: TaskAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskAssignment" (
    "taskId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    role public."TaskAssignmentRole" DEFAULT 'OWNER'::public."TaskAssignmentRole" NOT NULL,
    "assignedByUserId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: TaskComment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskComment" (
    id uuid NOT NULL,
    "taskId" uuid NOT NULL,
    "authorUserId" uuid NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);

--
-- Name: TaskLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskLink" (
    id uuid NOT NULL,
    "taskId" uuid NOT NULL,
    "objectType" public."TaskLinkObjectType" NOT NULL,
    "objectId" uuid NOT NULL,
    "labelSnapshot" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: TaskWatcher; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TaskWatcher" (
    "taskId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: TimelineDependency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TimelineDependency" (
    type public."TimelineDependencyType" DEFAULT 'FINISH_TO_START'::public."TimelineDependencyType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "predecessorItemId" uuid NOT NULL,
    "successorItemId" uuid NOT NULL
);

--
-- Name: TimelineImportBatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TimelineImportBatch" (
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "requestedByUserId" uuid NOT NULL,
    "idempotencyKey" text NOT NULL,
    "payloadHash" text NOT NULL,
    "importedCount" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: TimelineItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TimelineItem" (
    title text NOT NULL,
    department text,
    status public."TimelineStatus" DEFAULT 'NOT_STARTED'::public."TimelineStatus" NOT NULL,
    priority public."TimelinePriority" DEFAULT 'MEDIUM'::public."TimelinePriority" NOT NULL,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    progress integer,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    id uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "ownerUserId" uuid,
    "parentId" uuid,
    workstream public."TimelineWorkstream",
    "planningStage" public."TimelinePlanningStage",
    "isCriticalPath" boolean DEFAULT false NOT NULL,
    disposition public."TimelineItemDisposition" DEFAULT 'ACTIVE'::public."TimelineItemDisposition" NOT NULL,
    "dispositionReason" text,
    "dispositionActorUserId" uuid,
    "dispositionAt" timestamp(3) without time zone,
    notes text,
    CONSTRAINT "TimelineItem_not_needed_evidence_check" CHECK ((((disposition = 'ACTIVE'::public."TimelineItemDisposition") AND ("dispositionReason" IS NULL) AND ("dispositionActorUserId" IS NULL) AND ("dispositionAt" IS NULL)) OR ((disposition = 'NOT_NEEDED'::public."TimelineItemDisposition") AND (length(btrim("dispositionReason")) > 0) AND ("dispositionActorUserId" IS NOT NULL) AND ("dispositionAt" IS NOT NULL))))
);

--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id uuid NOT NULL,
    "orgId" uuid NOT NULL,
    email text NOT NULL,
    "platformUserId" uuid,
    name text,
    role public."UserRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: UserDashboardLayout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserDashboardLayout" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    "eventId" uuid NOT NULL,
    "roleKey" text NOT NULL,
    layout jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: BudgetActivity BudgetActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetActivity"
    ADD CONSTRAINT "BudgetActivity_pkey" PRIMARY KEY (id);

--
-- Name: BudgetApproval BudgetApproval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetApproval"
    ADD CONSTRAINT "BudgetApproval_pkey" PRIMARY KEY (id);

--
-- Name: BudgetCategoryTarget BudgetCategoryTarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetCategoryTarget"
    ADD CONSTRAINT "BudgetCategoryTarget_pkey" PRIMARY KEY (id);

--
-- Name: BudgetGroup BudgetGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetGroup"
    ADD CONSTRAINT "BudgetGroup_pkey" PRIMARY KEY (id);

--
-- Name: BudgetItem BudgetItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetItem"
    ADD CONSTRAINT "BudgetItem_pkey" PRIMARY KEY (id);

--
-- Name: BudgetLineItem BudgetLineItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetLineItem"
    ADD CONSTRAINT "BudgetLineItem_pkey" PRIMARY KEY (id);

--
-- Name: BudgetSubmissionLineItem BudgetSubmissionLineItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmissionLineItem"
    ADD CONSTRAINT "BudgetSubmissionLineItem_pkey" PRIMARY KEY ("submissionId", "budgetLineItemId");

--
-- Name: BudgetSubmissionRecipient BudgetSubmissionRecipient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmissionRecipient"
    ADD CONSTRAINT "BudgetSubmissionRecipient_pkey" PRIMARY KEY ("submissionId", "userId");

--
-- Name: BudgetSubmission BudgetSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmission"
    ADD CONSTRAINT "BudgetSubmission_pkey" PRIMARY KEY (id);

--
-- Name: BudgetVersion BudgetVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetVersion"
    ADD CONSTRAINT "BudgetVersion_pkey" PRIMARY KEY (id);

--
-- Name: Budget Budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_pkey" PRIMARY KEY (id);

--
-- Name: Client Client_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Client"
    ADD CONSTRAINT "Client_pkey" PRIMARY KEY (id);

--
-- Name: CopilotAuditLog CopilotAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_pkey" PRIMARY KEY (id);

--
-- Name: Deadline Deadline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deadline"
    ADD CONSTRAINT "Deadline_pkey" PRIMARY KEY (id);

--
-- Name: DocumentApprovalRecipient DocumentApprovalRecipient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentApprovalRecipient"
    ADD CONSTRAINT "DocumentApprovalRecipient_pkey" PRIMARY KEY ("approvalId", "userId");

--
-- Name: DocumentApproval DocumentApproval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentApproval"
    ADD CONSTRAINT "DocumentApproval_pkey" PRIMARY KEY (id);

--
-- Name: DocumentCategory DocumentCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentCategory"
    ADD CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY (id);

--
-- Name: DocumentLink DocumentLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentLink"
    ADD CONSTRAINT "DocumentLink_pkey" PRIMARY KEY (id);

--
-- Name: DocumentTagOnDocument DocumentTagOnDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentTagOnDocument"
    ADD CONSTRAINT "DocumentTagOnDocument_pkey" PRIMARY KEY ("documentId", "tagId");

--
-- Name: DocumentTag DocumentTag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentTag"
    ADD CONSTRAINT "DocumentTag_pkey" PRIMARY KEY (id);

--
-- Name: DocumentVersion DocumentVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY (id);

--
-- Name: Document Document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_pkey" PRIMARY KEY (id);

--
-- Name: EventActivity EventActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActivity"
    ADD CONSTRAINT "EventActivity_pkey" PRIMARY KEY (id);

--
-- Name: EventAttendeeSessionEnrollment EventAttendeeSessionEnrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendeeSessionEnrollment"
    ADD CONSTRAINT "EventAttendeeSessionEnrollment_pkey" PRIMARY KEY (id);

--
-- Name: EventAttendee EventAttendee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendee"
    ADD CONSTRAINT "EventAttendee_pkey" PRIMARY KEY (id);

--
-- Name: EventDashboardLayoutMigration EventDashboardLayoutMigration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardLayoutMigration"
    ADD CONSTRAINT "EventDashboardLayoutMigration_pkey" PRIMARY KEY (id);

--
-- Name: EventDashboardViewPreference EventDashboardViewPreference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardViewPreference"
    ADD CONSTRAINT "EventDashboardViewPreference_pkey" PRIMARY KEY (id);

--
-- Name: EventDashboardView EventDashboardView_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardView"
    ADD CONSTRAINT "EventDashboardView_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectoryExternalIdentity EventDirectoryExternalIdentity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryExternalIdentity"
    ADD CONSTRAINT "EventDirectoryExternalIdentity_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectoryImportBatch EventDirectoryImportBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryImportBatch"
    ADD CONSTRAINT "EventDirectoryImportBatch_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectoryImportRow EventDirectoryImportRow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryImportRow"
    ADD CONSTRAINT "EventDirectoryImportRow_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectoryModuleLink EventDirectoryModuleLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryModuleLink"
    ADD CONSTRAINT "EventDirectoryModuleLink_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectoryPerson EventDirectoryPerson_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryPerson"
    ADD CONSTRAINT "EventDirectoryPerson_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectoryRole EventDirectoryRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryRole"
    ADD CONSTRAINT "EventDirectoryRole_pkey" PRIMARY KEY (id);

--
-- Name: EventDirectorySource EventDirectorySource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectorySource"
    ADD CONSTRAINT "EventDirectorySource_pkey" PRIMARY KEY (id);

--
-- Name: EventExternalIdentity EventExternalIdentity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventExternalIdentity"
    ADD CONSTRAINT "EventExternalIdentity_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbCatalogItemClaim EventFnbCatalogItemClaim_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItemClaim"
    ADD CONSTRAINT "EventFnbCatalogItemClaim_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbCatalogItemSafetyRevision EventFnbCatalogItemSafetyRevision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItemSafetyRevision"
    ADD CONSTRAINT "EventFnbCatalogItemSafetyRevision_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbCatalogItem EventFnbCatalogItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItem"
    ADD CONSTRAINT "EventFnbCatalogItem_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbExportRecord EventFnbExportRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbExportRecord"
    ADD CONSTRAINT "EventFnbExportRecord_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbSourceMenuParseJob EventFnbSourceMenuParseJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseJob"
    ADD CONSTRAINT "EventFnbSourceMenuParseJob_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbSourceMenuParseTarget EventFnbSourceMenuParseTarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseTarget"
    ADD CONSTRAINT "EventFnbSourceMenuParseTarget_pkey" PRIMARY KEY (id);

--
-- Name: EventFnbSourceMenu EventFnbSourceMenu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenu"
    ADD CONSTRAINT "EventFnbSourceMenu_pkey" PRIMARY KEY (id);

--
-- Name: EventImportIntent EventImportIntent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportIntent"
    ADD CONSTRAINT "EventImportIntent_pkey" PRIMARY KEY (id);

--
-- Name: EventImportResult EventImportResult_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportResult"
    ADD CONSTRAINT "EventImportResult_pkey" PRIMARY KEY (id);

--
-- Name: EventIntegrationConnection EventIntegrationConnection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntegrationConnection"
    ADD CONSTRAINT "EventIntegrationConnection_pkey" PRIMARY KEY (id);

--
-- Name: EventIntegrationMetric EventIntegrationMetric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntegrationMetric"
    ADD CONSTRAINT "EventIntegrationMetric_pkey" PRIMARY KEY (id);

--
-- Name: EventMember EventMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventMember"
    ADD CONSTRAINT "EventMember_pkey" PRIMARY KEY (id);

--
-- Name: EventPerson EventPerson_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventPerson"
    ADD CONSTRAINT "EventPerson_pkey" PRIMARY KEY (id);

--
-- Name: EventRegistrationRecord EventRegistrationRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventRegistrationRecord"
    ADD CONSTRAINT "EventRegistrationRecord_pkey" PRIMARY KEY (id);

--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);

--
-- Name: FnbParserFeedback FnbParserFeedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FnbParserFeedback"
    ADD CONSTRAINT "FnbParserFeedback_pkey" PRIMARY KEY (id);

--
-- Name: MarketingAudienceRecipient MarketingAudienceRecipient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingAudienceRecipient"
    ADD CONSTRAINT "MarketingAudienceRecipient_pkey" PRIMARY KEY (id);

--
-- Name: MarketingAudience MarketingAudience_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingAudience"
    ADD CONSTRAINT "MarketingAudience_pkey" PRIMARY KEY (id);

--
-- Name: MarketingCampaign MarketingCampaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingCampaign"
    ADD CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY (id);

--
-- Name: MarketingEmailEvent MarketingEmailEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailEvent"
    ADD CONSTRAINT "MarketingEmailEvent_pkey" PRIMARY KEY (id);

--
-- Name: MarketingEmailSendRecipient MarketingEmailSendRecipient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSendRecipient"
    ADD CONSTRAINT "MarketingEmailSendRecipient_pkey" PRIMARY KEY (id);

--
-- Name: MarketingEmailSend MarketingEmailSend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSend"
    ADD CONSTRAINT "MarketingEmailSend_pkey" PRIMARY KEY (id);

--
-- Name: MarketingKpiSnapshot MarketingKpiSnapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingKpiSnapshot"
    ADD CONSTRAINT "MarketingKpiSnapshot_pkey" PRIMARY KEY (id);

--
-- Name: MarketingPlan MarketingPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingPlan"
    ADD CONSTRAINT "MarketingPlan_pkey" PRIMARY KEY (id);

--
-- Name: MarketingSuppression MarketingSuppression_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingSuppression"
    ADD CONSTRAINT "MarketingSuppression_pkey" PRIMARY KEY (id);

--
-- Name: MatrixImportBatch MatrixImportBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixImportBatch"
    ADD CONSTRAINT "MatrixImportBatch_pkey" PRIMARY KEY (id);

--
-- Name: MatrixRowSpeaker MatrixRowSpeaker_matrixRowId_eventPersonId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowSpeaker"
    ADD CONSTRAINT "MatrixRowSpeaker_matrixRowId_eventPersonId_key" UNIQUE ("matrixRowId", "eventPersonId");

--
-- Name: MatrixRowSpeaker MatrixRowSpeaker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowSpeaker"
    ADD CONSTRAINT "MatrixRowSpeaker_pkey" PRIMARY KEY (id);

--
-- Name: MatrixRowStaffAssignment MatrixRowStaffAssignment_matrixRowId_eventPersonId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowStaffAssignment"
    ADD CONSTRAINT "MatrixRowStaffAssignment_matrixRowId_eventPersonId_key" UNIQUE ("matrixRowId", "eventPersonId");

--
-- Name: MatrixRowStaffAssignment MatrixRowStaffAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowStaffAssignment"
    ADD CONSTRAINT "MatrixRowStaffAssignment_pkey" PRIMARY KEY (id);

--
-- Name: MatrixRow MatrixRow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRow"
    ADD CONSTRAINT "MatrixRow_pkey" PRIMARY KEY (id);

--
-- Name: Membership Membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_pkey" PRIMARY KEY (id);

--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);

--
-- Name: Organization Organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Organization"
    ADD CONSTRAINT "Organization_pkey" PRIMARY KEY (id);

--
-- Name: Room Room_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Room"
    ADD CONSTRAINT "Room_pkey" PRIMARY KEY (id);

--
-- Name: SeatingAssignment SeatingAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAssignment"
    ADD CONSTRAINT "SeatingAssignment_pkey" PRIMARY KEY (id);

--
-- Name: SeatingAttendee SeatingAttendee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAttendee"
    ADD CONSTRAINT "SeatingAttendee_pkey" PRIMARY KEY (id);

--
-- Name: SeatingPlan SeatingPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingPlan"
    ADD CONSTRAINT "SeatingPlan_pkey" PRIMARY KEY (id);

--
-- Name: SeatingTable SeatingTable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingTable"
    ADD CONSTRAINT "SeatingTable_pkey" PRIMARY KEY (id);

--
-- Name: SessionAVRequirement SessionAVRequirement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionAVRequirement"
    ADD CONSTRAINT "SessionAVRequirement_pkey" PRIMARY KEY (id);

--
-- Name: SessionAgendaPublication SessionAgendaPublication_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionAgendaPublication"
    ADD CONSTRAINT "SessionAgendaPublication_pkey" PRIMARY KEY (id);

--
-- Name: SessionFnbAssignmentSafetyResolution SessionFnbAssignmentSafetyResolution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbAssignmentSafetyResolution"
    ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_pkey" PRIMARY KEY (id);

--
-- Name: SessionFnbCatalogAssignmentTax SessionFnbCatalogAssignmentTax_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbCatalogAssignmentTax"
    ADD CONSTRAINT "SessionFnbCatalogAssignmentTax_pkey" PRIMARY KEY (id);

--
-- Name: SessionFnbCatalogAssignment SessionFnbCatalogAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbCatalogAssignment"
    ADD CONSTRAINT "SessionFnbCatalogAssignment_pkey" PRIMARY KEY (id);

--
-- Name: SessionFnbRequirement SessionFnbRequirement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbRequirement"
    ADD CONSTRAINT "SessionFnbRequirement_pkey" PRIMARY KEY (id);

--
-- Name: SessionFoodService SessionFoodService_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFoodService"
    ADD CONSTRAINT "SessionFoodService_pkey" PRIMARY KEY (id);

--
-- Name: SessionRequirementItem SessionRequirementItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementItem"
    ADD CONSTRAINT "SessionRequirementItem_pkey" PRIMARY KEY (id);

--
-- Name: SessionRequirementItem SessionRequirementItem_sectionId_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementItem"
    ADD CONSTRAINT "SessionRequirementItem_sectionId_key_key" UNIQUE ("sectionId", key);

--
-- Name: SessionRequirementSection SessionRequirementSection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSection"
    ADD CONSTRAINT "SessionRequirementSection_pkey" PRIMARY KEY (id);

--
-- Name: SessionRequirementSection SessionRequirementSection_templateId_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSection"
    ADD CONSTRAINT "SessionRequirementSection_templateId_key_key" UNIQUE ("templateId", key);

--
-- Name: SessionRequirementSelection SessionRequirementSelection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSelection"
    ADD CONSTRAINT "SessionRequirementSelection_pkey" PRIMARY KEY ("sessionId", "itemId");

--
-- Name: SessionRequirementTemplate SessionRequirementTemplate_eventId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementTemplate"
    ADD CONSTRAINT "SessionRequirementTemplate_eventId_key" UNIQUE ("eventId");

--
-- Name: SessionRequirementTemplate SessionRequirementTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementTemplate"
    ADD CONSTRAINT "SessionRequirementTemplate_pkey" PRIMARY KEY (id);

--
-- Name: SessionShowFlowItem SessionShowFlowItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowItem"
    ADD CONSTRAINT "SessionShowFlowItem_pkey" PRIMARY KEY (id);

--
-- Name: SessionShowFlowState SessionShowFlowState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowState"
    ADD CONSTRAINT "SessionShowFlowState_pkey" PRIMARY KEY ("sessionId");

--
-- Name: SessionSpeakerAssignment SessionSpeakerAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSpeakerAssignment"
    ADD CONSTRAINT "SessionSpeakerAssignment_pkey" PRIMARY KEY ("sessionId", "speakerId");

--
-- Name: SessionStaffAssignment SessionStaffAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionStaffAssignment"
    ADD CONSTRAINT "SessionStaffAssignment_pkey" PRIMARY KEY ("sessionId", "personId");

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_eventId_sessionId_idempotencyKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_eventId_sessionId_idempotencyKey_key" UNIQUE ("eventId", "sessionId", "idempotencyKey");

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_pkey" PRIMARY KEY (id);

--
-- Name: SessionSupplyState SessionSupplyState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyState"
    ADD CONSTRAINT "SessionSupplyState_pkey" PRIMARY KEY ("sessionId");

--
-- Name: SignageApproval SignageApproval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageApproval"
    ADD CONSTRAINT "SignageApproval_pkey" PRIMARY KEY (id);

--
-- Name: SignageAsset SignageAsset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageAsset"
    ADD CONSTRAINT "SignageAsset_pkey" PRIMARY KEY (id);

--
-- Name: SignageChangeImpact SignageChangeImpact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageChangeImpact"
    ADD CONSTRAINT "SignageChangeImpact_pkey" PRIMARY KEY (id);

--
-- Name: SignageChangeImpact SignageChangeImpact_signId_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageChangeImpact"
    ADD CONSTRAINT "SignageChangeImpact_signId_fingerprint_key" UNIQUE ("signId", fingerprint);

--
-- Name: SignageChecklistItem SignageChecklistItem_eventId_ownerUserId_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageChecklistItem"
    ADD CONSTRAINT "SignageChecklistItem_eventId_ownerUserId_key_key" UNIQUE ("eventId", "ownerUserId", key);

--
-- Name: SignageChecklistItem SignageChecklistItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageChecklistItem"
    ADD CONSTRAINT "SignageChecklistItem_pkey" PRIMARY KEY (id);

--
-- Name: SignageIssue SignageIssue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageIssue"
    ADD CONSTRAINT "SignageIssue_pkey" PRIMARY KEY (id);

--
-- Name: SignageRouteOrder SignageRouteOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageRouteOrder"
    ADD CONSTRAINT "SignageRouteOrder_pkey" PRIMARY KEY (id);

--
-- Name: SignageRouteOrder SignageRouteOrder_signId_routeKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageRouteOrder"
    ADD CONSTRAINT "SignageRouteOrder_signId_routeKey_key" UNIQUE ("signId", "routeKey");

--
-- Name: SignageSignSession SignageSignSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSignSession"
    ADD CONSTRAINT "SignageSignSession_pkey" PRIMARY KEY ("signId", "sessionId");

--
-- Name: SignageSign SignageSign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSign"
    ADD CONSTRAINT "SignageSign_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerDocumentRequest SpeakerDocumentRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerDocumentRequest"
    ADD CONSTRAINT "SpeakerDocumentRequest_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerEmailLog SpeakerEmailLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerEmailLog"
    ADD CONSTRAINT "SpeakerEmailLog_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerFile SpeakerFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerFile"
    ADD CONSTRAINT "SpeakerFile_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerIntakeToken SpeakerIntakeToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerIntakeToken"
    ADD CONSTRAINT "SpeakerIntakeToken_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerInternalNote SpeakerInternalNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerInternalNote"
    ADD CONSTRAINT "SpeakerInternalNote_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerMessage SpeakerMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerMessage"
    ADD CONSTRAINT "SpeakerMessage_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerOnsiteInfo SpeakerOnsiteInfo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerOnsiteInfo"
    ADD CONSTRAINT "SpeakerOnsiteInfo_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerProfileSubmission SpeakerProfileSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerProfileSubmission"
    ADD CONSTRAINT "SpeakerProfileSubmission_pkey" PRIMARY KEY (id);

--
-- Name: SpeakerReadinessItem SpeakerReadinessItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerReadinessItem"
    ADD CONSTRAINT "SpeakerReadinessItem_pkey" PRIMARY KEY (id);

--
-- Name: Speaker Speaker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Speaker"
    ADD CONSTRAINT "Speaker_pkey" PRIMARY KEY (id);

--
-- Name: SupplyAllocationAudit SupplyAllocationAudit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyAllocationAudit"
    ADD CONSTRAINT "SupplyAllocationAudit_pkey" PRIMARY KEY (id);

--
-- Name: SupplyDependency SupplyDependency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyDependency"
    ADD CONSTRAINT "SupplyDependency_pkey" PRIMARY KEY (id);

--
-- Name: SupplyItem SupplyItem_eventId_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyItem"
    ADD CONSTRAINT "SupplyItem_eventId_id_key" UNIQUE ("eventId", id);

--
-- Name: SupplyItem SupplyItem_eventId_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyItem"
    ADD CONSTRAINT "SupplyItem_eventId_name_key" UNIQUE ("eventId", name);

--
-- Name: SupplyItem SupplyItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyItem"
    ADD CONSTRAINT "SupplyItem_pkey" PRIMARY KEY (id);

--
-- Name: SupplyTemplateItem SupplyTemplateItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplateItem"
    ADD CONSTRAINT "SupplyTemplateItem_pkey" PRIMARY KEY (id);

--
-- Name: SupplyTemplateItem SupplyTemplateItem_templateId_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplateItem"
    ADD CONSTRAINT "SupplyTemplateItem_templateId_name_key" UNIQUE ("templateId", name);

--
-- Name: SupplyTemplate SupplyTemplate_eventId_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplate"
    ADD CONSTRAINT "SupplyTemplate_eventId_key_key" UNIQUE ("eventId", key);

--
-- Name: SupplyTemplate SupplyTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplate"
    ADD CONSTRAINT "SupplyTemplate_pkey" PRIMARY KEY (id);

--
-- Name: TaskActivity TaskActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskActivity"
    ADD CONSTRAINT "TaskActivity_pkey" PRIMARY KEY (id);

--
-- Name: TaskAssignment TaskAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskAssignment"
    ADD CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId", "userId");

--
-- Name: TaskComment TaskComment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskComment"
    ADD CONSTRAINT "TaskComment_pkey" PRIMARY KEY (id);

--
-- Name: TaskLink TaskLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskLink"
    ADD CONSTRAINT "TaskLink_pkey" PRIMARY KEY (id);

--
-- Name: TaskWatcher TaskWatcher_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskWatcher"
    ADD CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("taskId", "userId");

--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);

--
-- Name: TimelineDependency TimelineDependency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineDependency"
    ADD CONSTRAINT "TimelineDependency_pkey" PRIMARY KEY (id);

--
-- Name: TimelineImportBatch TimelineImportBatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineImportBatch"
    ADD CONSTRAINT "TimelineImportBatch_pkey" PRIMARY KEY (id);

--
-- Name: TimelineItem TimelineItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineItem"
    ADD CONSTRAINT "TimelineItem_pkey" PRIMARY KEY (id);

--
-- Name: UserDashboardLayout UserDashboardLayout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserDashboardLayout"
    ADD CONSTRAINT "UserDashboardLayout_pkey" PRIMARY KEY (id);

--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

--
-- Name: BudgetActivity_actorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetActivity_actorUserId_idx" ON public."BudgetActivity" USING btree ("actorUserId");

--
-- Name: BudgetActivity_budgetId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetActivity_budgetId_createdAt_idx" ON public."BudgetActivity" USING btree ("budgetId", "createdAt");

--
-- Name: BudgetApproval_actedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetApproval_actedByUserId_idx" ON public."BudgetApproval" USING btree ("actedByUserId");

--
-- Name: BudgetApproval_budgetVersionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetApproval_budgetVersionId_idx" ON public."BudgetApproval" USING btree ("budgetVersionId");

--
-- Name: BudgetCategoryTarget_budgetId_categoryKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BudgetCategoryTarget_budgetId_categoryKey_key" ON public."BudgetCategoryTarget" USING btree ("budgetId", "categoryKey");

--
-- Name: BudgetCategoryTarget_budgetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetCategoryTarget_budgetId_idx" ON public."BudgetCategoryTarget" USING btree ("budgetId");

--
-- Name: BudgetGroup_budgetId_normalizedName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BudgetGroup_budgetId_normalizedName_key" ON public."BudgetGroup" USING btree ("budgetId", "normalizedName");

--
-- Name: BudgetGroup_budgetId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetGroup_budgetId_sortOrder_idx" ON public."BudgetGroup" USING btree ("budgetId", "sortOrder");

--
-- Name: BudgetItem_budgetVersionId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetItem_budgetVersionId_category_idx" ON public."BudgetItem" USING btree ("budgetVersionId", category);

--
-- Name: BudgetItem_budgetVersionId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetItem_budgetVersionId_status_idx" ON public."BudgetItem" USING btree ("budgetVersionId", status);

--
-- Name: BudgetLineItem_budgetId_approval_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetLineItem_budgetId_approval_idx" ON public."BudgetLineItem" USING btree ("budgetId", approval);

--
-- Name: BudgetLineItem_budgetId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetLineItem_budgetId_category_idx" ON public."BudgetLineItem" USING btree ("budgetId", category);

--
-- Name: BudgetLineItem_budgetId_groupId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetLineItem_budgetId_groupId_idx" ON public."BudgetLineItem" USING btree ("budgetId", "groupId");

--
-- Name: BudgetLineItem_budgetId_matrixRowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetLineItem_budgetId_matrixRowId_idx" ON public."BudgetLineItem" USING btree ("budgetId", "matrixRowId");

--
-- Name: BudgetLineItem_budgetId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetLineItem_budgetId_sortOrder_idx" ON public."BudgetLineItem" USING btree ("budgetId", "sortOrder");

--
-- Name: BudgetLineItem_budgetId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetLineItem_budgetId_status_idx" ON public."BudgetLineItem" USING btree ("budgetId", status);

--
-- Name: BudgetSubmissionLineItem_budgetLineItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetSubmissionLineItem_budgetLineItemId_idx" ON public."BudgetSubmissionLineItem" USING btree ("budgetLineItemId");

--
-- Name: BudgetSubmissionRecipient_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetSubmissionRecipient_userId_idx" ON public."BudgetSubmissionRecipient" USING btree ("userId");

--
-- Name: BudgetSubmission_budgetId_submittedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetSubmission_budgetId_submittedAt_idx" ON public."BudgetSubmission" USING btree ("budgetId", "submittedAt");

--
-- Name: BudgetSubmission_budgetVersionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetSubmission_budgetVersionId_idx" ON public."BudgetSubmission" USING btree ("budgetVersionId");

--
-- Name: BudgetVersion_budgetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetVersion_budgetId_idx" ON public."BudgetVersion" USING btree ("budgetId");

--
-- Name: BudgetVersion_budgetId_versionNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BudgetVersion_budgetId_versionNumber_key" ON public."BudgetVersion" USING btree ("budgetId", "versionNumber");

--
-- Name: BudgetVersion_createdByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BudgetVersion_createdByUserId_idx" ON public."BudgetVersion" USING btree ("createdByUserId");

--
-- Name: Budget_approvedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Budget_approvedByUserId_idx" ON public."Budget" USING btree ("approvedByUserId");

--
-- Name: Budget_currentVersionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Budget_currentVersionId_idx" ON public."Budget" USING btree ("currentVersionId");

--
-- Name: Budget_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Budget_eventId_key" ON public."Budget" USING btree ("eventId");

--
-- Name: Budget_rejectedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Budget_rejectedByUserId_idx" ON public."Budget" USING btree ("rejectedByUserId");

--
-- Name: Budget_submittedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Budget_submittedByUserId_idx" ON public."Budget" USING btree ("submittedByUserId");

--
-- Name: Client_orgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Client_orgId_idx" ON public."Client" USING btree ("orgId");

--
-- Name: Client_orgId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Client_orgId_slug_key" ON public."Client" USING btree ("orgId", slug);

--
-- Name: CopilotAuditLog_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CopilotAuditLog_eventId_createdAt_idx" ON public."CopilotAuditLog" USING btree ("eventId", "createdAt");

--
-- Name: CopilotAuditLog_orgId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CopilotAuditLog_orgId_createdAt_idx" ON public."CopilotAuditLog" USING btree ("orgId", "createdAt");

--
-- Name: CopilotAuditLog_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CopilotAuditLog_status_createdAt_idx" ON public."CopilotAuditLog" USING btree (status, "createdAt");

--
-- Name: CopilotAuditLog_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CopilotAuditLog_userId_createdAt_idx" ON public."CopilotAuditLog" USING btree ("userId", "createdAt");

--
-- Name: Deadline_dependsOnDeadlineId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deadline_dependsOnDeadlineId_idx" ON public."Deadline" USING btree ("dependsOnDeadlineId");

--
-- Name: Deadline_eventId_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deadline_eventId_dueAt_idx" ON public."Deadline" USING btree ("eventId", "dueAt");

--
-- Name: Deadline_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deadline_eventId_status_idx" ON public."Deadline" USING btree ("eventId", status);

--
-- Name: DocumentApprovalRecipient_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentApprovalRecipient_userId_idx" ON public."DocumentApprovalRecipient" USING btree ("userId");

--
-- Name: DocumentApproval_actedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentApproval_actedByUserId_idx" ON public."DocumentApproval" USING btree ("actedByUserId");

--
-- Name: DocumentApproval_documentId_actedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentApproval_documentId_actedAt_idx" ON public."DocumentApproval" USING btree ("documentId", "actedAt");

--
-- Name: DocumentCategory_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentCategory_eventId_idx" ON public."DocumentCategory" USING btree ("eventId");

--
-- Name: DocumentCategory_eventId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DocumentCategory_eventId_slug_key" ON public."DocumentCategory" USING btree ("eventId", slug);

--
-- Name: DocumentLink_documentId_linkType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentLink_documentId_linkType_idx" ON public."DocumentLink" USING btree ("documentId", "linkType");

--
-- Name: DocumentLink_documentId_linkType_linkedId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DocumentLink_documentId_linkType_linkedId_key" ON public."DocumentLink" USING btree ("documentId", "linkType", "linkedId");

--
-- Name: DocumentLink_linkType_linkedId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentLink_linkType_linkedId_idx" ON public."DocumentLink" USING btree ("linkType", "linkedId");

--
-- Name: DocumentTagOnDocument_tagId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentTagOnDocument_tagId_idx" ON public."DocumentTagOnDocument" USING btree ("tagId");

--
-- Name: DocumentTag_orgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentTag_orgId_idx" ON public."DocumentTag" USING btree ("orgId");

--
-- Name: DocumentTag_orgId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DocumentTag_orgId_name_key" ON public."DocumentTag" USING btree ("orgId", name);

--
-- Name: DocumentVersion_documentId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentVersion_documentId_createdAt_idx" ON public."DocumentVersion" USING btree ("documentId", "createdAt");

--
-- Name: DocumentVersion_documentId_versionNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON public."DocumentVersion" USING btree ("documentId", "versionNumber");

--
-- Name: DocumentVersion_uploadedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentVersion_uploadedByUserId_idx" ON public."DocumentVersion" USING btree ("uploadedByUserId");

--
-- Name: Document_eventId_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Document_eventId_categoryId_idx" ON public."Document" USING btree ("eventId", "categoryId");

--
-- Name: Document_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Document_eventId_status_idx" ON public."Document" USING btree ("eventId", status);

--
-- Name: Document_eventId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Document_eventId_updatedAt_idx" ON public."Document" USING btree ("eventId", "updatedAt");

--
-- Name: Document_orgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Document_orgId_idx" ON public."Document" USING btree ("orgId");

--
-- Name: EventActivity_actorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActivity_actorUserId_idx" ON public."EventActivity" USING btree ("actorUserId");

--
-- Name: EventActivity_eventId_actionType_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActivity_eventId_actionType_createdAt_id_idx" ON public."EventActivity" USING btree ("eventId", "actionType", "createdAt", id);

--
-- Name: EventActivity_eventId_actorUserId_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActivity_eventId_actorUserId_createdAt_id_idx" ON public."EventActivity" USING btree ("eventId", "actorUserId", "createdAt", id);

--
-- Name: EventActivity_eventId_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActivity_eventId_createdAt_id_idx" ON public."EventActivity" USING btree ("eventId", "createdAt", id);

--
-- Name: EventActivity_eventId_module_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventActivity_eventId_module_createdAt_id_idx" ON public."EventActivity" USING btree ("eventId", module, "createdAt", id);

--
-- Name: EventActivity_eventId_sourceRecordType_sourceRecordId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventActivity_eventId_sourceRecordType_sourceRecordId_key" ON public."EventActivity" USING btree ("eventId", "sourceRecordType", "sourceRecordId");

--
-- Name: EventAttendeeSessionEnrollment_event_attendee_session_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAttendeeSessionEnrollment_event_attendee_session_key" ON public."EventAttendeeSessionEnrollment" USING btree ("eventId", "attendeeId", "matrixRowId");

--
-- Name: EventAttendeeSessionEnrollment_event_attendee_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendeeSessionEnrollment_event_attendee_status_idx" ON public."EventAttendeeSessionEnrollment" USING btree ("eventId", "attendeeId", "enrollmentStatus");

--
-- Name: EventAttendeeSessionEnrollment_event_integrationConnection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendeeSessionEnrollment_event_integrationConnection_idx" ON public."EventAttendeeSessionEnrollment" USING btree ("eventId", "integrationConnectionId");

--
-- Name: EventAttendeeSessionEnrollment_event_matrix_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendeeSessionEnrollment_event_matrix_status_idx" ON public."EventAttendeeSessionEnrollment" USING btree ("eventId", "matrixRowId", "enrollmentStatus");

--
-- Name: EventAttendeeSessionEnrollment_event_registrationRecord_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendeeSessionEnrollment_event_registrationRecord_idx" ON public."EventAttendeeSessionEnrollment" USING btree ("eventId", "registrationRecordId");

--
-- Name: EventAttendeeSessionEnrollment_external_registration_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAttendeeSessionEnrollment_external_registration_key" ON public."EventAttendeeSessionEnrollment" USING btree ("eventId", "integrationConnectionId", "externalSessionRegistrationId") WHERE (("integrationConnectionId" IS NOT NULL) AND ("externalSessionRegistrationId" IS NOT NULL));

--
-- Name: EventAttendee_directoryPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendee_directoryPersonId_idx" ON public."EventAttendee" USING btree ("directoryPersonId");

--
-- Name: EventAttendee_directoryPersonId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventAttendee_directoryPersonId_key" ON public."EventAttendee" USING btree ("directoryPersonId");

--
-- Name: EventAttendee_eventId_attendanceStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendee_eventId_attendanceStatus_idx" ON public."EventAttendee" USING btree ("eventId", "attendanceStatus");

--
-- Name: EventAttendee_eventId_registrationStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendee_eventId_registrationStatus_idx" ON public."EventAttendee" USING btree ("eventId", "registrationStatus");

--
-- Name: EventAttendee_eventId_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendee_eventId_source_idx" ON public."EventAttendee" USING btree ("eventId", source);

--
-- Name: EventAttendee_eventId_syncStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventAttendee_eventId_syncStatus_idx" ON public."EventAttendee" USING btree ("eventId", "syncStatus");

--
-- Name: EventDashboardLayoutMigration_eventId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDashboardLayoutMigration_eventId_userId_key" ON public."EventDashboardLayoutMigration" USING btree ("eventId", "userId");

--
-- Name: EventDashboardLayoutMigration_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDashboardLayoutMigration_userId_idx" ON public."EventDashboardLayoutMigration" USING btree ("userId");

--
-- Name: EventDashboardViewPreference_userId_isPersonalDefault_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDashboardViewPreference_userId_isPersonalDefault_idx" ON public."EventDashboardViewPreference" USING btree ("userId", "isPersonalDefault");

--
-- Name: EventDashboardViewPreference_viewId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDashboardViewPreference_viewId_userId_key" ON public."EventDashboardViewPreference" USING btree ("viewId", "userId");

--
-- Name: EventDashboardView_eventId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDashboardView_eventId_archivedAt_idx" ON public."EventDashboardView" USING btree ("eventId", "archivedAt");

--
-- Name: EventDashboardView_eventId_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDashboardView_eventId_visibility_idx" ON public."EventDashboardView" USING btree ("eventId", visibility);

--
-- Name: EventDashboardView_one_active_team_default_per_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDashboardView_one_active_team_default_per_event" ON public."EventDashboardView" USING btree ("eventId") WHERE (("isTeamDefault" = true) AND ("archivedAt" IS NULL));

--
-- Name: EventDashboardView_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDashboardView_organizationId_idx" ON public."EventDashboardView" USING btree ("organizationId");

--
-- Name: EventDashboardView_ownerUserId_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDashboardView_ownerUserId_eventId_idx" ON public."EventDashboardView" USING btree ("ownerUserId", "eventId");

--
-- Name: EventDirectoryExternalIdentity_eventId_provider_externalPer_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDirectoryExternalIdentity_eventId_provider_externalPer_key" ON public."EventDirectoryExternalIdentity" USING btree ("eventId", provider, "externalPersonId");

--
-- Name: EventDirectoryExternalIdentity_eventId_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryExternalIdentity_eventId_provider_idx" ON public."EventDirectoryExternalIdentity" USING btree ("eventId", provider);

--
-- Name: EventDirectoryExternalIdentity_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryExternalIdentity_personId_idx" ON public."EventDirectoryExternalIdentity" USING btree ("personId");

--
-- Name: EventDirectoryImportBatch_eventId_uploadedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryImportBatch_eventId_uploadedAt_idx" ON public."EventDirectoryImportBatch" USING btree ("eventId", "uploadedAt");

--
-- Name: EventDirectoryImportBatch_sourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryImportBatch_sourceId_idx" ON public."EventDirectoryImportBatch" USING btree ("sourceId");

--
-- Name: EventDirectoryImportRow_batchId_rowNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryImportRow_batchId_rowNumber_idx" ON public."EventDirectoryImportRow" USING btree ("batchId", "rowNumber");

--
-- Name: EventDirectoryImportRow_eventId_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryImportRow_eventId_result_idx" ON public."EventDirectoryImportRow" USING btree ("eventId", result);

--
-- Name: EventDirectoryModuleLink_eventId_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryModuleLink_eventId_module_idx" ON public."EventDirectoryModuleLink" USING btree ("eventId", module);

--
-- Name: EventDirectoryModuleLink_eventId_module_moduleRecordId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDirectoryModuleLink_eventId_module_moduleRecordId_key" ON public."EventDirectoryModuleLink" USING btree ("eventId", module, "moduleRecordId");

--
-- Name: EventDirectoryModuleLink_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryModuleLink_personId_idx" ON public."EventDirectoryModuleLink" USING btree ("personId");

--
-- Name: EventDirectoryPerson_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryPerson_clientId_idx" ON public."EventDirectoryPerson" USING btree ("clientId");

--
-- Name: EventDirectoryPerson_eventId_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryPerson_eventId_company_idx" ON public."EventDirectoryPerson" USING btree ("eventId", company);

--
-- Name: EventDirectoryPerson_eventId_displayName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryPerson_eventId_displayName_idx" ON public."EventDirectoryPerson" USING btree ("eventId", "displayName");

--
-- Name: EventDirectoryPerson_eventId_normalizedEmail_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryPerson_eventId_normalizedEmail_idx" ON public."EventDirectoryPerson" USING btree ("eventId", "normalizedEmail");

--
-- Name: EventDirectoryPerson_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryPerson_eventId_status_idx" ON public."EventDirectoryPerson" USING btree ("eventId", status);

--
-- Name: EventDirectoryPerson_orgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryPerson_orgId_idx" ON public."EventDirectoryPerson" USING btree ("orgId");

--
-- Name: EventDirectoryRole_eventId_personId_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDirectoryRole_eventId_personId_role_key" ON public."EventDirectoryRole" USING btree ("eventId", "personId", role);

--
-- Name: EventDirectoryRole_eventId_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryRole_eventId_role_idx" ON public."EventDirectoryRole" USING btree ("eventId", role);

--
-- Name: EventDirectoryRole_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryRole_personId_idx" ON public."EventDirectoryRole" USING btree ("personId");

--
-- Name: EventDirectoryRole_sourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectoryRole_sourceId_idx" ON public."EventDirectoryRole" USING btree ("sourceId");

--
-- Name: EventDirectorySource_eventId_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectorySource_eventId_label_idx" ON public."EventDirectorySource" USING btree ("eventId", label);

--
-- Name: EventDirectorySource_eventId_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventDirectorySource_eventId_type_idx" ON public."EventDirectorySource" USING btree ("eventId", type);

--
-- Name: EventDirectorySource_eventId_type_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventDirectorySource_eventId_type_label_key" ON public."EventDirectorySource" USING btree ("eventId", type, label);

--
-- Name: EventExternalIdentity_attendeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventExternalIdentity_attendeeId_idx" ON public."EventExternalIdentity" USING btree ("attendeeId");

--
-- Name: EventExternalIdentity_directoryPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventExternalIdentity_directoryPersonId_idx" ON public."EventExternalIdentity" USING btree ("directoryPersonId");

--
-- Name: EventExternalIdentity_eventId_provider_externalObjectType_e_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventExternalIdentity_eventId_provider_externalObjectType_e_key" ON public."EventExternalIdentity" USING btree ("eventId", provider, "externalObjectType", "externalObjectId");

--
-- Name: EventExternalIdentity_eventId_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventExternalIdentity_eventId_provider_idx" ON public."EventExternalIdentity" USING btree ("eventId", provider);

--
-- Name: EventFnbCatalogItemClaim_eventId_kind_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItemClaim_eventId_kind_code_idx" ON public."EventFnbCatalogItemClaim" USING btree ("eventId", kind, code);

--
-- Name: EventFnbCatalogItemClaim_itemId_kind_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventFnbCatalogItemClaim_itemId_kind_code_key" ON public."EventFnbCatalogItemClaim" USING btree ("itemId", kind, code);

--
-- Name: EventFnbCatalogItemClaim_itemId_verificationStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItemClaim_itemId_verificationStatus_idx" ON public."EventFnbCatalogItemClaim" USING btree ("itemId", "verificationStatus");

--
-- Name: EventFnbCatalogItemSafetyRevision_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItemSafetyRevision_eventId_createdAt_idx" ON public."EventFnbCatalogItemSafetyRevision" USING btree ("eventId", "createdAt");

--
-- Name: EventFnbCatalogItemSafetyRevision_itemId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItemSafetyRevision_itemId_createdAt_idx" ON public."EventFnbCatalogItemSafetyRevision" USING btree ("itemId", "createdAt");

--
-- Name: EventFnbCatalogItem_eventId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_eventId_archivedAt_idx" ON public."EventFnbCatalogItem" USING btree ("eventId", "archivedAt");

--
-- Name: EventFnbCatalogItem_eventId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_eventId_category_idx" ON public."EventFnbCatalogItem" USING btree ("eventId", category);

--
-- Name: EventFnbCatalogItem_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_eventId_idx" ON public."EventFnbCatalogItem" USING btree ("eventId");

--
-- Name: EventFnbCatalogItem_eventId_verificationStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_eventId_verificationStatus_idx" ON public."EventFnbCatalogItem" USING btree ("eventId", "verificationStatus");

--
-- Name: EventFnbCatalogItem_modificationVerifiedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_modificationVerifiedByUserId_idx" ON public."EventFnbCatalogItem" USING btree ("modificationVerifiedByUserId");

--
-- Name: EventFnbCatalogItem_sourceMenuId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_sourceMenuId_idx" ON public."EventFnbCatalogItem" USING btree ("sourceMenuId");

--
-- Name: EventFnbCatalogItem_verifiedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbCatalogItem_verifiedByUserId_idx" ON public."EventFnbCatalogItem" USING btree ("verifiedByUserId");

--
-- Name: EventFnbExportRecord_eventId_recipient_generatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbExportRecord_eventId_recipient_generatedAt_idx" ON public."EventFnbExportRecord" USING btree ("eventId", recipient, "generatedAt");

--
-- Name: EventFnbExportRecord_eventId_recipient_projectionKey_projection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbExportRecord_eventId_recipient_projectionKey_projection" ON public."EventFnbExportRecord" USING btree ("eventId", recipient, "projectionKey", "projectionVersion");

--
-- Name: EventFnbExportRecord_eventId_sourceDataVersion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbExportRecord_eventId_sourceDataVersion_idx" ON public."EventFnbExportRecord" USING btree ("eventId", "sourceDataVersion");

--
-- Name: EventFnbSourceMenuParseJob_eventId_status_runAfter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenuParseJob_eventId_status_runAfter_idx" ON public."EventFnbSourceMenuParseJob" USING btree ("eventId", status, "runAfter");

--
-- Name: EventFnbSourceMenuParseJob_lockedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenuParseJob_lockedAt_idx" ON public."EventFnbSourceMenuParseJob" USING btree ("lockedAt");

--
-- Name: EventFnbSourceMenuParseJob_sourceMenuId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventFnbSourceMenuParseJob_sourceMenuId_key" ON public."EventFnbSourceMenuParseJob" USING btree ("sourceMenuId");

--
-- Name: EventFnbSourceMenuParseJob_status_runAfter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenuParseJob_status_runAfter_idx" ON public."EventFnbSourceMenuParseJob" USING btree (status, "runAfter");

--
-- Name: EventFnbSourceMenuParseTarget_eventId_sourceMenuId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenuParseTarget_eventId_sourceMenuId_idx" ON public."EventFnbSourceMenuParseTarget" USING btree ("eventId", "sourceMenuId");

--
-- Name: EventFnbSourceMenuParseTarget_jobId_status_startPage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenuParseTarget_jobId_status_startPage_idx" ON public."EventFnbSourceMenuParseTarget" USING btree ("jobId", status, "startPage");

--
-- Name: EventFnbSourceMenuParseTarget_jobId_targetKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventFnbSourceMenuParseTarget_jobId_targetKey_key" ON public."EventFnbSourceMenuParseTarget" USING btree ("jobId", "targetKey");

--
-- Name: EventFnbSourceMenu_baseSourceMenuId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_baseSourceMenuId_idx" ON public."EventFnbSourceMenu" USING btree ("baseSourceMenuId");

--
-- Name: EventFnbSourceMenu_eventId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_eventId_archivedAt_idx" ON public."EventFnbSourceMenu" USING btree ("eventId", "archivedAt");

--
-- Name: EventFnbSourceMenu_eventId_operationalStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_eventId_operationalStatus_idx" ON public."EventFnbSourceMenu" USING btree ("eventId", "operationalStatus");

--
-- Name: EventFnbSourceMenu_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_eventId_status_idx" ON public."EventFnbSourceMenu" USING btree ("eventId", status);

--
-- Name: EventFnbSourceMenu_objectKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_objectKey_idx" ON public."EventFnbSourceMenu" USING btree ("objectKey");

--
-- Name: EventFnbSourceMenu_ownerUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_ownerUserId_idx" ON public."EventFnbSourceMenu" USING btree ("ownerUserId");

--
-- Name: EventFnbSourceMenu_verifiedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventFnbSourceMenu_verifiedByUserId_idx" ON public."EventFnbSourceMenu" USING btree ("verifiedByUserId");

--
-- Name: EventImportIntent_orgId_requestedByUserId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventImportIntent_orgId_requestedByUserId_idempotencyKey_key" ON public."EventImportIntent" USING btree ("orgId", "requestedByUserId", "idempotencyKey");

--
-- Name: EventImportIntent_orgId_status_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventImportIntent_orgId_status_createdAt_idx" ON public."EventImportIntent" USING btree ("orgId", status, "createdAt");

--
-- Name: EventImportIntent_requestedByUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventImportIntent_requestedByUserId_createdAt_idx" ON public."EventImportIntent" USING btree ("requestedByUserId", "createdAt");

--
-- Name: EventImportResult_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventImportResult_eventId_key" ON public."EventImportResult" USING btree ("eventId");

--
-- Name: EventImportResult_intentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventImportResult_intentId_key" ON public."EventImportResult" USING btree ("intentId");

--
-- Name: EventImportResult_orgId_status_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventImportResult_orgId_status_completedAt_idx" ON public."EventImportResult" USING btree ("orgId", status, "completedAt");

--
-- Name: EventImportResult_requestedByUserId_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventImportResult_requestedByUserId_completedAt_idx" ON public."EventImportResult" USING btree ("requestedByUserId", "completedAt");

--
-- Name: EventIntegrationConnection_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntegrationConnection_eventId_idx" ON public."EventIntegrationConnection" USING btree ("eventId");

--
-- Name: EventIntegrationConnection_eventId_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventIntegrationConnection_eventId_provider_key" ON public."EventIntegrationConnection" USING btree ("eventId", provider);

--
-- Name: EventIntegrationMetric_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventIntegrationMetric_eventId_idx" ON public."EventIntegrationMetric" USING btree ("eventId");

--
-- Name: EventIntegrationMetric_eventId_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventIntegrationMetric_eventId_type_key" ON public."EventIntegrationMetric" USING btree ("eventId", type);

--
-- Name: EventMember_eventId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventMember_eventId_userId_key" ON public."EventMember" USING btree ("eventId", "userId");

--
-- Name: EventMember_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventMember_userId_idx" ON public."EventMember" USING btree ("userId");

--
-- Name: EventPerson_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventPerson_eventId_idx" ON public."EventPerson" USING btree ("eventId");

--
-- Name: EventPerson_eventId_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventPerson_eventId_role_idx" ON public."EventPerson" USING btree ("eventId", role);

--
-- Name: EventRegistrationRecord_attendeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventRegistrationRecord_attendeeId_idx" ON public."EventRegistrationRecord" USING btree ("attendeeId");

--
-- Name: EventRegistrationRecord_directoryPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventRegistrationRecord_directoryPersonId_idx" ON public."EventRegistrationRecord" USING btree ("directoryPersonId");

--
-- Name: EventRegistrationRecord_eventId_provider_externalRegistrati_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EventRegistrationRecord_eventId_provider_externalRegistrati_key" ON public."EventRegistrationRecord" USING btree ("eventId", provider, "externalRegistrationId");

--
-- Name: EventRegistrationRecord_eventId_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EventRegistrationRecord_eventId_provider_idx" ON public."EventRegistrationRecord" USING btree ("eventId", provider);

--
-- Name: Event_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_clientId_idx" ON public."Event" USING btree ("clientId");

--
-- Name: Event_createdByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_createdByUserId_idx" ON public."Event" USING btree ("createdByUserId");

--
-- Name: Event_orgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_orgId_idx" ON public."Event" USING btree ("orgId");

--
-- Name: Event_sessionRequirementTemplateId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_sessionRequirementTemplateId_idx" ON public."Event" USING btree ("sessionRequirementTemplateId");

--
-- Name: FnbParserFeedback_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FnbParserFeedback_clientId_idx" ON public."FnbParserFeedback" USING btree ("clientId");

--
-- Name: FnbParserFeedback_documentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FnbParserFeedback_documentId_idx" ON public."FnbParserFeedback" USING btree ("documentId");

--
-- Name: FnbParserFeedback_orgId_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FnbParserFeedback_orgId_eventId_createdAt_idx" ON public."FnbParserFeedback" USING btree ("orgId", "eventId", "createdAt");

--
-- Name: FnbParserFeedback_sourceMenuFileName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FnbParserFeedback_sourceMenuFileName_idx" ON public."FnbParserFeedback" USING btree ("sourceMenuFileName");

--
-- Name: MarketingAudienceRecipient_audienceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingAudienceRecipient_audienceId_idx" ON public."MarketingAudienceRecipient" USING btree ("audienceId");

--
-- Name: MarketingAudienceRecipient_audienceId_normalizedEmail_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MarketingAudienceRecipient_audienceId_normalizedEmail_key" ON public."MarketingAudienceRecipient" USING btree ("audienceId", "normalizedEmail");

--
-- Name: MarketingAudienceRecipient_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingAudienceRecipient_eventId_idx" ON public."MarketingAudienceRecipient" USING btree ("eventId");

--
-- Name: MarketingAudience_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingAudience_eventId_idx" ON public."MarketingAudience" USING btree ("eventId");

--
-- Name: MarketingAudience_eventId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingAudience_eventId_updatedAt_idx" ON public."MarketingAudience" USING btree ("eventId", "updatedAt");

--
-- Name: MarketingCampaign_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingCampaign_eventId_status_idx" ON public."MarketingCampaign" USING btree ("eventId", status);

--
-- Name: MarketingCampaign_eventId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingCampaign_eventId_updatedAt_idx" ON public."MarketingCampaign" USING btree ("eventId", "updatedAt");

--
-- Name: MarketingCampaign_marketingPlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingCampaign_marketingPlanId_idx" ON public."MarketingCampaign" USING btree ("marketingPlanId");

--
-- Name: MarketingCampaign_ownerUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingCampaign_ownerUserId_idx" ON public."MarketingCampaign" USING btree ("ownerUserId");

--
-- Name: MarketingEmailEvent_emailSendId_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailEvent_emailSendId_type_idx" ON public."MarketingEmailEvent" USING btree ("emailSendId", type);

--
-- Name: MarketingEmailEvent_emailSendRecipientId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailEvent_emailSendRecipientId_occurredAt_idx" ON public."MarketingEmailEvent" USING btree ("emailSendRecipientId", "occurredAt");

--
-- Name: MarketingEmailEvent_eventId_occurredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailEvent_eventId_occurredAt_idx" ON public."MarketingEmailEvent" USING btree ("eventId", "occurredAt");

--
-- Name: MarketingEmailEvent_sgEventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MarketingEmailEvent_sgEventId_key" ON public."MarketingEmailEvent" USING btree ("sgEventId");

--
-- Name: MarketingEmailSendRecipient_emailSendId_normalizedEmail_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MarketingEmailSendRecipient_emailSendId_normalizedEmail_key" ON public."MarketingEmailSendRecipient" USING btree ("emailSendId", "normalizedEmail");

--
-- Name: MarketingEmailSendRecipient_eventId_emailSendId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSendRecipient_eventId_emailSendId_idx" ON public."MarketingEmailSendRecipient" USING btree ("eventId", "emailSendId");

--
-- Name: MarketingEmailSendRecipient_sendgridMessageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSendRecipient_sendgridMessageId_idx" ON public."MarketingEmailSendRecipient" USING btree ("sendgridMessageId");

--
-- Name: MarketingEmailSendRecipient_sourceAudienceRecipientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSendRecipient_sourceAudienceRecipientId_idx" ON public."MarketingEmailSendRecipient" USING btree ("sourceAudienceRecipientId");

--
-- Name: MarketingEmailSend_audienceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSend_audienceId_idx" ON public."MarketingEmailSend" USING btree ("audienceId");

--
-- Name: MarketingEmailSend_campaignId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSend_campaignId_idx" ON public."MarketingEmailSend" USING btree ("campaignId");

--
-- Name: MarketingEmailSend_eventId_scheduledSendAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSend_eventId_scheduledSendAt_idx" ON public."MarketingEmailSend" USING btree ("eventId", "scheduledSendAt");

--
-- Name: MarketingEmailSend_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSend_eventId_status_idx" ON public."MarketingEmailSend" USING btree ("eventId", status);

--
-- Name: MarketingEmailSend_eventId_status_scheduledSendAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSend_eventId_status_scheduledSendAt_idx" ON public."MarketingEmailSend" USING btree ("eventId", status, "scheduledSendAt");

--
-- Name: MarketingEmailSend_ownerUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingEmailSend_ownerUserId_idx" ON public."MarketingEmailSend" USING btree ("ownerUserId");

--
-- Name: MarketingKpiSnapshot_campaignId_capturedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingKpiSnapshot_campaignId_capturedAt_idx" ON public."MarketingKpiSnapshot" USING btree ("campaignId", "capturedAt");

--
-- Name: MarketingKpiSnapshot_emailSendId_capturedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingKpiSnapshot_emailSendId_capturedAt_idx" ON public."MarketingKpiSnapshot" USING btree ("emailSendId", "capturedAt");

--
-- Name: MarketingKpiSnapshot_eventId_capturedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingKpiSnapshot_eventId_capturedAt_idx" ON public."MarketingKpiSnapshot" USING btree ("eventId", "capturedAt");

--
-- Name: MarketingPlan_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MarketingPlan_eventId_key" ON public."MarketingPlan" USING btree ("eventId");

--
-- Name: MarketingPlan_ownerUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingPlan_ownerUserId_idx" ON public."MarketingPlan" USING btree ("ownerUserId");

--
-- Name: MarketingSuppression_eventId_normalizedEmail_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MarketingSuppression_eventId_normalizedEmail_key" ON public."MarketingSuppression" USING btree ("eventId", "normalizedEmail");

--
-- Name: MarketingSuppression_eventId_reason_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MarketingSuppression_eventId_reason_idx" ON public."MarketingSuppression" USING btree ("eventId", reason);

--
-- Name: MatrixImportBatch_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixImportBatch_eventId_createdAt_idx" ON public."MatrixImportBatch" USING btree ("eventId", "createdAt");

--
-- Name: MatrixImportBatch_eventId_requestedByUserId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MatrixImportBatch_eventId_requestedByUserId_idempotencyKey_key" ON public."MatrixImportBatch" USING btree ("eventId", "requestedByUserId", "idempotencyKey");

--
-- Name: MatrixImportBatch_requestedByUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixImportBatch_requestedByUserId_createdAt_idx" ON public."MatrixImportBatch" USING btree ("requestedByUserId", "createdAt");

--
-- Name: MatrixRowSpeaker_eventPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRowSpeaker_eventPersonId_idx" ON public."MatrixRowSpeaker" USING btree ("eventPersonId");

--
-- Name: MatrixRowSpeaker_matrixRowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRowSpeaker_matrixRowId_idx" ON public."MatrixRowSpeaker" USING btree ("matrixRowId");

--
-- Name: MatrixRowStaffAssignment_eventPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRowStaffAssignment_eventPersonId_idx" ON public."MatrixRowStaffAssignment" USING btree ("eventPersonId");

--
-- Name: MatrixRowStaffAssignment_matrixRowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRowStaffAssignment_matrixRowId_idx" ON public."MatrixRowStaffAssignment" USING btree ("matrixRowId");

--
-- Name: MatrixRow_eventId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRow_eventId_archivedAt_idx" ON public."MatrixRow" USING btree ("eventId", "archivedAt");

--
-- Name: MatrixRow_eventId_dayDate_roomId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRow_eventId_dayDate_roomId_idx" ON public."MatrixRow" USING btree ("eventId", "dayDate", "roomId");

--
-- Name: MatrixRow_eventId_dayDate_roomName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRow_eventId_dayDate_roomName_idx" ON public."MatrixRow" USING btree ("eventId", "dayDate", "roomName");

--
-- Name: MatrixRow_eventId_dayDate_startTime_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRow_eventId_dayDate_startTime_sortOrder_idx" ON public."MatrixRow" USING btree ("eventId", "dayDate", "startTime", "sortOrder");

--
-- Name: MatrixRow_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MatrixRow_eventId_idx" ON public."MatrixRow" USING btree ("eventId");

--
-- Name: Membership_orgId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON public."Membership" USING btree ("orgId", "userId");

--
-- Name: Membership_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Membership_userId_idx" ON public."Membership" USING btree ("userId");

--
-- Name: Notification_orgId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_orgId_createdAt_idx" ON public."Notification" USING btree ("orgId", "createdAt");

--
-- Name: Notification_userId_isRead_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON public."Notification" USING btree ("userId", "isRead", "createdAt");

--
-- Name: Organization_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Organization_slug_key" ON public."Organization" USING btree (slug);

--
-- Name: Room_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Room_eventId_idx" ON public."Room" USING btree ("eventId");

--
-- Name: Room_eventId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Room_eventId_name_key" ON public."Room" USING btree ("eventId", name);

--
-- Name: SeatingAssignment_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAssignment_eventId_idx" ON public."SeatingAssignment" USING btree ("eventId");

--
-- Name: SeatingAssignment_eventId_seatingPlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAssignment_eventId_seatingPlanId_idx" ON public."SeatingAssignment" USING btree ("eventId", "seatingPlanId");

--
-- Name: SeatingAssignment_eventId_tableId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAssignment_eventId_tableId_idx" ON public."SeatingAssignment" USING btree ("eventId", "tableId");

--
-- Name: SeatingAssignment_event_attendee_event_level_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SeatingAssignment_event_attendee_event_level_key" ON public."SeatingAssignment" USING btree ("eventId", "attendeeId") WHERE ("seatingPlanId" IS NULL);

--
-- Name: SeatingAssignment_event_attendee_plan_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SeatingAssignment_event_attendee_plan_key" ON public."SeatingAssignment" USING btree ("eventId", "attendeeId", "seatingPlanId") WHERE ("seatingPlanId" IS NOT NULL);

--
-- Name: SeatingAssignment_seatingPlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAssignment_seatingPlanId_idx" ON public."SeatingAssignment" USING btree ("seatingPlanId");

--
-- Name: SeatingAssignment_tableId_attendeeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SeatingAssignment_tableId_attendeeId_key" ON public."SeatingAssignment" USING btree ("tableId", "attendeeId");

--
-- Name: SeatingAssignment_tableId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAssignment_tableId_idx" ON public."SeatingAssignment" USING btree ("tableId");

--
-- Name: SeatingAssignment_tableId_seatIndex_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SeatingAssignment_tableId_seatIndex_key" ON public."SeatingAssignment" USING btree ("tableId", "seatIndex");

--
-- Name: SeatingAttendee_eventAttendeeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SeatingAttendee_eventAttendeeId_key" ON public."SeatingAttendee" USING btree ("eventAttendeeId");

--
-- Name: SeatingAttendee_eventId_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAttendee_eventId_email_idx" ON public."SeatingAttendee" USING btree ("eventId", email);

--
-- Name: SeatingAttendee_eventId_eventAttendeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAttendee_eventId_eventAttendeeId_idx" ON public."SeatingAttendee" USING btree ("eventId", "eventAttendeeId");

--
-- Name: SeatingAttendee_eventId_lastName_firstName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingAttendee_eventId_lastName_firstName_idx" ON public."SeatingAttendee" USING btree ("eventId", "lastName", "firstName");

--
-- Name: SeatingPlan_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingPlan_eventId_idx" ON public."SeatingPlan" USING btree ("eventId");

--
-- Name: SeatingPlan_eventId_matrixRowId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingPlan_eventId_matrixRowId_idx" ON public."SeatingPlan" USING btree ("eventId", "matrixRowId");

--
-- Name: SeatingPlan_matrixRowId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SeatingPlan_matrixRowId_key" ON public."SeatingPlan" USING btree ("matrixRowId");

--
-- Name: SeatingTable_eventId_seatingPlanId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingTable_eventId_seatingPlanId_sortOrder_idx" ON public."SeatingTable" USING btree ("eventId", "seatingPlanId", "sortOrder");

--
-- Name: SeatingTable_eventId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingTable_eventId_sortOrder_idx" ON public."SeatingTable" USING btree ("eventId", "sortOrder");

--
-- Name: SeatingTable_seatingPlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SeatingTable_seatingPlanId_idx" ON public."SeatingTable" USING btree ("seatingPlanId");

--
-- Name: SessionAVRequirement_sessionId_avType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionAVRequirement_sessionId_avType_idx" ON public."SessionAVRequirement" USING btree ("sessionId", "avType");

--
-- Name: SessionAVRequirement_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionAVRequirement_sessionId_idx" ON public."SessionAVRequirement" USING btree ("sessionId");

--
-- Name: SessionAgendaPublication_eventId_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionAgendaPublication_eventId_publishedAt_idx" ON public."SessionAgendaPublication" USING btree ("eventId", "publishedAt");

--
-- Name: SessionAgendaPublication_publishedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionAgendaPublication_publishedByUserId_idx" ON public."SessionAgendaPublication" USING btree ("publishedByUserId");

--
-- Name: SessionAgendaPublication_sessionId_publishedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionAgendaPublication_sessionId_publishedAt_idx" ON public."SessionAgendaPublication" USING btree ("sessionId", "publishedAt");

--
-- Name: SessionAgendaPublication_sessionId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionAgendaPublication_sessionId_version_key" ON public."SessionAgendaPublication" USING btree ("sessionId", version);

--
-- Name: SessionFnbAssignmentSafetyResolution_assignmentId_requirementId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionFnbAssignmentSafetyResolution_assignmentId_requirementId" ON public."SessionFnbAssignmentSafetyResolution" USING btree ("assignmentId", "requirementId");

--
-- Name: SessionFnbAssignmentSafetyResolution_eventId_sessionId_outcome_; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbAssignmentSafetyResolution_eventId_sessionId_outcome_" ON public."SessionFnbAssignmentSafetyResolution" USING btree ("eventId", "sessionId", outcome);

--
-- Name: SessionFnbAssignmentSafetyResolution_requirementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbAssignmentSafetyResolution_requirementId_idx" ON public."SessionFnbAssignmentSafetyResolution" USING btree ("requirementId");

--
-- Name: SessionFnbAssignmentSafetyResolution_sessionId_resolvedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbAssignmentSafetyResolution_sessionId_resolvedAt_idx" ON public."SessionFnbAssignmentSafetyResolution" USING btree ("sessionId", "resolvedAt");

--
-- Name: SessionFnbCatalogAssignmentTax_assignmentId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbCatalogAssignmentTax_assignmentId_sortOrder_idx" ON public."SessionFnbCatalogAssignmentTax" USING btree ("assignmentId", "sortOrder");

--
-- Name: SessionFnbCatalogAssignment_budgetLineItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionFnbCatalogAssignment_budgetLineItemId_key" ON public."SessionFnbCatalogAssignment" USING btree ("budgetLineItemId");

--
-- Name: SessionFnbCatalogAssignment_eventFnbCatalogItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbCatalogAssignment_eventFnbCatalogItemId_idx" ON public."SessionFnbCatalogAssignment" USING btree ("eventFnbCatalogItemId");

--
-- Name: SessionFnbCatalogAssignment_sessionId_eventFnbCatalogItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionFnbCatalogAssignment_sessionId_eventFnbCatalogItemId_key" ON public."SessionFnbCatalogAssignment" USING btree ("sessionId", "eventFnbCatalogItemId");

--
-- Name: SessionFnbCatalogAssignment_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbCatalogAssignment_sessionId_idx" ON public."SessionFnbCatalogAssignment" USING btree ("sessionId");

--
-- Name: SessionFnbRequirement_eventId_disposition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbRequirement_eventId_disposition_idx" ON public."SessionFnbRequirement" USING btree ("eventId", disposition);

--
-- Name: SessionFnbRequirement_sessionId_kind_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionFnbRequirement_sessionId_kind_code_key" ON public."SessionFnbRequirement" USING btree ("sessionId", kind, code);

--
-- Name: SessionFnbRequirement_sessionId_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionFnbRequirement_sessionId_kind_idx" ON public."SessionFnbRequirement" USING btree ("sessionId", kind);

--
-- Name: SessionFoodService_sessionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionFoodService_sessionId_key" ON public."SessionFoodService" USING btree ("sessionId");

--
-- Name: SessionRequirementItem_sectionId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionRequirementItem_sectionId_sortOrder_idx" ON public."SessionRequirementItem" USING btree ("sectionId", "sortOrder");

--
-- Name: SessionRequirementSection_templateId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionRequirementSection_templateId_sortOrder_idx" ON public."SessionRequirementSection" USING btree ("templateId", "sortOrder");

--
-- Name: SessionRequirementSelection_budgetLineItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionRequirementSelection_budgetLineItemId_key" ON public."SessionRequirementSelection" USING btree ("budgetLineItemId");

--
-- Name: SessionRequirementSelection_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionRequirementSelection_itemId_idx" ON public."SessionRequirementSelection" USING btree ("itemId");

--
-- Name: SessionRequirementTemplate_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionRequirementTemplate_eventId_idx" ON public."SessionRequirementTemplate" USING btree ("eventId");

--
-- Name: SessionShowFlowItem_eventId_sessionId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionShowFlowItem_eventId_sessionId_sortOrder_idx" ON public."SessionShowFlowItem" USING btree ("eventId", "sessionId", "sortOrder");

--
-- Name: SessionShowFlowItem_ownerPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionShowFlowItem_ownerPersonId_idx" ON public."SessionShowFlowItem" USING btree ("ownerPersonId");

--
-- Name: SessionShowFlowItem_sessionId_sortOrder_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionShowFlowItem_sessionId_sortOrder_key" ON public."SessionShowFlowItem" USING btree ("sessionId", "sortOrder");

--
-- Name: SessionShowFlowItem_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionShowFlowItem_speakerId_idx" ON public."SessionShowFlowItem" USING btree ("speakerId");

--
-- Name: SessionShowFlowState_eventId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionShowFlowState_eventId_updatedAt_idx" ON public."SessionShowFlowState" USING btree ("eventId", "updatedAt");

--
-- Name: SessionSpeakerAssignment_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSpeakerAssignment_speakerId_idx" ON public."SessionSpeakerAssignment" USING btree ("speakerId");

--
-- Name: SessionStaffAssignment_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionStaffAssignment_personId_idx" ON public."SessionStaffAssignment" USING btree ("personId");

--
-- Name: SessionSupplyAllocation_active_catalog_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SessionSupplyAllocation_active_catalog_key" ON public."SessionSupplyAllocation" USING btree ("sessionId", "supplyItemId") WHERE ((state = 'ACTIVE'::public."SupplyAllocationState") AND ("supplyItemId" IS NOT NULL));

--
-- Name: SessionSupplyAllocation_budgetLineItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyAllocation_budgetLineItemId_idx" ON public."SessionSupplyAllocation" USING btree ("budgetLineItemId");

--
-- Name: SessionSupplyAllocation_eventId_state_fulfillment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyAllocation_eventId_state_fulfillment_idx" ON public."SessionSupplyAllocation" USING btree ("eventId", state, fulfillment);

--
-- Name: SessionSupplyAllocation_responsibleUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyAllocation_responsibleUserId_idx" ON public."SessionSupplyAllocation" USING btree ("responsibleUserId");

--
-- Name: SessionSupplyAllocation_sessionId_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyAllocation_sessionId_state_idx" ON public."SessionSupplyAllocation" USING btree ("sessionId", state);

--
-- Name: SessionSupplyAllocation_setupDeadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyAllocation_setupDeadline_idx" ON public."SessionSupplyAllocation" USING btree ("setupDeadline");

--
-- Name: SessionSupplyAllocation_supplyItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyAllocation_supplyItemId_idx" ON public."SessionSupplyAllocation" USING btree ("supplyItemId");

--
-- Name: SessionSupplyState_eventId_notNeededAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SessionSupplyState_eventId_notNeededAt_idx" ON public."SessionSupplyState" USING btree ("eventId", "notNeededAt");

--
-- Name: SignageAsset_signId_kind_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageAsset_signId_kind_createdAt_idx" ON public."SignageAsset" USING btree ("signId", kind, "createdAt");

--
-- Name: SignageChecklistItem_eventId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SignageChecklistItem_eventId_key_key" ON public."SignageChecklistItem" USING btree ("eventId", key);

--
-- Name: SignageIssue_responsibleOwnerUserId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageIssue_responsibleOwnerUserId_status_idx" ON public."SignageIssue" USING btree ("responsibleOwnerUserId", status);

--
-- Name: SignageSignSession_sessionId_signId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSignSession_sessionId_signId_idx" ON public."SignageSignSession" USING btree ("sessionId", "signId");

--
-- Name: SignageSign_eventId_fnbCatalogItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_fnbCatalogItemId_idx" ON public."SignageSign" USING btree ("eventId", "fnbCatalogItemId");

--
-- Name: SignageSign_eventId_installOwnerUserId_installWindowStart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_installOwnerUserId_installWindowStart_idx" ON public."SignageSign" USING btree ("eventId", "installOwnerUserId", "installWindowStart");

--
-- Name: SignageSign_eventId_roomId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_roomId_idx" ON public."SignageSign" USING btree ("eventId", "roomId");

--
-- Name: SignageSign_eventId_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_sessionId_idx" ON public."SignageSign" USING btree ("eventId", "sessionId");

--
-- Name: SignageSign_eventId_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_speakerId_idx" ON public."SignageSign" USING btree ("eventId", "speakerId");

--
-- Name: SignageSign_eventId_vendorName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_vendorName_idx" ON public."SignageSign" USING btree ("eventId", "vendorName");

--
-- Name: SignageSign_eventId_workflowState_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SignageSign_eventId_workflowState_idx" ON public."SignageSign" USING btree ("eventId", "workflowState");

--
-- Name: SpeakerDocumentRequest_createdByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerDocumentRequest_createdByUserId_idx" ON public."SpeakerDocumentRequest" USING btree ("createdByUserId");

--
-- Name: SpeakerDocumentRequest_documentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerDocumentRequest_documentId_idx" ON public."SpeakerDocumentRequest" USING btree ("documentId");

--
-- Name: SpeakerDocumentRequest_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerDocumentRequest_eventId_idx" ON public."SpeakerDocumentRequest" USING btree ("eventId");

--
-- Name: SpeakerDocumentRequest_speakerFileId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerDocumentRequest_speakerFileId_idx" ON public."SpeakerDocumentRequest" USING btree ("speakerFileId");

--
-- Name: SpeakerDocumentRequest_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerDocumentRequest_speakerId_idx" ON public."SpeakerDocumentRequest" USING btree ("speakerId");

--
-- Name: SpeakerEmailLog_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerEmailLog_eventId_createdAt_idx" ON public."SpeakerEmailLog" USING btree ("eventId", "createdAt");

--
-- Name: SpeakerEmailLog_speakerId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerEmailLog_speakerId_createdAt_idx" ON public."SpeakerEmailLog" USING btree ("speakerId", "createdAt");

--
-- Name: SpeakerEmailLog_triggeredByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerEmailLog_triggeredByUserId_idx" ON public."SpeakerEmailLog" USING btree ("triggeredByUserId");

--
-- Name: SpeakerFile_eventId_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerFile_eventId_kind_idx" ON public."SpeakerFile" USING btree ("eventId", kind);

--
-- Name: SpeakerFile_objectKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SpeakerFile_objectKey_key" ON public."SpeakerFile" USING btree ("objectKey");

--
-- Name: SpeakerFile_reviewedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerFile_reviewedByUserId_idx" ON public."SpeakerFile" USING btree ("reviewedByUserId");

--
-- Name: SpeakerFile_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerFile_sessionId_idx" ON public."SpeakerFile" USING btree ("sessionId");

--
-- Name: SpeakerFile_speakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerFile_speakerId_idx" ON public."SpeakerFile" USING btree ("speakerId");

--
-- Name: SpeakerFile_speakerId_kind_sessionId_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerFile_speakerId_kind_sessionId_version_idx" ON public."SpeakerFile" USING btree ("speakerId", kind, "sessionId", version);

--
-- Name: SpeakerFile_uploadedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerFile_uploadedByUserId_idx" ON public."SpeakerFile" USING btree ("uploadedByUserId");

--
-- Name: SpeakerIntakeToken_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerIntakeToken_eventId_idx" ON public."SpeakerIntakeToken" USING btree ("eventId");

--
-- Name: SpeakerIntakeToken_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerIntakeToken_expiresAt_idx" ON public."SpeakerIntakeToken" USING btree ("expiresAt");

--
-- Name: SpeakerIntakeToken_speakerId_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerIntakeToken_speakerId_eventId_idx" ON public."SpeakerIntakeToken" USING btree ("speakerId", "eventId");

--
-- Name: SpeakerIntakeToken_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SpeakerIntakeToken_tokenHash_key" ON public."SpeakerIntakeToken" USING btree ("tokenHash");

--
-- Name: SpeakerInternalNote_authorUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerInternalNote_authorUserId_idx" ON public."SpeakerInternalNote" USING btree ("authorUserId");

--
-- Name: SpeakerInternalNote_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerInternalNote_eventId_idx" ON public."SpeakerInternalNote" USING btree ("eventId");

--
-- Name: SpeakerInternalNote_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerInternalNote_sessionId_idx" ON public."SpeakerInternalNote" USING btree ("sessionId");

--
-- Name: SpeakerInternalNote_speakerFileId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerInternalNote_speakerFileId_idx" ON public."SpeakerInternalNote" USING btree ("speakerFileId");

--
-- Name: SpeakerInternalNote_speakerId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerInternalNote_speakerId_createdAt_idx" ON public."SpeakerInternalNote" USING btree ("speakerId", "createdAt");

--
-- Name: SpeakerMessage_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerMessage_eventId_idx" ON public."SpeakerMessage" USING btree ("eventId");

--
-- Name: SpeakerMessage_senderUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerMessage_senderUserId_idx" ON public."SpeakerMessage" USING btree ("senderUserId");

--
-- Name: SpeakerMessage_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerMessage_sessionId_idx" ON public."SpeakerMessage" USING btree ("sessionId");

--
-- Name: SpeakerMessage_speakerFileId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerMessage_speakerFileId_idx" ON public."SpeakerMessage" USING btree ("speakerFileId");

--
-- Name: SpeakerMessage_speakerId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerMessage_speakerId_createdAt_idx" ON public."SpeakerMessage" USING btree ("speakerId", "createdAt");

--
-- Name: SpeakerOnsiteInfo_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SpeakerOnsiteInfo_eventId_key" ON public."SpeakerOnsiteInfo" USING btree ("eventId");

--
-- Name: SpeakerOnsiteInfo_updatedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerOnsiteInfo_updatedByUserId_idx" ON public."SpeakerOnsiteInfo" USING btree ("updatedByUserId");

--
-- Name: SpeakerProfileSubmission_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerProfileSubmission_eventId_status_idx" ON public."SpeakerProfileSubmission" USING btree ("eventId", status);

--
-- Name: SpeakerProfileSubmission_reviewedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerProfileSubmission_reviewedByUserId_idx" ON public."SpeakerProfileSubmission" USING btree ("reviewedByUserId");

--
-- Name: SpeakerProfileSubmission_speakerId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerProfileSubmission_speakerId_status_idx" ON public."SpeakerProfileSubmission" USING btree ("speakerId", status);

--
-- Name: SpeakerProfileSubmission_tokenId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerProfileSubmission_tokenId_idx" ON public."SpeakerProfileSubmission" USING btree ("tokenId");

--
-- Name: SpeakerReadinessItem_eventId_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SpeakerReadinessItem_eventId_completed_idx" ON public."SpeakerReadinessItem" USING btree ("eventId", completed);

--
-- Name: SpeakerReadinessItem_speakerId_eventId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SpeakerReadinessItem_speakerId_eventId_key_key" ON public."SpeakerReadinessItem" USING btree ("speakerId", "eventId", key);

--
-- Name: Speaker_eventId_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Speaker_eventId_email_key" ON public."Speaker" USING btree ("eventId", email);

--
-- Name: Speaker_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Speaker_eventId_idx" ON public."Speaker" USING btree ("eventId");

--
-- Name: Speaker_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Speaker_eventId_status_idx" ON public."Speaker" USING btree ("eventId", status);

--
-- Name: SupplyAllocationAudit_allocationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyAllocationAudit_allocationId_createdAt_idx" ON public."SupplyAllocationAudit" USING btree ("allocationId", "createdAt");

--
-- Name: SupplyAllocationAudit_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyAllocationAudit_eventId_createdAt_idx" ON public."SupplyAllocationAudit" USING btree ("eventId", "createdAt");

--
-- Name: SupplyDependency_allocationId_blocking_resolvedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyDependency_allocationId_blocking_resolvedAt_idx" ON public."SupplyDependency" USING btree ("allocationId", blocking, "resolvedAt");

--
-- Name: SupplyItem_eventId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyItem_eventId_category_idx" ON public."SupplyItem" USING btree ("eventId", category);

--
-- Name: SupplyTemplateItem_templateId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyTemplateItem_templateId_sortOrder_idx" ON public."SupplyTemplateItem" USING btree ("templateId", "sortOrder");

--
-- Name: SupplyTemplate_eventId_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyTemplate_eventId_active_idx" ON public."SupplyTemplate" USING btree ("eventId", active);

--
-- Name: SupplyTemplate_isSystem_triggerType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplyTemplate_isSystem_triggerType_idx" ON public."SupplyTemplate" USING btree ("isSystem", "triggerType");

--
-- Name: SupplyTemplate_system_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SupplyTemplate_system_key_key" ON public."SupplyTemplate" USING btree (key) WHERE "isSystem";

--
-- Name: TaskActivity_actorUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskActivity_actorUserId_createdAt_idx" ON public."TaskActivity" USING btree ("actorUserId", "createdAt");

--
-- Name: TaskActivity_taskId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON public."TaskActivity" USING btree ("taskId", "createdAt");

--
-- Name: TaskAssignment_taskId_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskAssignment_taskId_role_idx" ON public."TaskAssignment" USING btree ("taskId", role);

--
-- Name: TaskAssignment_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskAssignment_userId_createdAt_idx" ON public."TaskAssignment" USING btree ("userId", "createdAt");

--
-- Name: TaskComment_authorUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskComment_authorUserId_createdAt_idx" ON public."TaskComment" USING btree ("authorUserId", "createdAt");

--
-- Name: TaskComment_taskId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskComment_taskId_createdAt_idx" ON public."TaskComment" USING btree ("taskId", "createdAt");

--
-- Name: TaskLink_objectType_objectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskLink_objectType_objectId_idx" ON public."TaskLink" USING btree ("objectType", "objectId");

--
-- Name: TaskLink_taskId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskLink_taskId_idx" ON public."TaskLink" USING btree ("taskId");

--
-- Name: TaskLink_taskId_objectType_objectId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TaskLink_taskId_objectType_objectId_key" ON public."TaskLink" USING btree ("taskId", "objectType", "objectId");

--
-- Name: TaskWatcher_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TaskWatcher_userId_createdAt_idx" ON public."TaskWatcher" USING btree ("userId", "createdAt");

--
-- Name: Task_completedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_completedByUserId_idx" ON public."Task" USING btree ("completedByUserId");

--
-- Name: Task_createdByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_createdByUserId_idx" ON public."Task" USING btree ("createdByUserId");

--
-- Name: Task_orgId_clientId_status_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_orgId_clientId_status_dueAt_idx" ON public."Task" USING btree ("orgId", "clientId", status, "dueAt");

--
-- Name: Task_orgId_eventId_status_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_orgId_eventId_status_dueAt_idx" ON public."Task" USING btree ("orgId", "eventId", status, "dueAt");

--
-- Name: Task_orgId_eventId_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_orgId_eventId_type_status_idx" ON public."Task" USING btree ("orgId", "eventId", type, status);

--
-- Name: Task_orgId_eventId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_orgId_eventId_updatedAt_idx" ON public."Task" USING btree ("orgId", "eventId", "updatedAt");

--
-- Name: TimelineDependency_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineDependency_eventId_idx" ON public."TimelineDependency" USING btree ("eventId");

--
-- Name: TimelineDependency_predecessorItemId_successorItemId_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TimelineDependency_predecessorItemId_successorItemId_type_key" ON public."TimelineDependency" USING btree ("predecessorItemId", "successorItemId", type);

--
-- Name: TimelineImportBatch_eventId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineImportBatch_eventId_createdAt_idx" ON public."TimelineImportBatch" USING btree ("eventId", "createdAt");

--
-- Name: TimelineImportBatch_eventId_requestedByUserId_idempotencyKey_ke; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TimelineImportBatch_eventId_requestedByUserId_idempotencyKey_ke" ON public."TimelineImportBatch" USING btree ("eventId", "requestedByUserId", "idempotencyKey");

--
-- Name: TimelineImportBatch_requestedByUserId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineImportBatch_requestedByUserId_createdAt_idx" ON public."TimelineImportBatch" USING btree ("requestedByUserId", "createdAt");

--
-- Name: TimelineItem_eventId_disposition_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_disposition_endDate_idx" ON public."TimelineItem" USING btree ("eventId", disposition, "endDate");

--
-- Name: TimelineItem_eventId_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_endDate_idx" ON public."TimelineItem" USING btree ("eventId", "endDate");

--
-- Name: TimelineItem_eventId_planningStage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_planningStage_idx" ON public."TimelineItem" USING btree ("eventId", "planningStage");

--
-- Name: TimelineItem_eventId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_sortOrder_idx" ON public."TimelineItem" USING btree ("eventId", "sortOrder");

--
-- Name: TimelineItem_eventId_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_startDate_idx" ON public."TimelineItem" USING btree ("eventId", "startDate");

--
-- Name: TimelineItem_eventId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_status_idx" ON public."TimelineItem" USING btree ("eventId", status);

--
-- Name: TimelineItem_eventId_workstream_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TimelineItem_eventId_workstream_idx" ON public."TimelineItem" USING btree ("eventId", workstream);

--
-- Name: UserDashboardLayout_eventId_roleKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserDashboardLayout_eventId_roleKey_idx" ON public."UserDashboardLayout" USING btree ("eventId", "roleKey");

--
-- Name: UserDashboardLayout_userId_eventId_roleKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserDashboardLayout_userId_eventId_roleKey_key" ON public."UserDashboardLayout" USING btree ("userId", "eventId", "roleKey");

--
-- Name: UserDashboardLayout_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserDashboardLayout_userId_idx" ON public."UserDashboardLayout" USING btree ("userId");

--
-- Name: User_platformUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_platformUserId_idx" ON public."User" USING btree ("platformUserId");


--
-- Name: User_platformUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_platformUserId_key" ON public."User" USING btree ("platformUserId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

--
-- Name: User_orgId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_orgId_idx" ON public."User" USING btree ("orgId");

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_event_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "SessionSupplyAllocation_event_scope" BEFORE INSERT OR UPDATE ON public."SessionSupplyAllocation" FOR EACH ROW EXECUTE FUNCTION public.enforce_supply_event_scope();

--
-- Name: SupplyTemplate SupplyTemplate_system_read_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "SupplyTemplate_system_read_only" BEFORE DELETE OR UPDATE ON public."SupplyTemplate" FOR EACH ROW WHEN (old."isSystem") EXECUTE FUNCTION public.protect_system_supply_templates();

--
-- Name: BudgetActivity BudgetActivity_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetActivity"
    ADD CONSTRAINT "BudgetActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: BudgetActivity BudgetActivity_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetActivity"
    ADD CONSTRAINT "BudgetActivity_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public."Budget"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetApproval BudgetApproval_actedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetApproval"
    ADD CONSTRAINT "BudgetApproval_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetApproval BudgetApproval_budgetVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetApproval"
    ADD CONSTRAINT "BudgetApproval_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES public."BudgetVersion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetCategoryTarget BudgetCategoryTarget_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetCategoryTarget"
    ADD CONSTRAINT "BudgetCategoryTarget_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public."Budget"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: BudgetGroup BudgetGroup_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetGroup"
    ADD CONSTRAINT "BudgetGroup_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public."Budget"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: BudgetItem BudgetItem_budgetVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetItem"
    ADD CONSTRAINT "BudgetItem_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES public."BudgetVersion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetLineItem BudgetLineItem_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetLineItem"
    ADD CONSTRAINT "BudgetLineItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public."Budget"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetLineItem BudgetLineItem_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetLineItem"
    ADD CONSTRAINT "BudgetLineItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."BudgetGroup"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: BudgetLineItem BudgetLineItem_matrixRowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetLineItem"
    ADD CONSTRAINT "BudgetLineItem_matrixRowId_fkey" FOREIGN KEY ("matrixRowId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: BudgetSubmissionLineItem BudgetSubmissionLineItem_budgetLineItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmissionLineItem"
    ADD CONSTRAINT "BudgetSubmissionLineItem_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES public."BudgetLineItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetSubmissionLineItem BudgetSubmissionLineItem_submissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmissionLineItem"
    ADD CONSTRAINT "BudgetSubmissionLineItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES public."BudgetSubmission"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetSubmissionRecipient BudgetSubmissionRecipient_submissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmissionRecipient"
    ADD CONSTRAINT "BudgetSubmissionRecipient_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES public."BudgetSubmission"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetSubmissionRecipient BudgetSubmissionRecipient_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmissionRecipient"
    ADD CONSTRAINT "BudgetSubmissionRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetSubmission BudgetSubmission_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmission"
    ADD CONSTRAINT "BudgetSubmission_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public."Budget"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetSubmission BudgetSubmission_budgetVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmission"
    ADD CONSTRAINT "BudgetSubmission_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES public."BudgetVersion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetSubmission BudgetSubmission_pulledBackByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmission"
    ADD CONSTRAINT "BudgetSubmission_pulledBackByUserId_fkey" FOREIGN KEY ("pulledBackByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: BudgetSubmission BudgetSubmission_submittedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetSubmission"
    ADD CONSTRAINT "BudgetSubmission_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetVersion BudgetVersion_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetVersion"
    ADD CONSTRAINT "BudgetVersion_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public."Budget"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BudgetVersion BudgetVersion_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BudgetVersion"
    ADD CONSTRAINT "BudgetVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Budget Budget_approvedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Budget Budget_currentVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES public."BudgetVersion"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Budget Budget_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Budget Budget_rejectedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Budget Budget_submittedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Client Client_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Client"
    ADD CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: CopilotAuditLog CopilotAuditLog_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: CopilotAuditLog CopilotAuditLog_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CopilotAuditLog CopilotAuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Deadline Deadline_dependsOnDeadlineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deadline"
    ADD CONSTRAINT "Deadline_dependsOnDeadlineId_fkey" FOREIGN KEY ("dependsOnDeadlineId") REFERENCES public."Deadline"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Deadline Deadline_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deadline"
    ADD CONSTRAINT "Deadline_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Deadline Deadline_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deadline"
    ADD CONSTRAINT "Deadline_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: DocumentApprovalRecipient DocumentApprovalRecipient_approvalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentApprovalRecipient"
    ADD CONSTRAINT "DocumentApprovalRecipient_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES public."DocumentApproval"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentApprovalRecipient DocumentApprovalRecipient_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentApprovalRecipient"
    ADD CONSTRAINT "DocumentApprovalRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentApproval DocumentApproval_actedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentApproval"
    ADD CONSTRAINT "DocumentApproval_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentApproval DocumentApproval_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentApproval"
    ADD CONSTRAINT "DocumentApproval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentCategory DocumentCategory_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentCategory"
    ADD CONSTRAINT "DocumentCategory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentLink DocumentLink_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentLink"
    ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentTagOnDocument DocumentTagOnDocument_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentTagOnDocument"
    ADD CONSTRAINT "DocumentTagOnDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentTagOnDocument DocumentTagOnDocument_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentTagOnDocument"
    ADD CONSTRAINT "DocumentTagOnDocument_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."DocumentTag"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentTag DocumentTag_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentTag"
    ADD CONSTRAINT "DocumentTag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentVersion DocumentVersion_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: DocumentVersion DocumentVersion_uploadedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Document Document_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."DocumentCategory"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Document Document_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Document Document_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Document"
    ADD CONSTRAINT "Document_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventActivity EventActivity_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActivity"
    ADD CONSTRAINT "EventActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventActivity EventActivity_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventActivity"
    ADD CONSTRAINT "EventActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventAttendeeSessionEnrollment EventAttendeeSessionEnrollment_attendeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendeeSessionEnrollment"
    ADD CONSTRAINT "EventAttendeeSessionEnrollment_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES public."EventAttendee"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAttendeeSessionEnrollment EventAttendeeSessionEnrollment_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendeeSessionEnrollment"
    ADD CONSTRAINT "EventAttendeeSessionEnrollment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAttendeeSessionEnrollment EventAttendeeSessionEnrollment_integrationConnectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendeeSessionEnrollment"
    ADD CONSTRAINT "EventAttendeeSessionEnrollment_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES public."EventIntegrationConnection"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventAttendeeSessionEnrollment EventAttendeeSessionEnrollment_matrixRowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendeeSessionEnrollment"
    ADD CONSTRAINT "EventAttendeeSessionEnrollment_matrixRowId_fkey" FOREIGN KEY ("matrixRowId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAttendeeSessionEnrollment EventAttendeeSessionEnrollment_registrationRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendeeSessionEnrollment"
    ADD CONSTRAINT "EventAttendeeSessionEnrollment_registrationRecordId_fkey" FOREIGN KEY ("registrationRecordId") REFERENCES public."EventRegistrationRecord"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventAttendee EventAttendee_directoryPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendee"
    ADD CONSTRAINT "EventAttendee_directoryPersonId_fkey" FOREIGN KEY ("directoryPersonId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventAttendee EventAttendee_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventAttendee"
    ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDashboardLayoutMigration EventDashboardLayoutMigration_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardLayoutMigration"
    ADD CONSTRAINT "EventDashboardLayoutMigration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDashboardLayoutMigration EventDashboardLayoutMigration_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardLayoutMigration"
    ADD CONSTRAINT "EventDashboardLayoutMigration_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDashboardViewPreference EventDashboardViewPreference_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardViewPreference"
    ADD CONSTRAINT "EventDashboardViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDashboardViewPreference EventDashboardViewPreference_viewId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardViewPreference"
    ADD CONSTRAINT "EventDashboardViewPreference_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES public."EventDashboardView"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDashboardView EventDashboardView_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardView"
    ADD CONSTRAINT "EventDashboardView_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDashboardView EventDashboardView_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardView"
    ADD CONSTRAINT "EventDashboardView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventDashboardView EventDashboardView_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDashboardView"
    ADD CONSTRAINT "EventDashboardView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventDirectoryExternalIdentity EventDirectoryExternalIdentity_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryExternalIdentity"
    ADD CONSTRAINT "EventDirectoryExternalIdentity_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDirectoryImportBatch EventDirectoryImportBatch_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryImportBatch"
    ADD CONSTRAINT "EventDirectoryImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDirectoryImportBatch EventDirectoryImportBatch_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryImportBatch"
    ADD CONSTRAINT "EventDirectoryImportBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."EventDirectorySource"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventDirectoryImportRow EventDirectoryImportRow_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryImportRow"
    ADD CONSTRAINT "EventDirectoryImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public."EventDirectoryImportBatch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDirectoryImportRow EventDirectoryImportRow_matchedPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryImportRow"
    ADD CONSTRAINT "EventDirectoryImportRow_matchedPersonId_fkey" FOREIGN KEY ("matchedPersonId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventDirectoryModuleLink EventDirectoryModuleLink_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryModuleLink"
    ADD CONSTRAINT "EventDirectoryModuleLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDirectoryPerson EventDirectoryPerson_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryPerson"
    ADD CONSTRAINT "EventDirectoryPerson_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDirectoryRole EventDirectoryRole_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryRole"
    ADD CONSTRAINT "EventDirectoryRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventDirectoryRole EventDirectoryRole_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectoryRole"
    ADD CONSTRAINT "EventDirectoryRole_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."EventDirectorySource"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventDirectorySource EventDirectorySource_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventDirectorySource"
    ADD CONSTRAINT "EventDirectorySource_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventExternalIdentity EventExternalIdentity_attendeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventExternalIdentity"
    ADD CONSTRAINT "EventExternalIdentity_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES public."EventAttendee"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventExternalIdentity EventExternalIdentity_directoryPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventExternalIdentity"
    ADD CONSTRAINT "EventExternalIdentity_directoryPersonId_fkey" FOREIGN KEY ("directoryPersonId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventExternalIdentity EventExternalIdentity_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventExternalIdentity"
    ADD CONSTRAINT "EventExternalIdentity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbCatalogItemClaim EventFnbCatalogItemClaim_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItemClaim"
    ADD CONSTRAINT "EventFnbCatalogItemClaim_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbCatalogItemClaim EventFnbCatalogItemClaim_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItemClaim"
    ADD CONSTRAINT "EventFnbCatalogItemClaim_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."EventFnbCatalogItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbCatalogItemSafetyRevision EventFnbCatalogItemSafetyRevision_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItemSafetyRevision"
    ADD CONSTRAINT "EventFnbCatalogItemSafetyRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbCatalogItemSafetyRevision EventFnbCatalogItemSafetyRevision_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItemSafetyRevision"
    ADD CONSTRAINT "EventFnbCatalogItemSafetyRevision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."EventFnbCatalogItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbCatalogItem EventFnbCatalogItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItem"
    ADD CONSTRAINT "EventFnbCatalogItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbCatalogItem EventFnbCatalogItem_modificationVerifiedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItem"
    ADD CONSTRAINT "EventFnbCatalogItem_modificationVerifiedByUserId_fkey" FOREIGN KEY ("modificationVerifiedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventFnbCatalogItem EventFnbCatalogItem_sourceMenuId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItem"
    ADD CONSTRAINT "EventFnbCatalogItem_sourceMenuId_fkey" FOREIGN KEY ("sourceMenuId") REFERENCES public."EventFnbSourceMenu"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventFnbCatalogItem EventFnbCatalogItem_verifiedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbCatalogItem"
    ADD CONSTRAINT "EventFnbCatalogItem_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventFnbExportRecord EventFnbExportRecord_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbExportRecord"
    ADD CONSTRAINT "EventFnbExportRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenuParseJob EventFnbSourceMenuParseJob_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseJob"
    ADD CONSTRAINT "EventFnbSourceMenuParseJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenuParseJob EventFnbSourceMenuParseJob_sourceMenuId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseJob"
    ADD CONSTRAINT "EventFnbSourceMenuParseJob_sourceMenuId_fkey" FOREIGN KEY ("sourceMenuId") REFERENCES public."EventFnbSourceMenu"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenuParseTarget EventFnbSourceMenuParseTarget_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseTarget"
    ADD CONSTRAINT "EventFnbSourceMenuParseTarget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenuParseTarget EventFnbSourceMenuParseTarget_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseTarget"
    ADD CONSTRAINT "EventFnbSourceMenuParseTarget_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."EventFnbSourceMenuParseJob"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenuParseTarget EventFnbSourceMenuParseTarget_sourceMenuId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenuParseTarget"
    ADD CONSTRAINT "EventFnbSourceMenuParseTarget_sourceMenuId_fkey" FOREIGN KEY ("sourceMenuId") REFERENCES public."EventFnbSourceMenu"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenu EventFnbSourceMenu_baseSourceMenuId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenu"
    ADD CONSTRAINT "EventFnbSourceMenu_baseSourceMenuId_fkey" FOREIGN KEY ("baseSourceMenuId") REFERENCES public."EventFnbSourceMenu"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventFnbSourceMenu EventFnbSourceMenu_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenu"
    ADD CONSTRAINT "EventFnbSourceMenu_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventFnbSourceMenu EventFnbSourceMenu_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenu"
    ADD CONSTRAINT "EventFnbSourceMenu_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventFnbSourceMenu EventFnbSourceMenu_verifiedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventFnbSourceMenu"
    ADD CONSTRAINT "EventFnbSourceMenu_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventImportIntent EventImportIntent_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportIntent"
    ADD CONSTRAINT "EventImportIntent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventImportIntent EventImportIntent_requestedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportIntent"
    ADD CONSTRAINT "EventImportIntent_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventImportResult EventImportResult_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportResult"
    ADD CONSTRAINT "EventImportResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: EventImportResult EventImportResult_intentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportResult"
    ADD CONSTRAINT "EventImportResult_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES public."EventImportIntent"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventImportResult EventImportResult_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportResult"
    ADD CONSTRAINT "EventImportResult_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventImportResult EventImportResult_requestedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventImportResult"
    ADD CONSTRAINT "EventImportResult_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventIntegrationConnection EventIntegrationConnection_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntegrationConnection"
    ADD CONSTRAINT "EventIntegrationConnection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventIntegrationMetric EventIntegrationMetric_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventIntegrationMetric"
    ADD CONSTRAINT "EventIntegrationMetric_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventMember EventMember_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventMember"
    ADD CONSTRAINT "EventMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventMember EventMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventMember"
    ADD CONSTRAINT "EventMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: EventPerson EventPerson_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventPerson"
    ADD CONSTRAINT "EventPerson_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: EventRegistrationRecord EventRegistrationRecord_attendeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventRegistrationRecord"
    ADD CONSTRAINT "EventRegistrationRecord_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES public."EventAttendee"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventRegistrationRecord EventRegistrationRecord_directoryPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventRegistrationRecord"
    ADD CONSTRAINT "EventRegistrationRecord_directoryPersonId_fkey" FOREIGN KEY ("directoryPersonId") REFERENCES public."EventDirectoryPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EventRegistrationRecord EventRegistrationRecord_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EventRegistrationRecord"
    ADD CONSTRAINT "EventRegistrationRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Event Event_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Event Event_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Event Event_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Event Event_sessionRequirementTemplateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_sessionRequirementTemplateId_fkey" FOREIGN KEY ("sessionRequirementTemplateId") REFERENCES public."SessionRequirementTemplate"(id) ON DELETE SET NULL;

--
-- Name: FnbParserFeedback FnbParserFeedback_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FnbParserFeedback"
    ADD CONSTRAINT "FnbParserFeedback_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FnbParserFeedback FnbParserFeedback_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FnbParserFeedback"
    ADD CONSTRAINT "FnbParserFeedback_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FnbParserFeedback FnbParserFeedback_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FnbParserFeedback"
    ADD CONSTRAINT "FnbParserFeedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FnbParserFeedback FnbParserFeedback_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FnbParserFeedback"
    ADD CONSTRAINT "FnbParserFeedback_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingAudienceRecipient MarketingAudienceRecipient_audienceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingAudienceRecipient"
    ADD CONSTRAINT "MarketingAudienceRecipient_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES public."MarketingAudience"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingAudienceRecipient MarketingAudienceRecipient_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingAudienceRecipient"
    ADD CONSTRAINT "MarketingAudienceRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingAudience MarketingAudience_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingAudience"
    ADD CONSTRAINT "MarketingAudience_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingCampaign MarketingCampaign_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingCampaign"
    ADD CONSTRAINT "MarketingCampaign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingCampaign MarketingCampaign_marketingPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingCampaign"
    ADD CONSTRAINT "MarketingCampaign_marketingPlanId_fkey" FOREIGN KEY ("marketingPlanId") REFERENCES public."MarketingPlan"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingCampaign MarketingCampaign_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingCampaign"
    ADD CONSTRAINT "MarketingCampaign_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingEmailEvent MarketingEmailEvent_emailSendId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailEvent"
    ADD CONSTRAINT "MarketingEmailEvent_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES public."MarketingEmailSend"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailEvent MarketingEmailEvent_emailSendRecipientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailEvent"
    ADD CONSTRAINT "MarketingEmailEvent_emailSendRecipientId_fkey" FOREIGN KEY ("emailSendRecipientId") REFERENCES public."MarketingEmailSendRecipient"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailEvent MarketingEmailEvent_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailEvent"
    ADD CONSTRAINT "MarketingEmailEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailSendRecipient MarketingEmailSendRecipient_emailSendId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSendRecipient"
    ADD CONSTRAINT "MarketingEmailSendRecipient_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES public."MarketingEmailSend"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailSendRecipient MarketingEmailSendRecipient_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSendRecipient"
    ADD CONSTRAINT "MarketingEmailSendRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailSend MarketingEmailSend_audienceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSend"
    ADD CONSTRAINT "MarketingEmailSend_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES public."MarketingAudience"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingEmailSend MarketingEmailSend_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSend"
    ADD CONSTRAINT "MarketingEmailSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."MarketingCampaign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailSend MarketingEmailSend_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSend"
    ADD CONSTRAINT "MarketingEmailSend_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingEmailSend MarketingEmailSend_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingEmailSend"
    ADD CONSTRAINT "MarketingEmailSend_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingKpiSnapshot MarketingKpiSnapshot_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingKpiSnapshot"
    ADD CONSTRAINT "MarketingKpiSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."MarketingCampaign"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingKpiSnapshot MarketingKpiSnapshot_capturedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingKpiSnapshot"
    ADD CONSTRAINT "MarketingKpiSnapshot_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingKpiSnapshot MarketingKpiSnapshot_emailSendId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingKpiSnapshot"
    ADD CONSTRAINT "MarketingKpiSnapshot_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES public."MarketingEmailSend"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingKpiSnapshot MarketingKpiSnapshot_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingKpiSnapshot"
    ADD CONSTRAINT "MarketingKpiSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingPlan MarketingPlan_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingPlan"
    ADD CONSTRAINT "MarketingPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MarketingPlan MarketingPlan_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingPlan"
    ADD CONSTRAINT "MarketingPlan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: MarketingSuppression MarketingSuppression_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MarketingSuppression"
    ADD CONSTRAINT "MarketingSuppression_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MatrixImportBatch MatrixImportBatch_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixImportBatch"
    ADD CONSTRAINT "MatrixImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MatrixImportBatch MatrixImportBatch_requestedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixImportBatch"
    ADD CONSTRAINT "MatrixImportBatch_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: MatrixRowSpeaker MatrixRowSpeaker_eventPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowSpeaker"
    ADD CONSTRAINT "MatrixRowSpeaker_eventPersonId_fkey" FOREIGN KEY ("eventPersonId") REFERENCES public."EventPerson"(id) ON DELETE CASCADE;

--
-- Name: MatrixRowSpeaker MatrixRowSpeaker_matrixRowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowSpeaker"
    ADD CONSTRAINT "MatrixRowSpeaker_matrixRowId_fkey" FOREIGN KEY ("matrixRowId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: MatrixRowStaffAssignment MatrixRowStaffAssignment_eventPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowStaffAssignment"
    ADD CONSTRAINT "MatrixRowStaffAssignment_eventPersonId_fkey" FOREIGN KEY ("eventPersonId") REFERENCES public."EventPerson"(id) ON DELETE CASCADE;

--
-- Name: MatrixRowStaffAssignment MatrixRowStaffAssignment_matrixRowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRowStaffAssignment"
    ADD CONSTRAINT "MatrixRowStaffAssignment_matrixRowId_fkey" FOREIGN KEY ("matrixRowId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: MatrixRow MatrixRow_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRow"
    ADD CONSTRAINT "MatrixRow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: MatrixRow MatrixRow_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MatrixRow"
    ADD CONSTRAINT "MatrixRow_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public."Room"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Membership Membership_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Membership Membership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Room Room_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Room"
    ADD CONSTRAINT "Room_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingAssignment SeatingAssignment_attendeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAssignment"
    ADD CONSTRAINT "SeatingAssignment_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES public."SeatingAttendee"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingAssignment SeatingAssignment_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAssignment"
    ADD CONSTRAINT "SeatingAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingAssignment SeatingAssignment_seatingPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAssignment"
    ADD CONSTRAINT "SeatingAssignment_seatingPlanId_fkey" FOREIGN KEY ("seatingPlanId") REFERENCES public."SeatingPlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SeatingAssignment SeatingAssignment_tableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAssignment"
    ADD CONSTRAINT "SeatingAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES public."SeatingTable"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingAttendee SeatingAttendee_eventAttendeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAttendee"
    ADD CONSTRAINT "SeatingAttendee_eventAttendeeId_fkey" FOREIGN KEY ("eventAttendeeId") REFERENCES public."EventAttendee"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SeatingAttendee SeatingAttendee_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingAttendee"
    ADD CONSTRAINT "SeatingAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingPlan SeatingPlan_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingPlan"
    ADD CONSTRAINT "SeatingPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingPlan SeatingPlan_matrixRowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingPlan"
    ADD CONSTRAINT "SeatingPlan_matrixRowId_fkey" FOREIGN KEY ("matrixRowId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SeatingTable SeatingTable_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingTable"
    ADD CONSTRAINT "SeatingTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SeatingTable SeatingTable_seatingPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SeatingTable"
    ADD CONSTRAINT "SeatingTable_seatingPlanId_fkey" FOREIGN KEY ("seatingPlanId") REFERENCES public."SeatingPlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionAVRequirement SessionAVRequirement_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionAVRequirement"
    ADD CONSTRAINT "SessionAVRequirement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: SessionAgendaPublication SessionAgendaPublication_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionAgendaPublication"
    ADD CONSTRAINT "SessionAgendaPublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionAgendaPublication SessionAgendaPublication_publishedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionAgendaPublication"
    ADD CONSTRAINT "SessionAgendaPublication_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SessionAgendaPublication SessionAgendaPublication_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionAgendaPublication"
    ADD CONSTRAINT "SessionAgendaPublication_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbAssignmentSafetyResolution SessionFnbAssignmentSafetyResolution_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbAssignmentSafetyResolution"
    ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."SessionFnbCatalogAssignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbAssignmentSafetyResolution SessionFnbAssignmentSafetyResolution_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbAssignmentSafetyResolution"
    ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbAssignmentSafetyResolution SessionFnbAssignmentSafetyResolution_requirementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbAssignmentSafetyResolution"
    ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES public."SessionFnbRequirement"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbAssignmentSafetyResolution SessionFnbAssignmentSafetyResolution_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbAssignmentSafetyResolution"
    ADD CONSTRAINT "SessionFnbAssignmentSafetyResolution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbCatalogAssignmentTax SessionFnbCatalogAssignmentTax_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbCatalogAssignmentTax"
    ADD CONSTRAINT "SessionFnbCatalogAssignmentTax_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."SessionFnbCatalogAssignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbCatalogAssignment SessionFnbCatalogAssignment_budgetLineItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbCatalogAssignment"
    ADD CONSTRAINT "SessionFnbCatalogAssignment_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES public."BudgetLineItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SessionFnbCatalogAssignment SessionFnbCatalogAssignment_eventFnbCatalogItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbCatalogAssignment"
    ADD CONSTRAINT "SessionFnbCatalogAssignment_eventFnbCatalogItemId_fkey" FOREIGN KEY ("eventFnbCatalogItemId") REFERENCES public."EventFnbCatalogItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbCatalogAssignment SessionFnbCatalogAssignment_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbCatalogAssignment"
    ADD CONSTRAINT "SessionFnbCatalogAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbRequirement SessionFnbRequirement_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbRequirement"
    ADD CONSTRAINT "SessionFnbRequirement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFnbRequirement SessionFnbRequirement_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFnbRequirement"
    ADD CONSTRAINT "SessionFnbRequirement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionFoodService SessionFoodService_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionFoodService"
    ADD CONSTRAINT "SessionFoodService_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: SessionRequirementItem SessionRequirementItem_sectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementItem"
    ADD CONSTRAINT "SessionRequirementItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES public."SessionRequirementSection"(id) ON DELETE CASCADE;

--
-- Name: SessionRequirementSection SessionRequirementSection_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSection"
    ADD CONSTRAINT "SessionRequirementSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."SessionRequirementTemplate"(id) ON DELETE CASCADE;

--
-- Name: SessionRequirementSelection SessionRequirementSelection_budgetLineItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSelection"
    ADD CONSTRAINT "SessionRequirementSelection_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES public."BudgetLineItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SessionRequirementSelection SessionRequirementSelection_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSelection"
    ADD CONSTRAINT "SessionRequirementSelection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."SessionRequirementItem"(id) ON DELETE CASCADE;

--
-- Name: SessionRequirementSelection SessionRequirementSelection_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementSelection"
    ADD CONSTRAINT "SessionRequirementSelection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: SessionRequirementTemplate SessionRequirementTemplate_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionRequirementTemplate"
    ADD CONSTRAINT "SessionRequirementTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SessionShowFlowItem SessionShowFlowItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowItem"
    ADD CONSTRAINT "SessionShowFlowItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionShowFlowItem SessionShowFlowItem_ownerPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowItem"
    ADD CONSTRAINT "SessionShowFlowItem_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES public."EventPerson"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SessionShowFlowItem SessionShowFlowItem_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowItem"
    ADD CONSTRAINT "SessionShowFlowItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionShowFlowItem SessionShowFlowItem_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowItem"
    ADD CONSTRAINT "SessionShowFlowItem_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SessionShowFlowState SessionShowFlowState_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowState"
    ADD CONSTRAINT "SessionShowFlowState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionShowFlowState SessionShowFlowState_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionShowFlowState"
    ADD CONSTRAINT "SessionShowFlowState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionSpeakerAssignment SessionSpeakerAssignment_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSpeakerAssignment"
    ADD CONSTRAINT "SessionSpeakerAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionSpeakerAssignment SessionSpeakerAssignment_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSpeakerAssignment"
    ADD CONSTRAINT "SessionSpeakerAssignment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionStaffAssignment SessionStaffAssignment_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionStaffAssignment"
    ADD CONSTRAINT "SessionStaffAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."EventPerson"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionStaffAssignment SessionStaffAssignment_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionStaffAssignment"
    ADD CONSTRAINT "SessionStaffAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_budgetLineItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES public."BudgetLineItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_responsibleUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: SessionSupplyAllocation SessionSupplyAllocation_supplyItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyAllocation"
    ADD CONSTRAINT "SessionSupplyAllocation_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES public."SupplyItem"(id) ON DELETE RESTRICT;

--
-- Name: SessionSupplyState SessionSupplyState_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyState"
    ADD CONSTRAINT "SessionSupplyState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SessionSupplyState SessionSupplyState_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SessionSupplyState"
    ADD CONSTRAINT "SessionSupplyState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON DELETE CASCADE;

--
-- Name: SignageApproval SignageApproval_signId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageApproval"
    ADD CONSTRAINT "SignageApproval_signId_fkey" FOREIGN KEY ("signId") REFERENCES public."SignageSign"(id) ON DELETE CASCADE;

--
-- Name: SignageAsset SignageAsset_signId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageAsset"
    ADD CONSTRAINT "SignageAsset_signId_fkey" FOREIGN KEY ("signId") REFERENCES public."SignageSign"(id) ON DELETE CASCADE;

--
-- Name: SignageChangeImpact SignageChangeImpact_signId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageChangeImpact"
    ADD CONSTRAINT "SignageChangeImpact_signId_fkey" FOREIGN KEY ("signId") REFERENCES public."SignageSign"(id) ON DELETE CASCADE;

--
-- Name: SignageChecklistItem SignageChecklistItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageChecklistItem"
    ADD CONSTRAINT "SignageChecklistItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SignageIssue SignageIssue_signId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageIssue"
    ADD CONSTRAINT "SignageIssue_signId_fkey" FOREIGN KEY ("signId") REFERENCES public."SignageSign"(id) ON DELETE CASCADE;

--
-- Name: SignageRouteOrder SignageRouteOrder_signId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageRouteOrder"
    ADD CONSTRAINT "SignageRouteOrder_signId_fkey" FOREIGN KEY ("signId") REFERENCES public."SignageSign"(id) ON DELETE CASCADE;

--
-- Name: SignageSignSession SignageSignSession_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSignSession"
    ADD CONSTRAINT "SignageSignSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SignageSignSession SignageSignSession_signId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSignSession"
    ADD CONSTRAINT "SignageSignSession_signId_fkey" FOREIGN KEY ("signId") REFERENCES public."SignageSign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SignageSign SignageSign_budgetLineItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSign"
    ADD CONSTRAINT "SignageSign_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES public."BudgetLineItem"(id) ON DELETE SET NULL;

--
-- Name: SignageSign SignageSign_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSign"
    ADD CONSTRAINT "SignageSign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SignageSign SignageSign_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSign"
    ADD CONSTRAINT "SignageSign_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public."Room"(id) ON DELETE SET NULL;

--
-- Name: SignageSign SignageSign_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SignageSign"
    ADD CONSTRAINT "SignageSign_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON DELETE SET NULL;

--
-- Name: SpeakerDocumentRequest SpeakerDocumentRequest_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerDocumentRequest"
    ADD CONSTRAINT "SpeakerDocumentRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerDocumentRequest SpeakerDocumentRequest_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerDocumentRequest"
    ADD CONSTRAINT "SpeakerDocumentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."Document"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerDocumentRequest SpeakerDocumentRequest_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerDocumentRequest"
    ADD CONSTRAINT "SpeakerDocumentRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerDocumentRequest SpeakerDocumentRequest_speakerFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerDocumentRequest"
    ADD CONSTRAINT "SpeakerDocumentRequest_speakerFileId_fkey" FOREIGN KEY ("speakerFileId") REFERENCES public."SpeakerFile"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerDocumentRequest SpeakerDocumentRequest_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerDocumentRequest"
    ADD CONSTRAINT "SpeakerDocumentRequest_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerEmailLog SpeakerEmailLog_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerEmailLog"
    ADD CONSTRAINT "SpeakerEmailLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerEmailLog SpeakerEmailLog_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerEmailLog"
    ADD CONSTRAINT "SpeakerEmailLog_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerEmailLog SpeakerEmailLog_triggeredByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerEmailLog"
    ADD CONSTRAINT "SpeakerEmailLog_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerFile SpeakerFile_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerFile"
    ADD CONSTRAINT "SpeakerFile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerFile SpeakerFile_reviewedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerFile"
    ADD CONSTRAINT "SpeakerFile_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerFile SpeakerFile_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerFile"
    ADD CONSTRAINT "SpeakerFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerFile SpeakerFile_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerFile"
    ADD CONSTRAINT "SpeakerFile_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerFile SpeakerFile_uploadedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerFile"
    ADD CONSTRAINT "SpeakerFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerIntakeToken SpeakerIntakeToken_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerIntakeToken"
    ADD CONSTRAINT "SpeakerIntakeToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerIntakeToken SpeakerIntakeToken_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerIntakeToken"
    ADD CONSTRAINT "SpeakerIntakeToken_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerInternalNote SpeakerInternalNote_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerInternalNote"
    ADD CONSTRAINT "SpeakerInternalNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: SpeakerInternalNote SpeakerInternalNote_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerInternalNote"
    ADD CONSTRAINT "SpeakerInternalNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerInternalNote SpeakerInternalNote_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerInternalNote"
    ADD CONSTRAINT "SpeakerInternalNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerInternalNote SpeakerInternalNote_speakerFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerInternalNote"
    ADD CONSTRAINT "SpeakerInternalNote_speakerFileId_fkey" FOREIGN KEY ("speakerFileId") REFERENCES public."SpeakerFile"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerInternalNote SpeakerInternalNote_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerInternalNote"
    ADD CONSTRAINT "SpeakerInternalNote_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerMessage SpeakerMessage_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerMessage"
    ADD CONSTRAINT "SpeakerMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerMessage SpeakerMessage_senderUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerMessage"
    ADD CONSTRAINT "SpeakerMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerMessage SpeakerMessage_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerMessage"
    ADD CONSTRAINT "SpeakerMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."MatrixRow"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerMessage SpeakerMessage_speakerFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerMessage"
    ADD CONSTRAINT "SpeakerMessage_speakerFileId_fkey" FOREIGN KEY ("speakerFileId") REFERENCES public."SpeakerFile"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerMessage SpeakerMessage_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerMessage"
    ADD CONSTRAINT "SpeakerMessage_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerOnsiteInfo SpeakerOnsiteInfo_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerOnsiteInfo"
    ADD CONSTRAINT "SpeakerOnsiteInfo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerOnsiteInfo SpeakerOnsiteInfo_updatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerOnsiteInfo"
    ADD CONSTRAINT "SpeakerOnsiteInfo_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerProfileSubmission SpeakerProfileSubmission_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerProfileSubmission"
    ADD CONSTRAINT "SpeakerProfileSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerProfileSubmission SpeakerProfileSubmission_reviewedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerProfileSubmission"
    ADD CONSTRAINT "SpeakerProfileSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerProfileSubmission SpeakerProfileSubmission_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerProfileSubmission"
    ADD CONSTRAINT "SpeakerProfileSubmission_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerProfileSubmission SpeakerProfileSubmission_tokenId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerProfileSubmission"
    ADD CONSTRAINT "SpeakerProfileSubmission_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES public."SpeakerIntakeToken"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SpeakerReadinessItem SpeakerReadinessItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerReadinessItem"
    ADD CONSTRAINT "SpeakerReadinessItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SpeakerReadinessItem SpeakerReadinessItem_speakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SpeakerReadinessItem"
    ADD CONSTRAINT "SpeakerReadinessItem_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES public."Speaker"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Speaker Speaker_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Speaker"
    ADD CONSTRAINT "Speaker_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: SupplyAllocationAudit SupplyAllocationAudit_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyAllocationAudit"
    ADD CONSTRAINT "SupplyAllocationAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON DELETE SET NULL;

--
-- Name: SupplyAllocationAudit SupplyAllocationAudit_allocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyAllocationAudit"
    ADD CONSTRAINT "SupplyAllocationAudit_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES public."SessionSupplyAllocation"(id) ON DELETE CASCADE;

--
-- Name: SupplyAllocationAudit SupplyAllocationAudit_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyAllocationAudit"
    ADD CONSTRAINT "SupplyAllocationAudit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SupplyDependency SupplyDependency_allocationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyDependency"
    ADD CONSTRAINT "SupplyDependency_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES public."SessionSupplyAllocation"(id) ON DELETE CASCADE;

--
-- Name: SupplyItem SupplyItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyItem"
    ADD CONSTRAINT "SupplyItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: SupplyTemplateItem SupplyTemplateItem_supplyItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplateItem"
    ADD CONSTRAINT "SupplyTemplateItem_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES public."SupplyItem"(id) ON DELETE SET NULL;

--
-- Name: SupplyTemplateItem SupplyTemplateItem_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplateItem"
    ADD CONSTRAINT "SupplyTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."SupplyTemplate"(id) ON DELETE CASCADE;

--
-- Name: SupplyTemplate SupplyTemplate_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplyTemplate"
    ADD CONSTRAINT "SupplyTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON DELETE CASCADE;

--
-- Name: TaskActivity TaskActivity_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskActivity"
    ADD CONSTRAINT "TaskActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TaskActivity TaskActivity_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskActivity"
    ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TaskAssignment TaskAssignment_assignedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskAssignment"
    ADD CONSTRAINT "TaskAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TaskAssignment TaskAssignment_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskAssignment"
    ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TaskAssignment TaskAssignment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskAssignment"
    ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: TaskComment TaskComment_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskComment"
    ADD CONSTRAINT "TaskComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: TaskComment TaskComment_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskComment"
    ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TaskLink TaskLink_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskLink"
    ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TaskWatcher TaskWatcher_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskWatcher"
    ADD CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public."Task"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TaskWatcher TaskWatcher_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TaskWatcher"
    ADD CONSTRAINT "TaskWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Task Task_canceledByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Task Task_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Task Task_completedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Task Task_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Task Task_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Task Task_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: TimelineDependency TimelineDependency_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineDependency"
    ADD CONSTRAINT "TimelineDependency_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimelineDependency TimelineDependency_predecessorItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineDependency"
    ADD CONSTRAINT "TimelineDependency_predecessorItemId_fkey" FOREIGN KEY ("predecessorItemId") REFERENCES public."TimelineItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimelineDependency TimelineDependency_successorItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineDependency"
    ADD CONSTRAINT "TimelineDependency_successorItemId_fkey" FOREIGN KEY ("successorItemId") REFERENCES public."TimelineItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimelineImportBatch TimelineImportBatch_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineImportBatch"
    ADD CONSTRAINT "TimelineImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimelineImportBatch TimelineImportBatch_requestedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineImportBatch"
    ADD CONSTRAINT "TimelineImportBatch_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimelineItem TimelineItem_dispositionActorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineItem"
    ADD CONSTRAINT "TimelineItem_dispositionActorUserId_fkey" FOREIGN KEY ("dispositionActorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TimelineItem TimelineItem_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineItem"
    ADD CONSTRAINT "TimelineItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: TimelineItem TimelineItem_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineItem"
    ADD CONSTRAINT "TimelineItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: TimelineItem TimelineItem_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TimelineItem"
    ADD CONSTRAINT "TimelineItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."TimelineItem"(id) ON DELETE SET NULL;

--
-- Name: UserDashboardLayout UserDashboardLayout_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserDashboardLayout"
    ADD CONSTRAINT "UserDashboardLayout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserDashboardLayout UserDashboardLayout_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserDashboardLayout"
    ADD CONSTRAINT "UserDashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: User User_orgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES public."Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- PostgreSQL database dump complete
--
