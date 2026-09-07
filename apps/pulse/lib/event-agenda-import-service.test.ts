import {
  EventAgendaImportResolution,
  EventAgendaImportRowStatus,
  EventAgendaImportStatus,
} from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  classifyAgendaImportRows,
  confirmAgendaImport,
  createAgendaImportUpload,
  discardAgendaImport,
  saveAgendaImportDecisions,
  saveAgendaImportMapping,
  saveAgendaImportRowCorrection,
  selectAgendaImportWorksheet,
  type AgendaImportCanonicalServices,
} from './event-agenda-import-service'

const BASE_JOB = {
  id: 'import_1', accountId: 'account_1', eventId: 'event_1', createdByUserId: 'user_1', confirmedByUserId: null,
  status: EventAgendaImportStatus.UPLOADED, idempotencyKey: '', sourceFileName: 'agenda.csv', sourceMimeType: 'text/csv',
  sourceFileSizeBytes: 0, sourceChecksumSha256: '', sourceObjectKey: null, worksheetName: null, worksheetIndex: null,
  mappingSnapshot: null, failureCode: null, failureMessage: null, createdSessionCount: 0, updatedSessionCount: 0,
  skippedRowCount: 0, duplicateRowCount: 0, failedRowCount: 0, createdSpeakerCount: 0, matchedSpeakerCount: 0,
  confirmedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
}

function createImportDb() {
  let job: typeof BASE_JOB | null = null
  let rows: Array<Record<string, any>> = []
  let existingSessions: Array<Record<string, any>> = []
  let existingSpeakers: Array<Record<string, any>> = []
  let rosterAssignments: Array<Record<string, any>> = []

  const db: Record<string, any> = {
    event: { findFirst: vi.fn(async ({ where }) => where.location.accountId === 'account_1' ? { id: 'event_1', status: 'DRAFT', location: { accountId: 'account_1' } } : null) },
    user: { findFirst: vi.fn(async ({ where }) => where.id === 'user_1' ? { id: 'user_1' } : null) },
    eventAgendaImportJob: {
      upsert: vi.fn(async ({ create }) => {
        if (!job) job = { ...BASE_JOB, ...create, id: 'import_1' }
        return { ...job }
      }),
      findFirst: vi.fn(async ({ where }) => job && job.id === where.id && job.eventId === where.eventId && job.accountId === where.accountId ? { ...job, rows: rows.map((row) => ({ ...row })) } : null),
      update: vi.fn(async ({ data }) => {
        if (!job) throw new Error('missing job')
        job = { ...job, ...data, updatedAt: new Date() }
        return { ...job }
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (!job || job.id !== where.id || job.eventId !== where.eventId || job.accountId !== where.accountId) return { count: 0 }
        const allowed = where.status?.in ?? (where.status ? [where.status] : null)
        if (allowed && !allowed.includes(job.status)) return { count: 0 }
        job = { ...job, ...data, updatedAt: new Date() }
        return { count: 1 }
      }),
      create: vi.fn(async ({ data }) => {
        job = { ...BASE_JOB, ...data, id: `import_${Date.now()}` }
        return { ...job }
      }),
    },
    eventAgendaImportRow: {
      deleteMany: vi.fn(async () => { rows = []; return { count: 0 } }),
      createMany: vi.fn(async ({ data }) => {
        rows = data.map((row: Record<string, unknown>, index: number) => ({
          id: `row_${index + 1}`, result: null, resultSessionId: null, resultMessage: null, processedAt: null,
          createdAt: new Date(), updatedAt: new Date(), ...row,
        }))
        return { count: rows.length }
      }),
      update: vi.fn(async ({ where, data }) => {
        const index = rows.findIndex((row) => row.id === where.id)
        rows[index] = { ...rows[index], ...data, updatedAt: new Date() }
        return { ...rows[index] }
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const ids = new Set(where.id?.in ?? [])
        rows = rows.map((row) => ids.has(row.id) ? { ...row, ...data, updatedAt: new Date() } : row)
        return { count: ids.size }
      }),
      findMany: vi.fn(async () => rows.map((row) => ({ ...row }))),
    },
    eventStructureItem: {
      findMany: vi.fn(async ({ select }) => select?.slug
        ? existingSessions.map((session) => ({ slug: session.slug }))
        : select?.metadata
          ? existingSessions
          : []),
      createMany: vi.fn(async ({ data }) => { existingSessions.push(...data); return { count: data.length } }),
      update: vi.fn(async ({ where, data }) => {
        const index = existingSessions.findIndex((session) => session.id === where.id)
        existingSessions[index] = { ...existingSessions[index], ...data }
        return { ...existingSessions[index] }
      }),
    },
    eventSpeakerProfile: {
      findMany: vi.fn(async ({ include }) => include ? existingSpeakers.map((speaker) => ({
        ...speaker,
        sessionAssignments: rosterAssignments.filter((assignment) => assignment.speakerId === speaker.id).map((assignment) => ({ ...assignment, session: null, speakerSurveyTargets: [] })),
        surveyTargets: [],
      })) : existingSpeakers),
      findFirst: vi.fn(async ({ where }) => existingSpeakers.find((speaker) => speaker.id === where.id || (where.normalizedEmail && speaker.normalizedEmail === where.normalizedEmail)) ?? null),
      createMany: vi.fn(async ({ data }) => { existingSpeakers.push(...data); return { count: data.length } }),
    },
    eventSessionSpeakerAssignment: {
      findMany: vi.fn(async ({ where }) => rosterAssignments.filter((assignment) => assignment.accountId === where.accountId && assignment.eventId === where.eventId && assignment.sessionId === null && (!where.speakerId?.in || where.speakerId.in.includes(assignment.speakerId)))),
      createMany: vi.fn(async ({ data }) => { rosterAssignments.push(...data); return { count: data.length } }),
      deleteMany: vi.fn(async ({ where }) => {
        const sessionIds = new Set(where.sessionId?.in ?? [])
        const before = rosterAssignments.length
        rosterAssignments = rosterAssignments.filter((assignment) => !sessionIds.has(assignment.sessionId))
        return { count: before - rosterAssignments.length }
      }),
    },
  }
  db.$transaction = vi.fn(async (callback: (transaction: typeof db) => Promise<unknown>) => {
    const jobBefore = job ? { ...job } : null
    const rowsBefore = rows.map((row) => ({ ...row }))
    try { return await callback(db) } catch (error) { job = jobBefore; rows = rowsBefore; throw error }
  })
  return {
    db,
    state: {
      get job() { return job }, get rows() { return rows },
      get existingSessions() { return existingSessions },
      set existingSessions(value: Array<Record<string, any>>) { existingSessions = value },
      get existingSpeakers() { return existingSpeakers },
      set existingSpeakers(value: Array<Record<string, any>>) { existingSpeakers = value },
      get rosterAssignments() { return rosterAssignments },
    },
  }
}

