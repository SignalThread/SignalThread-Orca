import { NextRequest, NextResponse } from 'next/server'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { eventAgendaImportMappingSchema } from '@/lib/event-agenda-contract'
import {
  discoverAgendaImportMapping,
  inspectAgendaImportFile,
  normalizeAgendaImportRow,
} from '@/lib/event-agenda-import-parser'
import { preCreationAgendaInspectionSchema } from '@/lib/pre-creation-agenda'

function selectWorksheet(worksheets: Awaited<ReturnType<typeof inspectAgendaImportFile>>['worksheets']) {
  return [...worksheets].sort((left, right) => {
    const leftMapping = discoverAgendaImportMapping(left.columns)
    const rightMapping = discoverAgendaImportMapping(right.columns)
    return Number(Boolean(rightMapping.mapping.title)) - Number(Boolean(leftMapping.mapping.title))
      || Object.keys(rightMapping.mapping).length - Object.keys(leftMapping.mapping).length
      || right.rowCount - left.rowCount
  })[0]
}

function completeMapping(mapping: ReturnType<typeof discoverAgendaImportMapping>['mapping']) {
  return eventAgendaImportMappingSchema.parse({
    title: mapping.title,
    startDate: mapping.startDate ?? null,
    startTime: mapping.startTime ?? null,
    endTime: mapping.endTime ?? null,
    endDate: mapping.endDate ?? null,
    externalId: mapping.externalId ?? null,
    description: mapping.description ?? null,
    room: mapping.room ?? null,
    track: mapping.track ?? null,
    format: mapping.format ?? null,
    speakerNames: mapping.speakerNames ?? null,
    speakerFirstNames: mapping.speakerFirstNames ?? null,
    speakerLastNames: mapping.speakerLastNames ?? null,
    speakerEmails: mapping.speakerEmails ?? null,
    speakerOrganizations: mapping.speakerOrganizations ?? null,
    speakerTitles: mapping.speakerTitles ?? null,
    capacity: mapping.capacity ?? null,
    tags: mapping.tags ?? null,
  })
}

function interpretRows(input: {
  sourceFileName: string
  inspection: ReturnType<typeof preCreationAgendaInspectionSchema.parse>
  worksheetName: string
  mapping: ReturnType<typeof eventAgendaImportMappingSchema.parse>
  timezone: string
  eventStartDate?: string | null
  eventEndDate?: string | null
}) {
  const worksheet = input.inspection.worksheets.find((item) => item.name === input.worksheetName)
  if (!worksheet) throw new Error('The selected worksheet is no longer available')
  const rows = worksheet.rows.map((row) => {
    const result = normalizeAgendaImportRow({
      row,
      mapping: input.mapping,
      timezone: input.timezone,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
    })
    const hasErrors = result.issues.some((issue) => issue.severity === 'ERROR')
    return {
      id: `${input.inspection.checksumSha256}:${worksheet.index}:${row.sourceRowNumber}`,
      sourceRowNumber: row.sourceRowNumber,
      sourceValues: row.values,
      normalized: result.normalized,
      issues: result.issues,
      status: hasErrors || !result.normalized ? 'INVALID' as const : result.issues.length ? 'NEEDS_REVIEW' as const : 'READY' as const,
    }
  })
  return { sourceFileName: input.sourceFileName, inspection: input.inspection, worksheetName: worksheet.name, mapping: input.mapping, rows }
}

export async function POST(request: NextRequest) {
  try {
    const membership = await requireAccountMembership(request.nextUrl.searchParams.get('account'), { allowSuperAdmin: true })
    if (!membership.ok) return membership.response
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ error: 'Agenda file is required' }, { status: 400 })
      const inspection = await inspectAgendaImportFile({ fileName: file.name, mimeType: file.type || 'application/octet-stream', buffer: Buffer.from(await file.arrayBuffer()) })
      const worksheet = selectWorksheet(inspection.worksheets)
      if (!worksheet) return NextResponse.json({ error: 'The agenda has no worksheets to review' }, { status: 400 })
      const discovered = discoverAgendaImportMapping(worksheet.columns)
      const mapping = completeMapping({ ...discovered.mapping, title: discovered.mapping.title ?? worksheet.columns[0] })
      return NextResponse.json({ success: true, data: interpretRows({
        sourceFileName: file.name,
        inspection,
        worksheetName: worksheet.name,
        mapping,
        timezone: String(form.get('timezone') || 'UTC'),
        eventStartDate: String(form.get('eventStartDate') || '') || null,
        eventEndDate: String(form.get('eventEndDate') || '') || null,
      }) })
    }

    const body = await request.json()
    const inspection = preCreationAgendaInspectionSchema.parse(body.inspection)
    const mapping = eventAgendaImportMappingSchema.parse(body.mapping)
    return NextResponse.json({ success: true, data: interpretRows({
      sourceFileName: String(body.sourceFileName || ''), inspection, worksheetName: String(body.worksheetName || ''), mapping,
      timezone: typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC',
      eventStartDate: typeof body.eventStartDate === 'string' ? body.eventStartDate : null,
      eventEndDate: typeof body.eventEndDate === 'string' ? body.eventEndDate : null,
    }) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Agenda interpretation failed' }, { status: 400 })
  }
}
