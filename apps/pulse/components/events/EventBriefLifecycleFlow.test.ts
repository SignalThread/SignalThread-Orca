import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const action = read('components/events/EventBriefAction.tsx')
const pre = read('components/events/EventPreEventSignals.tsx')
const during = read('components/events/EventInEventOverview.tsx')
const post = read('components/events/EventPostEventClosingBrief.tsx')
const documentPage = read('app/app/events/[eventId]/brief/page.tsx')
const document = read('components/events/EventClosingBriefDocument.tsx')

describe('Event Brief lifecycle flows', () => {
  it('wires PRE, DURING, and POST buttons to their explicit lifecycle', () => {
    expect(pre).toContain('lifecyclePhase="PRE_EVENT"')
    expect(during).toContain('lifecyclePhase="IN_EVENT"')
    expect(post).toContain('lifecyclePhase="POST_EVENT"')
  })

  it('switches from Generate to View and refreshes the version after generation', () => {
    expect(action).toContain("? 'View brief'")
    expect(action).toContain(": 'Generate brief'")
    expect(action).toContain('setBriefHash(generatedHash)')
    expect(action).toContain("&mode=generate")
    expect(documentPage).toContain("regenerate: '1'")
    expect(document).toContain('Regenerate brief')
  })

  it('opens and downloads the same lifecycle-scoped canonical version', () => {
    expect(action).toContain('lifecycle: lifecyclePhase, briefHash')
    expect(documentPage).toContain('lifecycle: brief.lifecyclePhase')
    expect(documentPage).toContain("format: 'pdf', briefHash: brief.versionId")
    expect(documentPage).toContain('briefHash: brief.versionId')
  })
})
