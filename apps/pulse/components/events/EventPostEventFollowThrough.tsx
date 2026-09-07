export interface PostEventFollowThroughAction {
  id: string
  title: string
  status: string
  owner: string
  dueAt: string | null
  classification: string
}

function dueLabel(value: string | null) {
  if (!value) return 'No due date'
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function ownerStatus(action: PostEventFollowThroughAction) {
  return `${action.owner} · ${action.status.toLowerCase().replaceAll('_', ' ')} · ${dueLabel(action.dueAt)}`
}

function initials(owner: string) {
  if (owner === 'Unassigned') return '—'
  return owner.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '—'
}

function statusTone(status: string) {
  const value = status.toUpperCase()
  if (value.includes('COMPLETE')) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (value.includes('BLOCK')) return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (value.includes('WORK')) return 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  if (value.includes('WAIT') || value.includes('UNASSIGNED')) return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

function ActionColumn({ title, subtitle, actions }: { title: string; subtitle: string; actions: PostEventFollowThroughAction[] }) {
  return (
    <section className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-extrabold text-slate-950">{title}</h3>
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">{actions.length}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
      <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {actions.map((action) => (
          <article key={`${title}-${action.id}`} className="flex gap-3 py-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-extrabold text-indigo-700">{initials(action.owner)}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold leading-5 text-slate-950">{action.title}</p>
              <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] ring-1 ${statusTone(action.status)}`}>{action.status.replaceAll('_', ' ')}</span>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">{ownerStatus(action)}</p>
            </div>
          </article>
        ))}
        {actions.length === 0 && <p className="py-4 text-xs leading-5 text-slate-500">No work in this group.</p>}
      </div>
    </section>
  )
}

export function EventPostEventFollowThrough({ actions }: { actions: PostEventFollowThroughAction[] }) {
  const openActions = actions.filter((action) => !['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(action.status))
  const assignedActions = openActions.filter((action) => action.owner !== 'Unassigned')
  const unassignedActions = openActions.filter((action) => action.owner === 'Unassigned')
  const scheduledActions = actions.filter((action) => (
    action.dueAt !== null
    && (action.classification === 'AFTER_EVENT_FOLLOW_UP' || action.classification === 'NEXT_EVENT_LEARNING')
    && !openActions.some((openAction) => openAction.id === action.id)
  ))

  return (
    <section data-testid="post-event-follow-through" aria-labelledby="post-decisions-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="post-decisions-heading" className="text-[22px] font-extrabold tracking-[-0.025em] text-slate-950">Decisions and follow-through</h2>
          <p className="mt-1 text-sm text-slate-500">{openActions.length} open · {unassignedActions.length} awaiting an owner · {scheduledActions.length} scheduled after the event</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ActionColumn title="Still open" subtitle="Work that carried past the event closing" actions={assignedActions} />
        <ActionColumn title="Awaiting an owner" subtitle="Recorded work without an assigned owner" actions={unassignedActions} />
        <ActionColumn title="Scheduled after the event" subtitle="Follow-up with a recorded due date" actions={scheduledActions} />
      </div>
    </section>
  )
}
