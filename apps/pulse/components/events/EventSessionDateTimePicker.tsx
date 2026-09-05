'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { formatEventDateValue } from '@/components/app/events/EventDatePicker'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface CalendarDate {
  year: number
  month: number
  day: number
}

export function sessionDateTimeParts(value: string): { date: string; time: string } {
  const separator = value.indexOf('T')
  if (separator < 0) return { date: value, time: '' }
  return { date: value.slice(0, separator), time: value.slice(separator + 1, separator + 6) }
}

export function updateSessionDateTimePart(value: string, part: 'date' | 'time', nextValue: string): string {
  const current = sessionDateTimeParts(value)
  const date = part === 'date' ? nextValue : current.date
  const time = part === 'time' ? nextValue : current.time
  if (!date) return time ? `T${time}` : ''
  return `${date}T${time}`
}

export function hasCompleteSessionDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function applyStartDateSelection(
  startsAt: string,
  endsAt: string,
  date: string,
  endDateWasChanged: boolean,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: updateSessionDateTimePart(startsAt, 'date', date),
    endsAt: endDateWasChanged ? endsAt : updateSessionDateTimePart(endsAt, 'date', date),
  }
}

export function isSessionEndAfterStart(startsAt: string, endsAt: string): boolean {
  return hasCompleteSessionDateTime(startsAt)
    && hasCompleteSessionDateTime(endsAt)
    && endsAt > startsAt
}

export function formatSessionTimeValue(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return ''
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

export const SESSION_TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const hour = Math.floor(index / 4)
  const minute = (index % 4) * 15
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
})

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function parseDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonth(date.year, date.month)) return null
  return date
}

function dateValue(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function todayDate(): CalendarDate {
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }
}

function compareDates(left: CalendarDate, right: CalendarDate) {
  return left.year - right.year || left.month - right.month || left.day - right.day
}

