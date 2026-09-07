import { describe, expect, it } from 'vitest'
import { buildEventAgendaReconciliationPlan } from './event-agenda-reconciliation'

const existing = [
  { id: 'one', name: 'Opening', description: null, startsAt: new Date('2026-08-18T13:00:00.000Z'), endsAt: new Date('2026-08-18T14:00:00.000Z'), metadata: { room: 'Main' }, speakerAssignments: [{ speaker: { normalizedName: 'ali kamyab', normalizedEmail: null } }] },
  { id: 'missing', name: 'Closing', description: null, startsAt: null, endsAt: null, metadata: {}, speakerAssignments: [] },
]

describe('event agenda reconciliation', () => {
  it('classifies unchanged, added, updated, and missing sessions without treating row order as identity', () => {
    const plan = buildEventAgendaReconciliationPlan({
      existingSessions: existing,
      rows: [
        { existingSessionId: 'one', normalizedRowSnapshot: { title: 'Opening', description: null, startsAt: '2026-08-18T13:00:00.000Z', endsAt: '2026-08-18T14:00:00.000Z', timezone: 'America/New_York', room: 'Main', speakers: [{ name: 'Ali Kamyab' }], tags: [] } },
        { existingSessionId: null, normalizedRowSnapshot: { title: 'Breakout', startsAt: null, endsAt: null, timezone: null, room: 'B', speakers: [], tags: [] } },
      ],
    })
    expect(plan.summary).toMatchObject({ addedSessions: 1, unchangedSessions: 1, updatedSessions: 0, missingSessions: 1 })
    expect(plan.missing).toEqual([{ id: 'missing', title: 'Closing' }])
  })

  it('surfaces changed time, room, and speaker assignments', () => {
    const plan = buildEventAgendaReconciliationPlan({
      existingSessions: existing.slice(0, 1),
      rows: [{ existingSessionId: 'one', normalizedRowSnapshot: { title: 'Opening', description: null, startsAt: '2026-08-18T14:00:00.000Z', endsAt: '2026-08-18T15:00:00.000Z', timezone: 'America/New_York', room: 'Ballroom', speakers: [{ name: 'Sam Rivera' }], tags: [] } }],
    })
    expect(plan.summary).toMatchObject({ updatedSessions: 1, changedTimes: 1, changedRooms: 1, changedSpeakerAssignments: 1, missingSessions: 0 })
  })
})
