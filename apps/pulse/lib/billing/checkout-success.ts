import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

export type CheckoutSuccessContext =
  | {
      ok: true
      email: string
      accountName: string
    }
  | {
      ok: false
      reason: 'missing_session' | 'billing_unconfigured' | 'invalid_session' | 'missing_account'
      message: string
    }

export function getCheckoutSuccessUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/signup/success?session_id={CHECKOUT_SESSION_ID}`
}

export async function getCheckoutSuccessContext(sessionId: string | null | undefined): Promise<CheckoutSuccessContext> {
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!normalizedSessionId) {
    return {
      ok: false,
      reason: 'missing_session',
      message: 'Checkout session is missing. Open SignalThread to continue.',
    }
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!stripeSecret) {
    return {
      ok: false,
      reason: 'billing_unconfigured',
      message: 'Checkout verification is not configured. Open SignalThread to continue.',
    }
  }

  try {
    const stripe = new Stripe(stripeSecret)
    const session = await stripe.checkout.sessions.retrieve(normalizedSessionId)
    if (session.status !== 'complete') {
      return {
        ok: false,
        reason: 'invalid_session',
        message: 'Checkout is not complete yet. Open SignalThread to continue.',
      }
    }

    const accountId = session.metadata?.accountId?.trim()
    if (!accountId) {
      return {
        ok: false,
        reason: 'invalid_session',
        message: 'This checkout session is missing account context. Open SignalThread to continue.',
      }
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true, name: true },
    })

    const email = account?.email?.trim().toLowerCase()
    if (!account || !email) {
      return {
        ok: false,
        reason: 'missing_account',
        message: 'We could not find the account for this checkout session. Open SignalThread to continue.',
      }
    }

    return {
      ok: true,
      email,
      accountName: account.name,
    }
  } catch (error) {
    console.error('[checkout-success] failed to resolve checkout session:', error)
    return {
      ok: false,
      reason: 'invalid_session',
      message: 'We could not verify this checkout session. Open SignalThread to continue.',
    }
  }
}
