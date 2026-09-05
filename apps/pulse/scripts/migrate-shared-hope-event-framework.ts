import { prisma } from '@/lib/prisma'
import { migrateLegacyEventToCurrentFramework } from '@/lib/migrate-legacy-event-framework'

const TARGET_ACCOUNT_SLUG = 'shared-hope'
const TARGET_EVENT_ID = 'cmsgytyzf0001gs4gnvd4wqak'
const EXPECTED_DATABASE_PROJECT_REF = 'tsoquobpingfqezolvgp'
const REQUIRED_CONFIRMATION = `${TARGET_ACCOUNT_SLUG}/${TARGET_EVENT_ID}`

function databaseProjectRef() {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is required')
  const username = new URL(raw).username
  return username.includes('.') ? username.slice(username.lastIndexOf('.') + 1) : null
}

function printSnapshot(label: string, snapshot: Awaited<ReturnType<typeof migrateLegacyEventToCurrentFramework>>['before']) {
  console.log(label, {
    eventId: snapshot.eventId,
    accountSlug: snapshot.accountSlug,
    eventType: snapshot.eventType,
    templateKey: snapshot.templateKey,
    sessions: snapshot.sessionCount,
    activeSessions: snapshot.activeSessionCount,
    speakers: snapshot.speakerCount,
    sessionSpeakerAssociations: snapshot.sessionSpeakerAssociationCount,
    rosterMemberships: snapshot.rosterMembershipCount,
    eventAreas: snapshot.eventAreaCount,
    targets: snapshot.surveyTargetCount,
    surveys: snapshot.surveyCount,
    links: snapshot.publicSurveyLinkCount,
    questions: snapshot.questionCount,
    responses: snapshot.responseCount,
    answers: snapshot.answerCount,
    legacyRecordingSessions: snapshot.legacyRecordingSessionCount,
    agendaImportJobs: snapshot.agendaImportJobCount,
    agendaImportRows: snapshot.agendaImportRowCount,
    sessionFingerprint: snapshot.sessionFingerprint,
    speakerFingerprint: snapshot.speakerFingerprint,
    assignmentFingerprint: snapshot.assignmentFingerprint,
  })
}

async function main() {
  const apply = process.argv.includes('--apply')
  const confirmation = process.argv.find((argument) => argument.startsWith('--confirm='))?.slice('--confirm='.length)
  const projectRef = databaseProjectRef()
  if (projectRef !== EXPECTED_DATABASE_PROJECT_REF) {
    throw new Error(`Refusing database project ${projectRef ?? 'unknown'}; expected ${EXPECTED_DATABASE_PROJECT_REF}`)
  }
  if (apply && confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${REQUIRED_CONFIRMATION}`)
  }

  console.log(`[event-framework-migration] ${apply ? 'APPLY' : 'DRY RUN'} ${REQUIRED_CONFIRMATION}`)
  const result = await migrateLegacyEventToCurrentFramework({
    accountSlug: TARGET_ACCOUNT_SLUG,
    eventId: TARGET_EVENT_ID,
    apply,
  })
  printSnapshot('before', result.before)
  if (result.after) printSnapshot('after', result.after)
  console.log('result', { mode: result.mode, outcome: result.outcome, targetEventType: result.targetEventType })
}

main()
  .catch((error) => {
    console.error('[event-framework-migration] failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
