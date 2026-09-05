'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface InfoTooltipProps {
  content: string
  className?: string
  /** Optional custom trigger; defaults to the compact information icon. */
  trigger?: React.ReactNode
  ariaLabel?: string
  /** Tooltip panel position relative to the trigger (default: bottom). */
  placement?: 'top' | 'bottom'
  /** Optional action semantics for icon-only links and buttons. */
  href?: string
  external?: boolean
  onAction?: () => void
  disabled?: boolean
}

export function InfoTooltip({ content, className = '', trigger, ariaLabel = 'More information', placement = 'bottom', href, external = false, onAction, disabled = false }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLSpanElement | null>(null)
  const [nudgeX, setNudgeX] = useState(0)
  /** When placement is `top` but the panel would clip the viewport top, show below instead. */
  const [forceBottom, setForceBottom] = useState(false)

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setNudgeX(0)
      setForceBottom(false)
      return
    }
    if (placement !== 'top') {
      setForceBottom(false)
    }
    const tip = tipRef.current
    if (!tip) return
    const tipRect = tip.getBoundingClientRect()
    const vPad = 8
    if (placement === 'top' && !forceBottom && tipRect.top < vPad) {
      setForceBottom(true)
      return
    }

    const pad = 10
    let nudge = 0
    if (tipRect.left < pad) {
      nudge = pad - tipRect.left
    } else if (tipRect.right > window.innerWidth - pad) {
      nudge = window.innerWidth - pad - tipRect.right
    }
    setNudgeX(nudge)
  }, [open, content, placement, forceBottom])

  const showAbove = placement === 'top' && !forceBottom
  const positionClasses = showAbove
    ? 'bottom-full left-1/2 mb-2'
    : 'top-full left-1/2 mt-2'
  const triggerClassName = trigger
    ? `inline-flex cursor-help items-center justify-center text-inherit focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:pointer-events-none disabled:opacity-50${className ? ' h-full w-full' : ''}`
    : 'inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 bg-white text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
  const triggerContents = trigger ?? 'i'

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {href ? <a href={href} aria-label={ariaLabel} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className={triggerClassName} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{triggerContents}</a> : (
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={onAction ?? (() => setOpen((v) => !v))}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          disabled={disabled}
          className={triggerClassName}
        >
          {triggerContents}
        </button>
      )}

      {open && (
        <span
          ref={tipRef}
          data-tooltip-panel
          style={{ transform: `translateX(calc(-50% + ${nudgeX}px))` }}
          className={`absolute ${positionClasses} z-50 w-[min(16rem,calc(100vw-1.5rem))] rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-normal text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
