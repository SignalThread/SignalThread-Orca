import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { eventActionVoiceObjectPrefix } from '@/lib/event-actions/contract'
import { addEventActionUpdate, EventActionError, getEventAction } from '@/lib/event-actions/service'
import { transcribeEventActionVoiceUpdate } from '@/lib/event-actions/voice-update'
import { getStorageConfig, presignPut, verifyObjectExists } from '@/lib/objectStorage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'] as const
const MAX_BYTES = 25 * 1024 * 1024

const requestSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('PRESIGN'),
    fileName: z.string().min(1).max(255),
    fileSize: z.number().int().positive().max(MAX_BYTES),
    mimeType: z.string().min(1),
  }),
  z.object({
    operation: z.literal('CONFIRM'),
    objectKey: z.string().min(1).max(1000),
    mimeType: z.string().min(1),
    durationMs: z.number().int().positive().max(30 * 60 * 1000),
    idempotencyKey: z.string().min(8).max(200),
  }),
])

function normalizedMimeType(value: string) {
  return value.split(';')[0].trim().toLocaleLowerCase('en-US')
}

function extension(fileName: string, mimeType: string) {
  const raw = fileName.split('.').pop()?.toLocaleLowerCase('en-US') ?? ''
  if (/^(webm|mp4|mp3|wav|ogg)$/.test(raw)) return raw
  return mimeType === 'audio/mp4' ? 'mp4' : mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'audio/wav' ? 'wav' : mimeType === 'audio/ogg' ? 'ogg' : 'webm'
}

function failure(error: unknown) {
  if (error instanceof EventActionError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  }
  console.error('[event action voice update]', error)
  return NextResponse.json({ success: false, error: 'Failed to process voice update' }, { status: 500 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; actionId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  if (!accountSlug) {
    return NextResponse.json({ success: false, error: 'Account parameter required' }, { status: 400 })
  }
  const access = await requireEventsEventAccess(accountSlug, params.eventId)
  if (!access.ok) return access.response

  let parsed: z.infer<typeof requestSchema>
  try {
    const result = requestSchema.safeParse(await request.json())
    if (!result.success) {
      return NextResponse.json({ success: false, error: 'Invalid voice update request' }, { status: 400 })
    }
    parsed = result.data
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    await getEventAction({
      accountId: access.account.id,
      eventId: params.eventId,
      clusterId: params.actionId,
    })
    const mimeType = normalizedMimeType(parsed.mimeType)
    if (!(MIME_TYPES as readonly string[]).includes(mimeType)) {
      return NextResponse.json({ success: false, error: 'Unsupported audio type' }, { status: 400 })
    }
    const prefix = eventActionVoiceObjectPrefix(access.account.id, params.eventId, params.actionId)
    const storage = getStorageConfig()
    if (!storage || !process.env.S3_BUCKET_NAME) {
      return NextResponse.json({ success: false, error: 'Voice update storage is not configured' }, { status: 503 })
    }

    if (parsed.operation === 'PRESIGN') {
      const key = `${prefix}${Date.now()}-${crypto.randomUUID()}.${extension(parsed.fileName, mimeType)}`
      const expiresIn = Number.parseInt(process.env.S3_UPLOAD_EXPIRES_IN || '300', 10)
      const url = await presignPut({
        bucket: process.env.S3_BUCKET_NAME,
        key,
        contentType: mimeType,
        expiresIn,
      })
      return NextResponse.json({ success: true, data: { key, url, expiresIn } })
    }

    if (!parsed.objectKey.startsWith(prefix)) {
      return NextResponse.json({ success: false, error: 'Voice update is outside this action scope' }, { status: 400 })
    }
    if (!await verifyObjectExists(process.env.S3_BUCKET_NAME, parsed.objectKey)) {
      return NextResponse.json({ success: false, error: 'Voice update upload was not found' }, { status: 409 })
    }
    const update = await addEventActionUpdate({
      accountId: access.account.id,
      eventId: params.eventId,
      clusterId: params.actionId,
      actorUserId: access.userId,
      kind: 'VOICE',
      voice: { objectKey: parsed.objectKey, mimeType, durationMs: parsed.durationMs },
      idempotencyKey: parsed.idempotencyKey,
    })
    void transcribeEventActionVoiceUpdate({
      accountId: access.account.id,
      eventId: params.eventId,
      clusterId: params.actionId,
      updateId: update.id,
    }).catch((error) => console.error('[event action voice transcription]', error))
    return NextResponse.json({ success: true, data: update }, { status: 202 })
  } catch (error) {
    return failure(error)
  }
}
