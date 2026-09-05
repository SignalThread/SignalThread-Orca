import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/SimpleEventSurveyStartingPoint.tsx'), 'utf8')

describe('Simple Event survey starting point', () => {
  it('renders the approved compact five-option survey starting-point surface', () => {
    expect(source).toContain('data-testid="simple-event-survey-starting-point"')
    expect(source).toContain('max-w-[812px]')
    expect(source).toContain('w-full')
    expect(source).toContain('px-4 pb-16 sm:px-6 sm:pb-20')
    expect(source).toContain('space-y-3')
    expect(source).toContain('padding="none" className="rounded-[16px] px-4 py-3 sm:px-5 sm:py-4"')
    expect(source).toContain('text-[32px]')
    expect(source).toContain('sm:text-[38px]')
    expect(source).toContain('text-[17px]')
    expect(source).toContain('sm:text-[19px]')
    expect(source).toContain('grid h-11 w-11')
    expect(source).toContain('grid h-8 w-8')
    expect(source).toContain('sm:h-9 sm:w-9')
    expect(source).toContain('basis-full text-[12px] font-medium leading-4 text-slate-500 sm:basis-auto sm:text-[14px] sm:leading-5')
    expect(source).toContain('Start from scratch')
    expect(source).toContain('Start building')
    expect(source).toContain('Use this starting point')
    expect(source).toContain('Recommended')
    expect(source).toContain('ready-to-edit questions')
    expect(source).not.toContain('min-h-[')
    expect(source).not.toContain('sm:grid-cols-2')
    expect(source).not.toContain('border-dashed')
  })

  it('uses one consistent semantic icon tile for every starting point', () => {
    expect(source).toContain('data-testid="simple-survey-scratch-sparkle"')
    expect(source).toContain("'event-feedback': { Icon: MessageSquareText")
    expect(source).toContain("'attendee-experience': { Icon: Users")
    expect(source).toContain("'sponsor-exhibitor-feedback': { Icon: Handshake")
    expect(source).toContain("'post-event-wrap-up': { Icon: ClipboardCheck")
    expect(source).toContain('grid h-11 w-11 shrink-0 place-items-center rounded-xl')
  })

  it('uses the canonical four templates plus scratch and never adds Net Promoter', () => {
    expect(source).toContain('SIMPLE_EVENT_SURVEY_TEMPLATES.map')
    expect(source).not.toContain('Net Promoter')
    expect(source).not.toContain('Net promoter')
  })
})
