/**
 * Shared agenda-import schema for column discovery, mapping UI, and the
 * downloadable CSV. Keeping these definitions together prevents a template
 * header from drifting away from the parser's accepted canonical headers.
 */
export const EVENT_AGENDA_IMPORT_FIELDS = [
  { key: 'title', label: 'Session title', header: 'Session title', required: true, aliases: ['session title', 'session name', 'session', 'program', 'program name', 'title', 'name'] },
  { key: 'description', label: 'Description', header: 'Description', required: false, aliases: ['description', 'session description', 'summary'] },
  { key: 'startDate', label: 'Start date', header: 'Start date', required: false, aliases: ['start date', 'session date', 'day date', 'date'] },
  { key: 'startTime', label: 'Start time', header: 'Start time', required: false, aliases: ['start time', 'starts at', 'start', 'time'] },
  { key: 'endDate', label: 'End date', header: 'End date', required: false, aliases: ['end date'] },
  { key: 'endTime', label: 'End time', header: 'End time', required: false, aliases: ['end time', 'ends at', 'end', 'time'] },
  { key: 'room', label: 'Room', header: 'Room', required: false, aliases: ['room', 'location', 'venue'] },
  { key: 'track', label: 'Track', header: 'Track', required: false, aliases: ['track', 'stream'] },
  { key: 'format', label: 'Format', header: 'Format', required: false, aliases: ['format', 'session type', 'type'] },
  { key: 'speakerNames', label: 'Speaker names', header: 'Speaker names', required: false, aliases: ['speaker names', 'speakers', 'speaker', 'speaker s', 'presenters'] },
  { key: 'speakerFirstNames', label: 'Speaker first names', header: 'Speaker first names', required: false, aliases: ['speaker first names', 'speaker first name', 'presenter first names', 'presenter first name', 'first name'] },
  { key: 'speakerLastNames', label: 'Speaker last names', header: 'Speaker last names', required: false, aliases: ['speaker last names', 'speaker last name', 'presenter last names', 'presenter last name', 'last name'] },
  { key: 'speakerEmails', label: 'Speaker emails', header: 'Speaker emails', required: false, aliases: ['speaker emails', 'speaker email', 'presenter emails', 'emails', 'email'] },
  { key: 'speakerOrganizations', label: 'Speaker organizations', header: 'Speaker organizations', required: false, aliases: ['speaker organizations', 'speaker organization', 'speaker companies', 'speaker company', 'organization', 'company'] },
  { key: 'speakerTitles', label: 'Speaker titles', header: 'Speaker titles', required: false, aliases: ['speaker titles', 'speaker title', 'presenter titles', 'presenter title', 'job title'] },
  { key: 'capacity', label: 'Capacity', header: 'Capacity', required: false, aliases: ['capacity', 'seats'] },
  { key: 'externalId', label: 'External / source ID', header: 'External ID', required: false, aliases: ['external id', 'session id', 'source id', 'id'] },
  { key: 'tags', label: 'Tags', header: 'Tags', required: false, aliases: ['tags', 'labels'] },
] as const

export type AgendaImportMappingField = typeof EVENT_AGENDA_IMPORT_FIELDS[number]['key']

export const EVENT_AGENDA_IMPORT_TEMPLATE_FILENAME = 'signalthread-agenda-template.csv'

const EXAMPLE_ROWS: Array<Record<AgendaImportMappingField, string>> = [
  {
    title: 'Example Opening Keynote',
    description: 'Fictional sample session — replace all example content before import.',
    startDate: '2026-09-17', startTime: '09:00', endDate: '2026-09-17', endTime: '10:00',
    room: 'Grand Hall', track: 'Main stage', format: 'Keynote',
    speakerNames: 'Avery Example; Jordan Sample', speakerFirstNames: '', speakerLastNames: '', speakerEmails: 'avery@example.test; jordan@example.test', speakerOrganizations: 'Example Co.; Sample Group', speakerTitles: 'CEO; VP Product',
    capacity: '500', externalId: 'DEMO-OPENING-001', tags: 'welcome; all-attendees',
  },
  {
    title: 'Example Product Workshop',
    description: 'A made-up "hands-on", session with commas, quotes, and optional metadata.',
    startDate: '2026-09-17', startTime: '10:30', endDate: '2026-09-17', endTime: '11:30',
    room: 'Studio A', track: 'Product', format: 'Workshop',
    speakerNames: 'Casey Demo', speakerFirstNames: '', speakerLastNames: '', speakerEmails: 'casey@example.test', speakerOrganizations: 'Demo Labs', speakerTitles: 'Facilitator',
    capacity: '40', externalId: 'DEMO-WORKSHOP-002', tags: 'hands-on; product',
  },
  {
    title: 'Example Networking Break',
    description: 'Fictional open networking time.',
    startDate: '2026-09-17', startTime: '11:30', endDate: '2026-09-17', endTime: '12:00',
    room: 'Expo Lounge', track: 'Community', format: 'Networking',
    speakerNames: '', speakerFirstNames: '', speakerLastNames: '', speakerEmails: '', speakerOrganizations: '', speakerTitles: '', capacity: '', externalId: 'DEMO-NETWORKING-003', tags: 'networking; break',
  },
]

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function buildAgendaImportTemplateCsv() {
  const headers = EVENT_AGENDA_IMPORT_FIELDS.map((field) => field.header)
  const rows = EXAMPLE_ROWS.map((row) => EVENT_AGENDA_IMPORT_FIELDS.map((field) => row[field.key]))
  // UTF-8 BOM lets Excel identify the encoding while the parser safely removes it.
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
