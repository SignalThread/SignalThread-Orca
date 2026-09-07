import { createHash } from 'node:crypto'
import readXlsxFile, { type CellValue } from 'read-excel-file/node'
import { eventAgendaImportMappingSchema, eventAgendaNormalizedRowSchema, type EventAgendaValidationIssue } from '@/lib/event-agenda-contract'
import { eventLocalDateTimeToIso } from '@/lib/event-agenda-time'
import { EVENT_AGENDA_IMPORT_FIELDS, type AgendaImportMappingField } from '@/lib/event-agenda-import-template'

export const EVENT_AGENDA_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024
export const EVENT_AGENDA_IMPORT_MAX_ROWS = 5_000

export type AgendaImportFileType = 'CSV' | 'XLSX'

export interface AgendaImportSourceRow {
  sourceRowNumber: number
  values: Record<string, string>
}

export interface AgendaImportWorksheet {
  name: string
  index: number
  columns: string[]
  rowCount: number
  rows: AgendaImportSourceRow[]
}

export interface AgendaImportInspection {
  schemaVersion: 1
  fileType: AgendaImportFileType
  checksumSha256: string
  worksheets: AgendaImportWorksheet[]
}

export interface NormalizedAgendaImportRow {
  normalized: ReturnType<typeof eventAgendaNormalizedRowSchema.parse> | null
  issues: EventAgendaValidationIssue[]
  empty: boolean
}

const KNOWN_FORMATS = new Set([
  'breakout', 'expo', 'fireside chat', 'hosted session', 'keynote', 'networking',
  'panel', 'presentation', 'roundtable', 'session', 'sponsor activation', 'workshop',
])

function parserError(message: string, code: string) {
  return Object.assign(new Error(message), { code })
}

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim()
}

function uniqueHeaders(values: string[]) {
  const counts = new Map<string, number>()
  return values.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

function parseCsvRecords(text: string) {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      record.push(field)
      field = ''
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''))
      records.push(record)
      record = []
      field = ''
    } else field += character
  }
  if (quoted) throw parserError('CSV contains an unterminated quoted field', 'INVALID_CSV')
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ''))
    records.push(record)
  }
  return records
}

function rowsToWorksheet(name: string, index: number, records: string[][]): AgendaImportWorksheet {
  const headerIndex = records.findIndex((record) => record.some((value) => value.trim()))
  if (headerIndex < 0) return { name, index, columns: [], rowCount: 0, rows: [] }
  const columns = uniqueHeaders(records[headerIndex])
  // XLSX readers occasionally expose a formatted worksheet range that is much
  // larger than the actual data. Ignore rows containing no values while keeping
  // original row numbers so review still points to the source spreadsheet.
  const rows = records.slice(headerIndex + 1).flatMap((record, rowIndex) => {
    if (!record.some((value) => value.trim())) return []
    return [{
      sourceRowNumber: headerIndex + rowIndex + 2,
      values: Object.fromEntries(columns.map((column, columnIndex) => [column, record[columnIndex]?.trim() ?? ''])),
    }]
  })
  if (rows.length > EVENT_AGENDA_IMPORT_MAX_ROWS) {
    throw parserError(`Agenda files may contain at most ${EVENT_AGENDA_IMPORT_MAX_ROWS} rows per worksheet`, 'TOO_MANY_ROWS')
  }
  return { name, index, columns, rowCount: rows.length, rows }
}

function cellText(value: CellValue) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function inferFileType(fileName: string, mimeType: string, buffer: Buffer): AgendaImportFileType {
  const extension = fileName.trim().toLocaleLowerCase('en-US').split('.').pop()
  const normalizedMime = mimeType.split(';')[0].trim().toLocaleLowerCase('en-US')
  if (extension === 'xlsx') {
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'].includes(normalizedMime)) {
      throw parserError('The uploaded file type does not match an XLSX workbook', 'UNSUPPORTED_FILE_TYPE')
    }
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw parserError('The XLSX workbook is invalid', 'INVALID_XLSX')
    return 'XLSX'
  }
  if (extension === 'csv') {
    if (!['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'].includes(normalizedMime)) {
      throw parserError('The uploaded file type does not match a CSV file', 'UNSUPPORTED_FILE_TYPE')
    }
    if (buffer.includes(0)) throw parserError('The CSV file contains unsupported binary data', 'INVALID_CSV')
    return 'CSV'
  }
  throw parserError('Only CSV and XLSX agenda files are supported', 'UNSUPPORTED_FILE_TYPE')
}

