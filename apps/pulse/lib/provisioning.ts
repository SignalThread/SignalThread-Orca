import { prisma } from './prisma'
import { CollectionPhase, EventType, EventStatus, AccountType, SurveyTargetCategory, type PrismaClient } from '@prisma/client'
import { syncEventQuestions } from './questions'
import { normalizeInviteEmail, sendEmailOtpCode } from './account-users'
import { createEventVoiceSurvey } from './event-voice-surveys'

/** Interactive transaction client (same model delegates as PrismaClient). */
type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

async function validateProvisionOwnerEmail(email: string) {
  const [existingUser, existingProvision] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { role: true, isActive: true } }),
    prisma.pendingProvision.findUnique({ where: { email }, select: { id: true } }),
  ])
  if (existingUser) {
    if (existingUser.role === 'ADMIN' && existingUser.isActive) return null
    return 'This email belongs to a user who cannot be assigned as a regular account Admin'
  }
  return existingProvision ? `Email "${email}" already has a pending provision` : null
}

async function grantOrInviteProvisionOwner(accountId: string, email: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isActive: true, accountId: true },
  })
  if (existingUser) {
    if (existingUser.role !== 'ADMIN' || !existingUser.isActive) {
      return { ok: false as const, message: 'Existing owner must be an active regular Admin' }
    }
    await prisma.$transaction(async (tx) => {
      await tx.accountUserMembership.upsert({
        where: { userId_accountId: { userId: existingUser.id, accountId } },
        create: { userId: existingUser.id, accountId },
        update: {},
      })
      if (!existingUser.accountId) {
        await tx.user.update({ where: { id: existingUser.id }, data: { accountId } })
      }
    })
    const otp = await sendEmailOtpCode({ email, shouldCreateUser: false })
    return otp.ok
      ? { ok: true as const, reusedUser: true }
      : { ok: false as const, message: otp.message }
  }

  const pending = await prisma.pendingProvision.findUnique({
    where: { email },
    select: { accountId: true, usedAt: true },
  })
  if (pending && pending.accountId !== accountId) {
    return { ok: false as const, message: 'This email already has a pending invite for another account' }
  }
  if (!pending) {
    await prisma.pendingProvision.create({
      data: { email, accountId, role: 'ADMIN' },
    })
  } else if (pending.usedAt) {
    return { ok: false as const, message: 'This invite was already used but no linked user was found' }
  }
  const otp = await sendEmailOtpCode({ email, shouldCreateUser: true })
  return otp.ok
    ? { ok: true as const, reusedUser: false }
    : { ok: false as const, message: otp.message }
}

export type PlanTier = 'starter' | 'growth' | 'enterprise'

/** URL-safe slug for a location name (unique within account is enforced by caller). */
export function locationSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Create the first Location for an account (e.g. self-service checkout or retail provision).
 * Ensures slug is unique per account.
 */
export async function createPrimaryLocationForAccount(
  accountId: string,
  locationName: string,
  options?: { address?: string; googleReviewUrl?: string | null },
  db: PrismaTx | typeof prisma = prisma
) {
  const trimmed = locationName.trim()
  if (!trimmed) {
    throw new Error('Location name is required')
  }
  let base = locationSlugFromName(trimmed) || 'main'
  let slug = base
  let n = 0
  while (
    await db.location.findFirst({
      where: { accountId, slug },
    })
  ) {
    slug = `${base}-${++n}`
  }
  return db.location.create({
    data: {
      accountId,
      name: trimmed,
      slug,
      address: options?.address ?? '',
      googleReviewUrl: options?.googleReviewUrl ?? null,
      isActive: true,
    },
  })
}

/**
 * Post-Stripe checkout: same access path as retail provision — PendingProvision + Supabase invite email.
 * Never throws; logs failures so webhook handlers still return 200 after account activation.
 */
export async function sendStripeCheckoutProvisionInvite(
  accountId: string,
  emailRaw: string | null | undefined
): Promise<void> {
  const email = typeof emailRaw === 'string' ? normalizeInviteEmail(emailRaw) : ''
  if (!email) {
    console.warn('[sendStripeCheckoutProvisionInvite] missing account email, accountId=', accountId)
    return
  }

  try {
    const invite = await grantOrInviteProvisionOwner(accountId, email)
    if (!invite.ok) {
      console.error('[sendStripeCheckoutProvisionInvite] owner access failed:', invite.message)
      return
    }
    console.log('[sendStripeCheckoutProvisionInvite] verification code sent:', email)
  } catch (err) {
    console.error(
      '[sendStripeCheckoutProvisionInvite] error:',
      err instanceof Error ? err.message : err
    )
  }
}

