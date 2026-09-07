import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventPostEventFollowThrough.tsx'), 'utf8')

describe('EventPostEventFollowThrough', () => {
  it('uses canonical action records for the three post-event groups', () => {
    expect(source).toContain('export interface PostEventFollowThroughAction')
    expect(source).toContain("actions.filter((action) => !['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(action.status))")
    expect(source).toContain("action.classification === 'AFTER_EVENT_FOLLOW_UP'")
    for (const label of ['Still open', 'Awaiting an owner', 'Scheduled after the event']) expect(source).toContain(label)
    expect(source).toContain('ownerStatus(action)')
    expect(source).toContain('initials(action.owner)')
    expect(source).toContain('No work in this group.')
  })

  it('does not include a navigation CTA because it renders inside Actions', () => {
    expect(source).not.toContain('Open the Actions workspace')
    expect(source).not.toContain('href=')
  })
})
