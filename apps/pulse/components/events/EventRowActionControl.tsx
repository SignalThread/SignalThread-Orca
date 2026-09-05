'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type EventRowActionVariant = 'primary' | 'secondary'

/** Shared Event Workspace row-control rhythm. */
export const EVENT_ROW_CONTROL_HEIGHT_CLASS = 'h-8'
export const EVENT_ROW_CONTROL_RADIUS_CLASS = 'rounded-md'
export const EVENT_ROW_ACTION_GAP_CLASS = 'gap-2'

const ACTION_CLASSES: Record<EventRowActionVariant, string> = {
  primary: 'border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800',
}

const BASE_CLASSES = `inline-flex ${EVENT_ROW_CONTROL_HEIGHT_CLASS} shrink-0 items-center justify-center whitespace-nowrap ${EVENT_ROW_CONTROL_RADIUS_CLASS} min-w-[4rem] px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 disabled:pointer-events-none disabled:opacity-50`

export const EVENT_ROW_ACTION_PRIMARY_CLASS = `${BASE_CLASSES} min-w-[8.5rem] ${ACTION_CLASSES.primary}`
export const EVENT_ROW_ACTION_SECONDARY_CLASS = `${BASE_CLASSES} ${ACTION_CLASSES.secondary}`

export const EVENT_ROW_ACTION_OVERFLOW_CLASS = `flex ${EVENT_ROW_CONTROL_HEIGHT_CLASS} w-8 cursor-pointer list-none items-center justify-center ${EVENT_ROW_CONTROL_RADIUS_CLASS} border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200`

interface EventRowActionButtonProps {
  children: ReactNode
  variant?: EventRowActionVariant
  href?: string
  external?: boolean
  onClick?: () => void
  disabled?: boolean
  title?: string
  className?: string
}

/** Canonical boxed text action for Event Workspace row and card action areas. */
export function EventRowActionButton({ children, variant = 'secondary', href, external = false, className = '', onClick, disabled = false, title }: EventRowActionButtonProps) {
  const classes = `${variant === 'primary' ? EVENT_ROW_ACTION_PRIMARY_CLASS : EVENT_ROW_ACTION_SECONDARY_CLASS} ${className}`
  if (href) {
    return <a href={href} title={title} onClick={onClick} className={`${classes} ${disabled ? 'pointer-events-none opacity-50' : ''}`} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>
  }
  return <button type="button" title={title} className={classes} disabled={disabled} onClick={onClick}>{children}</button>
}

/** Shared compact overflow control; menu content remains caller-owned. */
export function EventRowActionOverflow({ label, children, menuClassName = '', triggerClassName = '', onOpenChange }: { label: string; children?: ReactNode; menuClassName?: string; triggerClassName?: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number; placement: 'top' | 'bottom' } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const setMenuOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0
      if (!trigger) return
      const gap = 4
      const edge = 8
      const below = window.innerHeight - trigger.bottom - edge
      const above = trigger.top - edge
      const placement = below < menuHeight + gap && above > below ? 'top' : 'bottom'
      setPosition({
        top: placement === 'top' ? Math.max(edge, trigger.top - menuHeight - gap) : Math.min(window.innerHeight - edge, trigger.bottom + gap),
        right: Math.max(edge, window.innerWidth - trigger.right),
        placement,
      })
    }
    place()
    const frame = window.requestAnimationFrame(place)
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node
      if (!triggerRef.current?.contains(node) && !menuRef.current?.contains(node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [onOpenChange, open])

  const style: CSSProperties = position ? { top: position.top, right: position.right } : { visibility: 'hidden' }
  const menu = open && children && typeof document !== 'undefined' && createPortal(
    <div ref={menuRef} role="menu" data-testid="event-row-action-overflow-menu" data-placement={position?.placement ?? 'bottom'} onClick={(event) => { event.stopPropagation(); setMenuOpen(false) }} className={`fixed z-[100] flex w-40 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${menuClassName}`} style={style}>
      {children}
    </div>,
    document.body,
  )

  return <><button ref={triggerRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setMenuOpen(!open) }} className={`${EVENT_ROW_ACTION_OVERFLOW_CLASS} ${triggerClassName}`}>•••</button>{menu}</>
}
