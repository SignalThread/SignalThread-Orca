/**
 * Speaker roster membership validation suite (A–L).
 *
 * These tests exercise the real service functions in `lib/event-agenda-service.ts`
 * and the real import confirmation path in `lib/event-agenda-import-service.ts`
 * against an in-memory store that ENFORCES the same constraints the migration
 * `20260817120000_add_event_speaker_roster_membership` creates in PostgreSQL:
 *
 *   - unique (sessionId, speakerId) for session assignments
 *   - partial unique (eventId, speakerId) WHERE sessionId IS NULL for roster rows
 *   - (accountId, speakerId) FK to EventSpeakerProfile (cross-account rejection)
 *   - eventId FK to Event
 *
 * The membership rule under test is never mocked away: `ensureEventSpeakerAssignment`
 * really writes, and duplicate writes are really rejected by the store.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  addSpeakerToEvent,
  assignSpeakerToAgendaSession,
  createAccountSpeakerProfile,
  createEventSpeakerProfile,
  getEventAgendaWorkspace,
  listEventSpeakerLibrary,
  removeSpeakerFromAgendaSession,
  EventAgendaServiceError,
} from './event-agenda-service'

interface AssignmentRow {
  id: string
  accountId: string
  eventId: string
  sessionId: string | null
  speakerId: string
  role: string
  sortOrder: number
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}

interface SpeakerRow {
  id: string
  accountId: string
  name: string
  title: string | null
  organization: string | null
  email: string | null
  phone: string | null
  biography: string | null
  headshotState: string
  normalizedName: string
  normalizedEmail: string | null
  isArchived: boolean
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

class UniqueConstraintError extends Error {
  code = 'P2002'
}
class ForeignKeyError extends Error {
  code = 'P2003'
}

function matches(row: object, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true
  const record = row as Record<string, unknown>
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Array<Record<string, unknown>>).some((clause) => matches(record, clause))
    if (key === 'AND') return (condition as Array<Record<string, unknown>>).every((clause) => matches(record, clause))
    const value = record[key]
    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
      const nested = condition as Record<string, unknown>
      if ('in' in nested) return (nested.in as unknown[]).includes(value)
      if ('not' in nested) return value !== nested.not
      if ('equals' in nested) return value === nested.equals
      return false
    }
    return value === condition
  })
}

function createStore() {
  const accounts = [
    { id: 'acctA', accountType: 'EVENTS' },
    { id: 'acctB', accountType: 'EVENTS' },
  ]
  const locations = [
    { id: 'locA', accountId: 'acctA' },
    { id: 'locB', accountId: 'acctB' },
  ]
  const events = [
    { id: 'evA', locationId: 'locA', status: 'DRAFT' },
    { id: 'evB', locationId: 'locA', status: 'DRAFT' },
    { id: 'evOther', locationId: 'locB', status: 'DRAFT' },
  ]
  const sessions = [
    { id: 's1', eventId: 'evA', name: 'Opening keynote', kind: 'SESSION', isActive: true, startsAt: null, sortOrder: 0, metadata: {} },
    { id: 's2', eventId: 'evA', name: 'Panel', kind: 'SESSION', isActive: true, startsAt: null, sortOrder: 1, metadata: {} },
    { id: 'sOther', eventId: 'evOther', name: 'Other event session', kind: 'SESSION', isActive: true, startsAt: null, sortOrder: 0, metadata: {} },
  ]
  const speakers: SpeakerRow[] = []
  const assignments: AssignmentRow[] = []
  let seq = 0
  const nextId = (prefix: string) => `${prefix}_${++seq}`

  function accountOf(eventId: string): string | null {
    const event = events.find((candidate) => candidate.id === eventId)
    if (!event) return null
    return locations.find((location) => location.id === event.locationId)?.accountId ?? null
  }

  /** Enforces the real DB constraints before an assignment row is stored. */
  function insertAssignment(data: Partial<AssignmentRow>): AssignmentRow {
    const eventId = String(data.eventId)
    const accountId = String(data.accountId)
    const speakerId = String(data.speakerId)
    const sessionId = (data.sessionId ?? null) as string | null
    // eventId FK
    if (!events.some((event) => event.id === eventId)) {
      throw new ForeignKeyError('EventSessionSpeakerAssignment_eventId_fkey')
    }
    // (accountId, speakerId) FK -> EventSpeakerProfile(accountId, id)
    if (!speakers.some((speaker) => speaker.id === speakerId && speaker.accountId === accountId)) {
      throw new ForeignKeyError('EventSessionSpeakerAssignment_accountId_speakerId_fkey')
    }
    if (sessionId === null) {
      // partial unique index (eventId, speakerId) WHERE sessionId IS NULL
      if (assignments.some((row) => row.sessionId === null && row.eventId === eventId && row.speakerId === speakerId)) {
        throw new UniqueConstraintError('EventSessionSpeakerAssignment_eventId_speakerId_roster_key')
      }
    } else {
      // composite session FK (eventId, sessionId)
      if (!sessions.some((session) => session.id === sessionId && session.eventId === eventId)) {
        throw new ForeignKeyError('EventSessionSpeakerAssignment_eventId_sessionId_fkey')
      }
      if (assignments.some((row) => row.sessionId === sessionId && row.speakerId === speakerId)) {
        throw new UniqueConstraintError('EventSessionSpeakerAssignment_sessionId_speakerId_key')
      }
    }
    const row: AssignmentRow = {
      id: data.id ?? nextId('asg'),
      accountId,
      eventId,
      sessionId,
      speakerId,
      role: (data.role as string) ?? 'SPEAKER',
      sortOrder: (data.sortOrder as number) ?? 0,
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    assignments.push(row)
    return row
  }

  const db = {
    account: {
      findFirst: async ({ where }: never) => accounts.find((row) => matches(row, where as never)) ?? null,
    },
    event: {
      findFirst: async ({ where }: never) => {
        const clause = where as unknown as { id?: string; location?: { accountId?: string; account?: { accountType?: string } } }
        const event = events.find((row) => row.id === clause.id)
        if (!event) return null
        const accountId = accountOf(event.id)
        if (clause.location?.accountId && clause.location.accountId !== accountId) return null
        const account = accounts.find((row) => row.id === accountId)
        if (clause.location?.account?.accountType && account?.accountType !== clause.location.account.accountType) return null
        return { id: event.id, status: event.status, location: { accountId } }
      },
    },
    eventStructureItem: {
      findFirst: async ({ where }: never) => sessions.find((row) => matches(row, where as never)) ?? null,
      findMany: async ({ where }: never) => sessions
        .filter((row) => matches(row, where as never))
        .map((row) => ({
          ...row,
          speakerAssignments: assignments
            .filter((assignment) => assignment.sessionId === row.id)
            .map((assignment) => ({ ...assignment, speaker: speakers.find((s) => s.id === assignment.speakerId) })),
          surveyTargets: [],
        })),
    },
    eventSpeakerProfile: {
      findFirst: async ({ where }: never) => speakers.find((row) => matches(row, where as never)) ?? null,
      findFirstOrThrow: async ({ where }: never) => {
        const row = speakers.find((candidate) => matches(candidate, where as never))
        if (!row) throw new Error('NotFound')
        return row
      },
      findMany: async ({ where }: never) => {
        const clause = where as unknown as {
          accountId: string
          isArchived: boolean
          sessionAssignments?: { some?: { eventId?: string; sessionId?: string | null }; none?: { eventId?: string; sessionId?: string | null } }
        }
        const matchesMembership = (speakerId: string, filter?: { some?: { eventId?: string; sessionId?: string | null }; none?: { eventId?: string; sessionId?: string | null } }) => {
          if (!filter) return true
          const matchesAssignment = (assignment: AssignmentRow, condition: { eventId?: string; sessionId?: string | null }) =>
            assignment.speakerId === speakerId
            && (condition.eventId === undefined || assignment.eventId === condition.eventId)
            && (condition.sessionId === undefined || assignment.sessionId === condition.sessionId)
          if (filter.some && !assignments.some((assignment) => matchesAssignment(assignment, filter.some!))) return false
          if (filter.none && assignments.some((assignment) => matchesAssignment(assignment, filter.none!))) return false
          return true
        }
        return speakers
          .filter((row) => row.accountId === clause.accountId && row.isArchived === clause.isArchived && matchesMembership(row.id, clause.sessionAssignments))
          .map((row) => ({
            ...row,
            sessionAssignments: assignments
              .filter((assignment) => assignment.speakerId === row.id && assignment.eventId === scopedEventId)
              .map((assignment) => ({
                ...assignment,
                session: assignment.sessionId
                  ? sessions
                    .filter((session) => session.id === assignment.sessionId)
                    .map((session) => ({ id: session.id, name: session.name, startsAt: session.startsAt, isActive: session.isActive }))[0]
                  : null,
                speakerSurveyTargets: [],
              })),
            surveyTargets: [],
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      },
      create: async ({ data }: never) => {
        const row: SpeakerRow = {
          id: nextId('spk'),
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          title: null,
          organization: null,
          email: null,
          phone: null,
          biography: null,
          headshotState: 'NONE',
          isArchived: false,
          ...(data as object),
        } as SpeakerRow
        speakers.push(row)
        return row
      },
      update: async ({ where, data }: never) => {
        const row = speakers.find((candidate) => candidate.id === (where as unknown as { id: string }).id)
        if (!row) throw new Error('NotFound')
        Object.assign(row, data as object)
        return row
      },
    },
    eventSessionSpeakerAssignment: {
      createMany: async ({ data, skipDuplicates }: never) => {
        const rows = (data as unknown as Array<Partial<AssignmentRow>>)
        let count = 0
        for (const row of rows) {
          try {
            insertAssignment(row)
            count += 1
          } catch (error) {
            // `skipDuplicates` maps to ON CONFLICT DO NOTHING: unique violations
            // are swallowed, FK violations are not.
            if (skipDuplicates && error instanceof UniqueConstraintError) continue
            throw error
          }
        }
        return { count }
      },
      findFirst: async ({ where }: never) => assignments.find((row) => matches(row, where as never)) ?? null,
      findMany: async ({ where }: never) => assignments.filter((row) => matches(row, where as never)),
      upsert: async ({ where, create, update }: never) => {
        const key = (where as unknown as { sessionId_speakerId: { sessionId: string; speakerId: string } }).sessionId_speakerId
        const existing = assignments.find((row) => row.sessionId === key.sessionId && row.speakerId === key.speakerId)
        if (existing) {
          Object.assign(existing, update as object)
          return existing
        }
        return insertAssignment(create as never)
      },
      delete: async ({ where }: never) => {
        const id = (where as unknown as { id: string }).id
        const index = assignments.findIndex((row) => row.id === id)
        if (index === -1) throw new Error('NotFound')
        return assignments.splice(index, 1)[0]
      },
    },
  }

  let scopedEventId = 'evA'
  const withScope = (eventId: string) => { scopedEventId = eventId }

  return {
    db: Object.assign(db, { $transaction: async (callback: (tx: unknown) => unknown) => callback(db) }),
    state: { accounts, events, sessions, speakers, assignments },
    withScope,
    rosterRows: (eventId: string, speakerId?: string) => assignments.filter((row) =>
      row.sessionId === null && row.eventId === eventId && (!speakerId || row.speakerId === speakerId)),
    sessionRows: (eventId: string, speakerId?: string) => assignments.filter((row) =>
      row.sessionId !== null && row.eventId === eventId && (!speakerId || row.speakerId === speakerId)),
  }
}

type Store = ReturnType<typeof createStore>
let store: Store

beforeEach(() => { store = createStore() })

const scopeA = { accountId: 'acctA', eventId: 'evA' }
const scopeB = { accountId: 'acctA', eventId: 'evB' }

describe('A. new speaker created inside Event A', () => {
  it('creates the account speaker and the event roster row without any session', async () => {
    const speaker = await addSpeakerToEvent(
      { ...scopeA, profile: { name: 'Ada Lovelace', email: 'ada@example.com' } },
      store.db as never,
    )

    expect(store.state.speakers).toHaveLength(1)
    expect(store.state.speakers[0].accountId).toBe('acctA')
    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
    expect(store.rosterRows('evA', speaker.id)[0].sessionId).toBeNull()
    expect(store.rosterRows('evA', speaker.id)[0].metadata).toEqual({ eventRosterMembership: true })
    expect(store.sessionRows('evA', speaker.id)).toHaveLength(0)
  })

  it('immediately reports the speaker as assigned to Event A with no sessions', async () => {
    await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)
    store.withScope('evA')

    const workspace = await getEventAgendaWorkspace(scopeA, store.db as never)
    const [speaker] = workspace.speakers

    expect(speaker.isAssignedToEvent).toBe(true)
    expect(speaker.sessionCount).toBe(0)
    expect(workspace.summary.assignedSpeakerCount).toBe(1)
  })

  it('does not count the speaker as assigned in a different event', async () => {
    await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)
    store.withScope('evB')

    const workspace = await getEventAgendaWorkspace(scopeB, store.db as never)

    expect(workspace.speakers).toHaveLength(0)
    expect(workspace.summary.assignedSpeakerCount).toBe(0)
    expect(workspace.summary.speakerCount).toBe(0)
  })
})

describe('B. existing account speaker added to Event A', () => {
  it('reuses the existing profile and creates only the membership row', async () => {
    const created = await createAccountSpeakerProfile(
      { accountId: 'acctA', profile: { name: 'Grace Hopper', email: 'grace@example.com' } },
      store.db as never,
    )
    expect(store.rosterRows('evA')).toHaveLength(0)

    const added = await addSpeakerToEvent({ ...scopeA, speakerId: created.id }, store.db as never)

    expect(added.id).toBe(created.id)
    expect(store.state.speakers).toHaveLength(1)
    expect(store.rosterRows('evA', created.id)).toHaveLength(1)
  })

  it('rejects passing both an existing speaker and a new profile', async () => {
    await expect(addSpeakerToEvent(
      { ...scopeA, speakerId: 'spk_1', profile: { name: 'Grace Hopper' } },
      store.db as never,
    )).rejects.toMatchObject({ code: 'INVALID_SPEAKER_INPUT', status: 400 })
  })
})

describe('C. adding the same speaker to Event A twice', () => {
  it('is idempotent and leaves exactly one roster row', async () => {
    const speaker = await createAccountSpeakerProfile(
      { accountId: 'acctA', profile: { name: 'Grace Hopper', email: 'grace@example.com' } },
      store.db as never,
    )

    await addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never)
    await addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never)
    await addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never)

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
    expect(store.state.speakers).toHaveLength(1)
  })
})

