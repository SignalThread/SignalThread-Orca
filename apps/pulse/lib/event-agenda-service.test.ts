import { AccountType, EventAgendaImportStatus, EventStructureItemKind, EventType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  EVENT_AGENDA_IMPORT_CONFIRMATION_MODE,
  EVENT_AGENDA_SESSION_AUTHORITY,
  EVENT_SPEAKER_ASSIGNMENT_AUTHORITY,
  EVENT_SPEAKER_IDENTITY_SCOPE,
  EVENT_SPEAKER_REMOVAL_MODE,
  EventAgendaServiceError,
  addSpeakerToEvent,
  archiveEventSpeakerProfile,
  archiveAgendaSession,
  assignSpeakerToAgendaSession,
  assignSpeakersToAgendaSession,
  canTransitionAgendaImport,
  createSpeakerForAgendaSession,
  createEventSpeakerProfile,
  createAccountSpeakerProfile,
  createAgendaSession,
  createOrReuseAgendaImportJob,
  getEventAgendaWorkspace,
  listEventSpeakerLibrary,
  listAgendaSessions,
  speakerProfileMissingFields,
  updateEventSpeakerProfile,
} from './event-agenda-service'

function createDb() {
  const db = {
    account: { findFirst: vi.fn() },
    event: { findFirst: vi.fn() },
    eventStructureItem: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    eventSpeakerProfile: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), update: vi.fn() },
    eventSessionSpeakerAssignment: { createMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: 'event_assignment_1' }), delete: vi.fn() },
    eventAgendaImportJob: { upsert: vi.fn() },
    user: { findFirst: vi.fn() },
  }
  return Object.assign(db, { $transaction: vi.fn(async (callback) => callback(db)) })
}

function allowScope(db: ReturnType<typeof createDb>) {
  db.event.findFirst.mockResolvedValue({
    id: 'event_1',
    name: 'Event',
    eventType: EventType.FEEDBACK,
    status: 'DRAFT',
    startDate: null,
    endDate: null,
    location: { accountId: 'account_1', timezone: 'UTC' },
  })
}

