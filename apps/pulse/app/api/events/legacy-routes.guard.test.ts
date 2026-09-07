import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Source guard: ensures the legacy eventId routes keep their boundary banner
 * (so future contributors do not build new EVENTS product features on them or
 * treat Event/eventId as EVENTS product mode) AND keep the organizer access
 * guard introduced by the Pulse access-boundary hardening.
 */

const ORGANIZER_ONLY_LEGACY_ROUTES = [
  'app/api/events/[eventId]/questions/route.ts',
  'app/api/events/[eventId]/responses/route.ts',
  'app/api/events/[eventId]/answers/route.ts',
  'app/api/events/[eventId]/analysis/route.ts',
  'app/api/events/[eventId]/analysis/recompute/route.ts',
]

const DUAL_MODE_RESPONSE_ROUTE = 'app/api/events/[eventId]/responses/[responseId]/route.ts'

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('legacy event route source guards', () => {
  it.each([...ORGANIZER_ONLY_LEGACY_ROUTES, DUAL_MODE_RESPONSE_ROUTE])('keeps the legacy boundary banner in %s', (relativePath) => {
    const source = read(relativePath)
    expect(source).toContain('LEGACY ROUTE — NOT THE EVENTS PRODUCT SOURCE OF TRUTH')
    expect(source).not.toContain('LEGACY PUBLIC ROUTE')
    expect(source).toContain('Account.accountType === "EVENTS"')
    expect(source).toContain('docs/event-mode/LEGACY_EVENT_ROUTES.md')
  })

  it.each(ORGANIZER_ONLY_LEGACY_ROUTES)('%s is organizer-authenticated and not part of the kiosk runtime', (relativePath) => {
    const source = read(relativePath)
    expect(source).toContain("from '@/lib/auth/require-legacy-event-reporting-access'")
    expect(source).toContain('const access = await requireLegacyEventReportingAccess(eventId)')
    expect(source).toContain('if (!access.ok) return access.response')
    expect(source).toContain('NOT used by the kiosk runtime')
  })

  it('serves the response poll in two modes: organizer full payload, attendee scoped summary', () => {
    const source = read(DUAL_MODE_RESPONSE_ROUTE)
    expect(source).toContain("from '@/lib/auth/require-legacy-event-reporting-access'")
    expect(source).toContain("from '@/lib/legacy-response-summary'")
    expect(source).toContain('if (!access.ok) {')
    expect(source).toContain('isAttendeeSummaryWindowOpen(response)')
    expect(source).toContain('buildAttendeeSummaryPayload(response)')
    // The attendee branch must be decided before the full payload is formatted.
    expect(source.indexOf('buildAttendeeSummaryPayload(response)')).toBeLessThan(source.indexOf('const formattedAnswers'))
  })

  it('documents legacy ownership and the EVENTS boundary', () => {
    const docs = read('docs/event-mode/LEGACY_EVENT_ROUTES.md')
    expect(docs).toContain('Account.accountType === "EVENTS"')
    expect(docs).toContain('/api/app/events/*')
    expect(docs).toContain('The kiosk pipeline must remain independent of these routes.')
    expect(docs).toContain('requireLegacyEventReportingAccess')
  })
})
