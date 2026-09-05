import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { getBillingPortalReturnBaseUrl } from '@/lib/app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** JSON/Prisma may round-trip booleans inconsistently; Stripe fields are source of truth when present. */
function readBillingJsonBoolean(v: unknown): boolean | null {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return null
}

/** Active/trialing with a future end-of-access date: cancel at period end, or Stripe persisted cancel_at without cancel_at_period_end. */
function scheduledCancellationAtIso(params: {
  subscriptionStatus: string | null
  billingStatus: string | null
  cancelAtPeriodEnd: boolean | null
  cancelAt: string | null
  currentPeriodEnd: string | null
}): string | null {
  const status = (params.subscriptionStatus ?? params.billingStatus ?? '').toLowerCase()
  if (status !== 'active' && status !== 'trialing') return null

  const now = Date.now()

  if (params.cancelAtPeriodEnd === true) {
    const iso = params.cancelAt ?? params.currentPeriodEnd
    if (!iso) return null
    const t = new Date(iso).getTime()
    if (Number.isNaN(t) || t <= now) return null
    return iso
  }

  if (params.cancelAt) {
    const t = new Date(params.cancelAt).getTime()
    if (!Number.isNaN(t) && t > now) return params.cancelAt
  }

  return null
}

/**
 * GET /api/app/account/billing?account=<slug>
 * Account members only. Returns plan tier, stored billing fields, and renewal when subscription can be read from Stripe.
 */
export async function GET(request: NextRequest) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    const auth = await requireAccountMembership(accountSlug)
    if (!auth.ok) return auth.response

    const { account } = auth
    const billing = (account.billingJson as Record<string, unknown> | null) ?? {}

    const subscriptionStatusFromDb =
      typeof billing.subscriptionStatus === 'string' ? billing.subscriptionStatus : null
    const billingStatusFromDb = typeof billing.status === 'string' ? billing.status : null
    const cancelAtFromDb = typeof billing.cancelAt === 'string' ? billing.cancelAt : null
    const cancelAtPeriodEndFromDb = readBillingJsonBoolean(billing.cancelAtPeriodEnd)
    const currentPeriodEndFromDb =
      typeof billing.currentPeriodEnd === 'string' ? billing.currentPeriodEnd : null

    let currentPeriodEnd: string | null = currentPeriodEndFromDb
    let cancelAtPeriodEnd: boolean | null = cancelAtPeriodEndFromDb
    let cancelAt: string | null = cancelAtFromDb
    let subscriptionStatusLive: string | null = null

    const stripeSecret = process.env.STRIPE_SECRET_KEY
    if (stripeSecret && account.stripeSubscriptionId) {
      try {
        const stripe = new Stripe(stripeSecret)
        const sub = await stripe.subscriptions.retrieve(account.stripeSubscriptionId, {
          expand: ['items.data'],
        })
        const periodEndSec = sub.items?.data?.[0]?.current_period_end
        if (typeof periodEndSec === 'number') {
          currentPeriodEnd = new Date(periodEndSec * 1000).toISOString()
        }
        cancelAtPeriodEnd = sub.cancel_at_period_end
        subscriptionStatusLive = sub.status
        if (typeof sub.cancel_at === 'number') {
          cancelAt = new Date(sub.cancel_at * 1000).toISOString()
        } else if (sub.cancel_at_period_end === true && currentPeriodEnd) {
          cancelAt = currentPeriodEnd
        } else {
          cancelAt = null
        }
      } catch (e) {
        console.warn('[GET /api/app/account/billing] subscription retrieve failed', e)
      }
    }

    const cancelAtPeriodEndOut: boolean | null =
      cancelAtPeriodEnd === true ? true : cancelAtPeriodEnd === false ? false : null

    const subscriptionStatusResolved = subscriptionStatusLive ?? subscriptionStatusFromDb
    const scheduledCancellationAt = scheduledCancellationAtIso({
      subscriptionStatus: subscriptionStatusResolved,
      billingStatus: billingStatusFromDb,
      cancelAtPeriodEnd: cancelAtPeriodEndOut,
      cancelAt,
      currentPeriodEnd,
    })

    return NextResponse.json({
      success: true,
      billing: {
        planTier: (() => {
          const tier = (account.tier || 'starter').toLowerCase()
          if (tier === 'pro') return 'growth'
          if (tier === 'free') return 'starter'
          return tier
        })(),
        trialEndsAt: account.trialEndsAt?.toISOString() ?? null,
        subscriptionStatus: subscriptionStatusResolved,
        billingStatus: billingStatusFromDb,
        currentPeriodEnd,
        cancelAt,
        cancelAtPeriodEnd: cancelAtPeriodEndOut,
        scheduledCancellationAt,
        stripeCustomerId: account.stripeCustomerId,
        stripeSubscriptionId: account.stripeSubscriptionId,
        billingMetadata: billing,
      },
    })
  } catch (error) {
    console.error('[GET /api/app/account/billing]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load billing' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/app/account/billing?account=<slug>
 * Creates a Stripe Customer Portal session. Account members only.
 */
export async function POST(request: NextRequest) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    const auth = await requireAccountMembership(accountSlug)
    if (!auth.ok) return auth.response

    const { account } = auth
    if (!account.stripeCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No Stripe customer is linked to this account yet. Complete subscription setup or contact support.',
        },
        { status: 400 }
      )
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY
    if (!stripeSecret) {
      return NextResponse.json(
        { success: false, error: 'Billing is not configured' },
        { status: 500 }
      )
    }

    const stripe = new Stripe(stripeSecret)
    const base = getBillingPortalReturnBaseUrl(request)
    const returnUrl = `${base}/app/settings/profile?account=${encodeURIComponent(account.slug)}`

    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: returnUrl,
    })

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: 'Could not create billing session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, url: session.url })
  } catch (error) {
    console.error('[POST /api/app/account/billing]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to open billing portal' },
      { status: 500 }
    )
  }
}