describe('D. the same account speaker across multiple events', () => {
  it('keeps Event A and Event B memberships independent', async () => {
    const speaker = await createAccountSpeakerProfile(
      { accountId: 'acctA', profile: { name: 'Grace Hopper', email: 'grace@example.com' } },
      store.db as never,
    )

    await addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never)
    await addSpeakerToEvent({ ...scopeB, speakerId: speaker.id }, store.db as never)

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
    expect(store.rosterRows('evB', speaker.id)).toHaveLength(1)

    store.withScope('evA')
    expect((await getEventAgendaWorkspace(scopeA, store.db as never)).speakers[0].isAssignedToEvent).toBe(true)
    store.withScope('evB')
    expect((await getEventAgendaWorkspace(scopeB, store.db as never)).speakers[0].isAssignedToEvent).toBe(true)
  })
})

describe('E. session assignment behaviour', () => {
  it('creates a session row separate from the roster row', async () => {
    const speaker = await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)

    await assignSpeakerToAgendaSession(
      { ...scopeA, sessionId: 's1', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } },
      store.db as never,
    )

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
    expect(store.sessionRows('evA', speaker.id)).toHaveLength(1)
    expect(store.sessionRows('evA', speaker.id)[0].sessionId).toBe('s1')
  })

  it('supports multiple sessions and still only one roster row', async () => {
    const speaker = await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)

    await assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's1', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } }, store.db as never)
    await assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's2', assignment: { speakerId: speaker.id, role: 'MODERATOR', sortOrder: 1 } }, store.db as never)

    expect(store.sessionRows('evA', speaker.id).map((row) => row.sessionId).sort()).toEqual(['s1', 's2'])
    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)

    store.withScope('evA')
    const workspace = await getEventAgendaWorkspace(scopeA, store.db as never)
    expect(workspace.speakers[0].sessionCount).toBe(2)
    expect(workspace.speakers[0].isAssignedToEvent).toBe(true)
  })

  it('back-fills membership when a session assignment is made without a prior roster row', async () => {
    const speaker = await createAccountSpeakerProfile(
      { accountId: 'acctA', profile: { name: 'Grace Hopper' } },
      store.db as never,
    )
    expect(store.rosterRows('evA', speaker.id)).toHaveLength(0)

    await assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's1', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } }, store.db as never)

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
  })
})

