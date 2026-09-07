import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import {
  confirmAgendaImport,
  createAgendaImportUpload,
  discardAgendaImport,
  getAgendaImport,
  saveAgendaImportDecisions,
  saveAgendaImportMapping,
  saveAgendaImportRowCorrection,
  selectAgendaImportWorksheet,
} from '@/lib/event-agenda-import-service'
import { EVENT_AGENDA_IMPORT_MAX_FILE_BYTES } from '@/lib/event-agenda-import-parser'
import { EventAgendaServiceError } from '@/lib/event-agenda-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EventAgendaServiceError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code, details: error.details }, { status: error.status })
  }
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => issue.message).filter(Boolean).join('; ')
    return NextResponse.json({ success: false, error: message ? `Invalid import mapping: ${message}` : 'Invalid import mapping', code: 'VALIDATION_FAILED', details: error.issues }, { status: 400 })
  }
  const parserError = error as Error & { code?: string }
  if (parserError?.code && ['EMPTY_FILE', 'FILE_TOO_LARGE', 'TOO_MANY_ROWS', 'UNSUPPORTED_FILE_TYPE', 'INVALID_CSV', 'INVALID_XLSX', 'EMPTY_WORKBOOK'].includes(parserError.code)) {
    return NextResponse.json({ success: false, error: parserError.message, code: parserError.code }, { status: 400 })
  }
  console.error('[Event Agenda Import API]', error)
  return NextResponse.json({ success: false, error: fallback }, { status: 500 })
}

async function requireImportAdmin(request: NextRequest) {
  return requireAccountAdmin(request.nextUrl.searchParams.get('account'))
}

async function readBody(request: NextRequest) {
  try { return await request.json() as Record<string, unknown> } catch { throw new EventAgendaServiceError('Invalid JSON body', 400, 'INVALID_JSON') }
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireImportAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const importJobId = request.nextUrl.searchParams.get('job')?.trim()
    if (!importJobId) throw new EventAgendaServiceError('Import job is required', 400, 'IMPORT_JOB_REQUIRED')
    const data = await getAgendaImport({ accountId: admin.account.id, eventId: params.eventId, importJobId })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error, 'Failed to load agenda import')
  }
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireImportAdmin(request)
  if (!admin.ok) return admin.response
  try {
    let formData: FormData
    try { formData = await request.formData() } catch { throw new EventAgendaServiceError('Upload must use multipart form data', 400, 'INVALID_UPLOAD') }
    const file = formData.get('file')
    const importType = formData.get('importType')
    if (!(file instanceof File)) throw new EventAgendaServiceError('Choose an agenda file to upload', 400, 'FILE_REQUIRED')
    if (file.size > EVENT_AGENDA_IMPORT_MAX_FILE_BYTES) throw new EventAgendaServiceError('Agenda files may be no larger than 5 MB', 400, 'FILE_TOO_LARGE')
    const data = await createAgendaImportUpload({
      accountId: admin.account.id,
      eventId: params.eventId,
      userId: admin.userId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      buffer: Buffer.from(await file.arrayBuffer()),
      importType: importType === 'SPEAKER_ROSTER' ? 'SPEAKER_ROSTER' : 'AGENDA',
    })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'Failed to inspect agenda file')
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireImportAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const body = await readBody(request)
    const base = {
      accountId: admin.account.id,
      eventId: params.eventId,
      importJobId: String(body.importJobId ?? ''),
    }
    if (body.action === 'SELECT_WORKSHEET') {
      const data = await selectAgendaImportWorksheet({
        ...base,
        ...(typeof body.worksheetName === 'string' ? { worksheetName: body.worksheetName } : {}),
        ...(typeof body.worksheetIndex === 'number' ? { worksheetIndex: body.worksheetIndex } : {}),
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'SAVE_MAPPING') {
      const data = await saveAgendaImportMapping({
        ...base,
        mapping: body.mapping,
        timezone: String(body.timezone ?? ''),
        assignSpeakersToEvent: body.assignSpeakersToEvent !== false,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'SAVE_DECISIONS') {
      const data = await saveAgendaImportDecisions({ ...base, decisions: body.decisions })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'SAVE_CORRECTION') {
      const data = await saveAgendaImportRowCorrection({ ...base, correction: body.correction })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'CONFIRM') {
      const data = await confirmAgendaImport({ ...base, userId: admin.userId, confirmLiveEdit: body.confirmLiveEdit === true })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'DISCARD') {
      const data = await discardAgendaImport(base)
      return NextResponse.json({ success: true, data })
    }
    throw new EventAgendaServiceError('Agenda import action is invalid', 400, 'INVALID_ACTION')
  } catch (error) {
    return errorResponse(error, 'Failed to update agenda import')
  }
}