export function EventSessionDateTimePicker({
  label,
  value,
  onChange,
  minValue,
  align = 'start',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  /** A complete wall-time lower bound. Used by End to prevent values at or before Start. */
  minValue?: string
  align?: 'start' | 'end'
}) {
  const { date, time } = sessionDateTimeParts(value)
  const minParts = sessionDateTimeParts(minValue ?? '')
  const selectedDate = useMemo(() => parseDate(date), [date])
  const minimumDate = useMemo(() => parseDate(minParts.date), [minParts.date])
  const [open, setOpen] = useState(false)
  const initialMonth = selectedDate ?? minimumDate ?? todayDate()
  const [viewYear, setViewYear] = useState(initialMonth.year)
  const [viewMonth, setViewMonth] = useState(initialMonth.month)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectedTimeRef = useRef<HTMLButtonElement>(null)

  const openPicker = () => {
    const anchor = selectedDate ?? minimumDate ?? todayDate()
    setViewYear(anchor.year)
    setViewMonth(anchor.month)
    setOpen(true)
  }

  const closePicker = (returnFocus = true) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closePicker(false)
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePicker()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) selectedTimeRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth - 1 + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth() + 1)
  }

  const isDateDisabled = (candidate: CalendarDate) => Boolean(minimumDate && compareDates(candidate, minimumDate) < 0)
  const isTimeDisabled = (candidate: string) => {
    if (!minValue || !date || date !== minParts.date || !minParts.time) return false
    return candidate <= minParts.time
  }

  const selectDate = (candidate: CalendarDate) => {
    if (!isDateDisabled(candidate)) onChange(updateSessionDateTimePart(value, 'date', dateValue(candidate)))
  }

  const selectTime = (candidate: string) => {
    if (isTimeDisabled(candidate)) return
    onChange(updateSessionDateTimePart(value, 'time', candidate))
    closePicker()
  }

  const dayCount = daysInMonth(viewYear, viewMonth)
  const leadingBlanks = new Date(viewYear, viewMonth - 1, 1).getDay()
  const cells: Array<CalendarDate | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => ({ year: viewYear, month: viewMonth, day: index + 1 })),
  ]
  const displayDate = formatEventDateValue(date)
  const displayTime = formatSessionTimeValue(time)

  const handleCalendarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const focused = document.activeElement as HTMLButtonElement | null
    const allDays = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const index = focused ? allDays.indexOf(focused) : -1
    const next = allDays[index + (event.key === 'ArrowLeft' ? -1 : 1)]
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }

  return (
    <div className="block text-xs font-semibold text-slate-600 dark:text-zinc-300">
      <span>{label}</span>
      <div ref={containerRef} className="relative mt-1">
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${label}: ${displayDate || 'choose date'}, ${displayTime || 'choose time'}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? closePicker() : openPicker())}
          className="flex min-h-11 w-full items-center rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-950 shadow-sm transition hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:hover:border-zinc-600"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
            <span className={displayDate ? 'truncate font-semibold' : 'truncate text-slate-400'}>{displayDate || 'Select date'}</span>
          </span>
          <span aria-hidden="true" className="mx-3 h-5 w-px bg-slate-200 dark:bg-zinc-700" />
          <span className="flex shrink-0 items-center gap-2">
            <svg aria-hidden="true" className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            <span className={displayTime ? 'font-semibold tabular-nums' : 'text-slate-400'}>{displayTime || 'Select time'}</span>
          </span>
          <svg aria-hidden="true" className={`ml-2 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m7 10 5 5 5-5" /></svg>
        </button>

        {open && (
          <div
            role="dialog"
            aria-label={`Choose ${label.toLocaleLowerCase()} date and time`}
            className={`absolute top-full z-40 mt-2 w-[min(31rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ${align === 'end' ? 'right-0' : 'left-0'}`}
          >
            <div className="grid sm:grid-cols-[minmax(0,1fr)_10.5rem]">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:hover:bg-zinc-800"><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 6-6 6 6 6" /></svg></button>
                  <p aria-live="polite" className="text-sm font-bold text-slate-950 dark:text-white">{MONTHS[viewMonth - 1]} {viewYear}</p>
                  <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:hover:bg-zinc-800"><svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg></button>
                </div>
                <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400" aria-hidden="true">
                  {WEEKDAYS.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
                </div>
                <div role="grid" aria-label={`${label} calendar`} onKeyDown={handleCalendarKeyDown} className="grid grid-cols-7">
                  {cells.map((candidate, index) => {
                    if (!candidate) return <span key={`blank-${index}`} aria-hidden="true" />
                    const candidateValue = dateValue(candidate)
                    const selected = candidateValue === date
                    const disabled = isDateDisabled(candidate)
                    return <button
                      key={candidateValue}
                      type="button"
                      role="gridcell"
                      disabled={disabled}
                      aria-selected={selected}
                      aria-label={`${MONTHS[candidate.month - 1]} ${candidate.day}, ${candidate.year}`}
                      onClick={() => selectDate(candidate)}
                      className={`mx-auto my-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${selected ? 'bg-indigo-600 font-bold text-white' : disabled ? 'cursor-not-allowed text-slate-300 dark:text-zinc-700' : 'text-slate-700 hover:bg-indigo-50 dark:text-zinc-200 dark:hover:bg-zinc-800'}`}
                    >{candidate.day}</button>
                  })}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50/70 p-3 sm:border-l sm:border-t-0 dark:border-zinc-700 dark:bg-zinc-950/40">
                <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Time</p>
                <div role="listbox" aria-label={`${label} time`} className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto pr-1 sm:grid-cols-1">
                  {SESSION_TIME_OPTIONS.map((option) => {
                    const selected = option === time
                    const disabled = !date || isTimeDisabled(option)
                    return <button
                      key={option}
                      ref={selected ? selectedTimeRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={disabled}
                      onClick={() => selectTime(option)}
                      className={`rounded-lg px-3 py-2 text-left text-xs font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${selected ? 'bg-indigo-600 text-white' : disabled ? 'cursor-not-allowed text-slate-300 dark:text-zinc-700' : 'text-slate-700 hover:bg-white hover:shadow-sm dark:text-zinc-200 dark:hover:bg-zinc-800'}`}
                    >{formatSessionTimeValue(option)}</button>
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
