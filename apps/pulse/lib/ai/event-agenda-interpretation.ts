import { z } from 'zod'
import { EVENT_AGENDA_IMPORT_FIELDS, type AgendaImportMappingField } from '@/lib/event-agenda-import-template'

const mappingKeys = EVENT_AGENDA_IMPORT_FIELDS.map((field) => field.key) as [AgendaImportMappingField, ...AgendaImportMappingField[]]

export const eventAgendaAiInterpretationSchema = z.object({
  mapping: z.record(z.enum(mappingKeys), z.string().trim().min(1).nullable()),
  rules: z.object({
    timeRangeColumn: z.string().trim().min(1).nullable().default(null),
    speakerDelimiters: z.array(z.enum(['NEWLINE', 'SEMICOLON', 'PIPE', 'COMMA'])).max(4).default([]),
  }).default({ timeRangeColumn: null, speakerDelimiters: [] }),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(1)).max(20).default([]),
}).strict()

export type EventAgendaAiInterpretation = z.infer<typeof eventAgendaAiInterpretationSchema>

export async function interpretEventAgendaColumns(input: {
  columns: string[]
  sampleRows: Array<Record<string, string>>
  event: { name?: string | null; startDate?: string | null; endDate?: string | null; timezone?: string | null }
  existingSessionTitles?: string[]
}): Promise<EventAgendaAiInterpretation | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })
  const allowedFields = EVENT_AGENDA_IMPORT_FIELDS.map(({ key, label }) => ({ key, label }))
  const response = await client.chat.completions.create({
    model: process.env.EVENT_AGENDA_INTERPRETATION_MODEL || 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Interpret agenda spreadsheet columns. Return one JSON object only. Never invent columns or fields. Use null when unresolved.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Propose a column-to-agenda-field mapping and structural parsing rules. Speaker fields may be full names or split first/last names. A single time-range column should map to both startTime and endTime and be named in rules.timeRangeColumn. Identify newline-separated speaker names when present.',
          allowedFields,
          columns: input.columns,
          sampleRows: input.sampleRows.slice(0, 12),
          event: input.event,
          existingSessionTitles: (input.existingSessionTitles ?? []).slice(0, 50),
          responseShape: { mapping: 'object keyed only by allowed field keys; values are exact uploaded column names or null', rules: { timeRangeColumn: 'exact uploaded column name or null', speakerDelimiters: 'NEWLINE | SEMICOLON | PIPE | COMMA array' }, confidence: 'number 0..1', warnings: 'string[]' },
        }),
      },
    ],
  })
  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Agenda interpretation returned no structured output')
  const parsed = eventAgendaAiInterpretationSchema.parse(JSON.parse(content))
  const columns = new Set(input.columns)
  for (const column of Object.values(parsed.mapping)) {
    if (column && !columns.has(column)) throw new Error(`Agenda interpretation proposed an unknown column: ${column}`)
  }
  if (parsed.rules.timeRangeColumn && !columns.has(parsed.rules.timeRangeColumn)) {
    throw new Error(`Agenda interpretation proposed an unknown time range column: ${parsed.rules.timeRangeColumn}`)
  }
  return parsed
}
