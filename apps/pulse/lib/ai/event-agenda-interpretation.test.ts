import { describe, expect, it } from 'vitest'
import { eventAgendaAiInterpretationSchema } from './event-agenda-interpretation'

describe('agenda AI interpretation contract', () => {
  it('accepts structured supported mapping fields', () => {
    expect(eventAgendaAiInterpretationSchema.parse({ mapping: { title: 'Program', speakerNames: 'Panelists' }, rules: { timeRangeColumn: 'Time', speakerDelimiters: ['NEWLINE'] }, confidence: 0.9, warnings: [] })).toMatchObject({ confidence: 0.9 })
  })

  it('rejects unsupported fields and malformed output', () => {
    expect(() => eventAgendaAiInterpretationSchema.parse({ mapping: { deleteSessions: 'Yes' }, confidence: 1, warnings: [] })).toThrow()
    expect(() => eventAgendaAiInterpretationSchema.parse({ mapping: { title: 'Program' }, confidence: 'certain', warnings: [] })).toThrow()
  })
})
