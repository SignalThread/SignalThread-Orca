import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventActionsWorkspace.tsx'), 'utf8')

describe('EventActionsWorkspace', () => {
  it('provides every required persisted action view and real search/sort controls', () => {
    for (const label of [
      'My actions', 'All actions', 'Unassigned', 'Working', 'Blocked', 'Complete',
      'After-event follow-up', 'Next-event learning',
    ]) expect(source).toContain(`label: '${label}'`)
    for (const label of ['Open', 'Unclaimed', 'Mine', 'After event', 'Complete']) {
      expect(source).toContain(`label: '${label}'`)
    }
    expect(source).toContain("? requestedView! : 'open'")
    expect(source).toContain('Search actions, source findings, or owners')
    expect(source).toContain('<option value="due">Due date</option>')
    expect(source).toContain('<option value="priority">Priority</option>')
    expect(source).toContain('<option value="recent">Recently updated</option>')
  })

  it('uses one URL-backed detail identity suitable for desktop, email, and mobile', () => {
    expect(source).toContain("searchParams.get('actionId')")
    expect(source).toContain("query.set('tab', 'actions')")
    expect(source).toContain("updateUrl({ actionId: action.id, actionView: 'all' })")
    expect(source).toContain('data-testid="action-detail"')
  })

  it('uses only canonical action routes for conversion and mutations', () => {
    expect(source).toContain('const baseUrl = `/api/app/events/${encodeURIComponent(eventId)}/actions`')
    expect(source).toContain("operation: 'ASSIGN'")
    expect(source).toContain("operation: 'RETRY_ASSIGNMENT_EMAIL'")
    expect(source).toContain("operation: 'TRANSITION'")
    expect(source).toContain("operation: 'SET_DUE_DATE'")
    expect(source).toContain("operation: 'SET_PRIORITY'")
    expect(source).toContain("operation: 'SET_CLASSIFICATION'")
    expect(source).toContain("kind: 'WRITTEN'")
    expect(source).toContain('idempotencyKey: crypto.randomUUID()')
    expect(source).toContain("view === 'my' && ownerUserId !== currentUserId")
    expect(source).toContain("updateUrl({ actionView: 'all' })")
    expect(source).toContain('Email not sent')
    expect(source).toContain('Retry email')
    expect(source).toContain('Delivery attempts')
  })

  it('reuses the shared evidence renderer and displays the persisted timeline', () => {
    expect(source).toContain('<EventThemeEvidencePanel')
    expect(source).toContain('heading="Linked Evidence"')
    expect(source).toContain('detail.actionHistory')
    expect(source).toContain('detail.actionUpdates')
    expect(source).toContain('Create from a source finding')
  })

  it('uses the approved full-width list and responsive canonical detail drawer', () => {
    expect(source).toContain('max-w-[1176px]')
    expect(source).toContain('w-[min(560px,100vw)]')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-label="Close action detail"')
    expect(source).toContain('Only what someone deliberately decided to own.')
    expect(source).toContain('New action')
    expect(source).toContain('Quick status actions')
    expect(source).toContain('Mark working')
    expect(source).toContain('Mark blocked')
    expect(source).toContain('Mark complete')
    expect(source).toContain('Reopen')
    expect(source).toContain('Overdue ·')
    expect(source).not.toContain('mobileAction')
  })

  it('uses a specific action-queue heading instead of repeating the top-level tab name', () => {
    expect(source).toContain('>Action queue</h2>')
    expect(source).not.toContain('>Actions</h2>')
  })

  it('uses lifecycle state to place the canonical post-event follow-through summary above the detailed records', () => {
    expect(source).toContain("import { EventPostEventFollowThrough } from '@/components/events/EventPostEventFollowThrough'")
    expect(source).toContain('isPostEvent?: boolean')
    expect(source).toContain('const isPostEventActionsWorkspace = isPostEvent')
    expect(source).toContain('{isPostEventActionsWorkspace && <EventPostEventFollowThrough actions={followThroughActions} />}')
    expect(source).toContain('const followThroughActions = actions.map')
    expect(source).toContain('>Follow-through records</h2>')
    expect(source).toContain('Show completed')
  })

  it('writes and records voice through the same canonical action detail and history', () => {
    expect(source).toContain('<EventActionVoiceUpdateRecorder')
    expect(source).toContain("kind: 'WRITTEN'")
    expect(source).toContain("item.kind === 'VOICE' ? 'Voice update' : 'Written update'")
    expect(source).toContain('voiceFailureReason')
    expect(source).toContain('heading="Linked Evidence"')
    expect(source).toContain('Type a short update…')
    expect(source).toContain('Send update')
    expect(source).toContain('<EventActionVoiceUpdateRecorder')
    expect(source).toContain('Move it along')
    expect(source).toContain('border-l border-slate-200 pl-4')
  })

  it('keeps the canonical drawer accessible without changing the URL-backed action state', () => {
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain("document.body.style.overflow = 'hidden'")
    expect(source).toContain('actionCloseRef.current?.focus()')
    expect(source).toContain('previousFocus?.focus()')
  })

  it('explains required blocked and terminal status context before saving', () => {
    expect(source).toContain('const [statusContextError, setStatusContextError]')
    expect(source).toContain("setStatusContextError(statusDraft === 'BLOCKED' ? 'Enter a blocked reason before saving.' : 'Enter a resolution or reason before saving.')")
    expect(source).toContain('role="alert"')
    expect(source).toContain('aria-invalid={Boolean(statusContextError)}')
    expect(source).toContain('<button type="button" disabled={saving} onClick={async () =>')
  })

  it('renders assignment history with account owner names instead of raw user IDs', () => {
    expect(source).toContain('function historyValueLabel')
    expect(source).toContain("['ASSIGNED', 'REASSIGNED', 'UNASSIGNED'].includes(type)")
    expect(source).toContain('owner ? ownerName(owner)')
    expect(source).toContain('historyValueLabel(item.type, item.fromValue, detail.availableOwners)')
  })
})
