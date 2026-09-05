import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { isConsentBulletStyle, normalizeConsentBulletStyle } from '@/lib/consent-bullet-style'
import { isAttendeeExperienceConfigured } from '@/lib/events-setup-readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_CONSENT = {
  title: "SignalThread",
  subtitle: "We'd love to hear from you",
  items: [
    "Answer a few questions by voice",
    "Takes just a few minutes",
    "We'll ask for microphone access",
    "Your responses stay anonymous",
  ],
  buttonText: "I Agree, Let's Start",
}

/**
 * GET /api/app/account/settings?account=<slug>
 * Returns branding and consent settings from Account.settingsJson
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')
    const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
    if (!membership.ok) return membership.response

    const account = await prisma.account.findUnique({
      where: { id: membership.account.id },
      select: {
        settingsJson: true,
        name: true,
        accountType: true,
        locations: {
          take: 1,
          orderBy: { name: 'asc' },
          select: { name: true },
        },
      },
    })
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    const settings = (account.settingsJson as Record<string, unknown>) || {}
    const businessName = account.locations?.[0]?.name ?? account.name
    const branding = (settings.branding as Record<string, unknown>) || {}
    const consent = (settings.consent as Record<string, unknown>) || {}
    const consentConfigured = isAttendeeExperienceConfigured({
      title: typeof consent.title === 'string' ? consent.title : undefined,
      buttonText: typeof consent.buttonText === 'string' ? consent.buttonText : undefined,
      items: Array.isArray(consent.items) ? consent.items.filter((item): item is string => typeof item === 'string') : undefined,
    })

    return NextResponse.json({
      success: true,
      account: {
        accountType: account.accountType,
      },
      settings: {
        // The resolved payload below includes safe kiosk defaults. Expose this
        // separately so setup surfaces can distinguish saved consent from a
        // fallback UI without inventing another readiness flag.
        consentConfigured,
        businessName,
        branding: {
          logoUrl: (branding.logoUrl as string) || (branding.logo as string) || null,
          primaryColor: (branding.primaryColor as string) || null,
          primaryButtonColor: (branding.primaryButtonColor as string) || null,
        },
        consent: {
          title: (() => {
            const t = (consent.title as string) || DEFAULT_CONSENT.title
            return t === 'Share your thoughts' ? 'SignalThread' : t
          })(),
          subtitle: (consent.subtitle as string) || DEFAULT_CONSENT.subtitle,
          items: Array.isArray(consent.items) ? consent.items : DEFAULT_CONSENT.items,
          buttonText: (consent.buttonText as string) || DEFAULT_CONSENT.buttonText,
          bulletStyle: normalizeConsentBulletStyle(consent.bulletStyle),
        },
      },
    })
  } catch (error) {
    console.error('[API] account/settings GET error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load settings' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/app/account/settings?account=<slug>
 * Updates branding and/or consent in Account.settingsJson
 */
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')
    const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
    if (!membership.ok) return membership.response

    const account = await prisma.account.findUnique({
      where: { id: membership.account.id },
      select: { id: true, settingsJson: true },
    })
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const branding = body.branding
    const consent = body.consent

    const existing = ((account.settingsJson as Record<string, unknown>) || {}) as Record<string, unknown>
    const existingBranding = ((existing.branding as Record<string, unknown>) || {}) as Record<string, unknown>
    const existingConsent = ((existing.consent as Record<string, unknown>) || {}) as Record<string, unknown>

    if (branding && typeof branding === 'object') {
      if (branding.logoUrl !== undefined) existingBranding.logoUrl = branding.logoUrl
      if (branding.primaryColor !== undefined) existingBranding.primaryColor = branding.primaryColor
      if (branding.primaryButtonColor !== undefined) existingBranding.primaryButtonColor = branding.primaryButtonColor
      existing.branding = existingBranding
    }
    if (consent && typeof consent === 'object') {
      if (consent.bulletStyle !== undefined && !isConsentBulletStyle(consent.bulletStyle)) {
        return NextResponse.json({ success: false, error: 'Invalid consent bullet style' }, { status: 400 })
      }
      if (consent.title !== undefined) existingConsent.title = consent.title
      if (consent.subtitle !== undefined) existingConsent.subtitle = consent.subtitle
      if (Array.isArray(consent.items)) existingConsent.items = consent.items
      if (consent.buttonText !== undefined) existingConsent.buttonText = consent.buttonText
      if (consent.bulletStyle !== undefined) existingConsent.bulletStyle = consent.bulletStyle
      existing.consent = existingConsent
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { settingsJson: existing as object },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] account/settings PATCH error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save settings' },
      { status: 500 }
    )
  }
}