export async function inspectAgendaImportFile(input: { fileName: string; mimeType: string; buffer: Buffer }): Promise<AgendaImportInspection> {
  if (!input.fileName.trim() || input.buffer.byteLength === 0) throw parserError('Choose a non-empty agenda file', 'EMPTY_FILE')
  if (input.buffer.byteLength > EVENT_AGENDA_IMPORT_MAX_FILE_BYTES) {
    throw parserError('Agenda files may be no larger than 5 MB', 'FILE_TOO_LARGE')
  }
  const fileType = inferFileType(input.fileName, input.mimeType, input.buffer)
  const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex')
  let worksheets: AgendaImportWorksheet[]
  if (fileType === 'CSV') {
    const text = input.buffer.toString('utf8').replace(/^\uFEFF/, '')
    worksheets = [rowsToWorksheet('CSV', 0, parseCsvRecords(text))]
  } else {
    let workbook: Awaited<ReturnType<typeof readXlsxFile>>
    try {
      workbook = await readXlsxFile(input.buffer)
    } catch {
      throw parserError('The XLSX workbook could not be read', 'INVALID_XLSX')
    }
    worksheets = workbook.map((worksheet, index) => rowsToWorksheet(
      worksheet.sheet,
      index,
      worksheet.data.map((row) => row.map((cell) => cellText(cell as CellValue))),
    ))
    if (worksheets.length === 0) throw parserError('The XLSX workbook has no worksheets', 'EMPTY_WORKBOOK')
  }
  return { schemaVersion: 1, fileType, checksumSha256, worksheets }
}

export function discoverAgendaImportMapping(columns: string[]) {
  const normalized = columns.map((column) => ({ column, normalized: normalizeHeader(column) }))
  const mapping: Partial<Record<AgendaImportMappingField, string>> = {}
  for (const { key: field, aliases: fieldAliases } of EVENT_AGENDA_IMPORT_FIELDS) {
    const aliases: readonly string[] = fieldAliases
    const match = normalized.find((column) => aliases.includes(column.normalized))
    if (match) mapping[field] = match.column
  }
  const missingRequired = EVENT_AGENDA_IMPORT_FIELDS.filter((field) => field.required && !mapping[field.key]).map((field) => field.key)
  const hasCombinedTimeRange = Boolean(mapping.startTime && mapping.startTime === mapping.endTime)
  const nonCanonicalStructuralHeaders = new Set(['session', 'program', 'program name', 'day date', 'time', 'speaker s'])
  const usesStructuralAlias = Object.values(mapping).some((column) => nonCanonicalStructuralHeaders.has(normalizeHeader(column)))
  return {
    mapping,
    missingRequired,
    // A combined time field is safe to parse deterministically, but it is a
    // non-template structure worth sending through the single AI structural
    // interpretation pass when credentials are available.
    confidence: missingRequired.length > 0 ? 0.35 : hasCombinedTimeRange || usesStructuralAlias ? 0.82 : 0.98,
    needsStructuralInterpretation: hasCombinedTimeRange || usesStructuralAlias,
  }
}

function dateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function eventWindowDates(startDate?: string | Date | null, endDate?: string | Date | null) {
  if (!startDate || !endDate) return []
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const final = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  const dates: Date[] = []
  while (cursor <= final && dates.length <= 366) {
    dates.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function parseAgendaDate(value: string, context: { eventStartDate?: string | Date | null; eventEndDate?: string | Date | null } = {}) {
  const trimmed = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed)
  if (us) {
    const year = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3])
    const month = Number(us[1])
    const day = Number(us[2])
    const candidate = new Date(Date.UTC(year, month - 1, day))
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null
    return dateOnly(candidate)
  }

  // Excel's 1900 date system (including its historical leap-year offset).
  if (/^\d{4,6}(?:\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed)
    if (serial > 0 && serial < 2958466) return dateOnly(new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000))
  }

  const window = eventWindowDates(context.eventStartDate, context.eventEndDate)
  const dayNumber = /^day\s+(\d+)$/i.exec(trimmed)
  if (dayNumber && window.length > 0) return window[Number(dayNumber[1]) - 1] ? dateOnly(window[Number(dayNumber[1]) - 1]) : null

  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const weekdayIndex = weekdayNames.indexOf(trimmed.toLocaleLowerCase('en-US'))
  if (weekdayIndex >= 0) {
    const matches = window.filter((date) => date.getUTCDay() === weekdayIndex)
    return matches.length === 1 ? dateOnly(matches[0]) : null
  }

  const monthDay = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i.exec(trimmed)
  if (monthDay) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const month = monthNames.indexOf(monthDay[1].slice(0, 3).toLocaleLowerCase('en-US'))
    const day = Number(monthDay[2])
    if (monthDay[3]) {
      const candidate = new Date(Date.UTC(Number(monthDay[3]), month, day))
      return candidate.getUTCMonth() === month && candidate.getUTCDate() === day ? dateOnly(candidate) : null
    }
    const matches = window.filter((date) => date.getUTCMonth() === month && date.getUTCDate() === day)
    return matches.length === 1 ? dateOnly(matches[0]) : null
  }
  return null
}

