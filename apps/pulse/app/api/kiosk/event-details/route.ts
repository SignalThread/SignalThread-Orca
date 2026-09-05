import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolvePublicSurveyLaunchContext, type PublicSurveyLaunchContext } from '@/lib/event'
import { normalizeConsentBulletStyle } from '@/lib/consent-bullet-style'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/kiosk/event-details?eventId=xxx
 * GET /api/kiosk/event-details?token=xxx
 * 
 * Returns event details including account type and location Google review URL
 * Used by kiosk completion screen for retail-only features
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')?.trim() || ''
    const token = searchParams.get('token')?.trim() || ''

    if (Boolean(eventId) === Boolean(token)) {
      return NextResponse.json(
        { success: false, error: 'Provide exactly one of eventId or token' },
        { status: 400 }
      )
    }

    const eventSelect = {
      id: true,
      name: true,
      eventType: true,
      responseMode: true,
      location: {
        select: {
          id: true,
          name: true,
          googleReviewUrl: true,
          account: {
            select: {
              id: true,
              accountType: true,
              settingsJson: true,
            },
          },
        },
      },
    } satisfies Prisma.EventSelect

    type KioskEventDetails = Prisma.EventGetPayload<{ select: typeof eventSelect }>

    let surveyContext:
      | {
          surveyId: string
          surveyTargetId: string
          publicSurveyLinkId: string
          responseMode: string
          presentationMode: string
          surveyIntro: string | null
          targetContext: { category: string; name: string; kind: string | null } | null
          speakerContext: { speaker: { id: string; name: string } } | null
          sessionContext: { session: { id: string; name: string }; speakers: Array<{ id: string; name: string }> } | null
        }
      | null = null

    let event: KioskEventDetails | PublicSurveyLaunchContext['event'] | null = null

    if (eventId) {
      event = await prisma.event.findUnique({
        where: { id: eventId },
        select: eventSelect,
      })
    } else {
      try {
        const launchContext = await resolvePublicSurveyLaunchContext(token)
        surveyContext = {
          surveyId: launchContext.survey.id,
          surveyTargetId: launchContext.target.id,
          publicSurveyLinkId: launchContext.publicLink.id,
          responseMode: launchContext.survey.responseMode,
          presentationMode: launchContext.survey.presentationMode,
          surveyIntro: launchContext.survey.description?.trim() || null,
          targetContext: launchContext.target.name ? {
            category: launchContext.target.category,
            name: launchContext.target.eventStructureItem?.name || launchContext.target.name,
            kind: launchContext.target.eventStructureItem?.kind || null,
          } : null,
          speakerContext: launchContext.speakerContext,
          sessionContext: launchContext.sessionContext,
        }

        event = launchContext.event
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resolve public survey link'
        const status = message.includes('not found') ? 404 : 400
        return NextResponse.json(
          { success: false, error: message },
          { status },
        )
      }
    }

    if (!event) {
      return NextResponse.json(
        { success: false, error: token ? 'Public survey link not found' : 'Event not found' },
        { status: 404 }
      )
    }

    const settings = (event.location.account.settingsJson as Record<string, unknown>) || {}
    const branding = (settings.branding as Record<string, unknown>) || {}
    const consent = (settings.consent as Record<string, unknown>) || {}

    const defaultConsent = {
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

    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        name: event.name,
        eventType: event.eventType,
        responseMode: surveyContext?.responseMode ?? event.responseMode,
        presentationMode: surveyContext?.presentationMode ?? 'READ_ALOUD',
        ...(surveyContext
          ? {
              surveyId: surveyContext.surveyId,
              surveyTargetId: surveyContext.surveyTargetId,
              publicSurveyLinkId: surveyContext.publicSurveyLinkId,
              surveyIntro: surveyContext.surveyIntro,
              targetContext: surveyContext.targetContext,
              speakerContext: surveyContext.speakerContext,
              sessionContext: surveyContext.sessionContext,
            }
          : {}),
        accountType: event.location.account.accountType,
        location: {
          id: event.location.id,
          name: event.location.name,
          googleReviewUrl: event.location.googleReviewUrl,
        },
        branding: {
          logoUrl: (branding.logoUrl as string) || null,
          primaryColor: (branding.primaryColor as string) || null,
          primaryButtonColor: (branding.primaryButtonColor as string) || null,
        },
        consent: {
          title: (consent.title as string) || defaultConsent.title,
          subtitle: (consent.subtitle as string) || defaultConsent.subtitle,
          items: Array.isArray(consent.items) ? consent.items : defaultConsent.items,
          buttonText: (consent.buttonText as string) || defaultConsent.buttonText,
          bulletStyle: normalizeConsentBulletStyle(consent.bulletStyle),
        },
      },
    })
  } catch (error) {
    console.error('[API] /api/kiosk/event-details error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch event details'
    const status =
      message.includes('inactive') || message.includes('expired') || message.includes('launchable')
        ? 400
        : 500

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    )
  }
}
