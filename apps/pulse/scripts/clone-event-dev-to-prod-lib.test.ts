import { describe, expect, it } from 'vitest'
import {
  EXPECTED_TARGET_PROJECT,
  SOURCE_EVENT_ID,
  deterministicCloneId,
  lifecycleResponseCounts,
  parseCloneOptions,
  projectRefFromDatabaseUrl,
  rewriteJsonIds,
} from './clone-event-dev-to-prod-lib'

describe('DEV to PROD event clone safety helpers', () => {
  it('defaults to dry-run and requires two explicit environment files', () => {
    expect(
      parseCloneOptions(['--source-env=.env.local', '--target-env=.env.prod.disable']),
    ).toMatchObject({ apply: false, confirmTargetProject: null })
    expect(() => parseCloneOptions([])).toThrow(/source-env/)
    expect(() =>
      parseCloneOptions(['--source-env=.env.local', '--target-env=.env.local']),
    ).toThrow(/must be different/)
  })

  it('requires an exact production-project confirmation for apply mode', () => {
    const base = ['--source-env=.env.local', '--target-env=.env.prod.disable', '--apply']
    expect(() => parseCloneOptions(base)).toThrow(/confirm-target-project/)
    expect(() => parseCloneOptions([...base, '--confirm-target-project=wrong'])).toThrow(
      /confirm-target-project/,
    )
    expect(
      parseCloneOptions([
        ...base,
        `--confirm-target-project=${EXPECTED_TARGET_PROJECT}`,
      ]).apply,
    ).toBe(true)
  })

  it('resolves and validates a single Supabase project identity', () => {
    expect(
      projectRefFromDatabaseUrl(
        'postgresql://postgres.xcveazzoavnizefbcjfg:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      ),
    ).toBe('xcveazzoavnizefbcjfg')
    expect(() => projectRefFromDatabaseUrl('postgresql://user:secret@localhost/db')).toThrow(
      /positively resolve/,
    )
  })

  it('uses deterministic target IDs that never raw-copy the source ID', () => {
    const first = deterministicCloneId('event', SOURCE_EVENT_ID)
    expect(first).toBe(deterministicCloneId('event', SOURCE_EVENT_ID))
    expect(first).not.toBe(SOURCE_EVENT_ID)
    expect(first).not.toContain(SOURCE_EVENT_ID)
  })

  it('recursively rewrites exact IDs without modifying ordinary content', () => {
    const mapped = rewriteJsonIds(
      { eventId: 'source-event', nested: ['source-user', 'keep me'] },
      new Map([
        ['source-event', 'target-event'],
        ['source-user', 'target-user'],
      ]),
    )
    expect(mapped).toEqual({
      eventId: 'target-event',
      nested: ['target-user', 'keep me'],
    })
  })

  it('validates POST as DURING plus POST without changing stored phases', () => {
    const counts = lifecycleResponseCounts([
      { collectionPhase: 'PRE', status: 'COMPLETED' },
      { collectionPhase: 'DURING', status: 'COMPLETED' },
      { collectionPhase: 'DURING', status: 'COMPLETED' },
      { collectionPhase: 'POST', status: 'COMPLETED' },
      { collectionPhase: null, status: 'IN_PROGRESS' },
    ])
    expect(counts).toEqual({
      pre: 1,
      during: 2,
      postOnly: 1,
      postDashboard: 3,
      nullPhase: 1,
      total: 5,
    })
  })
})
