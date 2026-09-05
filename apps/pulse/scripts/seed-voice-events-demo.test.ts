import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const source = fs.readFileSync(path.join(process.cwd(), 'scripts/seed-voice-events-demo.ts'), 'utf8')

describe('Voice Events demo seeder contract', () => {
  it('is explicitly owned by the Voice Events product and package command', () => {
    expect(packageJson.scripts['seed:voice-events-demo']).toBe('ts-node --transpile-only scripts/seed-voice-events-demo.ts')
    expect(packageJson.scripts['seed:advanced-event']).toBe('dotenv -e .env.local -- ts-node --transpile-only scripts/seed-voice-events-demo.ts --apply --account=events-demo --event-id=event_advanced_demo_20260902031540_6c81e383')
    expect(packageJson.scripts['seed:events-demo']).toBeUndefined()
    expect(source).toContain("const DEFAULT_ACCOUNT_SLUG = 'events-demo'")
    expect(source).toContain('accountType: AccountType.EVENTS')
    expect(source).toContain("const DEFAULT_EVENT_NAME = 'SignalThread Live Experience Summit'")
    expect(source).toContain('eventType: EventType.ADVANCED')
    expect(source).not.toContain('prisma.session')
  })

  it('uses the canonical agenda, speaker, listening-point, survey, response, evidence, and action models', () => {
    for (const model of [
      'prisma.eventStructureItem.upsert',
      'prisma.eventSpeakerProfile.upsert',
      'prisma.eventSessionSpeakerAssignment.upsert',
      'prisma.surveyTarget.upsert',
      'prisma.survey.upsert',
      'prisma.publicSurveyLink.upsert',
      'prisma.response.upsert',
      'prisma.answer.upsert',
      'prisma.eventIssueEvidence.upsert',
      'prisma.eventActionUpdate.upsert',
    ]) expect(source).toContain(model)
    expect(source).toContain('QuestionResponseTarget.SPEAKERS')
    expect(source).toContain('SurveyTargetCategory.SPEAKER')
  })

  it('defines the required deterministic data shape and preserves provenance', () => {
    expect(source).toContain('const agendaSessionDefinitions = [...structureDefinitions.filter((item) => item.kind === EventStructureItemKind.SESSION), ...additionalAgendaSessions]')
    expect(source).toContain('const listeningPointDefinitions: ListeningPointDefinition[] = [')
    expect(source).toContain("const sessionListeningPointSlugs = new Set([\n  'opening-keynote',\n  'product-strategy-panel',\n  'customer-success-workshop',\n  'closing-session',\n])")
    expect(source).toContain('const speakerDefinitions: SpeakerDefinition[] = [')
    expect(source).toContain('const speakerAssignmentPlans: SpeakerAssignmentPlan[]')
    expect(source).toContain("targetKey: `session:${session.slug}`")
    expect(source).toContain("targetKey: `speaker:${session.slug}`")
    expect(source).toContain("speakerAssignmentId: null, category: SurveyTargetCategory.SESSION")
    expect(source).toContain('speakerId: speaker.id, category: SurveyTargetCategory.SPEAKER')
    expect(source).toContain("key: 'shared-session-and-speaker-feedback'")
    expect(source).toContain("assignmentSource: 'ADVANCED_SURVEY_BUILDER'")
    expect(source).toContain('EventActionClassification.DURING_EVENT')
  })

  it('defaults to dry-run, protects remote targets, and uses upserts for repeatable scoped writes', () => {
    expect(source).toContain("if (!isApplyRun()) {")
    expect(source).toContain('dry run — no database writes')
    expect(source).toContain("from './seed-voice-events-demo-safety.js'")
    expect(source).toContain('const safety = assertApplyTarget()')
    expect(source).toContain("where: { slug: ACCOUNT_SLUG }")
    expect(source).not.toContain('prisma.account.findFirst')
    expect(source).toContain("safety.environment === 'production'")
    expect(source).toContain('production write preflight')
    expect(source).toContain('VOICE_EVENTS_DEMO_ALLOW_PROD=signalthread')
    expect(source.indexOf('production write preflight')).toBeLessThan(source.indexOf('await prisma.account.upsert'))
    expect(source.indexOf('production write preflight')).toBeLessThan(source.indexOf('await prisma.location.upsert'))
    expect(source).toContain('Refusing to modify account "${ACCOUNT_SLUG}" because it exists as')
    expect(source).toContain('.upsert(')
    expect(source).not.toContain('.delete(')
    expect(source).not.toContain('.deleteMany(')
    expect(source).not.toContain('prisma.eventActionAssignmentDelivery')
  })

  it('supports a validated existing Events target without changing the canonical no-argument flow', () => {
    expect(source).toContain('export function parseSeedOptions')
    expect(source).toContain("arg.startsWith('--event-id=')")
    expect(source).toContain("arg.startsWith('--account=')")
    expect(source).toContain("throw new Error('--event-id requires a non-empty event ID')")
    expect(source).toContain("arg.startsWith('--seed-key=')")
    expect(source).toContain("arg.startsWith('--name=')")
    expect(source).toContain("throw new Error('Use either --event-id or --seed-key, not both')")
    expect(source).toContain('const existingTargetEventId = seedOptions.eventId')
    expect(source).toContain('Target event "${existingTargetEventId}" does not exist.')
    expect(source).toContain('does not belong to the ${ACCOUNT_SLUG} account')
    expect(source).toContain('target event: ${dryRunTarget ? `${dryRunTarget.id} (${dryRunTarget.name})`')
    expect(source).toContain('const event = targetEvent ?? await prisma.event.upsert({')
  })

  it('preserves existing event setup and scopes idempotent seeded records by the target event', () => {
    expect(source).toContain('const existingStructureItems = isExistingEventSeed()')
    expect(source).toContain('const existingAssignments = isExistingEventSeed()')
    expect(source).toContain('existingStructure ?? await prisma.eventStructureItem.upsert')
    expect(source).toContain('existingAssignment ?? await prisma.eventSessionSpeakerAssignment.upsert')
    expect(source).toContain('function scopedSeedValue')
    expect(source).toContain('function scopedSeedSlug')
    expect(source).toContain('function scopedSeedToken')
    expect(source).toContain('function scopedClusterKey')
    expect(source).toContain("normalizedSeedScope.slice(-24).replace(/^-+/, '')")
    expect(source).toContain('where: { id: scopedSeedValue(responseDef.id) }')
    expect(source).toContain('where: { clusterKey: scopedClusterKey(clusterDef.key) }')
    expect(source).toContain("where: { id: scopedSeedValue('aggregate_events_demo_event') }")
    expect(source).toContain('populated event: ${event.name} (${event.id})')
  })

  it('covers every existing session and speaker assignment with deterministic results', () => {
    expect(source).toContain('const expectedSeedTotals = {')
    expect(source).toContain('agendaSessions: 48')
    expect(source).toContain('speakers: 24')
    expect(source).toContain('speakerAssignments: 68')
    expect(source).toContain('listeningPoints: 14')
    expect(source).toContain('sessionListeningPoints: 4')
    expect(source).toContain('surveys: 110')
    expect(source).toContain('completedResponses: 345')
    expect(source).toContain('completedAnswers: 694')
    expect(source).toContain('issueClusters: 19')
    expect(source).toContain('evidence: 150')
    expect(source).toContain('canonicalActionWorkflows: 8')
    expect(source).toContain('const surveyDefinitions: SurveyDefinition[] = [...baseSurveyDefinitions, ...buildSessionResultSurveys()]')
    expect(source).toContain('...buildSessionAndSpeakerResponses()')
    expect(source).toContain('session result coverage: ${coverage.sessionsWithResponses}/${agendaSessionDefinitions.length}')
    expect(source).toContain('speaker result coverage: ${coverage.speakerAssignmentsWithResults}/${agendaSessionDefinitions.length}')
    expect(source).toContain('function sessionResultResponseCount')
    expect(source).toContain('function speakerResultResponseCount')
    expect(source).toContain('assertSeedDefinitionTotals()')
  })

  it('covers all four selected sessions and supported survey workflow states without adding listening points', () => {
    for (const surveyKey of [
      'opening-keynote-feedback',
      'product-strategy-panel-feedback',
      'customer-success-workshop-feedback',
      'closing-follow-up-feedback',
    ]) expect(source).toContain(`key: '${surveyKey}'`)
    expect(source).toContain('status: EventStatus.COMPLETED')
    expect(source).toContain('status: EventStatus.PAUSED')
    expect(source).toContain('type: QuestionType.RATING_1_TO_5')
    expect(source).toContain('type: QuestionType.RECOMMENDATION_0_TO_10')
    expect(source).toContain('numericValue: answerDef.numericValue')
    expect(source).toContain('Only collect feedback that directly evaluates the assigned speaker.')
    expect(source).toContain('type: QuestionType.SPEAKER_FEEDBACK')
    expect(source).toContain('createPublicLink: false')
    expect(source).toContain('requiresPublicLink: false')
  })

  it('classifies seeded evidence by survey purpose and keeps PRE content planning-oriented', () => {
    expect(source).toContain('collectionPhase: CollectionPhase.PRE')
    expect(source).toContain('collectionPhase: CollectionPhase.DURING')
    expect(source).toContain('collectionPhase: CollectionPhase.POST')
    expect(source).toContain('collectionPhase: surveyDefinition.collectionPhase')
    expect(source).toContain("key: 'pre-event-agenda-priorities'")
    expect(source).toContain('What question do you most want the agenda or speakers to answer?')
    expect(source).toContain('Brief speakers on practical AI questions')
    expect(source).toContain('Publish a role-based session choice guide')
    expect(source).toContain('Prepare hosted networking matches')
    expect(source).toContain("surveyKey: 'closing-follow-up-feedback'")

    const planningStart = source.indexOf('const planningResponseProfiles = [')
    const planningEnd = source.indexOf('function buildPlanningResponses()', planningStart)
    const planningProfiles = source.slice(planningStart, planningEnd)
    expect(planningProfiles.toLowerCase()).toContain('practical ai')
    expect(planningProfiles.toLowerCase()).toContain('networking')
    expect(planningProfiles.toLowerCase()).toContain('session guide')
    for (const onsiteOnlySignal of ['coffee queue', 'badge pickup', 'expo wayfinding', 'speaker pacing']) {
      expect(planningProfiles.toLowerCase()).not.toContain(onsiteOnlySignal)
    }

    expect(source).toContain('Cluster ${cluster.key} mixes collection phases')
  })
})
