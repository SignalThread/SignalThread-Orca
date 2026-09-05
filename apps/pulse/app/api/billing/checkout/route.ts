import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { AccountType } from '@prisma/client'
import { createPrimaryLocationForAccount } from '@/lib/provisioning'
import { getAppUrl } from '@/lib/app-url'
import { getCheckoutSuccessUrl } from '@/lib/billing/checkout-success'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Generate URL-safe slug from business name (same style as provision/start) */
function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * POST /api/billing/checkout
 *
 * Creates a pending account and Stripe Checkout session for subscription.
 * Account is NOT activated here; activation happens via Stripe webhook.
 *
 * Stripe success returns to Voice-owned OTP onboarding. Cancel returns to marketing pricing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, businessName, plan, locationName } = body as {
      email?: string
      businessName?: string
      plan?: string
      locationName?: string
    }

    if (!email?.trim() || !businessName?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'email and businessName are required' },
        { status: 400 }
      )
    }

    const trimmedLocation = locationName?.trim() ?? ''
    if (!trimmedLocation) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'Location is required' },
        { status: 400 }
      )
    }

    const rawPlan = typeof plan === 'string' ? plan.trim().toLowerCase() : ''
    if (rawPlan !== 'starter' && rawPlan !== 'growth') {
      return NextResponse.json(
        { error: 'Invalid plan', message: 'plan must be "starter" or "growth"' },
        { status: 400 }
      )
    }

    const priceEnvByPlan = {
      starter: 'STRIPE_PRICE_STARTER' as const,
      growth: 'STRIPE_PRICE_GROWTH' as const,
    }
    const priceId =
      rawPlan === 'starter' ? process.env.STRIPE_PRICE_STARTER?.trim() : process.env.STRIPE_PRICE_GROWTH?.trim()
    const stripeSecret = process.env.STRIPE_SECRET_KEY

    /**
     * Public marketing site for checkout cancel only.
     * Successful checkout returns to the Voice app so auth/onboarding stays app-owned.
     */
    const marketingSiteUrl = (
      process.env.MARKETING_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_MARKETING_SITE_URL?.trim() ||
      (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : 'https://www.signalthread.ai')
    ).replace(/\/$/, '')
    const checkoutSuccessUrl = getCheckoutSuccessUrl(getAppUrl())

    if (!priceId) {
      return NextResponse.json(
        {
          error: 'Billing not configured',
          message: `${priceEnvByPlan[rawPlan]} is required`,
        },
        { status: 500 }
      )
    }

    if (!stripeSecret) {
      return NextResponse.json(
        { error: 'Billing not configured', message: 'STRIPE_SECRET_KEY is required' },
        { status: 500 }
      )
    }

    // Generate slug from business name; ensure uniqueness
    let slug = slugFromName(businessName)
    if (!slug) {
      slug = `account-${Date.now().toString(36)}`
    }
    let candidateSlug = slug
    let suffix = 0
    while (true) {
      const exists = await prisma.account.findUnique({ where: { slug: candidateSlug } })
      if (!exists) break
      candidateSlug = `${slug}-${++suffix}`
    }
    slug = candidateSlug

    // Create pending account + primary location in one transaction (matches retail provision model)
    const account = await prisma.$transaction(async (tx) => {
      const acc = await tx.account.create({
        data: {
          name: businessName.trim(),
          slug,
          accountType: AccountType.RETAIL,
          tier: rawPlan,
          email: email.trim(),
          isActive: false, // Pending until Stripe webhook confirms payment
          billingJson: {
            plan: rawPlan,
            status: 'pending',
            signupLocationName: trimmedLocation,
          } as object,
        },
      })
      await createPrimaryLocationForAccount(acc.id, trimmedLocation, undefined, tx)
      return acc
    })

    const stripe = new Stripe(stripeSecret)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email.trim(),
      success_url: checkoutSuccessUrl,
      cancel_url: `${marketingSiteUrl}/#pricing`,
      metadata: { accountId: account.id },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[POST /api/billing/checkout] Error:', error)
    return NextResponse.json(
      {
        error: 'Checkout failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
