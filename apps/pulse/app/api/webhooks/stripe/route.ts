import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { createPrimaryLocationForAccount, sendStripeCheckoutProvisionInvite } from '@/lib/provisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Prefer customer id; fall back to subscription id when the account row is missing or mismatched stripeCustomerId. */
async function findAccountByStripeCustomerOrSubscription(
  customerId: string | null | undefined,
  subscriptionId: string,
) {
  if (customerId) {
    const byCustomer = await prisma.account.findFirst({
      where: { stripeCustomerId: customerId },
    })
    if (byCustomer) return byCustomer
  }
  return prisma.account.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  })
}

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler. Verifies signature and processes billing events.
 * Requires raw body - do not parse before calling constructEvent.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhooks/stripe] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let body: string
  try {
    body = await request.text()
  } catch (e) {
    console.error('[webhooks/stripe] Failed to read body:', e)
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[webhooks/stripe] Signature verification failed:', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const accountId = session.metadata?.accountId
        const customerId = session.customer as string | null
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null

        if (!accountId) {
          console.warn('[webhooks/stripe] checkout.session.completed missing accountId metadata')
          return NextResponse.json({ received: true })
        }

        const accountRow = await prisma.account.findUnique({ where: { id: accountId } })
        if (!accountRow) {
          console.warn('[webhooks/stripe] checkout.session.completed unknown accountId:', accountId)
          return NextResponse.json({ received: true })
        }

        const billing = (accountRow.billingJson as Record<string, unknown> | null) ?? {}
        const signupLocationName =
          typeof billing.signupLocationName === 'string' ? billing.signupLocationName.trim() : ''

        await prisma.account.update({
          where: { id: accountId },
          data: {
            isActive: true,
            stripeCustomerId: customerId || undefined,
            stripeSubscriptionId: subscriptionId || undefined,
            billingJson: {
              ...billing,
              status: 'active',
              stripeCustomerId: customerId,
              subscriptionId: subscriptionId,
            } as object,
          },
        })

        const locCount = await prisma.location.count({ where: { accountId } })
        if (locCount === 0) {
          try {
            await createPrimaryLocationForAccount(accountId, signupLocationName || accountRow.name)
          } catch (e) {
            console.error('[webhooks/stripe] Failed to backfill primary location:', e)
          }
        }

        await sendStripeCheckoutProvisionInvite(accountId, accountRow.email)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
        const subscriptionId = subscription.id
        if (!subscriptionId) {
          console.warn('[webhooks/stripe] subscription.updated missing subscription id')
          return NextResponse.json({ received: true })
        }

        const account = await findAccountByStripeCustomerOrSubscription(customerId, subscriptionId)
        if (!account) {
          console.warn(
            '[webhooks/stripe] subscription.updated no account for customer:',
            customerId,
            'subscription:',
            subscriptionId,
          )
          return NextResponse.json({ received: true })
        }

        const stripeSdk = new Stripe(process.env.STRIPE_SECRET_KEY!)
        let sub = subscription
        try {
          sub = await stripeSdk.subscriptions.retrieve(subscription.id, {
            expand: ['items.data'],
          })
        } catch (e) {
          console.warn('[webhooks/stripe] subscription.updated retrieve failed; using event payload', e)
        }

        const subscriptionStatus = sub.status
        const billing = (account.billingJson as Record<string, unknown>) ?? {}
        const firstItem = sub.items?.data?.[0]
        const periodEndSec = firstItem?.current_period_end
        const currentPeriodEndIso =
          typeof periodEndSec === 'number' ? new Date(periodEndSec * 1000).toISOString() : null
        let cancelAtIso: string | null =
          typeof sub.cancel_at === 'number' ? new Date(sub.cancel_at * 1000).toISOString() : null
        if (sub.cancel_at_period_end === true && !cancelAtIso && currentPeriodEndIso) {
          cancelAtIso = currentPeriodEndIso
        }

        await prisma.account.update({
          where: { id: account.id },
          data: {
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            stripeSubscriptionId: sub.id,
            billingJson: {
              ...billing,
              subscriptionStatus,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              cancelAt: cancelAtIso,
              currentPeriodEnd: currentPeriodEndIso,
            } as object,
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
        const subscriptionId = subscription.id
        if (!subscriptionId) {
          console.warn('[webhooks/stripe] subscription.deleted missing subscription id')
          return NextResponse.json({ received: true })
        }

        const account = await findAccountByStripeCustomerOrSubscription(customerId, subscriptionId)
        if (!account) {
          console.warn(
            '[webhooks/stripe] subscription.deleted no account for customer:',
            customerId,
            'subscription:',
            subscriptionId,
          )
          return NextResponse.json({ received: true })
        }

        const billing = (account.billingJson as Record<string, unknown>) ?? {}
        await prisma.account.update({
          where: { id: account.id },
          data: {
            isActive: false,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            billingJson: {
              ...billing,
              status: 'canceled',
              subscriptionStatus: 'canceled',
            } as object,
          },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) {
          console.warn('[webhooks/stripe] invoice.payment_failed missing customer')
          return NextResponse.json({ received: true })
        }

        const account = await prisma.account.findFirst({
          where: { stripeCustomerId: customerId },
        })
        if (!account) {
          console.warn('[webhooks/stripe] invoice.payment_failed no account for customer:', customerId)
          return NextResponse.json({ received: true })
        }

        const billing = (account.billingJson as Record<string, unknown>) ?? {}
        await prisma.account.update({
          where: { id: account.id },
          data: {
            isActive: false,
            billingJson: {
              ...billing,
              status: 'past_due',
            } as object,
          },
        })
        break
      }

      default:
        // Unhandled event type - acknowledge
        break
    }
  } catch (err) {
    console.error('[webhooks/stripe] Error processing event:', event.type, err)
    return NextResponse.json(
      { error: 'Webhook handler failed', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
