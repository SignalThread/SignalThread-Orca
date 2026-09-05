/** Client-safe speaker-roster mapping schema shared by the picker and parser. */
export const EVENT_SPEAKER_ROSTER_IMPORT_FIELDS = [
  { key: 'fullName', label: 'Full name', required: false, aliases: ['full name', 'speaker name', 'name', 'display name'] },
  { key: 'firstName', label: 'First name', required: false, aliases: ['first name', 'given name', 'first'] },
  { key: 'lastName', label: 'Last name', required: false, aliases: ['last name', 'family name', 'surname', 'last'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'email address', 'speaker email'] },
  { key: 'organization', label: 'Company', required: false, aliases: ['company', 'organization', 'organisation', 'employer'] },
  { key: 'title', label: 'Title / role', required: false, aliases: ['title', 'role', 'job title', 'position'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'telephone'] },
  { key: 'biography', label: 'Biography', required: false, aliases: ['biography', 'bio', 'speaker bio', 'about'] },
  { key: 'sessionTitle', label: 'Session title', required: false, aliases: ['session title', 'session name', 'session'] },
  { key: 'externalSessionId', label: 'External session ID', required: false, aliases: ['external session id', 'session id', 'source session id'] },
  { key: 'tags', label: 'Tags', required: false, aliases: ['tags', 'labels'] },
] as const

export type SpeakerRosterImportMappingField = typeof EVENT_SPEAKER_ROSTER_IMPORT_FIELDS[number]['key']

export const EVENT_SPEAKER_ROSTER_TEMPLATE_FILENAME = 'signalthread-speaker-roster-template.csv'

function csv(value: string) { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value }

export function buildSpeakerRosterImportTemplateCsv() {
  const rows = [
    ['Avery', 'Example', 'avery@example.test', 'Example Co.', 'Host', '+1 212 555 0140', 'A short speaker biography.', 'Example Opening Keynote', 'DEMO-OPENING-001', 'keynote; host'],
    ['Jordan', 'Sample', 'jordan@example.test', 'Sample Studio', 'Panelist', '', '', '', '', 'product; panel'],
  ]
  return `\uFEFF${[EVENT_SPEAKER_ROSTER_IMPORT_FIELDS.map((field) => field.label), ...rows].map((row) => row.map(csv).join(',')).join('\r\n')}\r\n`
}