function parseTime(value: string) {
  const trimmed = value.trim()
  const iso = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed)
  if (iso) return `${iso[1]}:${iso[2]}:${iso[3] ?? '00'}`
  if (/^0?\.\d+$/.test(trimmed)) {
    const seconds = Math.round(Number(trimmed) * 24 * 60 * 60)
    return `${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:00`
  }
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(trimmed)
  if (!clock) return null
  let hour = Number(clock[1])
  const minute = Number(clock[2])
  const second = Number(clock[3] ?? 0)
  if (minute > 59 || second > 59 || hour > (clock[4] ? 12 : 23) || (clock[4] && hour < 1)) return null
  if (clock[4]) hour = (hour % 12) + (clock[4].toUpperCase() === 'PM' ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function parseTimeRange(value: string) {
  const trimmed = value.trim()
  const range = /^(.+?)\s*(?:-|–|—|\bto\b)\s*(.+)$/i.exec(trimmed)
  if (!range) return null
  let start = range[1].trim()
  const end = range[2].trim()
  // Planners commonly write “9:15 - 10:45 AM”. Apply the shared meridiem to
  // the first boundary when it is unambiguous.
  const endMeridiem = /\b(AM|PM)\b/i.exec(end)?.[1]
  if (endMeridiem && !/\b(AM|PM)\b/i.test(start)) start = `${start} ${endMeridiem}`
  return { start: parseTime(start), end: parseTime(end) }
}

function splitValues(value: string) {
  if (!value.trim()) return []
  const separator = value.includes(';') ? /\s*;\s*/ : value.includes('|') ? /\s*\|\s*/ : /\s*,\s*/
  return value.split(separator).map((item) => item.trim()).filter(Boolean)
}

function splitAlignedValues(value: string) {
  if (!value.trim()) return []
  const separator = value.includes('\n') ? /\s*\n\s*/ : value.includes(';') ? /\s*;\s*/ : value.includes('|') ? /\s*\|\s*/ : /\s*,\s*/
  return value.split(separator).map((item) => item.trim())
}

export function normalizeAgendaImportRow(input: {
  row: AgendaImportSourceRow
  mapping: unknown
  timezone: string
  eventStartDate?: string | Date | null
  eventEndDate?: string | Date | null
}): NormalizedAgendaImportRow {
  const mapping = eventAgendaImportMappingSchema.parse(input.mapping)
  const read = (field: keyof typeof mapping) => {
    const column = mapping[field]
    return column ? input.row.values[column]?.trim() ?? '' : ''
  }
  if (Object.values(input.row.values).every((value) => !value.trim())) {
    return { normalized: null, empty: true, issues: [{ code: 'EMPTY_ROW_IGNORED', field: null, message: 'Empty row ignored', severity: 'WARNING' }] }
  }

  const issues: EventAgendaValidationIssue[] = []
  const title = read('title')
  const dateContext = { eventStartDate: input.eventStartDate, eventEndDate: input.eventEndDate }
  const startDate = parseAgendaDate(read('startDate'), dateContext)
  const endDate = parseAgendaDate(read('endDate'), dateContext) || startDate
  const startTimeSource = read('startTime')
  const endTimeSource = read('endTime')
  const range = parseTimeRange(startTimeSource) ?? parseTimeRange(endTimeSource)
  const startTime = range?.start ?? parseTime(startTimeSource)
  const endTime = range?.end ?? parseTime(endTimeSource)
  if (!title) issues.push({ code: 'MISSING_REQUIRED_INFORMATION', field: 'title', message: 'Session title is required', severity: 'ERROR' })
  const scheduleValuesPresent = [read('startDate'), read('startTime'), read('endDate'), read('endTime')].some(Boolean)
  if (scheduleValuesPresent) {
    if (!startDate) issues.push({ code: 'UNSUPPORTED_DATE_FORMAT', field: 'startDate', message: 'Start date is required when schedule data is provided and must be valid or deterministically resolve within the event dates', severity: 'ERROR' })
    if (read('endDate') && !parseAgendaDate(read('endDate'), dateContext)) issues.push({ code: 'UNSUPPORTED_DATE_FORMAT', field: 'endDate', message: 'End date is invalid or ambiguous for this event window', severity: 'ERROR' })
    if (!startTime) issues.push({ code: 'INVALID_DATE_TIME', field: 'startTime', message: 'Start time is required when schedule data is provided', severity: 'ERROR' })
    if (!endTime) issues.push({ code: 'INVALID_DATE_TIME', field: 'endTime', message: 'End time is required when schedule data is provided', severity: 'ERROR' })
  }

  let startsAt: string | null = null
  let endsAt: string | null = null
  if (startDate && endDate && startTime && endTime) {
    try {
      startsAt = eventLocalDateTimeToIso(`${startDate}T${startTime}`, input.timezone)
      endsAt = eventLocalDateTimeToIso(`${endDate}T${endTime}`, input.timezone)
      if (new Date(endsAt) <= new Date(startsAt)) issues.push({ code: 'END_BEFORE_START', field: 'endTime', message: 'End time must be after start time', severity: 'ERROR' })
    } catch (error) {
      issues.push({ code: 'INVALID_DATE_TIME', field: null, message: error instanceof Error ? error.message : 'Date/time is invalid', severity: 'ERROR' })
    }
  }

  const capacityText = read('capacity')
  const capacity = capacityText === '' ? null : Number(capacityText)
  if (capacityText && (capacity === null || !Number.isInteger(capacity) || capacity < 0)) {
    issues.push({ code: 'INVALID_CAPACITY', field: 'capacity', message: 'Capacity must be a non-negative whole number', severity: 'ERROR' })
  }
  const format = read('format') || null
  if (format && !KNOWN_FORMATS.has(normalizeHeader(format))) {
    issues.push({ code: 'UNKNOWN_FORMAT', field: 'format', message: `Review unrecognized session format “${format}”`, severity: 'WARNING' })
  }

  // Preserve empty slots across parallel speaker columns so, for example,
  // `Ali; Sam` and `; sam@example.com` continue to describe the same people.
  const fullNames = splitAlignedValues(read('speakerNames'))
  const firstNames = splitAlignedValues(read('speakerFirstNames'))
  const lastNames = splitAlignedValues(read('speakerLastNames'))
  const names = fullNames.length > 0 ? fullNames : Array.from({ length: Math.max(firstNames.length, lastNames.length) }, (_, index) => [firstNames[index], lastNames[index]].filter(Boolean).join(' ').trim())
  const emails = splitAlignedValues(read('speakerEmails'))
  const organizations = splitAlignedValues(read('speakerOrganizations'))
  const titles = splitAlignedValues(read('speakerTitles'))
  const speakers = Array.from({ length: Math.max(names.length, emails.length, organizations.length, titles.length) }, (_, index) => {
    const email = emails[index]?.toLocaleLowerCase('en-US') || null
    const name = names[index] || email || ''
    if (email && !/^\S+@\S+\.\S+$/.test(email)) issues.push({ code: 'INVALID_EMAIL', field: 'speakerEmails', message: `Speaker email “${email}” is invalid`, severity: 'ERROR' })
    return { name, email, organization: organizations[index] || null, title: titles[index] || null }
  }).filter((speaker) => speaker.name && !/^(?:tbd|tba|to be announced|n\/?a|none)$/i.test(speaker.name))

  if (!title || issues.some((issue) => issue.severity === 'ERROR')) return { normalized: null, issues, empty: false }
  const parsed = eventAgendaNormalizedRowSchema.safeParse({
    title, startsAt, endsAt, timezone: startsAt && endsAt ? input.timezone : null,
    externalId: read('externalId') || null,
    description: read('description') || null,
    room: read('room') || null,
    track: read('track') || null,
    format,
    capacity,
    tags: splitValues(read('tags')),
    speakers,
  })
  if (!parsed.success) {
    return { normalized: null, empty: false, issues: [...issues, ...parsed.error.issues.map((issue) => ({ code: 'MISSING_REQUIRED_INFORMATION' as const, field: issue.path.join('.') || null, message: issue.message, severity: 'ERROR' as const }))] }
  }
  return { normalized: parsed.data, issues, empty: false }
}
