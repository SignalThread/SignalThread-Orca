import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterEventAreas } from './EventAreasWorkspace'

const source = readFileSync('components/events/EventAreasWorkspace.tsx', 'utf8')

describe('EventAreasWorkspace', () => {
  const items = [
    { id: 'area_1', kind: 'AREA', name: 'Expo Hall', description: 'Main floor' },
    { id: 'area_2', kind: 'SPONSOR_ACTIVATION', name: 'Partner Booth', description: null },
    { id: 'area_3', kind: 'CUSTOM_TOUCHPOINT', name: 'VIP lounge', description: null },
  ] as never
  const assigned = new Map([['area_1', { id: 'survey_1', name: 'Expo feedback' }], ['area_2', { id: 'survey_2', name: 'Partner pulse' }]]) as never

  it('uses the approved compact Event Areas surface and keeps help collapsed', () => {
    expect(source).toContain('const [helpOpen, setHelpOpen] = useState(false)')
    expect(source).toContain('Non-session places you collect feedback')
    expect(source).toContain('Which target should I use?')
    expect(source).toContain('Sessions and speakers have their own pages — attach feedback to them there.')
    expect(source).not.toContain('Other feedback targets')
  })

  it('opens the approved landscape creator rather than the legacy inline form', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('max-w-5xl')
    expect(source).toContain("const [kind, setKind] = useState<EventAreaKind>('AREA')")
    for (const label of ['Location', 'Sponsor activation', 'Event-wide', 'Custom']) {
      expect(source).toContain(`label: '${label}'`)
    }
    expect(source).not.toContain('datetime-local')
    expect(source).not.toContain('Starts at')
    expect(source).not.toContain('Ends at')
    expect(source).not.toContain('Timezone')
    expect(source).not.toContain('<select')
  })

  it('leaves Event Area creation to the Operations action toolbar', () => {
    expect(source).not.toContain('onClick={openCreate}>Add Event Area</Button>')
    expect(source).not.toContain('sm:flex-row sm:items-start sm:justify-between')
  })

  it('keeps structure creation and survey assignment on their canonical endpoints', () => {
    expect(source).toContain('/structure?account=')
    expect(source).toContain("action: 'BULK_ASSIGN_EXISTING_SURVEY'")
    expect(source).toContain("action: 'CLEAR_EXISTING_SURVEY_ASSIGNMENT'")
    expect(source).toContain("targetType: 'AREA'")
    expect(source).toContain('<EventSurveyLibraryPicker')
    expect(source).toContain('<EventSurveyAssignmentControl')
    expect(source).toContain('onDetach={async () =>')
    expect(source).toContain("import { EventSurveyAssignmentControl }")
    expect(source).toContain("attachedSurvey?.name ?? 'No survey'")
    expect(source).toContain("attachedSurvey ? 'Survey changed' : 'Survey assigned'")
    expect(source).toContain('onAssign={async (nextSurveyId) =>')
    expect(source).toContain('onDetach={async () =>')
    expect(source).toContain('await onChanged()')
    expect(source).toContain('isSurveyAssignableToEventTarget(survey, eventId)')
    expect(source).not.toContain("survey.targetType === 'AREA'")
    expect(source).not.toContain('overflowActions=')
    expect(source).not.toContain('>Edit</button>')
  })

  it('maps current target-scoped assignments without reducing the picker inventory', () => {
    expect(source).toContain('structureItemIds?: string[]')
    expect(source).toContain('surveys.flatMap((survey) => (survey.structureItemIds ?? [])')
    expect(source).toContain('new Map(surveys.flatMap')
  })

  it('searches Event Area name, type, description, and assigned survey while applying relevant filters', () => {
    expect(filterEventAreas(items, assigned, 'expo', 'all', 'all').map((item) => item.id)).toEqual(['area_1'])
    expect(filterEventAreas(items, assigned, 'sponsor activation', 'all', 'all').map((item) => item.id)).toEqual(['area_2'])
    expect(filterEventAreas(items, assigned, 'feedback', 'all', 'all').map((item) => item.id)).toEqual(['area_1'])
    expect(filterEventAreas(items, assigned, '', 'SPONSOR_ACTIVATION', 'all').map((item) => item.id)).toEqual(['area_2'])
    expect(filterEventAreas(items, assigned, '', 'all', 'assigned').map((item) => item.id)).toEqual(['area_1', 'area_2'])
    expect(filterEventAreas(items, assigned, '', 'all', 'unassigned').map((item) => item.id)).toEqual(['area_3'])
  })

  it('reuses the Operations search toolbar and keeps deterministic visible-row selection', () => {
    expect(source).toContain("import { EventEmptyState, OperationsSearchToolbar }")
    expect(source).toContain('<OperationsSearchToolbar')
    expect(source).toContain('searchPlaceholder="Search event areas..."')
    expect(source).toContain('entityLabel="event areas"')
    expect(source).toContain('selectedCount={selectedAreaIds.length}')
    expect(source).toContain('allSelected={allVisibleSelected}')
    expect(source).toContain('onToggleAll={toggleVisibleSelection}')
    expect(source).toContain('...filteredItems.map((item) => item.id)')
    expect(source).toContain('current.filter((id) => !filteredItems.some((item) => item.id === id))')
    expect(source).toContain('aria-label={`Select ${item.name}`}')
  })

  it('keeps type and assignment filters meaningful and exposes the shared survey assignment control', () => {
    expect(source).toContain('Area type')
    expect(source).toContain('Survey assignment')
    expect(source).toContain("['assigned', 'Assigned']")
    expect(source).toContain("['unassigned', 'Unassigned']")
    expect(source).toContain('EventSurveyAssignmentControl')
    expect(source).toContain("setNotice('Survey detached')")
    expect(source).toContain("attachedSurvey?.name ?? 'No survey'")
    expect(source).toContain('filteredItems.map((item) =>')
  })

  it('renders semantic Event Area icons with the approved container treatments', () => {
    expect(source).toContain("import { Globe2, MapPin, Tag } from 'lucide-react'")
    expect(source).toContain("kind === 'EVENT' ? Globe2 : kind === 'SPONSOR_ACTIVATION' ? Tag : MapPin")
    expect(source).toContain("bg-indigo-50 text-indigo-600")
    expect(source).toContain("bg-amber-50 text-amber-700")
    expect(source).toContain('h-10 w-10 shrink-0 place-items-center rounded-xl')
    expect(source).toContain('<EventAreaTypeIcon kind={item.kind} />')
  })

  it('uses the shared white list shell and separate cards instead of connected table rows', () => {
    expect(source).toContain("import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'")
    expect(source).toContain('<EventEntityListShell>')
    expect(source).toContain('<EventEntityCard')
    expect(source).toContain('className="mt-4 space-y-3"')
  })

  it('keeps the assignment toolbar in a hover-owned reserved gutter', () => {
    expect(source).toContain('group relative flex flex-col gap-4 pr-[10.5rem]')
    expect(source).toContain('[&:has(.event-survey-assignment-toolbar[data-open=true])]:bg-[#f7f9fe]')
  })
})
