import {
  AccountType,
  EventSpeakerHeadshotState,
  EventStructureItemKind,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client'
import { randomBytes } from 'crypto'
import {
  EXPECTED_SOURCE_PROJECT,
  EXPECTED_TARGET_PROJECT,
  SOURCE_ACCOUNT_SLUG,
  SOURCE_EVENT_ID,
  SOURCE_EVENT_NAME,
  TARGET_ACCOUNT_NAME,
  assertExactSet,
  assertNoSourceIds,
  describeDatabaseUrl,
  deterministicCloneId,
  deterministicValue,
  lifecycleResponseCounts,
  loadDatabaseUrl,
  parseCloneOptions,
  rewriteJsonIds,
} from './clone-event-dev-to-prod-lib'

type DatabaseFingerprint = {
  databaseName: string
  databaseUser: string
  isReplica: boolean
  migrations: string[]
}

type TargetResolution = Awaited<ReturnType<typeof resolveTarget>>
type SourceGraph = Awaited<ReturnType<typeof loadSourceGraph>>

const REQUIRED_SOURCE_MIGRATIONS = [
  '20260904120000_add_event_collection_phase',
  '20260905153000_simplify_event_action_contract',
]
const REQUIRED_TARGET_MIGRATIONS = [
  ...REQUIRED_SOURCE_MIGRATIONS,
  '20260905180000_lock_down_data_api_access',
]

function makeClient(url: string) {
  const boundedUrl = new URL(url)
  // The audit fans out read queries, but this one-off tool must remain gentle on
  // Supabase's transaction pooler and never consume an application-sized pool.
  boundedUrl.searchParams.set('connection_limit', '3')
  boundedUrl.searchParams.set('pool_timeout', '30')
  if (boundedUrl.hostname.endsWith('.pooler.supabase.com')) {
    boundedUrl.searchParams.set('pgbouncer', 'true')
  }
  return new PrismaClient({
    datasources: { db: { url: boundedUrl.toString() } },
    log: [{ emit: 'event', level: 'error' }],
  })
}

async function fingerprintDatabase(
  db: PrismaClient,
  requiredMigrations: string[],
): Promise<DatabaseFingerprint> {
  const [identity] = await db.$queryRaw<
    Array<{ databaseName: string; databaseUser: string; isReplica: boolean }>
  >`SELECT current_database() AS "databaseName",
           current_user AS "databaseUser",
           pg_is_in_recovery() AS "isReplica"`
  const rows = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at
  `
  const migrations = rows.map((row) => row.migration_name)
  const missing = requiredMigrations.filter((name) => !migrations.includes(name))
  if (missing.length) throw new Error(`Database is missing required migrations: ${missing.join(', ')}`)
  if (identity.isReplica) throw new Error('Database unexpectedly resolved to a read replica')
  return { ...identity, migrations }
}

async function loadSourceGraph(source: PrismaClient) {
  const event = await source.event.findUnique({ where: { id: SOURCE_EVENT_ID } })
  if (!event || event.name !== SOURCE_EVENT_NAME) {
    throw new Error(
      `Source event must match both ID ${SOURCE_EVENT_ID} and name ${SOURCE_EVENT_NAME}`,
    )
  }
  const location = await source.location.findUnique({ where: { id: event.locationId } })
  if (!location) throw new Error(`Source event location ${event.locationId} does not exist`)
  const account = await source.account.findUnique({ where: { id: location.accountId } })
  if (!account || account.slug !== SOURCE_ACCOUNT_SLUG || account.accountType !== AccountType.EVENTS) {
    throw new Error(`Source event is not owned by the expected EVENTS account ${SOURCE_ACCOUNT_SLUG}`)
  }

  const [
    structureItems,
    speakerAssignments,
    surveyTargets,
    surveys,
    questions,
    responses,
    answerEventIntelligence,
    answerEventThemes,
    answerEventEntities,
    answerEventActions,
    intelligenceAggregates,
    issueClusters,
    issueEvidence,
    alertNotes,
    actionHistory,
    actionUpdates,
    actionDeliveries,
    actionDeliveryAttempts,
    insights,
    agendaImportJobs,
    agendaImportRows,
    closingBriefSnapshots,
    legacySessions,
  ] = await Promise.all([
    source.eventStructureItem.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventSessionSpeakerAssignment.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.surveyTarget.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.survey.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.question.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.response.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.answerEventIntelligence.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.answerEventTheme.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.answerEventEntity.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.answerEventAction.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventIntelligenceAggregate.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventIssueCluster.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventIssueEvidence.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventAlertNote.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventActionHistory.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventActionUpdate.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventActionAssignmentDelivery.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventActionDeliveryAttempt.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.insight.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventAgendaImportJob.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventAgendaImportRow.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.eventClosingBriefSnapshot.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
    source.session.findMany({ where: { eventId: event.id }, orderBy: { id: 'asc' } }),
  ])

  const responseIds = responses.map((row) => row.id)
  const answers = await source.answer.findMany({
    where: { responseId: { in: responseIds } },
    orderBy: { id: 'asc' },
  })
  const answerIds = answers.map((row) => row.id)
  const questionIds = questions.map((row) => row.id)
  const surveyIds = surveys.map((row) => row.id)
  const legacySessionIds = legacySessions.map((row) => row.id)
  const insightIds = insights.map((row) => row.id)

  const [
    publicSurveyLinks,
    questionAudioAssets,
    answerTranscripts,
    answerAnalyses,
    answerProcessingLogs,
    insightSourceAnswers,
    legacyTranscripts,
    legacyAnalyses,
    legacyProcessingLogs,
  ] = await Promise.all([
    source.publicSurveyLink.findMany({ where: { surveyId: { in: surveyIds } }, orderBy: { id: 'asc' } }),
    source.questionAudioAsset.findMany({ where: { questionId: { in: questionIds } }, orderBy: { id: 'asc' } }),
    source.answerTranscript.findMany({ where: { answerId: { in: answerIds } }, orderBy: { id: 'asc' } }),
    source.answerAnalysis.findMany({ where: { answerId: { in: answerIds } }, orderBy: { id: 'asc' } }),
    source.answerProcessingLog.findMany({ where: { answerId: { in: answerIds } }, orderBy: { id: 'asc' } }),
    source.insightSourceAnswer.findMany({ where: { insightId: { in: insightIds } }, orderBy: { id: 'asc' } }),
    source.transcript.findMany({ where: { sessionId: { in: legacySessionIds } }, orderBy: { id: 'asc' } }),
    source.analysis.findMany({ where: { sessionId: { in: legacySessionIds } }, orderBy: { id: 'asc' } }),
    source.processingLog.findMany({ where: { sessionId: { in: legacySessionIds } }, orderBy: { id: 'asc' } }),
  ])

  const referencedSpeakerIds = new Set(
    [
      ...speakerAssignments.map((row) => row.speakerId),
      ...surveyTargets.map((row) => row.speakerId),
      ...answers.map((row) => row.speakerId),
    ].filter((value): value is string => Boolean(value)),
  )
  const speakerProfiles = await source.eventSpeakerProfile.findMany({
    where: { id: { in: [...referencedSpeakerIds] } },
    orderBy: { id: 'asc' },
  })
  const referencedActionUserIds = new Set(
    compact([
      ...issueClusters.flatMap((row) => [
        row.ownerUserId,
        row.ownerAssignedByUserId,
        row.acknowledgedByUserId,
        row.actingByUserId,
        row.resolvedByUserId,
        row.dismissedByUserId,
        row.reopenedByUserId,
        row.actionConvertedByUserId,
      ]),
      ...actionHistory.map((row) => row.actorUserId),
      ...actionUpdates.map((row) => row.authorUserId),
      ...alertNotes.map((row) => row.authorUserId),
    ]),
  )
  const actionUsers = await source.user.findMany({
    where: { id: { in: [...referencedActionUserIds] } },
    orderBy: { id: 'asc' },
  })

  return {
    account,
    location,
    event,
    structureItems,
    speakerProfiles,
    actionUsers,
    speakerAssignments,
    surveyTargets,
    surveys,
    questions,
    questionAudioAssets,
    publicSurveyLinks,
    responses,
    answers,
    answerTranscripts,
    answerAnalyses,
    answerProcessingLogs,
    answerEventIntelligence,
    answerEventThemes,
    answerEventEntities,
    answerEventActions,
    intelligenceAggregates,
    issueClusters,
    issueEvidence,
    alertNotes,
    actionHistory,
    actionUpdates,
    actionDeliveries,
    actionDeliveryAttempts,
    insights,
    insightSourceAnswers,
    agendaImportJobs,
    agendaImportRows,
    closingBriefSnapshots,
    legacySessions,
    legacyTranscripts,
    legacyAnalyses,
    legacyProcessingLogs,
  }
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined)
}

function auditSourceScope(graph: SourceGraph) {
  const structureIds = new Set(graph.structureItems.map((row) => row.id))
  const assignmentIds = new Set(graph.speakerAssignments.map((row) => row.id))
  const speakerIds = new Set(graph.speakerProfiles.map((row) => row.id))
  const targetIds = new Set(graph.surveyTargets.map((row) => row.id))
  const surveyIds = new Set(graph.surveys.map((row) => row.id))
  const questionIds = new Set(graph.questions.map((row) => row.id))
  const linkIds = new Set(graph.publicSurveyLinks.map((row) => row.id))
  const responseIds = new Set(graph.responses.map((row) => row.id))
  const answerIds = new Set(graph.answers.map((row) => row.id))
  const intelligenceIds = new Set(graph.answerEventIntelligence.map((row) => row.id))
  const clusterIds = new Set(graph.issueClusters.map((row) => row.id))
  const insightIds = new Set(graph.insights.map((row) => row.id))
  const legacySessionIds = new Set(graph.legacySessions.map((row) => row.id))

  if (speakerIds.size !== new Set([...speakerIds]).size) throw new Error('Duplicate source speaker IDs')
  const expectedAccount = new Set([graph.account.id])
  const expectedLocation = new Set([graph.location.id])
  assertExactSet('Speaker profile account', graph.speakerProfiles.map((row) => row.accountId), expectedAccount)
  assertExactSet('Speaker assignment account', graph.speakerAssignments.map((row) => row.accountId), expectedAccount)
  assertExactSet('Answer intelligence account', graph.answerEventIntelligence.map((row) => row.accountId), expectedAccount)
  assertExactSet('Aggregate account', graph.intelligenceAggregates.map((row) => row.accountId), expectedAccount)
  assertExactSet('Issue cluster account', graph.issueClusters.map((row) => row.accountId), expectedAccount)
  assertExactSet('Issue evidence account', graph.issueEvidence.map((row) => row.accountId), expectedAccount)
  assertExactSet('Alert note account', graph.alertNotes.map((row) => row.accountId), expectedAccount)
  assertExactSet('Action history account', graph.actionHistory.map((row) => row.accountId), expectedAccount)
  assertExactSet('Action update account', graph.actionUpdates.map((row) => row.accountId), expectedAccount)
  assertExactSet('Answer intelligence location', graph.answerEventIntelligence.map((row) => row.locationId), expectedLocation)
  assertExactSet('Aggregate location', graph.intelligenceAggregates.map((row) => row.locationId), expectedLocation)
  assertExactSet('Issue cluster location', graph.issueClusters.map((row) => row.locationId), expectedLocation)
  assertExactSet('Issue evidence location', graph.issueEvidence.map((row) => row.locationId), expectedLocation)
  assertExactSet('Structure parent', compact(graph.structureItems.map((row) => row.parentId)), structureIds)
  assertExactSet('Assignment session', compact(graph.speakerAssignments.map((row) => row.sessionId)), structureIds)
  assertExactSet('Assignment speaker', graph.speakerAssignments.map((row) => row.speakerId), speakerIds)
  assertExactSet('Target structure', compact(graph.surveyTargets.map((row) => row.eventStructureItemId)), structureIds)
  assertExactSet('Target assignment', compact(graph.surveyTargets.map((row) => row.speakerAssignmentId)), assignmentIds)
  assertExactSet('Target speaker', compact(graph.surveyTargets.map((row) => row.speakerId)), speakerIds)
  assertExactSet('Survey target', compact(graph.surveys.map((row) => row.surveyTargetId)), targetIds)
  assertExactSet('Question survey', compact(graph.questions.map((row) => row.surveyId)), surveyIds)
  assertExactSet('Public link survey', graph.publicSurveyLinks.map((row) => row.surveyId), surveyIds)
  assertExactSet('Public link target', compact(graph.publicSurveyLinks.map((row) => row.surveyTargetId)), targetIds)
  assertExactSet('Public link assignment', compact(graph.publicSurveyLinks.map((row) => row.speakerAssignmentId)), assignmentIds)
  assertExactSet('Response survey', compact(graph.responses.map((row) => row.surveyId)), surveyIds)
  assertExactSet('Response target', compact(graph.responses.map((row) => row.surveyTargetId)), targetIds)
  assertExactSet('Response public link', compact(graph.responses.map((row) => row.publicSurveyLinkId)), linkIds)
  assertExactSet('Response assignment', compact(graph.responses.map((row) => row.speakerAssignmentId)), assignmentIds)
  assertExactSet('Answer response', graph.answers.map((row) => row.responseId), responseIds)
  assertExactSet('Answer question', compact(graph.answers.map((row) => row.questionId)), questionIds)
  assertExactSet('Answer speaker', compact(graph.answers.map((row) => row.speakerId)), speakerIds)
  assertExactSet('Transcript answer', graph.answerTranscripts.map((row) => row.answerId), answerIds)
  assertExactSet('Analysis answer', graph.answerAnalyses.map((row) => row.answerId), answerIds)
  assertExactSet('Intelligence answer', graph.answerEventIntelligence.map((row) => row.answerId), answerIds)
  assertExactSet('Theme intelligence', graph.answerEventThemes.map((row) => row.intelligenceId), intelligenceIds)
  assertExactSet('Entity intelligence', graph.answerEventEntities.map((row) => row.intelligenceId), intelligenceIds)
  assertExactSet('Answer action intelligence', graph.answerEventActions.map((row) => row.intelligenceId), intelligenceIds)
  assertExactSet('Issue evidence cluster', graph.issueEvidence.map((row) => row.clusterId), clusterIds)
  assertExactSet('Issue evidence answer', graph.issueEvidence.map((row) => row.answerId), answerIds)
  assertExactSet('Issue evidence response', graph.issueEvidence.map((row) => row.responseId), responseIds)
  assertExactSet('Action history cluster', graph.actionHistory.map((row) => row.clusterId), clusterIds)
  assertExactSet('Action update cluster', graph.actionUpdates.map((row) => row.clusterId), clusterIds)
  assertExactSet('Alert note cluster', graph.alertNotes.map((row) => row.clusterId), clusterIds)
  assertExactSet('Insight source insight', graph.insightSourceAnswers.map((row) => row.insightId), insightIds)
  assertExactSet('Insight source answer', graph.insightSourceAnswers.map((row) => row.answerId), answerIds)
  assertExactSet('Legacy transcript session', graph.legacyTranscripts.map((row) => row.sessionId), legacySessionIds)
  assertExactSet('Legacy analysis session', graph.legacyAnalyses.map((row) => row.sessionId), legacySessionIds)

  const locationRefs = compact([
    ...graph.structureItems.map((row) => row.locationId),
    ...graph.surveyTargets.map((row) => row.locationId),
    ...graph.legacySessions.map((row) => row.locationId),
  ])
  assertExactSet('Event-owned location', locationRefs, new Set([graph.location.id]))
}

function sourceActionUserIds(graph: SourceGraph) {
  return new Set(
    compact([
      ...graph.issueClusters.flatMap((row) => [
        row.ownerUserId,
        row.ownerAssignedByUserId,
        row.acknowledgedByUserId,
        row.actingByUserId,
        row.resolvedByUserId,
        row.dismissedByUserId,
        row.reopenedByUserId,
        row.actionConvertedByUserId,
      ]),
      ...graph.actionHistory.map((row) => row.actorUserId),
      ...graph.actionUpdates.map((row) => row.authorUserId),
      ...graph.alertNotes.map((row) => row.authorUserId),
    ]),
  )
}

function sameNullableText(left: string | null, right: string | null) {
  return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase()
}

async function resolveTarget(target: PrismaClient, graph: SourceGraph) {
  const accounts = await target.account.findMany({
    where: { name: TARGET_ACCOUNT_NAME, accountType: AccountType.EVENTS, isActive: true },
    orderBy: { id: 'asc' },
  })
  if (accounts.length !== 1) {
    throw new Error(
      `Expected exactly one active EVENTS account named ${TARGET_ACCOUNT_NAME}; found ${accounts.length}`,
    )
  }
  const account = accounts[0]
  const accountLocations = await target.location.findMany({
    where: { accountId: account.id },
    orderBy: { id: 'asc' },
  })

  const targetEventId = deterministicCloneId('event', graph.event.id)
  const globalIdCollision = await target.event.findUnique({ where: { id: targetEventId } })
  const accountEventCollisions = await target.event.findMany({
    where: {
      locationId: { in: accountLocations.map((location) => location.id) },
      name: SOURCE_EVENT_NAME,
    },
    select: { id: true, name: true, locationId: true },
  })
  if (globalIdCollision || accountEventCollisions.length) {
    const collisions = [
      ...(globalIdCollision ? [globalIdCollision.id] : []),
      ...accountEventCollisions.map((event) => event.id),
    ]
    throw new Error(
      `Target event identity already exists; refusing to duplicate or overwrite (${[...new Set(collisions)].join(', ')})`,
    )
  }

  const sameNameLocations = accountLocations.filter(
    (location) => location.name.trim().toLowerCase() === graph.location.name.trim().toLowerCase(),
  )
  if (sameNameLocations.length > 1) {
    throw new Error(`Multiple target locations match source location name ${graph.location.name}`)
  }
  let location = sameNameLocations[0] ?? null
  let createLocation = false
  if (location) {
    const compatible =
      sameNullableText(location.address, graph.location.address) &&
      sameNullableText(location.city, graph.location.city) &&
      sameNullableText(location.state, graph.location.state) &&
      sameNullableText(location.postalCode, graph.location.postalCode) &&
      location.country === graph.location.country &&
      location.timezone === graph.location.timezone
    if (!compatible) {
      throw new Error(
        `Target location ${location.id} matches by name but has conflicting address/timezone fields`,
      )
    }
  } else {
    const id = deterministicCloneId('location', graph.location.id)
    const slug = `${graph.location.slug}-clone-${id.slice(-8)}`
    const [idCollision, slugCollision] = await Promise.all([
      target.location.findUnique({ where: { id } }),
      target.location.findUnique({ where: { accountId_slug: { accountId: account.id, slug } } }),
    ])
    if (idCollision || slugCollision) {
      throw new Error('Deterministic target location identity already exists; refusing partial reuse')
    }
    location = { ...graph.location, id, accountId: account.id, slug }
    createLocation = true
  }

  const sourceUserIds = sourceActionUserIds(graph)
  const sourceUsers = graph.actionUsers
  if (sourceUsers.length !== sourceUserIds.size) {
    throw new Error(
      `Found ${sourceUsers.length} of ${sourceUserIds.size} source users referenced by canonical actions`,
    )
  }
  for (const user of sourceUsers) {
    if (user.role !== UserRole.SUPER_ADMIN && user.accountId !== graph.account.id) {
      throw new Error(`Source action user ${user.id} belongs to an unrelated account`)
    }
  }
  const accountUsers = await target.user.findMany({
    where: {
      isActive: true,
      OR: [
        { accountId: account.id },
        { accountMemberships: { some: { accountId: account.id } } },
      ],
    },
    orderBy: { id: 'asc' },
  })
  const userMap = new Map<string, string>()
  const userMappings: Array<{ source: string; target: string; match: string }> = []
  for (const sourceUser of sourceUsers) {
    let candidates
    let match
    if (sourceUser.role === UserRole.SUPER_ADMIN) {
      candidates = await target.user.findMany({
        where: {
          email: { equals: sourceUser.email, mode: 'insensitive' },
          role: UserRole.SUPER_ADMIN,
          isActive: true,
        },
      })
      match = `SUPER_ADMIN email ${sourceUser.email}`
    } else {
      candidates = accountUsers.filter(
        (candidate) =>
          candidate.role === sourceUser.role &&
          sameNullableText(candidate.firstName, sourceUser.firstName) &&
          sameNullableText(candidate.lastName, sourceUser.lastName),
      )
      match = `${sourceUser.firstName ?? ''} ${sourceUser.lastName ?? ''} / ${sourceUser.role}`.trim()
    }
    if (candidates.length !== 1) {
      throw new Error(
        `Could not uniquely map source action user ${sourceUser.id} (${match}); found ${candidates.length} target candidates`,
      )
    }
    userMap.set(sourceUser.id, candidates[0].id)
    userMappings.push({ source: sourceUser.id, target: candidates[0].id, match })
  }

  const targetProfiles = await target.eventSpeakerProfile.findMany({
    where: { accountId: account.id, isArchived: false },
    orderBy: { id: 'asc' },
  })
  const speakerMap = new Map<string, string>()
  const reusedSpeakerIds = new Set<string>()
  const newSpeakers = [] as SourceGraph['speakerProfiles']
  for (const speaker of graph.speakerProfiles) {
    const candidates = targetProfiles.filter((candidate) => {
      if (speaker.normalizedEmail) return candidate.normalizedEmail === speaker.normalizedEmail
      return (
        candidate.normalizedName === speaker.normalizedName &&
        sameNullableText(candidate.name, speaker.name) &&
        sameNullableText(candidate.title, speaker.title) &&
        sameNullableText(candidate.organization, speaker.organization)
      )
    })
    if (candidates.length > 1) {
      throw new Error(`Multiple target speaker profiles match source speaker ${speaker.name}`)
    }
    if (candidates.length === 1) {
      speakerMap.set(speaker.id, candidates[0].id)
      reusedSpeakerIds.add(candidates[0].id)
    } else {
      speakerMap.set(speaker.id, deterministicCloneId('speaker', speaker.id))
      newSpeakers.push(speaker)
    }
  }
  if (speakerMap.size !== graph.speakerProfiles.length) {
    throw new Error('Speaker mapping is incomplete')
  }
  if (new Set(speakerMap.values()).size !== speakerMap.size) {
    throw new Error('Speaker mapping is not one-to-one')
  }

  return {
    account,
    location,
    createLocation,
    targetEventId,
    userMap,
    userMappings,
    speakerMap,
    reusedSpeakerIds,
    newSpeakers,
  }
}

function addMappedIds(graph: SourceGraph, targetResolution: TargetResolution) {
  const idMap = new Map<string, string>([
    [graph.account.id, targetResolution.account.id],
    [graph.location.id, targetResolution.location.id],
    [graph.event.id, targetResolution.targetEventId],
    ...targetResolution.userMap,
    ...targetResolution.speakerMap,
  ])
  const groups: Array<[string, Array<{ id: string }>]> = [
    ['structure', graph.structureItems],
    ['assignment', graph.speakerAssignments],
    ['survey_target', graph.surveyTargets],
    ['survey', graph.surveys],
    ['question', graph.questions],
    ['public_link', graph.publicSurveyLinks],
    ['response', graph.responses],
    ['answer', graph.answers],
    ['answer_transcript', graph.answerTranscripts],
    ['answer_analysis', graph.answerAnalyses],
    ['answer_intelligence', graph.answerEventIntelligence],
    ['answer_theme', graph.answerEventThemes],
    ['answer_entity', graph.answerEventEntities],
    ['answer_action', graph.answerEventActions],
    ['intelligence_aggregate', graph.intelligenceAggregates],
    ['issue_cluster', graph.issueClusters],
    ['issue_evidence', graph.issueEvidence],
    ['alert_note', graph.alertNotes],
    ['action_history', graph.actionHistory],
    ['action_update', graph.actionUpdates],
    ['insight', graph.insights],
    ['insight_source', graph.insightSourceAnswers],
    ['legacy_session', graph.legacySessions],
    ['legacy_transcript', graph.legacyTranscripts],
    ['legacy_analysis', graph.legacyAnalyses],
  ]
  for (const [entity, rows] of groups) {
    for (const row of rows) idMap.set(row.id, deterministicCloneId(entity, row.id))
  }
  for (const response of graph.responses) {
    idMap.set(response.anonymousId, deterministicValue('anonymous_response', response.anonymousId))
  }
  return idMap
}

function mapped(idMap: ReadonlyMap<string, string>, value: string): string
function mapped(idMap: ReadonlyMap<string, string>, value: string | null): string | null
function mapped(idMap: ReadonlyMap<string, string>, value: string | null) {
  if (value === null) return null
  const result = idMap.get(value)
  if (!result) throw new Error(`Missing deterministic mapping for ${value}`)
  return result
}

function mappedJson(value: Prisma.JsonValue | null, idMap: ReadonlyMap<string, string>) {
  if (value === null) return Prisma.DbNull
  return rewriteJsonIds(value, idMap) as Prisma.InputJsonValue
}

function prepareRows(graph: SourceGraph, targetResolution: TargetResolution) {
  const idMap = addMappedIds(graph, targetResolution)
  const accountId = targetResolution.account.id
  const locationId = targetResolution.location.id
  const eventId = targetResolution.targetEventId

  const { id: _eventId, locationId: _eventLocationId, questionsJson, ...eventRest } = graph.event
  const event: Prisma.EventUncheckedCreateInput = {
    ...eventRest,
    id: eventId,
    locationId,
    questionsJson: mappedJson(questionsJson, idMap),
  }

  const speakers = targetResolution.newSpeakers.map((row) => {
    const {
      id,
      accountId: _accountId,
      headshotObjectKey,
      headshotMimeType,
      headshotState,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      accountId,
      headshotObjectKey: null,
      headshotMimeType: null,
      headshotState: headshotObjectKey ? EventSpeakerHeadshotState.NONE : headshotState,
    }
  })

  const structures = graph.structureItems.map((row) => {
    const { id, eventId: _eventId, parentId, locationId: sourceLocationId, metadata, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      eventId,
      parentId: mapped(idMap, parentId),
      locationId: mapped(idMap, sourceLocationId),
      metadata: mappedJson(metadata, idMap),
    }
  })
  const assignments = graph.speakerAssignments.map((row) => {
    const { id, accountId: _accountId, eventId: _eventId, sessionId, speakerId, metadata, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      accountId,
      eventId,
      sessionId: mapped(idMap, sessionId),
      speakerId: mapped(idMap, speakerId),
      metadata: mappedJson(metadata, idMap),
    }
  })
  const surveyTargets = graph.surveyTargets.map((row) => {
    const {
      id,
      eventId: _eventId,
      locationId: sourceLocationId,
      eventStructureItemId,
      speakerAssignmentId,
      speakerId,
      metadata,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      eventId,
      locationId: mapped(idMap, sourceLocationId),
      eventStructureItemId: mapped(idMap, eventStructureItemId),
      speakerAssignmentId: mapped(idMap, speakerAssignmentId),
      speakerId: mapped(idMap, speakerId),
      metadata: mappedJson(metadata, idMap),
    }
  })
  const surveys = graph.surveys.map((row) => {
    const { id, eventId: _eventId, surveyTargetId, settingsJson, creationRequestId, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      eventId,
      surveyTargetId: mapped(idMap, surveyTargetId),
      settingsJson: mappedJson(settingsJson, idMap),
      creationRequestId: creationRequestId
        ? deterministicValue('survey_creation_request', `${id}:${creationRequestId}`)
        : null,
    }
  })
  const questions = graph.questions.map((row) => {
    const { id, eventId: _eventId, surveyId, configurationJson, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      eventId,
      surveyId: mapped(idMap, surveyId),
      configurationJson: mappedJson(configurationJson, idMap),
    }
  })
  const publicLinks = graph.publicSurveyLinks.map((row) => {
    const { id, surveyId, surveyTargetId, speakerAssignmentId, token: _token, metadata, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      speakerAssignmentId: mapped(idMap, speakerAssignmentId),
      token: `prod-clone-${randomBytes(24).toString('base64url')}`,
      metadata: mappedJson(metadata, idMap),
    }
  })
  const responses = graph.responses.map((row) => {
    const {
      id,
      eventId: _eventId,
      surveyId,
      surveyTargetId,
      publicSurveyLinkId,
      speakerAssignmentId,
      anonymousId,
      metadata: _metadata,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      publicSurveyLinkId: mapped(idMap, publicSurveyLinkId),
      speakerAssignmentId: mapped(idMap, speakerAssignmentId),
      anonymousId: mapped(idMap, anonymousId),
      metadata: Prisma.DbNull,
    }
  })
  const answers = graph.answers.map((row) => {
    const {
      id,
      responseId,
      questionId,
      speakerId,
      objectKey: _objectKey,
      objectEtag: _objectEtag,
      mimeType: _mimeType,
      fileSizeBytes: _fileSizeBytes,
      durationMs: _durationMs,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      responseId: mapped(idMap, responseId),
      questionId: mapped(idMap, questionId),
      speakerId: mapped(idMap, speakerId),
      objectKey: null,
      objectEtag: null,
      mimeType: null,
      fileSizeBytes: null,
      durationMs: null,
    }
  })
  const answerTranscripts = graph.answerTranscripts.map((row) => {
    const { id, answerId, wordsJson, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      answerId: mapped(idMap, answerId),
      wordsJson: mappedJson(wordsJson, idMap),
    }
  })
  const answerAnalyses = graph.answerAnalyses.map((row) => {
    const { id, answerId, themesJson, actionsJson, entitiesJson, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      answerId: mapped(idMap, answerId),
      themesJson: mappedJson(themesJson, idMap),
      actionsJson: mappedJson(actionsJson, idMap),
      entitiesJson: mappedJson(entitiesJson, idMap),
    }
  })
  const answerIntelligence = graph.answerEventIntelligence.map((row) => {
    const {
      id,
      accountId: _accountId,
      locationId: _locationId,
      eventId: _eventId,
      surveyId,
      surveyTargetId,
      responseId,
      answerId,
      questionId,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      accountId,
      locationId,
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      responseId: mapped(idMap, responseId),
      answerId: mapped(idMap, answerId),
      questionId: mapped(idMap, questionId),
    }
  })
  const answerThemes = graph.answerEventThemes.map((row) => {
    const { id, intelligenceId, eventId: _eventId, surveyId, surveyTargetId, answerId, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      intelligenceId: mapped(idMap, intelligenceId),
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      answerId: mapped(idMap, answerId),
    }
  })
  const answerEntities = graph.answerEventEntities.map((row) => {
    const { id, intelligenceId, eventId: _eventId, surveyId, surveyTargetId, answerId, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      intelligenceId: mapped(idMap, intelligenceId),
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      answerId: mapped(idMap, answerId),
    }
  })
  const answerActions = graph.answerEventActions.map((row) => {
    const { id, intelligenceId, eventId: _eventId, surveyId, surveyTargetId, answerId, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      intelligenceId: mapped(idMap, intelligenceId),
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      answerId: mapped(idMap, answerId),
    }
  })
  const aggregates = graph.intelligenceAggregates.map((row) => {
    const {
      id,
      accountId: _accountId,
      locationId: _locationId,
      eventId: _eventId,
      surveyId,
      surveyTargetId,
      questionId,
      bucketKey,
      topThemesJson,
      topEntitiesJson,
      topActionsJson,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      accountId,
      locationId,
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      questionId: mapped(idMap, questionId),
      bucketKey: idMap.get(bucketKey) ?? bucketKey,
      topThemesJson: mappedJson(topThemesJson, idMap),
      topEntitiesJson: mappedJson(topEntitiesJson, idMap),
      topActionsJson: mappedJson(topActionsJson, idMap),
    }
  })

  const mapUser = (sourceId: string | null) => mapped(idMap, sourceId)
  const clusters = graph.issueClusters.map((row) => {
    const {
      id,
      clusterKey,
      accountId: _accountId,
      locationId: _locationId,
      eventId: _eventId,
      surveyId,
      surveyTargetId,
      questionId,
      metricSnapshotJson,
      ownerUserId,
      ownerAssignedByUserId,
      acknowledgedByUserId,
      actingByUserId,
      resolvedByUserId,
      dismissedByUserId,
      reopenedByUserId,
      actionConvertedByUserId,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      clusterKey: deterministicValue('cluster_key', `${id}:${clusterKey}`),
      accountId,
      locationId,
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      questionId: mapped(idMap, questionId),
      metricSnapshotJson: mappedJson(metricSnapshotJson, idMap),
      ownerUserId: mapUser(ownerUserId),
      ownerAssignedByUserId: mapUser(ownerAssignedByUserId),
      acknowledgedByUserId: mapUser(acknowledgedByUserId),
      actingByUserId: mapUser(actingByUserId),
      resolvedByUserId: mapUser(resolvedByUserId),
      dismissedByUserId: mapUser(dismissedByUserId),
      reopenedByUserId: mapUser(reopenedByUserId),
      actionConvertedByUserId: mapUser(actionConvertedByUserId),
    }
  })
  const evidence = graph.issueEvidence.map((row) => {
    const {
      id,
      clusterId,
      accountId: _accountId,
      locationId: _locationId,
      eventId: _eventId,
      surveyId,
      surveyTargetId,
      responseId,
      answerId,
      questionId,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      clusterId: mapped(idMap, clusterId),
      accountId,
      locationId,
      eventId,
      surveyId: mapped(idMap, surveyId),
      surveyTargetId: mapped(idMap, surveyTargetId),
      responseId: mapped(idMap, responseId),
      answerId: mapped(idMap, answerId),
      questionId: mapped(idMap, questionId),
    }
  })
  const notes = graph.alertNotes.map((row) => {
    const { id, clusterId, accountId: _accountId, eventId: _eventId, authorUserId, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      clusterId: mapped(idMap, clusterId),
      accountId,
      eventId,
      authorUserId: mapUser(authorUserId)!,
    }
  })
  const histories = graph.actionHistory.map((row) => {
    const {
      id,
      clusterId,
      accountId: _accountId,
      eventId: _eventId,
      actorUserId,
      idempotencyKey,
      fromValue,
      toValue,
      detailsJson,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      clusterId: mapped(idMap, clusterId),
      accountId,
      eventId,
      actorUserId: mapUser(actorUserId)!,
      idempotencyKey: deterministicValue('action_history_key', `${id}:${idempotencyKey}`),
      fromValue: fromValue ? idMap.get(fromValue) ?? fromValue : null,
      toValue: toValue ? idMap.get(toValue) ?? toValue : null,
      detailsJson: mappedJson(detailsJson, idMap),
    }
  })
  const updates = graph.actionUpdates.map((row) => {
    const {
      id,
      clusterId,
      accountId: _accountId,
      eventId: _eventId,
      authorUserId,
      idempotencyKey,
      voiceObjectKey: _voiceObjectKey,
      voiceMimeType: _voiceMimeType,
      voiceDurationMs: _voiceDurationMs,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      clusterId: mapped(idMap, clusterId),
      accountId,
      eventId,
      authorUserId: mapUser(authorUserId)!,
      idempotencyKey: deterministicValue('action_update_key', `${id}:${idempotencyKey}`),
      voiceObjectKey: null,
      voiceMimeType: null,
      voiceDurationMs: null,
    }
  })
  const insights = graph.insights.map((row) => {
    const { id, eventId: _eventId, ...rest } = row
    return { ...rest, id: mapped(idMap, id), eventId }
  })
  const insightSources = graph.insightSourceAnswers.map((row) => {
    const { id, insightId, answerId } = row
    return {
      id: mapped(idMap, id),
      insightId: mapped(idMap, insightId),
      answerId: mapped(idMap, answerId),
    }
  })
  const legacySessions = graph.legacySessions.map((row) => {
    const {
      id,
      eventId: _eventId,
      locationId: _locationId,
      boothId: _boothId,
      objectKey: _objectKey,
      objectEtag: _objectEtag,
      ...rest
    } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      eventId,
      locationId,
      boothId: null,
      objectKey: null,
      objectEtag: null,
    }
  })
  const legacyTranscripts = graph.legacyTranscripts.map((row) => {
    const { id, sessionId, wordsJson, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      sessionId: mapped(idMap, sessionId),
      wordsJson: mappedJson(wordsJson, idMap),
    }
  })
  const legacyAnalyses = graph.legacyAnalyses.map((row) => {
    const { id, sessionId, themesJson, entitiesJson, actionsJson, ...rest } = row
    return {
      ...rest,
      id: mapped(idMap, id),
      sessionId: mapped(idMap, sessionId),
      themesJson: mappedJson(themesJson, idMap),
      entitiesJson: mappedJson(entitiesJson, idMap),
      actionsJson: mappedJson(actionsJson, idMap),
    }
  })

  return {
    idMap,
    event,
    speakers,
    structures,
    assignments,
    surveyTargets,
    surveys,
    questions,
    publicLinks,
    responses,
    answers,
    answerTranscripts,
    answerAnalyses,
    answerIntelligence,
    answerThemes,
    answerEntities,
    answerActions,
    aggregates,
    clusters,
    evidence,
    notes,
    histories,
    updates,
    insights,
    insightSources,
    legacySessions,
    legacyTranscripts,
    legacyAnalyses,
  }
}

type PreparedRows = ReturnType<typeof prepareRows>

function sourceCounts(graph: SourceGraph) {
  return [
    ['Event', 1],
    ['EventStructureItem', graph.structureItems.length],
    ['EventSpeakerProfile (referenced only)', graph.speakerProfiles.length],
    ['EventSessionSpeakerAssignment', graph.speakerAssignments.length],
    ['SurveyTarget', graph.surveyTargets.length],
    ['Survey', graph.surveys.length],
    ['Question', graph.questions.length],
    ['QuestionAudioAsset', graph.questionAudioAssets.length],
    ['PublicSurveyLink', graph.publicSurveyLinks.length],
    ['Response', graph.responses.length],
    ['Answer', graph.answers.length],
    ['AnswerTranscript', graph.answerTranscripts.length],
    ['AnswerAnalysis', graph.answerAnalyses.length],
    ['AnswerProcessingLog', graph.answerProcessingLogs.length],
    ['AnswerEventIntelligence', graph.answerEventIntelligence.length],
    ['AnswerEventTheme', graph.answerEventThemes.length],
    ['AnswerEventEntity', graph.answerEventEntities.length],
    ['AnswerEventAction', graph.answerEventActions.length],
    ['EventIntelligenceAggregate', graph.intelligenceAggregates.length],
    ['EventIssueCluster', graph.issueClusters.length],
    ['EventIssueEvidence', graph.issueEvidence.length],
    ['EventAlertNote', graph.alertNotes.length],
    ['EventActionHistory', graph.actionHistory.length],
    ['EventActionUpdate', graph.actionUpdates.length],
    ['EventActionAssignmentDelivery', graph.actionDeliveries.length],
    ['EventActionDeliveryAttempt', graph.actionDeliveryAttempts.length],
    ['Insight', graph.insights.length],
    ['InsightSourceAnswer', graph.insightSourceAnswers.length],
    ['EventAgendaImportJob', graph.agendaImportJobs.length],
    ['EventAgendaImportRow', graph.agendaImportRows.length],
    ['EventClosingBriefSnapshot', graph.closingBriefSnapshots.length],
    ['Session (legacy)', graph.legacySessions.length],
    ['Transcript (legacy)', graph.legacyTranscripts.length],
    ['Analysis (legacy)', graph.legacyAnalyses.length],
    ['ProcessingLog (legacy)', graph.legacyProcessingLogs.length],
  ] as Array<[string, number]>
}

function printAudit(
  sourceDescription: ReturnType<typeof describeDatabaseUrl>,
  targetDescription: ReturnType<typeof describeDatabaseUrl>,
  sourceFingerprint: DatabaseFingerprint,
  targetFingerprint: DatabaseFingerprint,
  graph: SourceGraph,
  targetResolution: TargetResolution,
) {
  const lifecycle = lifecycleResponseCounts(graph.responses)
  const phaseRows = new Map<string, number>()
  for (const response of graph.responses) {
    const key = `${response.collectionPhase ?? 'NULL'} / ${response.status}`
    phaseRows.set(key, (phaseRows.get(key) ?? 0) + 1)
  }
  const surveyPhaseRows = new Map<string, number>()
  for (const survey of graph.surveys) {
    const key = `${survey.collectionPhase ?? 'NULL'} / ${survey.status}`
    surveyPhaseRows.set(key, (surveyPhaseRows.get(key) ?? 0) + 1)
  }

  console.log('\nENVIRONMENT VERIFICATION')
  console.table([
    {
      environment: 'SOURCE / DEV',
      project: sourceDescription.projectRef,
      host: sourceDescription.host,
      port: sourceDescription.port,
      database: sourceFingerprint.databaseName,
      user: sourceFingerprint.databaseUser,
    },
    {
      environment: 'TARGET / PROD',
      project: targetDescription.projectRef,
      host: targetDescription.host,
      port: targetDescription.port,
      database: targetFingerprint.databaseName,
      user: targetFingerprint.databaseUser,
    },
  ])
  console.log('\nIDENTITY VERIFICATION')
  console.table([
    { item: 'Source account', id: graph.account.id, identity: `${graph.account.name} (${graph.account.slug})` },
    { item: 'Source event', id: graph.event.id, identity: graph.event.name },
    {
      item: 'Target account',
      id: targetResolution.account.id,
      identity: `${targetResolution.account.name} (${targetResolution.account.slug})`,
    },
    {
      item: 'Target location',
      id: targetResolution.location.id,
      identity: `${targetResolution.location.name} (${targetResolution.createLocation ? 'create' : 'reuse PROD-native'})`,
    },
    { item: 'Planned target event', id: targetResolution.targetEventId, identity: SOURCE_EVENT_NAME },
  ])
  console.log('\nSOURCE EVENT INVENTORY')
  console.table(sourceCounts(graph).map(([entity, count]) => ({ entity, count })))
  console.log('\nRESPONSE LIFECYCLE (PRESERVED EXACTLY)')
  console.table([...phaseRows].map(([phaseAndStatus, count]) => ({ phaseAndStatus, count })))
  console.log('\nSURVEY LIFECYCLE (PRESERVED EXACTLY)')
  console.table([...surveyPhaseRows].map(([phaseAndStatus, count]) => ({ phaseAndStatus, count })))
  console.log('\nDASHBOARD RESPONSE VALIDATION')
  console.table([
    { dashboard: 'PRE', completedResponses: lifecycle.pre, rule: 'PRE' },
    { dashboard: 'DURING', completedResponses: lifecycle.during, rule: 'DURING' },
    { dashboard: 'POST', completedResponses: lifecycle.postDashboard, rule: 'DURING + POST' },
  ])
  console.log('\nTARGET-NATIVE IDENTITY MAPPINGS (NO USERS/MEMBERSHIPS COPIED)')
  console.table(targetResolution.userMappings)
  console.table([
    {
      entity: 'EventSpeakerProfile',
      sourceReferenced: graph.speakerProfiles.length,
      reuseExistingProd: targetResolution.reusedSpeakerIds.size,
      createWithNewIds: targetResolution.newSpeakers.length,
    },
  ])
  console.log('\nTRANSFER POLICY')
  console.table([
    { records: 'Core event graph, surveys, responses, transcripts, normalized intelligence, aggregates, findings/evidence, actions/history/updates', policy: 'COPY with remapped IDs/FKs' },
    { records: `PublicSurveyLink (${graph.publicSurveyLinks.length})`, policy: 'COPY relationship; generate new PROD token' },
    { records: `Answer audio object references (${graph.answers.filter((row) => row.objectKey).length})`, policy: 'DO NOT COPY storage keys; transcripts/intelligence retained' },
    { records: `QuestionAudioAsset (${graph.questionAudioAssets.length})`, policy: 'REGENERATE on demand in PROD' },
    { records: `EventClosingBriefSnapshot (${graph.closingBriefSnapshots.length})`, policy: 'REGENERATE in PROD' },
    { records: `Processing logs (${graph.answerProcessingLogs.length + graph.legacyProcessingLogs.length})`, policy: 'OMIT environment/debug history' },
    { records: `Action delivery/outbox rows (${graph.actionDeliveries.length + graph.actionDeliveryAttempts.length})`, policy: 'OMIT; prevent PROD notifications/replay' },
    { records: `Agenda import provenance (${graph.agendaImportJobs.length + graph.agendaImportRows.length})`, policy: 'OMIT; resultant sessions/speakers are copied' },
    { records: `Response device metadata (${graph.responses.filter((row) => row.metadata !== null).length})`, policy: 'OMIT environment/client telemetry' },
    { records: 'Auth users, admins, memberships, tokens/secrets, unrelated accounts/events', policy: 'NEVER COPY' },
  ])
  console.log('\nSCOPE ASSERTION: every selected child record was reached from the exact source event; only referenced account-scoped speakers and action-user identities were read. No unrelated DEV event/account rows are in the plan.')
}

function collectIdLikeValues(value: unknown, key = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectIdLikeValues(item, key))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, child]) => collectIdLikeValues(child, childKey))
  }
  if (
    typeof value === 'string' &&
    (key === 'id' || key === 'anonymousId' || /Id$/.test(key) || /ByUserId$/.test(key))
  ) {
    return [value]
  }
  return []
}

function assertPreparedRowsHaveNoSourceIds(rows: PreparedRows) {
  const sourceIds = new Set(rows.idMap.keys())
  const prepared: unknown[] = []
  for (const [key, value] of Object.entries(rows) as Array<[string, unknown]>) {
    if (key === 'idMap') continue
    if (Array.isArray(value)) prepared.push(...(value as unknown[]))
    else prepared.push(value)
  }
  assertNoSourceIds('Prepared target row', prepared.flatMap((row) => collectIdLikeValues(row)), sourceIds)
}

async function insertInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  chunkSize = 200,
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await insert(rows.slice(index, index + chunkSize))
  }
}

function phaseSignature(rows: Array<{ collectionPhase: string | null; status: string }>) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.collectionPhase ?? 'NULL'}|${row.status}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return JSON.stringify([...counts].sort(([left], [right]) => left.localeCompare(right)))
}

async function validateImportedGraph(
  tx: Prisma.TransactionClient,
  graph: SourceGraph,
  targetResolution: TargetResolution,
  rows: PreparedRows,
) {
  const eventId = targetResolution.targetEventId
  const targetEvent = await tx.event.findUnique({
    where: { id: eventId },
    include: { location: { select: { accountId: true } } },
  })
  if (
    !targetEvent ||
    targetEvent.name !== SOURCE_EVENT_NAME ||
    targetEvent.location.accountId !== targetResolution.account.id
  ) {
    throw new Error('Imported event does not resolve through the canonical target account')
  }

  const responseIds = rows.responses.map((row) => row.id)
  const answerIds = rows.answers.map((row) => row.id)
  const surveyIds = rows.surveys.map((row) => row.id)
  const insightIds = rows.insights.map((row) => row.id)
  const legacySessionIds = rows.legacySessions.map((row) => row.id)
  const checks = await Promise.all([
    tx.eventStructureItem.count({ where: { eventId } }),
    tx.eventSessionSpeakerAssignment.count({ where: { eventId } }),
    tx.surveyTarget.count({ where: { eventId } }),
    tx.survey.count({ where: { eventId } }),
    tx.question.count({ where: { eventId } }),
    tx.publicSurveyLink.count({ where: { surveyId: { in: surveyIds } } }),
    tx.response.count({ where: { eventId } }),
    tx.answer.count({ where: { responseId: { in: responseIds } } }),
    tx.answerTranscript.count({ where: { answerId: { in: answerIds } } }),
    tx.answerAnalysis.count({ where: { answerId: { in: answerIds } } }),
    tx.answerEventIntelligence.count({ where: { eventId } }),
    tx.answerEventTheme.count({ where: { eventId } }),
    tx.answerEventEntity.count({ where: { eventId } }),
    tx.answerEventAction.count({ where: { eventId } }),
    tx.eventIntelligenceAggregate.count({ where: { eventId } }),
    tx.eventIssueCluster.count({ where: { eventId } }),
    tx.eventIssueEvidence.count({ where: { eventId } }),
    tx.eventAlertNote.count({ where: { eventId } }),
    tx.eventActionHistory.count({ where: { eventId } }),
    tx.eventActionUpdate.count({ where: { eventId } }),
    tx.insight.count({ where: { eventId } }),
    tx.insightSourceAnswer.count({ where: { insightId: { in: insightIds } } }),
    tx.session.count({ where: { eventId } }),
    tx.transcript.count({ where: { sessionId: { in: legacySessionIds } } }),
    tx.analysis.count({ where: { sessionId: { in: legacySessionIds } } }),
  ])
  const expected = [
    graph.structureItems.length,
    graph.speakerAssignments.length,
    graph.surveyTargets.length,
    graph.surveys.length,
    graph.questions.length,
    graph.publicSurveyLinks.length,
    graph.responses.length,
    graph.answers.length,
    graph.answerTranscripts.length,
    graph.answerAnalyses.length,
    graph.answerEventIntelligence.length,
    graph.answerEventThemes.length,
    graph.answerEventEntities.length,
    graph.answerEventActions.length,
    graph.intelligenceAggregates.length,
    graph.issueClusters.length,
    graph.issueEvidence.length,
    graph.alertNotes.length,
    graph.actionHistory.length,
    graph.actionUpdates.length,
    graph.insights.length,
    graph.insightSourceAnswers.length,
    graph.legacySessions.length,
    graph.legacyTranscripts.length,
    graph.legacyAnalyses.length,
  ]
  if (checks.some((count, index) => count !== expected[index])) {
    throw new Error(`Imported entity counts do not match source: ${JSON.stringify({ checks, expected })}`)
  }

  const [targetResponses, targetSurveys, areaCount, sessionCount, omittedBriefs, omittedDeliveries] =
    await Promise.all([
      tx.response.findMany({ where: { eventId }, select: { collectionPhase: true, status: true } }),
      tx.survey.findMany({ where: { eventId }, select: { collectionPhase: true, status: true } }),
      tx.eventStructureItem.count({ where: { eventId, kind: EventStructureItemKind.AREA } }),
      tx.eventStructureItem.count({ where: { eventId, kind: EventStructureItemKind.SESSION } }),
      tx.eventClosingBriefSnapshot.count({ where: { eventId } }),
      tx.eventActionAssignmentDelivery.count({ where: { eventId } }),
    ])
  if (phaseSignature(targetResponses) !== phaseSignature(graph.responses)) {
    throw new Error('Response lifecycle phase/status counts changed during import')
  }
  if (phaseSignature(targetSurveys) !== phaseSignature(graph.surveys)) {
    throw new Error('Survey lifecycle phase/status counts changed during import')
  }
  if (areaCount !== graph.structureItems.filter((row) => row.kind === EventStructureItemKind.AREA).length) {
    throw new Error('Event area count changed during import')
  }
  if (sessionCount !== graph.structureItems.filter((row) => row.kind === EventStructureItemKind.SESSION).length) {
    throw new Error('Event session count changed during import')
  }
  const targetSpeakerIds = new Set([
    ...(await tx.eventSessionSpeakerAssignment.findMany({ where: { eventId }, select: { speakerId: true } })).map((row) => row.speakerId),
    ...(await tx.surveyTarget.findMany({ where: { eventId, speakerId: { not: null } }, select: { speakerId: true } })).flatMap((row) => row.speakerId ? [row.speakerId] : []),
  ])
  if (targetSpeakerIds.size !== graph.speakerProfiles.length) {
    throw new Error('Referenced speaker count changed during import')
  }
  if (omittedBriefs !== 0 || omittedDeliveries !== 0) {
    throw new Error('An environment-dependent brief or delivery row was unexpectedly imported')
  }

  assertPreparedRowsHaveNoSourceIds(rows)
  return lifecycleResponseCounts(targetResponses)
}

async function applyClone(
  target: PrismaClient,
  graph: SourceGraph,
  targetResolution: TargetResolution,
  rows: PreparedRows,
) {
  return target.$transaction(
    async (tx) => {
      const collision = await tx.event.findFirst({
        where: {
          OR: [
            { id: targetResolution.targetEventId },
            {
              name: SOURCE_EVENT_NAME,
              location: { accountId: targetResolution.account.id },
            },
          ],
        },
        select: { id: true },
      })
      if (collision) {
        throw new Error(`Target event identity appeared during apply; refusing overwrite (${collision.id})`)
      }

      if (targetResolution.createLocation) {
        const { settingsJson, ...location } = targetResolution.location
        await tx.location.create({
          data: {
            ...location,
            settingsJson: mappedJson(settingsJson, rows.idMap),
          },
        })
      }
      await tx.event.create({ data: rows.event })
      await insertInChunks(rows.speakers, (data) => tx.eventSpeakerProfile.createMany({ data }))
      await insertInChunks(rows.structures, (data) => tx.eventStructureItem.createMany({ data }))
      await insertInChunks(rows.assignments, (data) => tx.eventSessionSpeakerAssignment.createMany({ data }))
      await insertInChunks(rows.surveyTargets, (data) => tx.surveyTarget.createMany({ data }))
      await insertInChunks(rows.surveys, (data) => tx.survey.createMany({ data }))
      await insertInChunks(rows.questions, (data) => tx.question.createMany({ data }))
      await insertInChunks(rows.publicLinks, (data) => tx.publicSurveyLink.createMany({ data }))
      await insertInChunks(rows.responses, (data) => tx.response.createMany({ data }))
      await insertInChunks(rows.answers, (data) => tx.answer.createMany({ data }))
      await insertInChunks(rows.answerTranscripts, (data) => tx.answerTranscript.createMany({ data }))
      await insertInChunks(rows.answerAnalyses, (data) => tx.answerAnalysis.createMany({ data }))
      await insertInChunks(rows.answerIntelligence, (data) => tx.answerEventIntelligence.createMany({ data }))
      await insertInChunks(rows.answerThemes, (data) => tx.answerEventTheme.createMany({ data }))
      await insertInChunks(rows.answerEntities, (data) => tx.answerEventEntity.createMany({ data }))
      await insertInChunks(rows.answerActions, (data) => tx.answerEventAction.createMany({ data }))
      await insertInChunks(rows.aggregates, (data) => tx.eventIntelligenceAggregate.createMany({ data }))
      await insertInChunks(rows.clusters, (data) => tx.eventIssueCluster.createMany({ data }))
      await insertInChunks(rows.evidence, (data) => tx.eventIssueEvidence.createMany({ data }))
      await insertInChunks(rows.notes, (data) => tx.eventAlertNote.createMany({ data }))
      await insertInChunks(rows.histories, (data) => tx.eventActionHistory.createMany({ data }))
      await insertInChunks(rows.updates, (data) => tx.eventActionUpdate.createMany({ data }))
      await insertInChunks(rows.insights, (data) => tx.insight.createMany({ data }))
      await insertInChunks(rows.insightSources, (data) => tx.insightSourceAnswer.createMany({ data }))
      await insertInChunks(rows.legacySessions, (data) => tx.session.createMany({ data }))
      await insertInChunks(rows.legacyTranscripts, (data) => tx.transcript.createMany({ data }))
      await insertInChunks(rows.legacyAnalyses, (data) => tx.analysis.createMany({ data }))

      return validateImportedGraph(tx, graph, targetResolution, rows)
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 180_000 },
  )
}

async function main() {
  const options = parseCloneOptions()
  const sourceUrl = loadDatabaseUrl(options.sourceEnvPath)
  const targetUrl = loadDatabaseUrl(options.targetEnvPath)
  const sourceDescription = describeDatabaseUrl(sourceUrl)
  const targetDescription = describeDatabaseUrl(targetUrl)
  if (sourceDescription.projectRef !== EXPECTED_SOURCE_PROJECT) {
    throw new Error(
      `Source must be DEV project ${EXPECTED_SOURCE_PROJECT}; resolved ${sourceDescription.projectRef}`,
    )
  }
  if (targetDescription.projectRef !== EXPECTED_TARGET_PROJECT) {
    throw new Error(
      `Target must be PROD project ${EXPECTED_TARGET_PROJECT}; resolved ${targetDescription.projectRef}`,
    )
  }
  if (sourceUrl === targetUrl) {
    throw new Error('Source and target database identities must be different')
  }

  const source = makeClient(sourceUrl)
  const target = makeClient(targetUrl)
  try {
    const [sourceFingerprint, targetFingerprint] = await Promise.all([
      fingerprintDatabase(source, REQUIRED_SOURCE_MIGRATIONS),
      fingerprintDatabase(target, REQUIRED_TARGET_MIGRATIONS),
    ])
    const graph = await loadSourceGraph(source)
    auditSourceScope(graph)
    const targetResolution = await resolveTarget(target, graph)
    const rows = prepareRows(graph, targetResolution)
    assertPreparedRowsHaveNoSourceIds(rows)
    printAudit(
      sourceDescription,
      targetDescription,
      sourceFingerprint,
      targetFingerprint,
      graph,
      targetResolution,
    )

    if (!options.apply) {
      console.log('\nDRY RUN COMPLETE: no production writes were issued.')
      console.log(
        `Apply requires both --apply and --confirm-target-project=${EXPECTED_TARGET_PROJECT}.`,
      )
      return
    }

    const validatedLifecycle = await applyClone(target, graph, targetResolution, rows)
    console.log('\nAPPLY COMPLETE: the transaction committed after all relationship/count/lifecycle validations passed.')
    console.table([
      { dashboard: 'PRE', completedResponses: validatedLifecycle.pre },
      { dashboard: 'DURING', completedResponses: validatedLifecycle.during },
      { dashboard: 'POST (DURING + POST)', completedResponses: validatedLifecycle.postDashboard },
    ])
  } finally {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()])
  }
}

void main().catch((error) => {
  console.error(`\nCLONE ABORTED: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
