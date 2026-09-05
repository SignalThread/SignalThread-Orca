'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Canonical Events date field. Product-styled popover calendar over a plain
 * `YYYY-MM-DD` string value — no native browser date control and no Date/UTC
 * conversions, so the selected calendar date can never drift by timezone.
 */

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface CalendarDate {
  year: number
  month: number // 1-12
  day: number   // 1-31
}

function parseValue(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

function toValue(date: CalendarDate): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

function todayCalendarDate(): CalendarDate {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

function compareDates(a: CalendarDate, b: CalendarDate): number {
  return (a.year - b.year) || (a.month - b.month) || (a.day - b.day)
}

function addDays(date: CalendarDate, delta: number): CalendarDate {
  const base = new Date(date.year, date.month - 1, date.day + delta)
  return { year: base.getFullYear(), month: base.getMonth() + 1, day: base.getDate() }
}

export function formatEventDateValue(value: string): string {
  const date = parseValue(value)
  if (!date) return ''
  return `${MONTH_LABELS[date.month - 1].slice(0, 3)} ${date.day}, ${date.year}`
}

export interface EventDatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Inclusive lower bound as YYYY-MM-DD. */
  min?: string
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}

export function EventDatePicker({
  id,
  value,
  onChange,
  min,
  disabled = false,
  placeholder = 'Choose a date',
  'aria-label': ariaLabel,
}: EventDatePickerProps) {
  const generatedId = useId()
  const triggerId = id ?? `event-date-${generatedId}`
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseValue(value), [value])
  const minDate = useMemo(() => (min ? parseValue(min) : null), [min])
  const [viewYear, setViewYear] = useState(() => (selected ?? todayCalendarDate()).year)
  const [viewMonth, setViewMonth] = useState(() => (selected ?? todayCalendarDate()).month)
  const [focusedDay, setFocusedDay] = useState<CalendarDate | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const openPicker = () => {
    const anchor = selected ?? todayCalendarDate()
    setViewYear(anchor.year)
    setViewMonth(anchor.month)
    setFocusedDay(anchor)
    setOpen(true)
  }

  const closePicker = (returnFocus = true) => {
    setOpen(false)
    setFocusedDay(null)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closePicker(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closePicker()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open || !focusedDay) return
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${toValue(focusedDay)}"]`)
      ?.focus()
  }, [open, focusedDay])

  const isDisabledDay = (date: CalendarDate) => Boolean(minDate && compareDates(date, minDate) < 0)

  const selectDay = (date: CalendarDate) => {
    if (isDisabledDay(date)) return
    onChange(toValue(date))
    closePicker()
  }

  const moveFocus = (delta: number) => {
    const base = focusedDay ?? selected ?? todayCalendarDate()
    const next = addDays(base, delta)
    setViewYear(next.year)
    setViewMonth(next.month)
    setFocusedDay(next)
  }

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth - 1 + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth() + 1)
  }

  const handleGridKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (event.key in moves) {
      event.preventDefault()
      moveFocus(moves[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (focusedDay) selectDay(focusedDay)
    }
  }

  const today = todayCalendarDate()
  const leadingBlanks = firstWeekday(viewYear, viewMonth)
  const dayCount = daysInMonth(viewYear, viewMonth)
  const cells: Array<CalendarDate | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => ({ year: viewYear, month: viewMonth, day: index + 1 })),
  ]

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? closePicker() : openPicker())}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <span className={value ? '' : 'text-zinc-400 dark:text-zinc-500'}>
          {value ? formatEventDateValue(value) : placeholder}
        </span>
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Choose date"
          className="absolute left-0 top-full z-30 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 6-6 6 6 6" /></svg>
            </button>
            <p aria-live="polite" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {MONTH_LABELS[viewMonth - 1]} {viewYear}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-zinc-400 dark:text-zinc-500" aria-hidden="true">
            {WEEKDAY_LABELS.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
          </div>

          <div ref={gridRef} role="grid" aria-label="Calendar" onKeyDown={handleGridKeyDown} className="grid grid-cols-7">
            {cells.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} aria-hidden="true" />
              const dateValue = toValue(date)
              const isSelected = selected ? compareDates(date, selected) === 0 : false
              const isToday = compareDates(date, today) === 0
              const isFocused = focusedDay ? compareDates(date, focusedDay) === 0 : false
              const dayDisabled = isDisabledDay(date)
              return (
                <button
                  key={dateValue}
                  type="button"
                  role="gridcell"
                  data-day={dateValue}
                  tabIndex={isFocused || (!focusedDay && isSelected) ? 0 : -1}
                  disabled={dayDisabled}
                  aria-selected={isSelected}
                  aria-label={`${MONTH_LABELS[date.month - 1]} ${date.day}, ${date.year}`}
                  onClick={() => selectDay(date)}
                  className={`mx-auto my-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    isSelected
                      ? 'bg-blue-600 font-semibold text-white'
                      : dayDisabled
                        ? 'cursor-not-allowed text-zinc-300 dark:text-zinc-700'
                        : `text-zinc-700 hover:bg-blue-50 dark:text-zinc-200 dark:hover:bg-zinc-800 ${isToday ? 'ring-1 ring-inset ring-blue-400' : ''}`
                  }`}
                >
                  {date.day}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => { onChange(''); closePicker() }}
              className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Clear date
            </button>
            <button
              type="button"
              onClick={() => selectDay(today)}
              disabled={isDisabledDay(today)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-950/40"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
