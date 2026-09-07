'use client'

import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type TruncatedTableTextProps = {
  children: string
  className?: string
}

type TextMetrics = Pick<HTMLElement, 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'>

/** Shared overflow check for the fixed-height, two-line table cells. */
export function isTwoLineTextTruncated(element: TextMetrics) {
  return element.scrollHeight > element.clientHeight + 1
    || element.scrollWidth > element.clientWidth + 1
}

function measureUnclampedHeight(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0) return 0

  const computed = window.getComputedStyle(element)
  const measurement = element.cloneNode(true) as HTMLElement
  Object.assign(measurement.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    display: 'block',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: `${rect.width}px`,
    minHeight: '0',
    height: 'auto',
    maxHeight: 'none',
    overflow: 'visible',
    WebkitLineClamp: 'unset',
    WebkitBoxOrient: 'initial',
    font: computed.font,
    letterSpacing: computed.letterSpacing,
    lineHeight: computed.lineHeight,
    whiteSpace: computed.whiteSpace,
    wordBreak: computed.wordBreak,
    overflowWrap: computed.overflowWrap,
  })
  document.body.appendChild(measurement)
  const height = measurement.getBoundingClientRect().height
  measurement.remove()
  return height
}

export function TruncatedTableText({ children, className = '' }: TruncatedTableTextProps) {
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  useLayoutEffect(() => {
    const element = textRef.current
    if (!element) return
    const measure = () => {
      const nextTruncated = isTwoLineTextTruncated(element)
        || measureUnclampedHeight(element) > element.clientHeight + 1
      setTruncated(nextTruncated)
      if (!nextTruncated) setOpen(false)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [children])

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  useLayoutEffect(() => {
    if (!open || !textRef.current) {
      setPosition(null)
      return
    }
    const updatePosition = () => {
      const rect = textRef.current?.getBoundingClientRect()
      if (!rect) return
      const pad = 12
      const desiredWidth = Math.min(352, window.innerWidth - pad * 2)
      const left = Math.min(Math.max(pad, rect.left), window.innerWidth - desiredWidth - pad)
      const spaceBelow = window.innerHeight - rect.bottom - pad
      const spaceAbove = rect.top - pad
      const showAbove = spaceBelow < 112 && spaceAbove > spaceBelow
      const maxHeight = Math.max(72, Math.min(192, showAbove ? spaceAbove : spaceBelow))
      setPosition({
        left,
        top: showAbove ? Math.max(pad, rect.top - maxHeight - 8) : rect.bottom + 8,
        maxHeight,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (truncated) setOpen(true)
  }
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  return <>
    <span
      ref={textRef}
      tabIndex={truncated ? 0 : -1}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
      }}
      className={`min-h-[40px] break-words outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${className}`}
    >
      {children}
    </span>
    {open && position && typeof document !== 'undefined' && createPortal(
      <span
        id={tooltipId}
        role="tooltip"
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }}
        className="fixed z-[90] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-slate-700 shadow-xl"
      >
        {children}
      </span>,
      document.body,
    )}
  </>
}