const mapping = { title: 'Title', startDate: 'Date', startTime: 'Start', endTime: 'End', externalId: 'ID', room: 'Room', speakerNames: 'Speakers', speakerEmails: 'Emails' }

async function stageReadyImport(db: any, csv = 'Title,Date,Start,End,ID,Room,Speakers,Emails\nOpening,09/17/2026,09:00,10:00,S-1,Main,,\n') {
  await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }, db)
  return saveAgendaImportMapping({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', mapping, timezone: 'America/New_York' }, db)
}

describe('event agenda import service', () => {
  it('creates one durable upload identity and persists workbook inspection across retries', async () => {
    const { db, state } = createImportDb()
    const input = { accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Title,Date,Start,End\nOpening,09/17/2026,09:00,10:00\n') }
    const first = await createAgendaImportUpload(input, db as never)
    const second = await createAgendaImportUpload(input, db as never)
    expect(first.id).toBe('import_1')
    expect(second.id).toBe('import_1')
    expect(db.eventAgendaImportJob.upsert).toHaveBeenCalledTimes(2)
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.READY, worksheetName: 'CSV', sourceChecksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(first.inspection.worksheets).toEqual([{ name: 'CSV', index: 0, columns: ['Title', 'Date', 'Start', 'End'], rowCount: 1 }])
    expect(first.sourcePreview).toEqual({
      worksheetName: 'CSV',
      columns: ['Title', 'Date', 'Start', 'End'],
      rows: [{ Title: 'Opening', Date: '09/17/2026', Start: '09:00', End: '10:00' }],
    })
  })

  it('does not call AI when deterministic headers resolve the required mapping', async () => {
    const { db } = createImportDb()
    const interpret = vi.fn()
    await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Session Title,Date\nOpening,2026-08-18\n') }, db as never, interpret)
    expect(interpret).not.toHaveBeenCalled()
  })

  it('uses one structured AI fallback for unresolved headers and validates the proposed mapping', async () => {
    const { db } = createImportDb()
    const interpret = vi.fn().mockResolvedValue({ mapping: { title: 'Program Name', speakerNames: 'Panelists' }, confidence: 0.92, warnings: [] })
    const result = await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Program Name,Panelists\nOpening,Ali Kamyab\n') }, db as never, interpret)
    expect(interpret).toHaveBeenCalledTimes(1)
    expect(result.aiInterpretation).toMatchObject({ status: 'PROPOSED', plan: { confidence: 0.92 } })
    expect(result.discoveredMapping).toMatchObject({ mapping: { title: 'Program Name', speakerNames: 'Panelists' }, missingRequired: [] })
  })

  it('uses one AI fallback for an unresolved optional agenda column without overriding deterministic mappings', async () => {
    const { db } = createImportDb()
    const interpret = vi.fn().mockResolvedValue({ mapping: { description: 'Talk Abstract' }, confidence: 0.8, warnings: [] })
    const result = await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Session Title,Talk Abstract\nOpening,Welcome\n') }, db as never, interpret)
    expect(interpret).toHaveBeenCalledTimes(1)
    expect(result.discoveredMapping).toMatchObject({ mapping: { title: 'Session Title', description: 'Talk Abstract' }, missingRequired: [] })
  })

  it('keeps malformed AI output out of the mapping and falls back safely', async () => {
    const { db } = createImportDb()
    const result = await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Program Name\nOpening\n') }, db as never, vi.fn().mockRejectedValue(new Error('malformed structured response')))
    expect(result.aiInterpretation).toMatchObject({ status: 'FAILED', plan: null })
    // The deterministic Program alias still yields a safe, reviewable row
    // when the optional AI interpretation fails.
    expect(result.discoveredMapping?.missingRequired).toEqual([])
  })

  it('stages a first/last-name speaker roster for review without writing domain records', async () => {
    const { db, state } = createImportDb()
    await createAgendaImportUpload({
      accountId: 'account_1', eventId: 'event_1', userId: 'user_1', importType: 'SPEAKER_ROSTER',
      fileName: 'speaker-roster.csv', mimeType: 'text/csv',
      buffer: Buffer.from('First name,Last name,Email,Organization,Title,Session title,External session ID\nAvery,Example,avery@example.test,Example Co.,Host,Opening,S-1\n'),
    }, db as never)
    await expect(saveAgendaImportMapping({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', timezone: 'America/New_York',
      mapping: { fullName: null, firstName: 'First name', lastName: 'Last name', email: 'Email', organization: 'Organization', title: 'Title', sessionTitle: 'Session title', externalSessionId: 'External session ID', tags: null },
    }, db as never)).resolves.toMatchObject({ status: EventAgendaImportStatus.READY })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0].normalizedRowSnapshot).toMatchObject({ displayName: 'Avery Example', sessionTitle: 'Opening' })
    expect(db.eventStructureItem.findMany).toHaveBeenCalled()
    expect(db.eventSpeakerProfile.findMany).toHaveBeenCalled()
  })

  it('confirms a sessionless speaker roster row through the canonical event-assignment service', async () => {
    const { db, state } = createImportDb()
    await createAgendaImportUpload({
      accountId: 'account_1', eventId: 'event_1', userId: 'user_1', importType: 'SPEAKER_ROSTER',
      fileName: 'speaker-roster.csv', mimeType: 'text/csv', buffer: Buffer.from('Full name,Email\nAvery Example,avery@example.test\n'),
    }, db as never)
    await saveAgendaImportMapping({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', timezone: 'America/New_York',
      mapping: { fullName: 'Full name', firstName: null, lastName: null, email: 'Email', organization: null, title: null, sessionTitle: null, externalSessionId: null, tags: null },
    }, db as never)
    const services: AgendaImportCanonicalServices = {
      createSession: vi.fn() as never,
      updateSession: vi.fn() as never,
      createSpeaker: vi.fn().mockResolvedValue({ id: 'speaker_imported' }) as never,
      addSpeakerToEvent: vi.fn().mockResolvedValue({ id: 'speaker_imported' }) as never,
      assignSpeaker: vi.fn() as never,
    }

    await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services)

    expect(services.createSpeaker).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account_1', eventId: 'event_1' }), expect.anything())
    expect(services.addSpeakerToEvent).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', speakerId: 'speaker_imported' }, expect.anything())
    expect(services.assignSpeaker).not.toHaveBeenCalled()
    expect(state.rows[0]).toMatchObject({ status: EventAgendaImportRowStatus.CONFIRMED, resultMessage: 'Speaker added to this event; no session assignment was created' })
  })

  it('can populate the reusable account speaker directory without assigning the imported profile to this event', async () => {
    const { db } = createImportDb()
    await createAgendaImportUpload({
      accountId: 'account_1', eventId: 'event_1', userId: 'user_1', importType: 'SPEAKER_ROSTER',
      fileName: 'speaker-roster.csv', mimeType: 'text/csv', buffer: Buffer.from('Full name\nAvery Example\n'),
    }, db as never)
    await saveAgendaImportMapping({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', timezone: 'America/New_York', assignSpeakersToEvent: false,
      mapping: { fullName: 'Full name', firstName: null, lastName: null, email: null, organization: null, title: null, phone: null, biography: null, sessionTitle: null, externalSessionId: null, tags: null },
    }, db as never)
    const services: AgendaImportCanonicalServices = {
      createSession: vi.fn() as never, updateSession: vi.fn() as never,
      createSpeaker: vi.fn().mockResolvedValue({ id: 'speaker_imported' }) as never,
      addSpeakerToEvent: vi.fn() as never, assignSpeaker: vi.fn() as never,
    }

    await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services)

    expect(services.createSpeaker).toHaveBeenCalledOnce()
    expect(services.addSpeakerToEvent).not.toHaveBeenCalled()
    expect(services.assignSpeaker).not.toHaveBeenCalled()
  })

  it('batches a 500-row speaker roster into bulk profile and event-membership writes', async () => {
    const { db, state } = createImportDb()
    const source = ['Full name,Email', ...Array.from({ length: 500 }, (_, index) => `Speaker ${index + 1},speaker${index + 1}@example.test`)].join('\n')
    await createAgendaImportUpload({
      accountId: 'account_1', eventId: 'event_1', userId: 'user_1', importType: 'SPEAKER_ROSTER',
      fileName: 'speaker-roster.csv', mimeType: 'text/csv', buffer: Buffer.from(source),
    }, db as never)
    await saveAgendaImportMapping({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', timezone: 'America/New_York',
      mapping: { fullName: 'Full name', firstName: null, lastName: null, email: 'Email', organization: null, title: null, phone: null, biography: null, sessionTitle: null, externalSessionId: null, tags: null },
    }, db as never)

    await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never)

    expect(db.eventSpeakerProfile.createMany).toHaveBeenCalledTimes(1)
    expect(db.eventSessionSpeakerAssignment.createMany).toHaveBeenCalledTimes(1)
    expect(state.existingSpeakers).toHaveLength(500)
    expect(state.rosterAssignments).toHaveLength(500)
  })

  it('normalizes 500 agenda rows with one batched session lookup and one batched speaker lookup', async () => {
    const { db, state } = createImportDb()
    const source = ['Title,Date,Start,End,Speakers,Emails', ...Array.from({ length: 500 }, (_, index) => `Session ${index + 1},08/18/2026,09:00,10:00,Speaker ${index + 1},speaker${index + 1}@example.test`)].join('\n')
    await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from(source) }, db as never)
    expect(state.rows).toHaveLength(500)
    expect(db.eventStructureItem.findMany).toHaveBeenCalledTimes(1)
    expect(db.eventSpeakerProfile.findMany).toHaveBeenCalledTimes(1)
  })

  it('auto-interprets a combined-time agenda in one structural AI call and enters review without manual mapping', async () => {
    const { db, state } = createImportDb()
    const interpret = vi.fn().mockResolvedValue({
      mapping: { title: 'SESSION', startDate: 'DAY/DATE', startTime: 'TIME', endTime: 'TIME', speakerNames: 'SPEAKER(s)' },
      rules: { timeRangeColumn: 'TIME', speakerDelimiters: ['NEWLINE'] },
      confidence: 0.94,
      warnings: [],
    })
    const rows = Array.from({ length: 25 }, (_, index) => {
      const speakers = index === 2 ? '"Alex Example\nJordan Example"' : index === 22 ? 'TBD' : `Speaker ${index + 1}`
      return `${index < 13 ? '46309' : '46310'},9:15 AM - 10:45 AM,Session ${index + 1},${speakers}`
    })
    const result = await createAgendaImportUpload({
      accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'cornerstone.csv', mimeType: 'text/csv',
      buffer: Buffer.from(`DAY/DATE,TIME,SESSION,SPEAKER(s)\n${rows.join('\n')}`),
    }, db as never, interpret)
    expect(interpret).toHaveBeenCalledTimes(1)
    expect(result.status).toBe(EventAgendaImportStatus.READY)
    expect(state.rows).toHaveLength(25)
    expect(state.rows.every((row) => row.status === EventAgendaImportRowStatus.READY)).toBe(true)
    expect(state.rows[2].normalizedRowSnapshot).toMatchObject({ title: 'Session 3', speakers: [{ name: 'Alex Example' }, { name: 'Jordan Example' }] })
  })

  it('confirms 500 normalized sessions with one bulk session insert and remains idempotent', async () => {
    const { db, state } = createImportDb()
    const source = ['Title,Date,Start,End', ...Array.from({ length: 500 }, (_, index) => `Session ${index + 1},08/18/2026,09:00,10:00`)].join('\n')
    await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from(source) }, db as never)
    await saveAgendaImportMapping({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', timezone: 'America/New_York',
      mapping: { title: 'Title', startDate: 'Date', startTime: 'Start', endDate: null, endTime: 'End', description: null, room: null, track: null, format: null, speakerNames: null, speakerFirstNames: null, speakerLastNames: null, speakerEmails: null, speakerOrganizations: null, speakerTitles: null, capacity: null, externalId: null, tags: null },
    }, db as never)

    const first = await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never)
    const second = await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never)

    expect(first).toMatchObject({ idempotentReplay: false, completion: { importedCount: 500 } })
    expect(second).toMatchObject({ idempotentReplay: true, completion: { importedCount: 500 } })
    expect(db.eventStructureItem.createMany).toHaveBeenCalledTimes(1)
    expect(state.existingSessions).toHaveLength(500)
  })

  it('discards only staged rows and creates a clean draft after a discarded replay', async () => {
    const { db, state } = createImportDb()
    const input = { accountId: 'account_1', eventId: 'event_1', userId: 'user_1', importType: 'SPEAKER_ROSTER' as const, fileName: 'speaker-roster.csv', mimeType: 'text/csv', buffer: Buffer.from('First name\nAvery\n') }
    await createAgendaImportUpload(input, db as never)
    await expect(discardAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1' }, db as never)).resolves.toMatchObject({ discarded: true, idempotentReplay: false })
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.CANCELLED })
    await expect(discardAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1' }, db as never)).resolves.toMatchObject({ discarded: true, idempotentReplay: true })
    const replacement = await createAgendaImportUpload(input, db as never)
    expect(replacement.id).not.toBe('import_1')
    expect(replacement).toMatchObject({ status: EventAgendaImportStatus.MAPPING })
  })

  it('uses distinct durable identities for agenda and roster uploads of the same source', async () => {
    const { db } = createImportDb()
    const common = { accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'shared.csv', mimeType: 'text/csv', buffer: Buffer.from('First name\nAvery\n') }
    await createAgendaImportUpload({ ...common, importType: 'SPEAKER_ROSTER' }, db as never)
    await createAgendaImportUpload({ ...common, importType: 'AGENDA' }, db as never)
    const keys = db.eventAgendaImportJob.upsert.mock.calls.map((call: any[]) => call[0].create.idempotencyKey)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('rejects cross-account import access before reading or writing jobs', async () => {
    const { db } = createImportDb()
    await expect(createAgendaImportUpload({ accountId: 'account_other', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Title\nOpening') }, db as never))
      .rejects.toMatchObject({ code: 'EVENT_NOT_FOUND', status: 404 })
    expect(db.eventAgendaImportJob.upsert).not.toHaveBeenCalled()
  })

  it('replaces worksheet choice durably and clears stale normalized rows', async () => {
    const { db, state } = createImportDb()
    await createAgendaImportUpload({ accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from('Title,Date,Start,End\nOpening,09/17/2026,09:00,10:00\n') }, db as never)
    await selectAgendaImportWorksheet({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', worksheetIndex: 0 }, db as never)
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.MAPPING, worksheetName: 'CSV', worksheetIndex: 0 })
    expect(db.eventAgendaImportRow.deleteMany).toHaveBeenCalled()
  })

  it('classifies existing matches, overlaps, ambiguous speakers, and in-file duplicates without silent overwrite', () => {
    const worksheet = {
      name: 'Sessions', index: 0, columns: Object.values(mapping), rowCount: 2,
      rows: [
        { sourceRowNumber: 2, values: { Title: 'Opening', Date: '09/17/2026', Start: '09:00', End: '10:00', ID: 'S-1', Room: 'Main', Speakers: 'Alex', Emails: '' } },
        { sourceRowNumber: 3, values: { Title: 'Opening', Date: '09/17/2026', Start: '09:00', End: '10:00', ID: 'S-1', Room: 'Main', Speakers: '', Emails: '' } },
      ],
    }
    const rows = classifyAgendaImportRows({
      eventId: 'event_1', importJobId: 'import_1', checksumSha256: 'a'.repeat(64), worksheet, mapping, timezone: 'America/New_York',
      existingSessions: [{ id: 'existing_1', name: 'Existing', startsAt: new Date('2026-09-17T13:30:00Z'), endsAt: new Date('2026-09-17T14:30:00Z'), metadata: { room: 'Main', externalId: 'S-1' } }],
      existingSpeakers: [{ id: 'speaker_1', normalizedName: 'alex', normalizedEmail: null }, { id: 'speaker_2', normalizedName: 'alex', normalizedEmail: null }],
    })
    expect(rows[0]).toMatchObject({ status: EventAgendaImportRowStatus.DUPLICATE, conflictType: 'EXTERNAL_ID_MATCH', existingSessionId: 'existing_1' })
    expect(rows[0].speakerResolutionSnapshot).toEqual([expect.objectContaining({ decision: null, candidateSpeakerIds: ['speaker_1', 'speaker_2'] })])
    expect(rows[1]).toMatchObject({ status: EventAgendaImportRowStatus.DUPLICATE, conflictType: 'EXTERNAL_ID_MATCH' })
    expect(rows[0].stableSourceKey).not.toBe(rows[1].stableSourceKey)
  })

  it('keeps invalid rows durable and requires an explicit skip decision', async () => {
    const { db, state } = createImportDb()
    await stageReadyImport(db, 'Title,Date,Start,End,ID,Room,Speakers,Emails\n,not-a-date,09:00,08:00,,, ,\n')
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({ status: EventAgendaImportRowStatus.INVALID, normalizedRowSnapshot: expect.anything(), resolution: null })
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.NEEDS_REVIEW })
    await saveAgendaImportDecisions({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', decisions: [{ rowId: 'row_1', resolution: 'SKIP' }] }, db as never)
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.READY })
  })

  it('server-validates a normalized correction and refreshes the reconciliation plan', async () => {
    const { db, state } = createImportDb()
    await stageReadyImport(db)
    const normalized = state.rows[0].normalizedRowSnapshot
    const result = await saveAgendaImportRowCorrection({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1',
      correction: { rowId: 'row_1', normalizedRow: { ...normalized, title: 'Corrected Opening', room: 'Hall B' } },
    }, db as never)
    expect(state.rows[0].normalizedRowSnapshot).toMatchObject({ title: 'Corrected Opening', room: 'Hall B' })
    expect(result.reconciliation).toMatchObject({ summary: { addedSessions: 1, updatedSessions: 0 } })
  })

  it('keeps imported speaker identity immutable while accepting account-scoped reconciliation', async () => {
    const { db, state } = createImportDb()
    state.existingSpeakers = [{ id: 'speaker_1', normalizedName: 'alex', normalizedEmail: null }]
    await stageReadyImport(db, 'Title,Date,Start,End,ID,Room,Speakers,Emails\nOpening,09/17/2026,09:00,10:00,S-1,Main,Alex,\n')
    await expect(saveAgendaImportDecisions({
      accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1',
      decisions: [{
        rowId: 'row_1', resolution: 'KEEP_BOTH',
        speakerResolutions: [{ sourceName: 'Someone else', decision: 'LINK_EXISTING', matchedSpeakerId: 'speaker_1', candidateSpeakerIds: ['speaker_1'] }],
      }],
    }, db as never)).rejects.toMatchObject({ code: 'SPEAKER_SOURCE_MISMATCH' })
    expect(state.rows[0].resolution).toBeNull()
  })

  it('confirms atomically through canonical services and makes repeated confirmation a no-op', async () => {
    const { db, state } = createImportDb()
    await stageReadyImport(db)
    const services: AgendaImportCanonicalServices = {
      createSession: vi.fn(async (input) => ({ session: { id: 'session_imported', input }, warnings: [] })) as never,
      updateSession: vi.fn() as never,
      createSpeaker: vi.fn() as never,
      addSpeakerToEvent: vi.fn() as never,
      assignSpeaker: vi.fn() as never,
    }
    const first = await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services)
    const second = await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services)
    expect(first).toMatchObject({ idempotentReplay: false, completion: { importedCount: 1, updatedCount: 0, failedCount: 0 } })
    expect(second).toMatchObject({ idempotentReplay: true, completion: { importedCount: 1 } })
    expect(services.createSession).toHaveBeenCalledTimes(1)
    expect(services.createSession).toHaveBeenCalledWith(expect.objectContaining({ importSource: { importJobId: 'import_1', importRowId: 'row_1', sourceExternalId: 'S-1' } }), expect.anything())
    expect(state.rows[0]).toMatchObject({ status: EventAgendaImportRowStatus.CONFIRMED, result: 'CREATED', resultSessionId: 'session_imported' })
  })

  it('rolls back the complete confirmation, records resumable failure, and succeeds on retry', async () => {
    const { db, state } = createImportDb()
    await stageReadyImport(db)
    const createSession = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ session: { id: 'session_retry' }, warnings: [] })
    const services: AgendaImportCanonicalServices = {
      createSession: createSession as never, updateSession: vi.fn() as never, createSpeaker: vi.fn() as never, addSpeakerToEvent: vi.fn() as never, assignSpeaker: vi.fn() as never,
    }
    await expect(confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services))
      .rejects.toMatchObject({ code: 'IMPORT_CONFIRMATION_FAILED', details: { atomic: true, resumable: true } })
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.FAILED, createdSessionCount: 0, failedRowCount: 1 })
    expect(state.rows[0].result).toBeNull()
    const retried = await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services)
    expect(retried).toMatchObject({ completion: { importedCount: 1, failedCount: 0 } })
    expect(state.job).toMatchObject({ status: EventAgendaImportStatus.COMPLETED })
  })

  it('honors an explicit duplicate skip and reports reliable duplicate/skipped counts', async () => {
    const { db, state } = createImportDb()
    state.existingSessions = [{ id: 'existing_1', name: 'Opening', startsAt: new Date('2026-09-17T13:00:00Z'), endsAt: new Date('2026-09-17T14:00:00Z'), metadata: { externalId: 'S-1', room: 'Main' } }]
    await stageReadyImport(db)
    expect(state.rows[0]).toMatchObject({ status: EventAgendaImportRowStatus.DUPLICATE, resolution: null })
    await saveAgendaImportDecisions({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', decisions: [{ rowId: 'row_1', resolution: EventAgendaImportResolution.SKIP }] }, db as never)
    const services = { createSession: vi.fn(), updateSession: vi.fn(), createSpeaker: vi.fn(), addSpeakerToEvent: vi.fn(), assignSpeaker: vi.fn() } as unknown as AgendaImportCanonicalServices
    const result = await confirmAgendaImport({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1', userId: 'user_1' }, db as never, services)
    expect(result.completion).toMatchObject({ importedCount: 0, skippedCount: 1, duplicateCount: 1, failedCount: 0 })
    expect(services.createSession).not.toHaveBeenCalled()
    expect(services.updateSession).not.toHaveBeenCalled()
  })
})