describe('F. reverse state: removing the last session assignment', () => {
  it('keeps the speaker on the event roster and reports "no sessions yet"', async () => {
    const speaker = await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)
    await assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's1', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } }, store.db as never)

    await removeSpeakerFromAgendaSession({ ...scopeA, sessionId: 's1', speakerId: speaker.id }, store.db as never)

    expect(store.sessionRows('evA', speaker.id)).toHaveLength(0)
    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)

    store.withScope('evA')
    const workspace = await getEventAgendaWorkspace(scopeA, store.db as never)
    expect(workspace.speakers[0].isAssignedToEvent).toBe(true)
    expect(workspace.speakers[0].sessionCount).toBe(0)
    expect(workspace.summary.assignedSpeakerCount).toBe(1)
  })

  it('never deletes the roster row via the session removal path', async () => {
    const speaker = await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)
    await assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's1', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } }, store.db as never)
    await assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's2', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } }, store.db as never)

    await removeSpeakerFromAgendaSession({ ...scopeA, sessionId: 's1', speakerId: speaker.id }, store.db as never)
    await removeSpeakerFromAgendaSession({ ...scopeA, sessionId: 's2', speakerId: speaker.id }, store.db as never)

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
  })
})

describe('H. account-wide speaker creation', () => {
  it('keeps unassigned account speakers out of the event roster until explicitly added', async () => {
    const speaker = await createAccountSpeakerProfile(
      { accountId: 'acctA', profile: { name: 'Katherine Johnson' } },
      store.db as never,
    )

    expect(store.state.assignments).toHaveLength(0)
    store.withScope('evA')
    let workspace = await getEventAgendaWorkspace(scopeA, store.db as never)
    expect(workspace.speakers).toHaveLength(0)
    expect(workspace.summary.speakerCount).toBe(0)
    await expect(listEventSpeakerLibrary(scopeA, store.db as never)).resolves.toMatchObject([{ id: speaker.id }])

    await addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never)
    workspace = await getEventAgendaWorkspace(scopeA, store.db as never)
    expect(workspace.speakers[0].isAssignedToEvent).toBe(true)
    await expect(listEventSpeakerLibrary(scopeA, store.db as never)).resolves.toEqual([])
  })
})

