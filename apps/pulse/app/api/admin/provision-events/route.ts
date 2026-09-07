import { NextRequest, NextResponse } from 'next/server'
import { provisionEventsWorkspace } from '@/lib/provisioning'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function isValidPlan(plan: string) {
  return ['starter', 'growth', 'enterprise', 'pro'].includes(plan)
}

function normalizeQuestions(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error('questions must be an array')
  }
  if (value.length === 0) {
    throw new Error('questions must include at least one question')
  }
  return value.map((question, index) => {
    if (!question || typeof question !== 'object') {
      throw new Error(`questions[${index}] must be an object`)
    }
    const record = question as Record<string, unknown>
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
    if (!prompt) {
      throw new Error(`questions[${index}].prompt is required`)
    }
    const helperText = typeof record.helperText === 'string' ? record.helperText.trim() : undefined
    const order = typeof record.order === 'number' && Number.isInteger(record.order) ? record.order : undefined
    const required = typeof record.required === 'boolean' ? record.required : undefined
    return {
      prompt,
      helperText: helperText || undefined,
      order,
      required,
    }
  })
}

/**
 * POST /api/admin/provision-events
 *
 * Platform Admin only - Provision a new Events account with a starter event voice survey.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
    const locationTeamName = typeof body.locationName === 'string' ? body.locationName.trim() : ''

    const accountName = businessName || (typeof body.accountName === 'string' ? body.accountName.trim() : '')
    const accountSlug =
      (typeof body.accountSlug === 'string' && body.accountSlug.trim()) ||
      (accountName ? slugFromName(accountName) : '')
    const accountEmail =
      email || (typeof body.accountEmail === 'string' ? body.accountEmail.trim() : '')
    const ownerEmail =
      email || (typeof body.ownerEmail === 'string' ? body.ownerEmail.trim() : '')
    const plan = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : 'starter'
    const locationName =
      locationTeamName || (typeof body.locationName === 'string' ? body.locationName.trim() : '')
    const locationAddress = typeof body.locationAddress === 'string' ? body.locationAddress.trim() : undefined
    const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : undefined
    const eventDescription = typeof body.eventDescription === 'string' ? body.eventDescription.trim() : undefined
    const surveyName = typeof body.surveyName === 'string' ? body.surveyName.trim() : undefined
    const surveyDescription = typeof body.surveyDescription === 'string' ? body.surveyDescription.trim() : undefined
    const targetName = typeof body.targetName === 'string' ? body.targetName.trim() : undefined
    const targetDescription = typeof body.targetDescription === 'string' ? body.targetDescription.trim() : undefined

    if (!ownerEmail || !accountName || !locationName) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: 'Email, business name, and location/team name are required',
        },
        { status: 400 },
      )
    }

    if (!isValidPlan(plan)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid plan',
          message: 'Plan must be starter, growth, or enterprise',
        },
        { status: 400 },
      )
    }

    let questions
    try {
      questions = normalizeQuestions(body.questions)
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid questions',
          message: error instanceof Error ? error.message : 'Invalid starter survey questions',
        },
        { status: 400 },
      )
    }

    const result = await provisionEventsWorkspace({
      accountName,
      accountSlug,
      accountEmail,
      plan: plan || 'starter',
      locationName,
      locationAddress,
      eventName,
      eventDescription,
      surveyName,
      surveyDescription,
      targetName,
      targetDescription,
      questions,
      ownerEmail,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('[POST /api/admin/provision-events] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 },
    )
  }
}
