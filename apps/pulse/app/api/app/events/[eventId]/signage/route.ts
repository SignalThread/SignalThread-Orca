import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import {
  applyEventSurveySignageConfiguration,
  EventSignageApplyError,
} from '@/lib/event-signage-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const visualConfigurationSchema = z.object({
  version: z.literal(1),
  preset: z.enum(['tabletop', 'clean', 'bold_event']),
  useEventBranding: z.boolean(),
  logoSource: z.literal('event-branding'),
  headline: z.string().trim().min(1).max(160),
  supportingLine: z.string().trim().max(280),
  buttonLabel: z.string().trim().max(120),
  accent: z.enum(['event', 'ink', 'teal', 'amber']),
  orientation: z.enum(['portrait', 'landscape']),
}).strict()

const applySchema = z.object({
  surveyIds: z.array(z.string().trim().min(1)).min(1).max(500),
  configuration: visualConfigurationSchema,
}).strict()

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response

  try {
    const body = applySchema.parse(await request.json())
    const data = await applyEventSurveySignageConfiguration({
      accountId: admin.account.id,
      eventId: params.eventId,
      surveyIds: body.surveyIds,
      configuration: body.configuration,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    if (error instanceof EventSignageApplyError) {
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      }, { status: error.status })
    }
    console.error('[Event Signage Apply API]', error)
    return NextResponse.json({ success: false, error: 'Failed to apply signage configuration' }, { status: 500 })
  }
}