describe('event agenda service boundaries', () => {
  it('requires only title, organization, and email for speaker completeness', () => {
    expect(speakerProfileMissingFields({ title: null, organization: 'Northstar', email: 'speaker@example.com' })).toEqual(['title'])
    expect(speakerProfileMissingFields({ title: 'CEO', organization: null, email: 'speaker@example.com' })).toEqual(['organization'])
    expect(speakerProfileMissingFields({ title: 'CEO', organization: 'Northstar', email: null })).toEqual(['email'])
    expect(speakerProfileMissingFields({ title: null, organization: null, email: null })).toEqual(['title', 'organization', 'email'])
    expect(speakerProfileMissingFields({ title: 'CEO', organization: 'Northstar', email: 'speaker@example.com' })).toEqual([])
  })

  it('lists only canonical EventStructureItem agenda sessions after account/event scoping', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findMany.mockResolvedValue([])

    await listAgendaSessions({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'event_1',
        location: { accountId: 'account_1', account: { accountType: AccountType.EVENTS } },
      },
    }))
    expect(db.eventStructureItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: 'event_1', kind: EventStructureItemKind.SESSION, isActive: true },
    }))
    expect('session' in db).toBe(false)
  })

  it('rejects cross-account event scope before touching agenda records', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue(null)

    await expect(listAgendaSessions({ accountId: 'account_other', eventId: 'event_1' }, db as never))
      .rejects.toMatchObject({ status: 404, code: 'EVENT_NOT_FOUND' } satisfies Partial<EventAgendaServiceError>)
    expect(db.eventStructureItem.findMany).not.toHaveBeenCalled()
  })

  it('creates an account-scoped canonical speaker with normalized matching fields', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.create.mockImplementation(async ({ data }) => ({ id: 'speaker_1', ...data }))

    const speaker = await createEventSpeakerProfile({
      accountId: 'account_1',
      eventId: 'event_1',
      profile: { name: ' José O’Neil ', email: ' JOSE@Example.com ' },
    }, db as never)

    expect(speaker).toMatchObject({
      accountId: 'account_1',
      name: 'José O’Neil',
      normalizedName: 'jose o neil',
      normalizedEmail: 'jose@example.com',
    })
    expect(db.eventSessionSpeakerAssignment.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1', sessionId: null })],
      skipDuplicates: true,
    }))
  })

  it('reuses an existing account speaker and idempotently assigns it to the event', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.findFirst.mockResolvedValue({
      id: 'speaker_existing', accountId: 'account_1', name: 'Ada Lovelace', email: 'ada@example.test', normalizedEmail: 'ada@example.test', isArchived: false,
    })
    db.eventSpeakerProfile.findFirstOrThrow.mockResolvedValue({ id: 'speaker_existing', accountId: 'account_1', name: 'Ada Lovelace' })

    const first = await createEventSpeakerProfile({
      accountId: 'account_1', eventId: 'event_1', profile: { name: 'Ada Lovelace', email: 'ADA@example.test' },
    }, db as never)
    const second = await addSpeakerToEvent({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_existing' }, db as never)

    expect(first.id).toBe('speaker_existing')
    expect(second.id).toBe('speaker_existing')
    expect(db.eventSpeakerProfile.create).not.toHaveBeenCalled()
    expect(db.eventSessionSpeakerAssignment.createMany).toHaveBeenCalledTimes(2)
    expect(db.eventSessionSpeakerAssignment.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
  })

  it('keeps Template speaker participation session-driven', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue({ id: 'event_1', eventType: EventType.TEMPLATE, status: 'DRAFT', location: { accountId: 'account_1' } })
    db.eventStructureItem.findFirst.mockResolvedValue({ id: 'session_1' })
    db.eventSpeakerProfile.create.mockResolvedValue({ id: 'speaker_1', accountId: 'account_1', name: 'Ada' })
    db.eventSessionSpeakerAssignment.upsert.mockResolvedValue({ id: 'assignment_1', sessionId: 'session_1', speakerId: 'speaker_1' })

    await expect(addSpeakerToEvent({ accountId: 'account_1', eventId: 'event_1', profile: { name: 'Ada' } }, db as never))
      .rejects.toMatchObject({ code: 'TEMPLATE_SPEAKER_SESSION_REQUIRED', status: 409 })
    await createSpeakerForAgendaSession({
      accountId: 'account_1', eventId: 'event_1', sessionId: 'session_1',
      profile: { name: 'Ada' }, assignment: { role: 'SPEAKER', sortOrder: 0 },
    }, db as never)

    expect(db.eventSessionSpeakerAssignment.createMany).not.toHaveBeenCalled()
    expect(db.eventSessionSpeakerAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ eventId: 'event_1', sessionId: 'session_1', speakerId: 'speaker_1' }),
    }))
  })

  it('commits a deduplicated pending speaker selection with one role and sequential sort order', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findFirst.mockResolvedValue({ id: 'session_1' })
    db.eventSpeakerProfile.findFirst.mockImplementation(({ where }) => Promise.resolve({ id: where.id }))
    db.eventSessionSpeakerAssignment.upsert
      .mockResolvedValueOnce({ id: 'assignment_1', speakerId: 'speaker_1' })
      .mockResolvedValueOnce({ id: 'assignment_2', speakerId: 'speaker_2' })

    const assignments = await assignSpeakersToAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      sessionId: 'session_1',
      speakerIds: ['speaker_1', 'speaker_2', 'speaker_1'],
      assignment: { role: 'PANELIST', sortOrder: 4 },
    }, db as never)

    expect(assignments).toHaveLength(2)
    expect(db.eventSessionSpeakerAssignment.upsert).toHaveBeenCalledTimes(2)
    const writes = db.eventSessionSpeakerAssignment.upsert.mock.calls.map(([input]) => input)
    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        where: { sessionId_speakerId: { sessionId: 'session_1', speakerId: 'speaker_1' } },
        create: expect.objectContaining({ role: 'PANELIST', sortOrder: 4 }),
      }),
      expect.objectContaining({
        where: { sessionId_speakerId: { sessionId: 'session_1', speakerId: 'speaker_2' } },
        create: expect.objectContaining({ role: 'PANELIST', sortOrder: 5 }),
      }),
    ]))
  })

  it('rejects standalone speaker-roster imports for Template events', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue({ id: 'event_1', eventType: EventType.TEMPLATE, status: 'DRAFT', location: { accountId: 'account_1' } })

    await expect(createOrReuseAgendaImportJob({
      accountId: 'account_1', eventId: 'event_1', createdByUserId: 'user_1',
      sourceFileName: 'speakers.csv', sourceMimeType: 'text/csv', sourceFileSizeBytes: 1,
      sourceChecksumSha256: 'a'.repeat(64), importType: 'SPEAKER_ROSTER',
    }, db as never)).rejects.toMatchObject({ code: 'TEMPLATE_SPEAKER_ROSTER_NOT_SUPPORTED', status: 409 })
    expect(db.eventAgendaImportJob.upsert).not.toHaveBeenCalled()
  })

  it('assigns the same account speaker to multiple events without duplicating either event membership', async () => {
    const db = createDb()
    db.event.findFirst.mockImplementation(async ({ where }) => ({ id: where.id, status: 'DRAFT', location: { accountId: 'account_1' } }))
    db.eventSpeakerProfile.findFirst.mockResolvedValue({ id: 'speaker_1', accountId: 'account_1', isArchived: false })

    await addSpeakerToEvent({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1' }, db as never)
    await addSpeakerToEvent({ accountId: 'account_1', eventId: 'event_2', speakerId: 'speaker_1' }, db as never)
    await addSpeakerToEvent({ accountId: 'account_1', eventId: 'event_2', speakerId: 'speaker_1' }, db as never)

    expect(db.eventSessionSpeakerAssignment.createMany.mock.calls.map(([call]) => call.data[0].eventId)).toEqual(['event_1', 'event_2', 'event_2'])
    expect(db.eventSessionSpeakerAssignment.createMany.mock.calls.every(([call]) => call.skipDuplicates === true)).toBe(true)
  })

  it('keeps account-wide speaker creation unassigned to any event', async () => {
    const db = createDb()
    db.account.findFirst.mockResolvedValue({ id: 'account_1' })
    db.eventSpeakerProfile.create.mockImplementation(async ({ data }) => ({ id: 'speaker_library', ...data }))

    const speaker = await createAccountSpeakerProfile({ accountId: 'account_1', profile: { name: 'Library Speaker' } }, db as never)

    expect(speaker.id).toBe('speaker_library')
    expect(db.event.findFirst).not.toHaveBeenCalled()
    expect(db.eventSessionSpeakerAssignment.createMany).not.toHaveBeenCalled()
  })

  it('rejects a cross-account speaker before creating event membership', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.findFirst.mockResolvedValue(null)

    await expect(addSpeakerToEvent({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_other' }, db as never))
      .rejects.toMatchObject({ code: 'SPEAKER_NOT_FOUND', status: 404 })
    expect(db.eventSessionSpeakerAssignment.createMany).not.toHaveBeenCalled()
  })

  it('does not report speaker creation success when event assignment cannot be verified', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.create.mockResolvedValue({ id: 'speaker_1', accountId: 'account_1', name: 'Ada Lovelace' })
    db.eventSessionSpeakerAssignment.findFirst.mockResolvedValue(null)

    await expect(createEventSpeakerProfile({
      accountId: 'account_1', eventId: 'event_1', profile: { name: 'Ada Lovelace' },
    }, db as never)).rejects.toMatchObject({ code: 'EVENT_SPEAKER_ASSIGNMENT_FAILED', status: 409 })
    expect(db.$transaction).toHaveBeenCalledOnce()
  })

  it('creates manual agenda sessions only as EventStructureItem SESSION records', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findMany.mockResolvedValue([])
    db.eventStructureItem.findFirst.mockResolvedValue(null)
    db.eventStructureItem.findUnique.mockResolvedValue(null)
    db.eventStructureItem.create.mockImplementation(async ({ data }) => ({ id: 'session_new', ...data }))

    const result = await createAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      session: {
        title: 'Opening Keynote',
        startsAt: '2026-09-17T09:00:00-04:00',
        endsAt: '2026-09-17T10:00:00-04:00',
        timezone: 'America/New_York',
        room: 'Main stage',
        track: 'Leadership',
        format: 'Keynote',
      },
    }, db as never)

    expect(result.session).toMatchObject({ id: 'session_new', kind: EventStructureItemKind.SESSION })
    expect(db.eventStructureItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventId: 'event_1',
        kind: EventStructureItemKind.SESSION,
        name: 'Opening Keynote',
        metadata: expect.objectContaining({ room: 'Main stage', track: 'Leadership', format: 'Keynote' }),
      }),
    }))
    expect('session' in db).toBe(false)
  })

  it('rejects an end time that precedes the start before writing a session', async () => {
    const db = createDb()
    allowScope(db)

    await expect(createAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      session: {
        title: 'Invalid schedule',
        startsAt: '2026-09-17T10:00:00-04:00',
        endsAt: '2026-09-17T09:00:00-04:00',
        timezone: 'America/New_York',
      },
    }, db as never)).rejects.toMatchObject({ status: 400, code: 'END_BEFORE_START', message: 'End time must be after start time' })

    expect(db.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('preserves durable import provenance when the importer uses the canonical session service', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findMany.mockResolvedValue([])
    db.eventStructureItem.findFirst.mockResolvedValue(null)
    db.eventStructureItem.findUnique.mockResolvedValue(null)
    db.eventStructureItem.create.mockImplementation(async ({ data }) => ({ id: 'session_imported', ...data }))

    await createAgendaSession({
      accountId: 'account_1', eventId: 'event_1',
      session: {
        title: 'Imported keynote', startsAt: '2026-09-17T09:00:00-04:00', endsAt: '2026-09-17T10:00:00-04:00',
        timezone: 'America/New_York', externalId: 'SOURCE-1', confirmWarnings: true,
      },
      importSource: { importJobId: 'import_1', importRowId: 'row_1', sourceExternalId: 'SOURCE-1' },
    }, db as never)

    expect(db.eventStructureItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          externalId: 'SOURCE-1',
          importSource: { importJobId: 'import_1', importRowId: 'row_1', sourceExternalId: 'SOURCE-1' },
        }),
      }),
    }))
  })

  it('requires explicit confirmation for active-event schedule changes', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue({ id: 'event_1', status: 'ACTIVE', location: { accountId: 'account_1' } })

    await expect(createAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      session: {
        title: 'Live correction',
        startsAt: '2026-09-17T09:00:00-04:00',
        endsAt: '2026-09-17T10:00:00-04:00',
        timezone: 'America/New_York',
      },
    }, db as never)).rejects.toMatchObject({ status: 409, code: 'LIVE_EVENT_CONFIRMATION_REQUIRED' })
    expect(db.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('surfaces duplicate-title and room-overlap warnings before a manual write', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findMany
      .mockResolvedValueOnce([{ id: 'same_title', name: 'Opening Keynote', startsAt: new Date() }])
      .mockResolvedValueOnce([{ id: 'room_overlap', name: 'Other session', startsAt: new Date(), endsAt: new Date() }])

    await expect(createAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      session: {
        title: 'Opening Keynote',
        startsAt: '2026-09-17T09:00:00-04:00',
        endsAt: '2026-09-17T10:00:00-04:00',
        timezone: 'America/New_York',
        room: 'Main stage',
      },
    }, db as never)).rejects.toMatchObject({
      status: 409,
      code: 'SESSION_REVIEW_CONFIRMATION_REQUIRED',
      details: { warnings: expect.arrayContaining([
        expect.objectContaining({ code: 'POSSIBLE_DUPLICATE_SESSION' }),
        expect.objectContaining({ code: 'POSSIBLE_ROOM_OVERLAP' }),
      ]) },
    })
    expect(db.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('blocks a duplicate external session ID even when warnings were confirmed', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findFirst.mockResolvedValue({ id: 'existing_1', name: 'Existing session' })
    db.eventStructureItem.findMany.mockResolvedValue([])

    await expect(createAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      session: {
        title: 'Another session',
        startsAt: '2026-09-17T09:00:00-04:00',
        endsAt: '2026-09-17T10:00:00-04:00',
        timezone: 'America/New_York',
        externalId: 'SESSION-001',
        confirmWarnings: true,
      },
    }, db as never)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_EXTERNAL_ID' })
    expect(db.eventStructureItem.create).not.toHaveBeenCalled()
  })

  it('derives workspace totals, session completeness, and speaker duplicate state from canonical rows', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findMany.mockResolvedValue([{
      id: 'session_1', name: 'Opening', startsAt: new Date('2026-09-17T13:00:00Z'), endsAt: new Date('2026-09-17T14:00:00Z'),
      timezone: 'America/New_York', metadata: { room: 'Main', track: 'Leadership', format: 'Keynote' },
      speakerAssignments: [], surveyTargets: [],
    }])
    db.eventSpeakerProfile.findMany.mockResolvedValue([
      { id: 'speaker_1', name: 'Ali Example', normalizedName: 'ali example', normalizedEmail: null, title: null, organization: null, email: null, sessionAssignments: [{ id: 'event_assignment_1', session: null }], surveyTargets: [{ id: 'speaker_target_1', publicSurveyLinks: [
        { id: 'speaker_link_old', token: 'old-token', isActive: true, metadata: { assignmentState: 'SUPERSEDED' }, survey: { id: 'speaker_survey_old', name: 'Old speaker feedback', status: 'ACTIVE', _count: { questions: 1 } } },
        { id: 'speaker_link_1', token: 'ali-speaker-token', isActive: false, metadata: { assignmentState: 'CURRENT' }, survey: { id: 'speaker_survey_1', name: 'Speaker feedback', status: 'ACTIVE', _count: { questions: 2 } } },
      ] }] },
    ])

    const workspace = await getEventAgendaWorkspace({ accountId: 'account_1', eventId: 'event_1' }, db as never)
    expect(workspace.summary).toEqual({ sessionCount: 1, speakerCount: 1, sessionsNeedingReview: 0, assignedSpeakerCount: 1 })
    expect(workspace.eventLifecyclePhase).toBe('PRE_EVENT')
    expect(workspace.sessions[0]).toMatchObject({ reviewState: 'COMPLETE', reviewIssues: [] })
    expect(workspace.speakers[0]).toMatchObject({ profileState: 'MISSING_DETAILS', possibleDuplicate: false, isAssignedToEvent: true, sessionCount: 0, sessionAssignments: [] })
    expect(workspace.speakers[0].survey).toEqual({ id: 'speaker_survey_1', name: 'Speaker feedback', status: 'ACTIVE', questionCount: 2, kioskPath: '/kiosk?token=ali-speaker-token', isActive: false })
    expect(db.eventSpeakerProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        accountId: 'account_1',
        sessionAssignments: { some: { eventId: 'event_1', sessionId: null } },
      }),
    }))
  })

  it('derives live agenda warning state from event dates instead of persisted ACTIVE status', async () => {
    const upcomingDb = createDb()
    upcomingDb.event.findFirst.mockResolvedValue({
      id: 'event_upcoming', name: 'Upcoming', eventType: EventType.FEEDBACK, status: 'ACTIVE',
      startDate: new Date('2099-09-17T13:00:00Z'), endDate: new Date('2099-09-18T22:00:00Z'),
      location: { accountId: 'account_1', timezone: 'America/New_York' },
    })
    upcomingDb.eventStructureItem.findMany.mockResolvedValue([])
    upcomingDb.eventSpeakerProfile.findMany.mockResolvedValue([])

    const liveDb = createDb()
    liveDb.event.findFirst.mockResolvedValue({
      id: 'event_live', name: 'Live', eventType: EventType.FEEDBACK, status: 'ACTIVE',
      startDate: new Date('2000-01-01T00:00:00Z'), endDate: new Date('2099-12-31T23:59:59Z'),
      location: { accountId: 'account_1', timezone: 'America/New_York' },
    })
    liveDb.eventStructureItem.findMany.mockResolvedValue([])
    liveDb.eventSpeakerProfile.findMany.mockResolvedValue([])

    await expect(getEventAgendaWorkspace({ accountId: 'account_1', eventId: 'event_upcoming' }, upcomingDb as never))
      .resolves.toMatchObject({ eventStatus: 'ACTIVE', eventLifecyclePhase: 'PRE_EVENT' })
    await expect(getEventAgendaWorkspace({ accountId: 'account_1', eventId: 'event_live' }, liveDb as never))
      .resolves.toMatchObject({ eventStatus: 'ACTIVE', eventLifecyclePhase: 'IN_EVENT' })
  })

  it('derives Template speakers only from current-event session assignments', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue({ id: 'event_1', eventType: EventType.TEMPLATE, status: 'DRAFT', location: { accountId: 'account_1' } })
    db.eventStructureItem.findMany.mockResolvedValue([])
    db.eventSpeakerProfile.findMany.mockResolvedValue([])

    await getEventAgendaWorkspace({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(db.eventSpeakerProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        accountId: 'account_1',
        sessionAssignments: { some: { eventId: 'event_1', sessionId: { not: null } } },
      }),
    }))
  })

  it('keeps account speaker discovery in a separately scoped library query', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.findMany.mockResolvedValue([{ id: 'speaker_2', name: 'Library speaker' }])

    await expect(listEventSpeakerLibrary({ accountId: 'account_1', eventId: 'event_1' }, db as never)).resolves.toEqual([{ id: 'speaker_2', name: 'Library speaker' }])
    expect(db.eventSpeakerProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        accountId: 'account_1',
        isArchived: false,
        sessionAssignments: { none: { eventId: 'event_1', sessionId: null } },
      },
    }))
  })

  it('does not present result-only survey scopes as agenda listening targets', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findMany.mockResolvedValue([{
      id: 'session_1', name: 'Opening', startsAt: new Date('2026-09-17T13:00:00Z'), endsAt: new Date('2026-09-17T14:00:00Z'),
      timezone: 'America/New_York', metadata: { room: 'Main', track: 'Leadership', format: 'Keynote' },
      speakerAssignments: [],
      surveyTargets: [
        { metadata: { listeningPoint: true } },
        { metadata: { listeningPoint: false, resultScope: 'SESSION' } },
        { metadata: { listeningPoint: false, resultScope: 'SPEAKER_ASSIGNMENT' } },
      ],
    }])
    db.eventSpeakerProfile.findMany.mockResolvedValue([])

    const workspace = await getEventAgendaWorkspace({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(workspace.sessions[0]._count.surveyTargets).toBe(1)
    expect(workspace.sessions[0]).not.toHaveProperty('surveyTargets')
  })

  it('archives sessions without deleting linked targets, assignments, or history', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findFirst.mockResolvedValue({
      id: 'session_1',
      surveyTargets: [
        { metadata: { listeningPoint: true } },
        { metadata: { listeningPoint: false, resultScope: 'SESSION' } },
      ],
      _count: { speakerAssignments: 3 },
    })
    db.eventStructureItem.update.mockResolvedValue({ id: 'session_1', isActive: false })

    const result = await archiveAgendaSession({
      accountId: 'account_1', eventId: 'event_1', sessionId: 'session_1',
    }, db as never)
    expect(result).toMatchObject({ softArchived: true, linkedSurveyTargetCount: 1, preservedAssignmentCount: 3 })
    expect(db.eventStructureItem.update).toHaveBeenCalledWith({ where: { id: 'session_1' }, data: { isActive: false } })
    expect(db.eventSessionSpeakerAssignment.delete).not.toHaveBeenCalled()
  })

  it('assigns a same-account speaker only to an active session structure item and reuses the unique join', async () => {
    const db = createDb()
    allowScope(db)
    db.eventStructureItem.findFirst.mockResolvedValue({ id: 'session_1' })
    db.eventSpeakerProfile.findFirst.mockResolvedValue({ id: 'speaker_1' })
    db.eventSessionSpeakerAssignment.upsert.mockResolvedValue({ id: 'assignment_1' })

    await assignSpeakerToAgendaSession({
      accountId: 'account_1',
      eventId: 'event_1',
      sessionId: 'session_1',
      assignment: { speakerId: 'speaker_1', role: 'PANELIST', sortOrder: 2 },
    }, db as never)

    expect(db.eventStructureItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'session_1', eventId: 'event_1', kind: EventStructureItemKind.SESSION, isActive: true },
      select: { id: true },
    })
    expect(db.eventSpeakerProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'speaker_1', accountId: 'account_1', isArchived: false },
      select: { id: true },
    })
    expect(db.eventSessionSpeakerAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId_speakerId: { sessionId: 'session_1', speakerId: 'speaker_1' } },
      create: expect.objectContaining({ accountId: 'account_1', eventId: 'event_1' }),
    }))
  })

  it('archives speakers without deleting assignments or agenda sessions', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.findFirst.mockResolvedValue({ id: 'speaker_1' })
    db.eventSpeakerProfile.update.mockResolvedValue({ id: 'speaker_1', isArchived: true })

    await archiveEventSpeakerProfile({
      accountId: 'account_1',
      eventId: 'event_1',
      speakerId: 'speaker_1',
    }, db as never)

    expect(db.eventSpeakerProfile.update).toHaveBeenCalledWith({
      where: { id: 'speaker_1' },
      data: { isArchived: true, archivedAt: expect.any(Date) },
    })
    expect(db.eventSessionSpeakerAssignment.upsert).not.toHaveBeenCalled()
    expect(db.eventStructureItem.findMany).not.toHaveBeenCalled()
  })

  it('updates a scoped speaker profile without creating a speaker or changing session relationships', async () => {
    const db = createDb()
    allowScope(db)
    db.eventSpeakerProfile.findFirst
      .mockResolvedValueOnce({ id: 'speaker_1', accountId: 'account_1', name: 'Alexa Graham', email: null, isArchived: false })
      .mockResolvedValueOnce(null)
    db.eventSpeakerProfile.update.mockResolvedValue({ id: 'speaker_1', name: 'Alexa Graham', title: 'Head of Events' })

    await updateEventSpeakerProfile({
      accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_1',
      profile: { title: 'Head of Events' },
    }, db as never)

    expect(db.eventSpeakerProfile.update).toHaveBeenCalledWith({
      where: { id: 'speaker_1' },
      data: expect.objectContaining({ title: 'Head of Events', normalizedName: 'alexa graham' }),
    })
    expect(db.eventSpeakerProfile.create).not.toHaveBeenCalled()
    expect(db.eventSessionSpeakerAssignment.createMany).not.toHaveBeenCalled()
    expect(db.eventSessionSpeakerAssignment.upsert).not.toHaveBeenCalled()
    expect(db.eventSessionSpeakerAssignment.delete).not.toHaveBeenCalled()
  })

  it('creates or reuses the same durable import job through its event idempotency key', async () => {
    const db = createDb()
    allowScope(db)
    db.user.findFirst.mockResolvedValue({ id: 'user_1' })
    db.eventAgendaImportJob.upsert.mockImplementation(async ({ create }) => ({
      id: 'import_1',
      ...create,
      status: EventAgendaImportStatus.UPLOADED,
    }))
    const input = {
      accountId: 'account_1',
      eventId: 'event_1',
      createdByUserId: 'user_1',
      sourceFileName: 'agenda.xlsx',
      sourceMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sourceFileSizeBytes: 128,
      sourceChecksumSha256: 'a'.repeat(64),
      worksheetName: 'Sessions',
      worksheetIndex: 0,
    }

    const first = await createOrReuseAgendaImportJob(input, db as never)
    const second = await createOrReuseAgendaImportJob(input, db as never)

    expect(first.idempotencyKey).toBe(second.idempotencyKey)
    expect(db.eventAgendaImportJob.upsert).toHaveBeenCalledTimes(2)
    expect(db.eventAgendaImportJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_idempotencyKey: { eventId: 'event_1', idempotencyKey: first.idempotencyKey } },
      update: {},
    }))
  })

  it('locks confirmation to an explicit atomic lifecycle', () => {
    expect(EVENT_AGENDA_IMPORT_CONFIRMATION_MODE).toBe('ATOMIC_ALL_OR_NOTHING')
    expect(EVENT_AGENDA_SESSION_AUTHORITY).toBe('EVENT_STRUCTURE_ITEM')
    expect(EVENT_SPEAKER_IDENTITY_SCOPE).toBe('ACCOUNT')
    expect(EVENT_SPEAKER_ASSIGNMENT_AUTHORITY).toBe('EVENT_SESSION_SPEAKER_ASSIGNMENT')
    expect(EVENT_SPEAKER_REMOVAL_MODE).toBe('ARCHIVE_FIRST')
    expect(canTransitionAgendaImport(EventAgendaImportStatus.READY, EventAgendaImportStatus.CONFIRMING)).toBe(true)
    expect(canTransitionAgendaImport(EventAgendaImportStatus.CONFIRMING, EventAgendaImportStatus.COMPLETED)).toBe(true)
    expect(canTransitionAgendaImport(EventAgendaImportStatus.COMPLETED, EventAgendaImportStatus.CONFIRMING)).toBe(false)
  })
})
