import { z } from 'zod'
import { eventAgendaNormalizedRowSchema, normalizeSpeakerEmail, normalizeSpeakerName, parseEventAgendaSessionMetadata } from '@/lib/event-agenda-contract'

export const eventAgendaReconciliationPlanSchema = z.object({
  summary: z.object({
    addedSessions: z.number().int().nonnegative(),
    updatedSessions: z.number().int().nonnegative(),
    unchangedSessions: z.number().int().nonnegative(),
    missingSessions: z.number().int().nonnegative(),
    changedTimes: z.number().int().nonnegative(),
    changedRooms: z.number().int().nonnegative(),
    changedSpeakerAssignments: z.number().int().nonnegative(),
  }),
  missing: z.array(z.object({ id: z.string(), title: z.string() })),
}).strict()

export type EventAgendaReconciliationPlan = z.infer<typeof eventAgendaReconciliationPlanSchema>

type ExistingSession = {
  id: string
  name: string
  description?: string | null
  startsAt: Date | null
  endsAt: Date | null
  metadata: unknown
  speakerAssignments?: Array<{ speaker: { normalizedName: string; normalizedEmail: string | null } }>
}

function speakerKeys(value: Array<{ name: string; email?: string | null }>) {
  return value.map((speaker) => normalizeSpeakerEmail(speaker.email) ?? `name:${normalizeSpeakerName(speaker.name)}`).sort()
}

export function buildEventAgendaReconciliationPlan(input: {
  rows: Array<{ normalizedRowSnapshot: unknown; existingSessionId: string | null }>
  existingSessions: ExistingSession[]
}): EventAgendaReconciliationPlan {
  const existingById = new Map(input.existingSessions.map((session) => [session.id, session]))
  const matchedIds = new Set<string>()
  let addedSessions = 0
  let updatedSessions = 0
  let unchangedSessions = 0
  let changedTimes = 0
  let changedRooms = 0
  let changedSpeakerAssignments = 0

  for (const row of input.rows) {
    const normalized = eventAgendaNormalizedRowSchema.safeParse(row.normalizedRowSnapshot)
    if (!normalized.success) continue
    if (!row.existingSessionId) {
      addedSessions += 1
      continue
    }
    const existing = existingById.get(row.existingSessionId)
    if (!existing) continue
    matchedIds.add(existing.id)
    let metadata: ReturnType<typeof parseEventAgendaSessionMetadata>
    try { metadata = parseEventAgendaSessionMetadata(existing.metadata) } catch { metadata = { schemaVersion: 1 } }
    const timeChanged = existing.startsAt?.toISOString() !== normalized.data.startsAt || existing.endsAt?.toISOString() !== normalized.data.endsAt
    const roomChanged = (metadata.room ?? null) !== (normalized.data.room ?? null)
    const existingSpeakers = (existing.speakerAssignments ?? []).map(({ speaker }) => ({ name: speaker.normalizedName, email: speaker.normalizedEmail }))
    const speakersChanged = JSON.stringify(speakerKeys(existingSpeakers)) !== JSON.stringify(speakerKeys(normalized.data.speakers))
    const otherChanged = existing.name.trim() !== normalized.data.title.trim()
      || (existing.description ?? null) !== (normalized.data.description ?? null)
    if (timeChanged) changedTimes += 1
    if (roomChanged) changedRooms += 1
    if (speakersChanged) changedSpeakerAssignments += 1
    if (timeChanged || roomChanged || speakersChanged || otherChanged) updatedSessions += 1
    else unchangedSessions += 1
  }

  const missing = input.existingSessions.filter((session) => !matchedIds.has(session.id)).map((session) => ({ id: session.id, title: session.name }))
  return {
    summary: { addedSessions, updatedSessions, unchangedSessions, missingSessions: missing.length, changedTimes, changedRooms, changedSpeakerAssignments },
    missing,
  }
}
