'use client'

import { useEffect, useRef, useState } from 'react'

type DateRangePickerProps = {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value: string) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function displayRange(from: string, to: string) {
  const start = parseDate(from)
  const end = parseDate(to)
  if (start && end) return `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(end)}`
  if (start) return `From ${shortDateFormatter.format(start)}`
  if (end) return `Until ${shortDateFormatter.format(end)}`
  return 'All dates'
}

/** Compact, app-owned range picker; it deliberately avoids browser date inputs. */
export function EventDateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(parseDate(from) ?? parseDate(to) ?? new Date()))
  const ref = useRef<HTMLDivElement>(null)
  const start = parseDate(from)
  const end = parseDate(to)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const first = startOfMonth(month)
  const gridStart = new Date(first)
  gridStart.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })
  const choose = (date: Date) => {
    const value = dateKey(date)
    if (!start || (start && end) || value < from) onChange({ from: value, to: '' })
    else onChange({ from, to: value })
  }

  return <div ref={ref} data-testid="event-date-range-picker" className="relative min-w-0">
    <button type="button" aria-label="Date range" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-9 min-w-[172px] items-center justify-between gap-2 rounded-[9px] border border-slate-200 bg-white px-3 text-left text-[12px] font-semibold text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"><span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Date range</span><span className="truncate">{displayRange(from, to)}</span><span aria-hidden className="text-slate-400">⌄</span></button>
    {open && <div role="dialog" aria-label="Choose date range" className="absolute right-0 top-full z-50 mt-2 w-[288px] rounded-[14px] border border-slate-200 bg-white p-3 shadow-[0_16px_36px_rgba(15,23,42,0.16)]">
      <div className="flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" onClick={() => setMonth((value) => addMonths(value, -1))} className="inline-flex size-8 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100">‹</button><p className="text-[12px] font-bold text-slate-900">{monthFormatter.format(month)}</p><button type="button" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))} className="inline-flex size-8 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100">›</button></div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">{days.map((date) => {
        const value = dateKey(date)
        const currentMonth = date.getMonth() === month.getMonth()
        const selectedStart = value === from
        const selectedEnd = value === to
        const inRange = Boolean(from && to && value > from && value < to)
        return <button key={value} type="button" onClick={() => choose(date)} className={`relative flex size-8 items-center justify-center rounded-lg text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${!currentMonth ? 'text-slate-300' : 'text-slate-700'} ${inRange ? 'rounded-none bg-indigo-50 text-indigo-800' : ''} ${selectedStart || selectedEnd ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'hover:bg-slate-100'}`}>{date.getDate()}</button>
      })}</div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><button type="button" onClick={() => { const today = new Date(); setMonth(startOfMonth(today)); onChange({ from: dateKey(today), to: dateKey(today) }) }} className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900">Today</button><button type="button" onClick={() => onChange({ from: '', to: '' })} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">Clear</button></div>
    </div>}
  </div>
}
