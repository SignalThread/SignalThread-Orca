'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface EventWorkspaceDrawerProps {
  open: boolean
  title: string
  eyebrow?: string
  summary?: string | null
  width?: 'default' | 'compact'
  children: ReactNode
  onClose: () => void
  testId?: string
  ariaLabel?: string
}

/** Shared right-side event drawer. It intentionally owns focus, Escape, backdrop, and scroll locking. */
export function EventWorkspaceDrawer({
  open,
  title,
  eyebrow = 'Evidence',
  summary,
  width = 'default',
  children,
  onClose,
  testId = 'event-workspace-drawer',
  ariaLabel,
}: EventWorkspaceDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" data-testid={testId}>
      <button type="button" aria-label={`Close ${ariaLabel ?? title}`} onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[1px]" />
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label={ariaLabel ?? title} className={`relative flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white shadow-[-20px_0_56px_rgba(15,23,42,0.18)] ${width === 'compact' ? 'max-w-[500px]' : 'max-w-[min(660px,100vw)]'}`}>
        <header className="border-b border-slate-200 px-6 py-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>
              <h2 className="mt-2 text-[23px] font-extrabold leading-7 tracking-[-0.025em] text-slate-950">{title}</h2>
              {summary && <p className="mt-2 text-[13px] leading-6 text-slate-500">{summary}</p>}
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300" aria-label="Close">×</button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
      </aside>
    </div>
  )
}

interface EventEvidenceDrawerProps extends Omit<EventWorkspaceDrawerProps, 'testId' | 'ariaLabel'> {}

/** Canonical evidence surface for every Signals view. */
export function EventEvidenceDrawer(props: EventEvidenceDrawerProps) {
  return <EventWorkspaceDrawer {...props} testId="event-evidence-drawer" ariaLabel={`Evidence: ${props.title}`} />
}
