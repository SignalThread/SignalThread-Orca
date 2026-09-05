import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const { requireAccountAdminMock, serviceMocks } = vi.hoisted(() => ({
  requireAccountAdminMock: vi.fn(),
  serviceMocks: {
    createAgendaImportUpload: vi.fn(), getAgendaImport: vi.fn(), selectAgendaImportWorksheet: vi.fn(),
    saveAgendaImportMapping: vi.fn(), saveAgendaImportDecisions: vi.fn(), saveAgendaImportRowCorrection: vi.fn(), confirmAgendaImport: vi.fn(), discardAgendaImport: vi.fn(),
  },
}))

vi.mock('@/lib/auth/require-account-admin', () => ({ requireAccountAdmin: requireAccountAdminMock }))
vi.mock('@/lib/event-agenda-import-service', () => serviceMocks)

import { GET, PATCH, POST } from './route'

const context = { params: { eventId: 'event_1' } }

describe('/api/app/events/[eventId]/agenda/imports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({ ok: true, userId: 'user_1', account: { id: 'account_1', slug: 'events' } })
  })

  it('keeps authentication and tenant resolution ahead of upload parsing', async () => {
    const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    requireAccountAdminMock.mockResolvedValue({ ok: false, response })
    const result = await POST(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=other', { method: 'POST' }), context)
    expect(result.status).toBe(403)
    expect(serviceMocks.createAgendaImportUpload).not.toHaveBeenCalled()
  })

  it('passes a CSV upload to the parser/service with the authenticated actor and scoped event', async () => {
    serviceMocks.createAgendaImportUpload.mockResolvedValue({ id: 'import_1', status: 'MAPPING' })
    const form = new FormData()
    form.set('file', new File(['Title,Date,Start,End\nOpening,09/17/2026,09:00,10:00'], 'agenda.csv', { type: 'text/csv' }))
    const result = await POST(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events', { method: 'POST', body: form }), context)
    expect(result.status).toBe(201)
    expect(serviceMocks.createAgendaImportUpload).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', userId: 'user_1', fileName: 'agenda.csv', mimeType: 'text/csv', buffer: expect.any(Buffer),
    }))
  })

  it('requires a real file and rejects before invoking the import service', async () => {
    const result = await POST(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events', { method: 'POST', body: new FormData() }), context)
    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ code: 'FILE_REQUIRED' })
    expect(serviceMocks.createAgendaImportUpload).not.toHaveBeenCalled()
  })

  it('reports malformed upload content as a client error', async () => {
    const result = await POST(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }), context)
    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ code: 'INVALID_UPLOAD' })
  })

  it('loads only an explicitly identified durable import job', async () => {
    serviceMocks.getAgendaImport.mockResolvedValue({ id: 'import_1' })
    const result = await GET(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events&job=import_1'), context)
    expect(result.status).toBe(200)
    expect(serviceMocks.getAgendaImport).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1' })
  })

  it.each([
    ['SELECT_WORKSHEET', 'selectAgendaImportWorksheet'],
    ['SAVE_MAPPING', 'saveAgendaImportMapping'],
    ['SAVE_DECISIONS', 'saveAgendaImportDecisions'],
    ['SAVE_CORRECTION', 'saveAgendaImportRowCorrection'],
    ['CONFIRM', 'confirmAgendaImport'],
    ['DISCARD', 'discardAgendaImport'],
  ] as const)('dispatches %s through the dedicated service', async (action, serviceName) => {
    serviceMocks[serviceName].mockResolvedValue({ id: 'import_1' })
    const result = await PATCH(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, importJobId: 'import_1', worksheetName: 'Sessions', mapping: {}, timezone: 'America/New_York', decisions: [], confirmLiveEdit: true }),
    }), context)
    expect(result.status).toBe(200)
    expect(serviceMocks[serviceName]).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account_1', eventId: 'event_1', importJobId: 'import_1' }))
  })

  it('rejects unknown mutations without reducing the staged flow', async () => {
    const result = await PATCH(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'SKIP_IMPORT' }),
    }), context)
    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ code: 'INVALID_ACTION' })
  })

  it('returns structured 4xx mapping errors instead of a generic server failure', async () => {
    serviceMocks.saveAgendaImportMapping.mockImplementation(() => { throw new z.ZodError([{ code: 'custom', path: ['fullName'], message: 'Map either Full name or First name' }]) })
    const result = await PATCH(new NextRequest('http://localhost/api/app/events/event_1/agenda/imports?account=events', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'SAVE_MAPPING', importJobId: 'import_1', mapping: {}, timezone: 'America/New_York' }),
    }), context)
    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ code: 'VALIDATION_FAILED', error: 'Invalid import mapping: Map either Full name or First name', details: expect.any(Array) })
  })
})
