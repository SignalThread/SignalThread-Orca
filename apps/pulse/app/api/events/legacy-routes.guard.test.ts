import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Source guard: ensures the legacy public eventId routes keep their boundary
 * banner so future contributors do not build new EVENTS product features on
 * them or treat Event/eventId as EVENTS product mode. Documentation-only — this
 * does not exercise or change runtime behavior.
 */

const LEGACY_ROUTE_FILES = [
  'app/api/events/[eventId]/questions/route.ts',
  'app/api/events/[eventId]/responses/route.ts',
  'app/api/events/[eventId]/responses/[responseId]/route.ts',
  'app/api/events/[eventId]/answers/route.ts',
  'app/api/events/[eventId]/analysis/route.ts',
  'app/api/events/[eventId]/analysis/recompute/route.ts',
]

describe('legacy event route source guards', () => {
  it.each(LEGACY_ROUTE_FILES)('keeps the legacy boundary banner in %s', (relativePath) => {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    expect(source).toContain('LEGACY PUBLIC ROUTE — NOT THE EVENTS PRODUCT SOURCE OF TRUTH')
    expect(source).toContain('Account.accountType === "EVENTS"')
    expect(source).toContain('NOT used by the kiosk runtime')
    expect(source).toContain('docs/event-mode/LEGACY_EVENT_ROUTES.md')
  })

  it('documents legacy ownership and the EVENTS boundary', () => {
    const docs = fs.readFileSync(
      path.join(process.cwd(), 'docs/event-mode/LEGACY_EVENT_ROUTES.md'),
      'utf8',
    )
    expect(docs).toContain('Account.accountType === "EVENTS"')
    expect(docs).toContain('/api/app/events/*')
    expect(docs).toContain('The kiosk pipeline must remain independent of these routes.')
  })
})