interface ProvisionRetailInput {
  // Account
  accountName: string
  accountSlug: string
  accountEmail?: string  // optional; falls back to ownerEmail
  plan?: PlanTier | 'pro'  // starter, growth, enterprise; accepts legacy pro
  
  // Location
  locationName: string
  locationAddress?: string
  googleReviewUrl?: string | null
  
  // Auth
  ownerEmail: string
}

interface ProvisionRetailResult {
  success: boolean
  accountId?: string
  locationId?: string
  eventId?: string
  error?: string
  message?: string
}

interface ProvisionEventsWorkspaceInput {
  // Account
  accountName: string
  accountSlug: string
  accountEmail?: string
  plan?: PlanTier | 'pro'

  // Required event workspace location/team
  locationName: string
  locationAddress?: string

  // Optional starter event/survey defaults
  eventName?: string
  eventDescription?: string | null
  surveyName?: string
  surveyDescription?: string | null
  targetName?: string
  targetDescription?: string | null
  questions?: Array<{
    prompt: string
    helperText?: string | null
    required?: boolean
    order?: number
  }>

  // Auth
  ownerEmail: string
}

interface ProvisionEventsWorkspaceResult {
  success: boolean
  accountId?: string
  locationId?: string
  eventId?: string
  targetId?: string
  surveyId?: string
  publicLinkId?: string
  account?: unknown
  location?: unknown
  event?: unknown
  target?: unknown
  survey?: unknown
  questions?: unknown[]
  publicLink?: unknown
  error?: string
  message?: string
}

const DEFAULT_EVENT_VOICE_SURVEY_QUESTIONS = [
  {
    prompt: 'What was the most valuable part of this event?',
    helperText: 'Share the moments, sessions, or experiences that stood out.',
    order: 0,
    required: true,
  },
  {
    prompt: 'What could we improve for future events?',
    helperText: 'Tell us what would make the experience better next time.',
    order: 1,
    required: true,
  },
  {
    prompt: 'What else should the organizers know?',
    helperText: 'Add any final thoughts, ideas, or feedback.',
    order: 2,
    required: false,
  },
]

function normalizePlanTier(plan: PlanTier | 'pro' | undefined): PlanTier {
  const planRaw = (plan || 'starter').toLowerCase()
  const normalizedPlan = planRaw === 'pro' ? 'growth' : planRaw
  return ['starter', 'growth', 'enterprise'].includes(normalizedPlan)
    ? normalizedPlan as PlanTier
    : 'starter'
}

function trialEndForTier(tier: PlanTier) {
  if (tier !== 'starter') return null
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 30)
  return trialEndsAt
}

function buildKioskTokenPath(token: string) {
  return `/kiosk?token=${encodeURIComponent(token)}`
}

/**
 * Provision a complete retail setup:
 * - Create Account (RETAIL type)
 * - Create Location (with optional Google Review URL)
 * - Create Retail Kiosk Event (3 questions: quantitative, binary, open-ended)
 * - Send Supabase auth invitation to owner email
 * - Create PendingProvision record for linking on first login
 */