describe('I. cross-account protection', () => {
  it('rejects an event owned by another account', async () => {
    await expect(addSpeakerToEvent(
      { accountId: 'acctA', eventId: 'evOther', profile: { name: 'Ada Lovelace' } },
      store.db as never,
    )).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND', status: 404 })
    expect(store.state.speakers).toHaveLength(0)
    expect(store.state.assignments).toHaveLength(0)
  })

  it('rejects another account\'s speaker for this account\'s event', async () => {
    const foreign = await createAccountSpeakerProfile(
      { accountId: 'acctB', profile: { name: 'Foreign Speaker' } },
      store.db as never,
    )

    await expect(addSpeakerToEvent(
      { ...scopeA, speakerId: foreign.id },
      store.db as never,
    )).rejects.toMatchObject({ code: 'SPEAKER_NOT_FOUND', status: 404 })
    expect(store.rosterRows('evA')).toHaveLength(0)
  })

  it('rejects a cross-account session assignment', async () => {
    const foreign = await createAccountSpeakerProfile({ accountId: 'acctB', profile: { name: 'Foreign Speaker' } }, store.db as never)

    await expect(assignSpeakerToAgendaSession(
      { ...scopeA, sessionId: 's1', assignment: { speakerId: foreign.id, role: 'SPEAKER', sortOrder: 0 } },
      store.db as never,
    )).rejects.toBeInstanceOf(EventAgendaServiceError)
    expect(store.state.assignments).toHaveLength(0)
  })
})

