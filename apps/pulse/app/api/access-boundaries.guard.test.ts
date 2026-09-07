import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Source guard for the Pulse route access-boundary matrix
 * (docs/PULSE_ACCESS_BOUNDARIES.md). It keeps two things honest at once:
 * organizer-only routes must keep their guard, and intentionally public
 * attendee capabilities must NOT grow an organizer session requirement, so
 * distributed QR codes and kiosk builds keep working.
 */

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const ORGANIZER_GUARD_IMPORTS = [
  "@/lib/auth/require-account-membership",
  "@/lib/auth/require-account-admin",
  "@/lib/auth/require-events-event-access",
  "@/lib/auth/require-super-admin",
  "@/lib/auth/require-legacy-event-reporting-access",
  "@/lib/auth/require-authenticated-user",
  "@/lib/supabase/server",
]

/** Attendee/kiosk capabilities that must stay reachable without organizer login. */
const PUBLIC_ATTENDEE_ROUTES = [
  'app/api/response/create/route.ts',
  'app/api/response/[responseId]/complete/route.ts',
  'app/api/kiosk/event-details/route.ts',
  'app/api/answer/presign/route.ts',
  'app/api/answer/complete/route.ts',
  'app/api/answer/confirm/route.ts',
  'app/api/answer/text/route.ts',
  'app/api/answer/structured/route.ts',
  'app/api/tts/route.ts',
  'app/api/app/logo/route.ts',
]

const ORGANIZER_ROUTES: Array<[string, string]> = [
  ['app/api/app/account/logo-presign/route.ts', "from '@/lib/auth/require-account-membership'"],
  ['app/api/app/account/logo-upload/route.ts', "from '@/lib/auth/require-account-membership'"],
  ['app/api/app/insights/[insightId]/drilldown/route.ts', "from '@/lib/auth/require-account-membership'"],
  ['app/api/ai/generate-questions/route.ts', "from '@/lib/auth/require-authenticated-user'"],
  ['app/api/events/[eventId]/questions/route.ts', "from '@/lib/auth/require-legacy-event-reporting-access'"],
  ['app/api/events/[eventId]/responses/route.ts', "from '@/lib/auth/require-legacy-event-reporting-access'"],
  ['app/api/events/[eventId]/answers/route.ts', "from '@/lib/auth/require-legacy-event-reporting-access'"],
  ['app/api/events/[eventId]/analysis/route.ts', "from '@/lib/auth/require-legacy-event-reporting-access'"],
  ['app/api/events/[eventId]/analysis/recompute/route.ts', "from '@/lib/auth/require-legacy-event-reporting-access'"],
  ['app/api/events/[eventId]/responses/[responseId]/route.ts', "from '@/lib/auth/require-legacy-event-reporting-access'"],
]

describe('Pulse route access boundaries', () => {
  it.each(PUBLIC_ATTENDEE_ROUTES)('%s remains an attendee capability without an organizer session', (relativePath) => {
    const source = read(relativePath)
    for (const guard of ORGANIZER_GUARD_IMPORTS) {
      expect(source, `${relativePath} must not import ${guard}`).not.toContain(guard)
    }
  })

  it.each(ORGANIZER_ROUTES)('%s keeps its organizer guard', (relativePath, guardImport) => {
    expect(read(relativePath)).toContain(guardImport)
  })

  it('scopes the public branding proxy to branding keys only', () => {
    const source = read('app/api/app/logo/route.ts')
    expect(source).toContain('isServableBrandingLogoKey(key)')
    expect(read('lib/branding-logo-key.ts')).toMatch(/\^branding\\\//)
  })

  it('scopes public fallback TTS to a real response question instead of free text', () => {
    const source = read('app/api/tts/route.ts')
    expect(source).toContain('resolveAnswerQuestionContext')
    expect(source).toContain('spokenTexts.includes(text)')
    expect(source).toContain('responseId: z.string().cuid()')
  })

  it('keeps the Stripe webhook a signature-verified provider callback', () => {
    const source = read('app/api/webhooks/stripe/route.ts')
    expect(source).toContain('stripe.webhooks.constructEvent(body, signature, webhookSecret)')
    expect(source).toContain("request.headers.get('stripe-signature')")
  })

  it('documents the boundary matrix', () => {
    const docs = read('docs/PULSE_ACCESS_BOUNDARIES.md')
    for (const relativePath of [...PUBLIC_ATTENDEE_ROUTES, ...ORGANIZER_ROUTES.map(([file]) => file)]) {
      const route = '/' + relativePath.replace(/^app\//, '').replace(/\/route\.ts$/, '')
      expect(docs, `${route} must be listed in docs/PULSE_ACCESS_BOUNDARIES.md`).toContain(route)
    }
  })
})
