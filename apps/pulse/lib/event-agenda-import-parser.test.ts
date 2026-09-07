import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  EVENT_AGENDA_IMPORT_MAX_FILE_BYTES,
  discoverAgendaImportMapping,
  inspectAgendaImportFile,
  normalizeAgendaImportRow,
} from './event-agenda-import-parser'
import { buildAgendaImportTemplateCsv, EVENT_AGENDA_IMPORT_FIELDS, EVENT_AGENDA_IMPORT_TEMPLATE_FILENAME } from './event-agenda-import-template'

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function createWorkbook(sheets: Array<{ name: string; rows: string[][] }>) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="1"><xf xfId="0" numFmtId="0"/></cellXfs></styleSheet>')
  sheets.forEach((sheet, sheetIndex) => {
    const rows = sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('')
    zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`)
  })
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('event agenda import parser', () => {
  it('keeps the downloadable template headers and example rows accepted by the importer', async () => {
    const inspection = await inspectAgendaImportFile({
      fileName: EVENT_AGENDA_IMPORT_TEMPLATE_FILENAME,
      mimeType: 'text/csv',
      buffer: Buffer.from(buildAgendaImportTemplateCsv(), 'utf8'),
    })
    const worksheet = inspection.worksheets[0]
    const discovered = discoverAgendaImportMapping(worksheet.columns)

    expect(worksheet.columns).toEqual(EVENT_AGENDA_IMPORT_FIELDS.map((field) => field.header))
    expect(discovered.missingRequired).toEqual([])
    expect(worksheet.rows).toHaveLength(3)
    for (const row of worksheet.rows) {
      const parsed = normalizeAgendaImportRow({
        row,
        timezone: 'America/New_York',
        mapping: discovered.mapping,
      })
      expect(parsed.normalized).not.toBeNull()
      expect(parsed.issues).toEqual([])
    }
  })

  it('parses quoted CSV, discovers columns, and preserves source row identity', async () => {
    const inspection = await inspectAgendaImportFile({
      fileName: 'agenda.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Session Title,Start Date,Start Time,End Time,Room,Speakers\n"Opening, together",09/17/2026,9:00 AM,10:00 AM,Main,"Ali; Sam"\n'),
    })
    expect(inspection).toMatchObject({ fileType: 'CSV', worksheets: [{ name: 'CSV', rowCount: 1 }] })
    expect(inspection.worksheets[0].rows[0]).toMatchObject({ sourceRowNumber: 2, values: { 'Session Title': 'Opening, together' } })
    expect(discoverAgendaImportMapping(inspection.worksheets[0].columns)).toEqual(expect.objectContaining({
      mapping: expect.objectContaining({ title: 'Session Title', startDate: 'Start Date', startTime: 'Start Time', endTime: 'End Time' }),
      missingRequired: [],
    }))
  })

  it('interprets a real-world DAY/DATE, TIME, SESSION, and SPEAKER(s) workbook shape without manual mapping', async () => {
    const agendaRows = Array.from({ length: 25 }, (_, index) => [
      index < 13 ? '46309' : '46310',
      index === 2 ? '11:00 AM - 12:00 PM' : '9:15 AM - 10:45 AM',
      `Session ${index + 1}`,
      index === 2 ? 'Alex Example\nJordan Example' : index === 22 ? 'TBD' : `Speaker ${index + 1}`,
    ])
    // The blank trailing rows model a workbook whose declared dimension is
    // larger than its populated agenda range.
    const buffer = await createWorkbook([{ name: 'Sheet1', rows: [
      ['DAY/DATE', 'TIME', 'SESSION', 'SPEAKER(s)'],
      ...agendaRows,
      ...Array.from({ length: 20 }, () => ['', '', '', '']),
    ] }])
    const inspection = await inspectAgendaImportFile({
      fileName: 'cornerstone-elevate.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    })
    const worksheet = inspection.worksheets[0]
    const discovered = discoverAgendaImportMapping(worksheet.columns)

    expect(worksheet.rowCount).toBe(25)
    expect(discovered).toMatchObject({
      mapping: { title: 'SESSION', startDate: 'DAY/DATE', startTime: 'TIME', endTime: 'TIME', speakerNames: 'SPEAKER(s)' },
      missingRequired: [],
      needsStructuralInterpretation: true,
    })
    const opening = normalizeAgendaImportRow({
      row: worksheet.rows[0], mapping: discovered.mapping, timezone: 'America/New_York',
    })
    const multiSpeaker = normalizeAgendaImportRow({
      row: worksheet.rows[2], mapping: discovered.mapping, timezone: 'America/New_York',
    })
    const tbd = normalizeAgendaImportRow({
      row: worksheet.rows[22], mapping: discovered.mapping, timezone: 'America/New_York',
    })
    expect(opening.normalized).toMatchObject({ title: 'Session 1', startsAt: '2026-10-14T13:15:00.000Z', endsAt: '2026-10-14T14:45:00.000Z' })
    expect(multiSpeaker.normalized?.speakers.map((speaker) => speaker.name)).toEqual(['Alex Example', 'Jordan Example'])
    expect(tbd.normalized?.speakers).toEqual([])
  })

  it('inspects every XLSX worksheet without flattening worksheet identity', async () => {
    const buffer = await createWorkbook([
      { name: 'Sessions', rows: [['Title', 'Start Date', 'Start Time', 'End Time'], ['Keynote', '2026-09-17', '09:00', '10:00']] },
      { name: 'Speakers', rows: [['Name'], ['Ali Example']] },
    ])
    const inspection = await inspectAgendaImportFile({
      fileName: 'agenda.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    })
    expect(inspection.worksheets.map(({ name, index }) => ({ name, index }))).toEqual([
      { name: 'Sessions', index: 0 }, { name: 'Speakers', index: 1 },
    ])
    expect(inspection.worksheets[0].rows[0].sourceRowNumber).toBe(2)
  })

  it('normalizes date/time in the event timezone and reports review warnings', () => {
    const result = normalizeAgendaImportRow({
      timezone: 'America/New_York',
      mapping: {
        title: 'Title', startDate: 'Date', startTime: 'Start', endTime: 'End',
        format: 'Format', speakerNames: 'Speakers', speakerEmails: 'Emails', capacity: 'Capacity',
      },
      row: {
        sourceRowNumber: 2,
        values: { Title: 'Opening', Date: '09/17/2026', Start: '9:00 AM', End: '10:00 AM', Format: 'Immersive lab', Speakers: 'Ali; Sam', Emails: 'ali@example.com; sam@example.com', Capacity: '120' },
      },
    })
    expect(result.normalized).toMatchObject({
      title: 'Opening', startsAt: '2026-09-17T13:00:00.000Z', endsAt: '2026-09-17T14:00:00.000Z', capacity: 120,
      speakers: [{ name: 'Ali', email: 'ali@example.com' }, { name: 'Sam', email: 'sam@example.com' }],
    })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_FORMAT', severity: 'WARNING' }))
  })

  it('keeps invalid and empty rows reviewable instead of dropping them', () => {
    const mapping = { title: 'Title', startDate: 'Date', startTime: 'Start', endTime: 'End' }
    const invalid = normalizeAgendaImportRow({
      timezone: 'America/New_York', mapping,
      row: { sourceRowNumber: 2, values: { Title: '', Date: 'not-a-date', Start: '10:00', End: '09:00' } },
    })
    const empty = normalizeAgendaImportRow({
      timezone: 'America/New_York', mapping,
      row: { sourceRowNumber: 3, values: { Title: '', Date: '', Start: '', End: '' } },
    })
    expect(invalid.normalized).toBeNull()
    expect(invalid.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['MISSING_REQUIRED_INFORMATION', 'UNSUPPORTED_DATE_FORMAT']))
    expect(empty).toMatchObject({ empty: true, normalized: null, issues: [{ code: 'EMPTY_ROW_IGNORED' }] })
  })

  it('keeps title-only rows as intentionally unscheduled instead of fabricating a schedule', () => {
    const result = normalizeAgendaImportRow({
      timezone: 'America/New_York',
      mapping: { title: 'Title' },
      row: { sourceRowNumber: 2, values: { Title: 'Community conversation' } },
    })
    expect(result).toMatchObject({
      normalized: { title: 'Community conversation', startsAt: null, endsAt: null, timezone: null },
      issues: [],
    })
  })

  it('combines split speaker names and preserves optional profile context', () => {
    const result = normalizeAgendaImportRow({
      timezone: 'America/New_York',
      mapping: {
        title: 'Session', speakerFirstNames: 'First', speakerLastNames: 'Last',
        speakerEmails: 'Email', speakerOrganizations: 'Company', speakerTitles: 'Role',
      },
      row: { sourceRowNumber: 2, values: { Session: 'Panel', First: 'Ali; Sam', Last: 'Kamyab; Rivera', Email: '; sam@example.com', Company: 'Pulse; Example Co', Role: 'Founder; CTO' } },
    })
    expect(result.normalized?.speakers).toEqual([
      { name: 'Ali Kamyab', email: null, organization: 'Pulse', title: 'Founder' },
      { name: 'Sam Rivera', email: 'sam@example.com', organization: 'Example Co', title: 'CTO' },
    ])
  })

  it.each([
    ['August 19', '2026-08-19'],
    ['Wednesday', '2026-08-19'],
    ['Day 2', '2026-08-19'],
    ['46252', '2026-08-18'],
  ])('resolves contextual and spreadsheet date %s', (sourceDate, expectedDate) => {
    const result = normalizeAgendaImportRow({
      timezone: 'America/New_York',
      eventStartDate: '2026-08-18',
      eventEndDate: '2026-08-20',
      mapping: { title: 'Title', startDate: 'Date', startTime: 'Start', endTime: 'End' },
      row: { sourceRowNumber: 2, values: { Title: 'Session', Date: sourceDate, Start: '09:00', End: '10:00' } },
    })
    expect(result.normalized?.startsAt?.startsWith(expectedDate)).toBe(true)
  })

  it('flags a weekday that is ambiguous inside the event window', () => {
    const result = normalizeAgendaImportRow({
      timezone: 'America/New_York', eventStartDate: '2026-08-01', eventEndDate: '2026-08-20',
      mapping: { title: 'Title', startDate: 'Date', startTime: 'Start', endTime: 'End' },
      row: { sourceRowNumber: 2, values: { Title: 'Session', Date: 'Wednesday', Start: '09:00', End: '10:00' } },
    })
    expect(result.normalized).toBeNull()
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_DATE_FORMAT', severity: 'ERROR' }))
  })

  it('rejects unsupported, mismatched, binary, and oversized files clearly', async () => {
    await expect(inspectAgendaImportFile({ fileName: 'agenda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' })
    await expect(inspectAgendaImportFile({ fileName: 'agenda.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not zip') })).rejects.toMatchObject({ code: 'INVALID_XLSX' })
    await expect(inspectAgendaImportFile({ fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from([0, 1]) })).rejects.toMatchObject({ code: 'INVALID_CSV' })
    await expect(inspectAgendaImportFile({ fileName: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.alloc(EVENT_AGENDA_IMPORT_MAX_FILE_BYTES + 1) })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })
})