export async function provisionRetail(input: ProvisionRetailInput): Promise<ProvisionRetailResult> {
  try {
    console.log('[provisionRetail] Starting provision for:', input.accountSlug)
    const ownerEmail = normalizeInviteEmail(input.ownerEmail)
    const accountEmail = input.accountEmail ? normalizeInviteEmail(input.accountEmail) : ownerEmail

    // Validate input
    if (!input.accountName || !input.accountSlug || !input.locationName || !ownerEmail) {
      return {
        success: false,
        error: 'Missing required fields',
        message: 'Account name, slug, location name, and owner email are required',
      }
    }

    // Check if account slug already exists
    const existingAccount = await prisma.account.findUnique({
      where: { slug: input.accountSlug },
    })
    if (existingAccount) {
      return {
        success: false,
        error: 'Account slug already exists',
        message: `An account with slug "${input.accountSlug}" already exists`,
      }
    }

    const ownerEmailError = await validateProvisionOwnerEmail(ownerEmail)
    if (ownerEmailError) {
      return {
        success: false,
        error: 'Owner email already provisioned',
        message: ownerEmailError,
      }
    }

    // 1. Create Account
    const planRaw = (input.plan || 'starter').toLowerCase()
    const normalizedPlan = planRaw === 'pro' ? 'growth' : planRaw
    const tier = ['starter', 'growth', 'enterprise'].includes(normalizedPlan) ? normalizedPlan : 'starter'
    const trialEndsAt = tier === 'starter'
      ? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d })()
      : null

    const account = await prisma.account.create({
      data: {
        name: input.accountName,
        slug: input.accountSlug,
        accountType: AccountType.RETAIL,
        tier,
        trialEndsAt,
        email: accountEmail,
        isActive: true,
      },
    })
    console.log('[provisionRetail] Created account:', account.id)

    // 2. Create Location
    const location = await createPrimaryLocationForAccount(account.id, input.locationName, {
      address: input.locationAddress || '',
      googleReviewUrl: input.googleReviewUrl || null,
    })
    console.log('[provisionRetail] Created location:', location.id)

    // 3. Create Retail Kiosk Event in DRAFT with 3 starter questions (editable immediately)
    // Survey stays DRAFT until user manually activates it
    const defaultQuestions = [
      {
        key: 'q1_rating',
        id: 'q1_rating',
        label: 'On a scale of 1 to 5, how would you rate your experience?',
        text: 'On a scale of 1 to 5, how would you rate your experience?',
        order: 1,
        required: true,
      },
      {
        key: 'q2_well',
        id: 'q2_well',
        label: 'What did we do well?',
        text: 'What did we do well?',
        order: 2,
        required: true,
      },
      {
        key: 'q3_improve',
        id: 'q3_improve',
        label: 'What could we improve?',
        text: 'What could we improve?',
        order: 3,
        required: true,
      },
    ]

    const event = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          locationId: location.id,
          name: 'Customer Feedback Kiosk',
          description: 'Collect customer feedback and satisfaction ratings',
          eventType: EventType.KIOSK,
          status: EventStatus.DRAFT,
          isActive: true,
          startDate: null,
          questionsJson: defaultQuestions,
        },
      })

      await syncEventQuestions(tx, createdEvent.id, defaultQuestions)

      return createdEvent
    })
    console.log('[provisionRetail] Created event:', event.id)

    // 4. Reuse an existing ADMIN identity or create the first-account invite.
    try {
      const ownerAccess = await grantOrInviteProvisionOwner(account.id, ownerEmail)
      if (!ownerAccess.ok) {
        console.error('[provisionRetail] owner access failed:', ownerAccess.message)
        return {
          success: false,
          accountId: account.id,
          locationId: location.id,
          eventId: event.id,
          error: 'Verification code delivery failed',
          message: ownerAccess.message,
        }
      }
      console.log('[provisionRetail] Verification code sent:', ownerEmail)
    } catch (otpErr) {
      console.error('[provisionRetail] OTP send error:', otpErr)
      return {
        success: false,
        accountId: account.id,
        locationId: location.id,
        eventId: event.id,
        error: 'Verification code delivery failed',
        message: otpErr instanceof Error ? otpErr.message : 'Failed to send verification code',
      }
    }

    return {
      success: true,
      accountId: account.id,
      locationId: location.id,
      eventId: event.id,
      message: `Successfully provisioned retail account "${input.accountName}". A 6-digit verification code has been sent to ${ownerEmail}. Enter it on the login screen to complete account setup.`,
    }

  } catch (error) {
    console.error('[provisionRetail] Error:', error)
    return {
      success: false,
      error: 'Provision failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Provision an Events account with a starter event voice survey workspace:
 * - Create Account (EVENTS type)
 * - Create required Location/Team
 * - Create starter Event container
 * - Create SurveyTarget, Survey, Questions, and PublicSurveyLink via createEventVoiceSurvey
 * - Send Supabase auth invitation to owner email
 * - Create PendingProvision record for linking on first login
 */
export async function provisionEventsWorkspace(input: ProvisionEventsWorkspaceInput): Promise<ProvisionEventsWorkspaceResult> {
  try {
    console.log('[provisionEventsWorkspace] Starting provision for:', input.accountSlug)
    const ownerEmail = normalizeInviteEmail(input.ownerEmail)
    const accountEmail = input.accountEmail ? normalizeInviteEmail(input.accountEmail) : ownerEmail

    if (!input.accountName || !input.accountSlug || !input.locationName || !ownerEmail) {
      return {
        success: false,
        error: 'Missing required fields',
        message: 'Account name, slug, location name, and owner email are required',
      }
    }

    const eventName = input.eventName?.trim() || 'Event Voice Feedback'
    const surveyName = input.surveyName?.trim() || 'Event Voice Survey'
    const targetName = input.targetName?.trim() || eventName
    const questions =
      input.questions && input.questions.length > 0
        ? input.questions
        : DEFAULT_EVENT_VOICE_SURVEY_QUESTIONS

    if (!eventName || !surveyName || !targetName || questions.length === 0) {
      return {
        success: false,
        error: 'Missing starter survey defaults',
        message: 'Starter event name, survey name, target name, and questions are required',
      }
    }

    const existingAccount = await prisma.account.findUnique({
      where: { slug: input.accountSlug },
    })
    if (existingAccount) {
      return {
        success: false,
        error: 'Account slug already exists',
        message: `An account with slug "${input.accountSlug}" already exists`,
      }
    }

    const ownerEmailError = await validateProvisionOwnerEmail(ownerEmail)
    if (ownerEmailError) {
      return {
        success: false,
        error: 'Owner email already provisioned',
        message: ownerEmailError,
      }
    }

    const tier = normalizePlanTier(input.plan)
    const trialEndsAt = trialEndForTier(tier)

    const account = await prisma.account.create({
      data: {
        name: input.accountName,
        slug: input.accountSlug,
        accountType: AccountType.EVENTS,
        tier,
        trialEndsAt,
        email: accountEmail,
        isActive: true,
      },
    })
    console.log('[provisionEventsWorkspace] Created account:', account.id)

    const location = await createPrimaryLocationForAccount(account.id, input.locationName, {
      address: input.locationAddress || '',
      googleReviewUrl: null,
    })
    console.log('[provisionEventsWorkspace] Created location:', location.id)

    const event = await prisma.event.create({
      data: {
        locationId: location.id,
        name: eventName,
        description: input.eventDescription?.trim() || 'Starter event voice survey workspace',
        eventType: EventType.ADVANCED,
        status: EventStatus.ACTIVE,
        isActive: true,
        startDate: null,
        questionsJson: [],
      },
    })
    console.log('[provisionEventsWorkspace] Created event:', event.id)

    const voiceSurvey = await createEventVoiceSurvey({
      eventId: event.id,
      collectionPhase: CollectionPhase.DURING,
      targetCategory: SurveyTargetCategory.EVENT,
      targetName,
      targetDescription: input.targetDescription,
      surveyName,
      surveyDescription: input.surveyDescription,
      surveyStatus: EventStatus.ACTIVE,
      questions,
    })
    console.log('[provisionEventsWorkspace] Created starter voice survey:', voiceSurvey.survey.id)

    try {
      const ownerAccess = await grantOrInviteProvisionOwner(account.id, ownerEmail)
      if (!ownerAccess.ok) {
        console.error('[provisionEventsWorkspace] owner access failed:', ownerAccess.message)
        return {
          success: false,
          accountId: account.id,
          locationId: location.id,
          eventId: event.id,
          targetId: voiceSurvey.target.id,
          surveyId: voiceSurvey.survey.id,
          publicLinkId: voiceSurvey.publicLink.id,
          account,
          location,
          event,
          target: voiceSurvey.target,
          survey: voiceSurvey.survey,
          questions: voiceSurvey.questions,
          publicLink: {
            ...voiceSurvey.publicLink,
            kioskPath: buildKioskTokenPath(voiceSurvey.publicLink.token),
          },
          error: 'Verification code delivery failed',
          message: ownerAccess.message,
        }
      }
      console.log('[provisionEventsWorkspace] Verification code sent:', ownerEmail)
    } catch (otpErr) {
      console.error('[provisionEventsWorkspace] OTP send error:', otpErr)
      return {
        success: false,
        accountId: account.id,
        locationId: location.id,
        eventId: event.id,
        targetId: voiceSurvey.target.id,
        surveyId: voiceSurvey.survey.id,
        publicLinkId: voiceSurvey.publicLink.id,
        account,
        location,
        event,
        target: voiceSurvey.target,
        survey: voiceSurvey.survey,
        questions: voiceSurvey.questions,
        publicLink: {
          ...voiceSurvey.publicLink,
          kioskPath: buildKioskTokenPath(voiceSurvey.publicLink.token),
        },
        error: 'Verification code delivery failed',
        message: otpErr instanceof Error ? otpErr.message : 'Failed to send verification code',
      }
    }

    return {
      success: true,
      accountId: account.id,
      locationId: location.id,
      eventId: event.id,
      targetId: voiceSurvey.target.id,
      surveyId: voiceSurvey.survey.id,
      publicLinkId: voiceSurvey.publicLink.id,
      account,
      location,
      event,
      target: voiceSurvey.target,
      survey: voiceSurvey.survey,
      questions: voiceSurvey.questions,
      publicLink: {
        ...voiceSurvey.publicLink,
        kioskPath: buildKioskTokenPath(voiceSurvey.publicLink.token),
      },
      message: `Successfully provisioned events account "${input.accountName}". A starter event voice survey link is ready, and a 6-digit verification code has been sent to ${ownerEmail}.`,
    }
  } catch (error) {
    console.error('[provisionEventsWorkspace] Error:', error)
    return {
      success: false,
      error: 'Provision failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
