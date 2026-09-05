import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Event Workspace row action system', () => {
  it('routes every audited list and readiness surface through the canonical control', () => {
    const sources = [
      'components/app/events/EventReadinessList.tsx',
      'components/events/EventRowActions.tsx',
      'components/events/EventSurveyRowActions.tsx',
      'components/events/EventDeploymentWorkspace.tsx',
      'components/events/EventAgendaWorkspace.tsx',
      'components/events/EventPreEventSignals.tsx',
      'app/app/events/[eventId]/page.tsx',
    ].map(read)

    sources.filter((source) => !source.includes("import { InfoTooltip } from '@/components/ui/InfoTooltip'") && !source.includes('EventDeploymentWorkspace'))
      .forEach((source) => expect(source).toContain('EventRowAction'))
    expect(read('components/events/EventSurveyRowActions.tsx')).toContain("import { InfoTooltip } from '@/components/ui/InfoTooltip'")
    expect(read('components/events/EventRowActions.tsx')).toContain('grid-cols-[auto_auto]')
    expect(read('components/app/events/EventReadinessList.tsx')).toContain('sm:grid-cols-[minmax(0,1fr)_14rem]')
    expect(read('app/app/events/[eventId]/page.tsx')).toContain('sm:grid-cols-[minmax(0,1fr)_14rem]')
  })

  it('does not leave the old bare right-side action links in the audited row surfaces', () => {
    const page = read('app/app/events/[eventId]/page.tsx')
    const readiness = read('components/app/events/EventReadinessList.tsx')
    const deployment = read('components/events/EventDeploymentWorkspace.tsx')

    expect(page).not.toContain('className="text-indigo-700 hover:underline"')
    expect(readiness).not.toContain('text-blue-700 hover:underline')
    expect(deployment).not.toContain('<EventSurveyRowActions')
    expect(deployment).toContain('onClick={onDesign}')
    expect(deployment).toContain('onClick={onPrint}')
  })
})