describe('J. speaker-level event surveys', () => {
  it('an event roster member with no session satisfies the assigned-to-event predicate', async () => {
    const speaker = await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace' } }, store.db as never)

    // lib/event-speaker-surveys.ts guards with { sessionAssignments: { some: { eventId } } }.
    const membershipRows = await store.db.eventSessionSpeakerAssignment.findMany({
      where: { speakerId: speaker.id, eventId: 'evA' },
    } as never)
    expect(membershipRows.length).toBeGreaterThan(0)
  })

  it('a speaker that was never added to the event has no membership row', async () => {
    const speaker = await createAccountSpeakerProfile({ accountId: 'acctA', profile: { name: 'Katherine Johnson' } }, store.db as never)
    const membershipRows = await store.db.eventSessionSpeakerAssignment.findMany({
      where: { speakerId: speaker.id, eventId: 'evA' },
    } as never)
    expect(membershipRows).toHaveLength(0)
  })
})

describe('L. idempotence under repeated/near-simultaneous ensure calls', () => {
  it('concurrent addSpeakerToEvent calls settle on one roster row', async () => {
    const speaker = await createAccountSpeakerProfile({ accountId: 'acctA', profile: { name: 'Grace Hopper' } }, store.db as never)

    await Promise.all([
      addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never),
      addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never),
      addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never),
    ])

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
  })

  it('concurrent session assignment and roster add settle on one roster row', async () => {
    const speaker = await createAccountSpeakerProfile({ accountId: 'acctA', profile: { name: 'Grace Hopper' } }, store.db as never)

    await Promise.all([
      addSpeakerToEvent({ ...scopeA, speakerId: speaker.id }, store.db as never),
      assignSpeakerToAgendaSession({ ...scopeA, sessionId: 's1', assignment: { speakerId: speaker.id, role: 'SPEAKER', sortOrder: 0 } }, store.db as never),
    ])

    expect(store.rosterRows('evA', speaker.id)).toHaveLength(1)
    expect(store.sessionRows('evA', speaker.id)).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------------- *
 * G. Import flow — real confirmAgendaImport wired to the REAL membership
 *    services, against the constraint-enforcing store.
 * ------------------------------------------------------------------------- */

import {
  confirmAgendaImport,
  createAgendaImportUpload,
  saveAgendaImportMapping,
} from './event-agenda-import-service'

const BASE_JOB = {
  id: 'import_1', accountId: 'acctA', eventId: 'evA', createdByUserId: 'user_1', confirmedByUserId: null,
  status: 'UPLOADED', idempotencyKey: '', sourceFileName: 'roster.csv', sourceMimeType: 'text/csv',
  sourceFileSizeBytes: 0, sourceChecksumSha256: '', sourceObjectKey: null, worksheetName: null, worksheetIndex: null,
  mappingSnapshot: null, failureCode: null, failureMessage: null, createdSessionCount: 0, updatedSessionCount: 0,
  skippedRowCount: 0, duplicateRowCount: 0, failedRowCount: 0, createdSpeakerCount: 0, matchedSpeakerCount: 0,
  confirmedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
}

function createImportStore() {
  const base = createStore()
  let job: Record<string, unknown> | null = null
  let rows: Array<Record<string, unknown>> = []
  const db = base.db as unknown as Record<string, any>
  db.user = { findFirst: async ({ where }: never) => (where as unknown as { id: string }).id === 'user_1' ? { id: 'user_1' } : null }
  db.eventAgendaImportJob = {
    upsert: async ({ create }: never) => { if (!job) job = { ...BASE_JOB, ...(create as object), id: 'import_1' }; return { ...job } },
    findFirst: async ({ where }: never) => {
      const clause = where as unknown as { id: string; eventId: string; accountId: string }
      return job && job.id === clause.id && job.eventId === clause.eventId && job.accountId === clause.accountId
        ? { ...job, rows: rows.map((row) => ({ ...row })) } : null
    },
    update: async ({ data }: never) => { job = { ...job, ...(data as object) }; return { ...job } },
    updateMany: async ({ where, data }: never) => {
      const clause = where as unknown as { id: string; status?: { in?: string[] } | string }
      if (!job || job.id !== clause.id) return { count: 0 }
      const allowed = typeof clause.status === 'object' ? clause.status?.in : clause.status ? [clause.status] : null
      if (allowed && !allowed.includes(job.status as string)) return { count: 0 }
      job = { ...job, ...(data as object) }
      return { count: 1 }
    },
    create: async ({ data }: never) => { job = { ...BASE_JOB, ...(data as object), id: 'import_1' }; return { ...job } },
  }
  db.eventAgendaImportRow = {
    deleteMany: async () => { rows = []; return { count: 0 } },
    createMany: async ({ data }: never) => {
      rows = (data as Array<Record<string, unknown>>).map((row, index) => ({
        id: `row_${index + 1}`, result: null, resultSessionId: null, resultMessage: null, processedAt: null, ...row,
      }))
      return { count: rows.length }
    },
    update: async ({ where, data }: never) => {
      const index = rows.findIndex((row) => row.id === (where as unknown as { id: string }).id)
      rows[index] = { ...rows[index], ...(data as object) }
      return { ...rows[index] }
    },
    findMany: async () => rows.map((row) => ({ ...row })),
  }
  return Object.assign(base, { get rows() { return rows }, get job() { return job }, resetJob() { job = null; rows = [] } })
}

async function stageRoster(store: ReturnType<typeof createImportStore>, csv: string) {
  await createAgendaImportUpload({
    accountId: 'acctA', eventId: 'evA', userId: 'user_1', importType: 'SPEAKER_ROSTER',
    fileName: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  }, store.db as never)
  await saveAgendaImportMapping({
    accountId: 'acctA', eventId: 'evA', importJobId: 'import_1', timezone: 'America/New_York',
    mapping: { fullName: 'Full name', firstName: null, lastName: null, email: 'Email', organization: null, title: null, sessionTitle: null, externalSessionId: null, tags: null },
  }, store.db as never)
}

describe('G. import flow creates real event roster membership', () => {
  it('imports a new speaker with no session and makes them an event member', async () => {
    const importStore = createImportStore()
    await stageRoster(importStore, 'Full name,Email\nAvery Example,avery@example.test\n')

    await confirmAgendaImport({ accountId: 'acctA', eventId: 'evA', importJobId: 'import_1', userId: 'user_1' }, importStore.db as never)

    expect(importStore.state.speakers).toHaveLength(1)
    const speakerId = importStore.state.speakers[0].id
    expect(importStore.rosterRows('evA', speakerId)).toHaveLength(1)
    expect(importStore.sessionRows('evA', speakerId)).toHaveLength(0)
  })

  it('imports an existing account speaker without duplicating the profile or the membership', async () => {
    const importStore = createImportStore()
    const existing = await createAccountSpeakerProfile(
      { accountId: 'acctA', profile: { name: 'Avery Example', email: 'avery@example.test' } },
      importStore.db as never,
    )
    await stageRoster(importStore, 'Full name,Email\nAvery Example,avery@example.test\n')

    await confirmAgendaImport({ accountId: 'acctA', eventId: 'evA', importJobId: 'import_1', userId: 'user_1' }, importStore.db as never)

    expect(importStore.state.speakers).toHaveLength(1)
    expect(importStore.rosterRows('evA', existing.id)).toHaveLength(1)
  })

  it('does not duplicate roster membership when the same roster is imported again', async () => {
    const importStore = createImportStore()
    await stageRoster(importStore, 'Full name,Email\nAvery Example,avery@example.test\n')
    await confirmAgendaImport({ accountId: 'acctA', eventId: 'evA', importJobId: 'import_1', userId: 'user_1' }, importStore.db as never)
    const speakerId = importStore.state.speakers[0].id

    importStore.resetJob()
    await stageRoster(importStore, 'Full name,Email\nAvery Example,avery@example.test\n')
    await confirmAgendaImport({ accountId: 'acctA', eventId: 'evA', importJobId: 'import_1', userId: 'user_1' }, importStore.db as never)

    expect(importStore.state.speakers).toHaveLength(1)
    expect(importStore.rosterRows('evA', speakerId)).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------------- *
 * Duplicate-confirmation contract (regression guard for the new reuse path)
 * ------------------------------------------------------------------------- */

describe('duplicate confirmation contract for name-only matches', () => {
  it('still asks the operator to confirm a name-only duplicate', async () => {
    await createAccountSpeakerProfile({ accountId: 'acctA', profile: { name: 'Test Test' } }, store.db as never)

    await expect(addSpeakerToEvent(
      { ...scopeA, profile: { name: 'Test Test' } },
      store.db as never,
    )).rejects.toMatchObject({ code: 'SPEAKER_DUPLICATE_CONFIRMATION_REQUIRED', status: 409 })
  })

  it('creates a separate profile when the operator confirms they are different people', async () => {
    const first = await createAccountSpeakerProfile({ accountId: 'acctA', profile: { name: 'Test Test' } }, store.db as never)

    const second = await addSpeakerToEvent(
      { ...scopeA, profile: { name: 'Test Test' }, confirmDuplicate: true },
      store.db as never,
    )

    expect(second.id).not.toBe(first.id)
    expect(store.state.speakers).toHaveLength(2)
  })

  it('still reuses silently when the email identity matches', async () => {
    const first = await createAccountSpeakerProfile({ accountId: 'acctA', profile: { name: 'Ada Lovelace', email: 'ada@example.test' } }, store.db as never)

    const second = await addSpeakerToEvent({ ...scopeA, profile: { name: 'Ada Lovelace', email: 'ADA@example.test' } }, store.db as never)

    expect(second.id).toBe(first.id)
    expect(store.state.speakers).toHaveLength(1)
    expect(store.rosterRows('evA', first.id)).toHaveLength(1)
  })
})
