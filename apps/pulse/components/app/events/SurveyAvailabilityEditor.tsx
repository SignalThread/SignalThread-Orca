'use client'

import { useEffect, useState } from 'react'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { EventDatePicker } from '@/components/app/events/EventDatePicker'

export type SurveyAvailabilityModeValue = 'OPEN_IMMEDIATELY' | 'CUSTOM_WINDOW' | 'RELATIVE_TO_EVENT_AREA'
export type SurveyAvailabilityAnchorValue = 'START' | 'END'
export type SurveyAvailabilityOverrideValue = 'FORCE_OPEN' | 'FORCE_CLOSED' | null
type OffsetUnit = 'minutes' | 'hours' | 'days'

export interface SurveyAvailabilityFormValue {
  mode: SurveyAvailabilityModeValue
  timezone: string | null
  opensAt: string | null
  closesAt: string | null
  openAnchor: SurveyAvailabilityAnchorValue | null
  closeAnchor: SurveyAvailabilityAnchorValue | null
  openOffsetMinutes: number | null
  closeOffsetMinutes: number | null
  // Retained for legacy saved surveys and operational controls; it is not a
  // substitute for an organizer's response-window choice.
  override: SurveyAvailabilityOverrideValue
}

export interface SurveyScheduleContext {
  label: string
  startsAt: string | null
  endsAt: string | null
  timezone?: string | null
}

export function defaultSurveyAvailability(timezone?: string | null): SurveyAvailabilityFormValue {
  return { mode: 'OPEN_IMMEDIATELY', timezone: timezone || null, opensAt: null, closesAt: null, openAnchor: null, closeAnchor: null, openOffsetMinutes: null, closeOffsetMinutes: null, override: null }
}

export function SurveyAvailabilityEditor({ value, onChange, scheduleContext, scheduleUnavailableReason, disabled = false, advancedLabels = false, lockTimezone = false }: {
  value: SurveyAvailabilityFormValue
  onChange: (value: SurveyAvailabilityFormValue) => void
  scheduleContext: SurveyScheduleContext | null
  scheduleUnavailableReason?: string
  disabled?: boolean
  advancedLabels?: boolean
  lockTimezone?: boolean
}) {
  const timezone = value.timezone || scheduleContext?.timezone || browserTimezone()
  const fieldClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'
  const canScheduleAround = Boolean(scheduleContext?.startsAt && scheduleContext?.endsAt)
  const setMode = (mode: SurveyAvailabilityModeValue) => {
    if (mode === 'OPEN_IMMEDIATELY') return onChange(defaultSurveyAvailability(timezone))
    if (mode === 'CUSTOM_WINDOW') return onChange({ ...defaultSurveyAvailability(timezone), mode, opensAt: value.opensAt, closesAt: value.closesAt, override: value.override })
    onChange({ ...defaultSurveyAvailability(timezone), mode, openAnchor: value.openAnchor ?? 'START', closeAnchor: value.closeAnchor ?? 'END', openOffsetMinutes: value.openOffsetMinutes ?? -60, closeOffsetMinutes: value.closeOffsetMinutes ?? 120, override: value.override })
  }
  const updateOffset = (boundary: 'open' | 'close', patch: Partial<{ amount: number; unit: OffsetUnit; relation: 'before' | 'after'; anchor: SurveyAvailabilityAnchorValue }>) => {
    const currentOffset = boundary === 'open' ? value.openOffsetMinutes ?? 0 : value.closeOffsetMinutes ?? 0
    const current = offsetParts(currentOffset)
    const next = { ...current, ...patch }
    const offset = (next.relation === 'before' ? -1 : 1) * next.amount * unitMinutes(next.unit)
    onChange({ ...value, timezone, ...(boundary === 'open' ? { openAnchor: next.anchor ?? 'START', openOffsetMinutes: offset } : { closeAnchor: next.anchor ?? 'END', closeOffsetMinutes: offset }) })
  }
  const preview = value.mode === 'RELATIVE_TO_EVENT_AREA' && canScheduleAround
    ? relativePreview(value, scheduleContext!, timezone)
    : value.mode === 'CUSTOM_WINDOW' ? { opensAt: value.opensAt ? new Date(value.opensAt) : null, closesAt: value.closesAt ? new Date(value.closesAt) : null } : null

  const unavailableReason = scheduleUnavailableReason || 'Add schedule details to use this option.'
  return <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-testid="survey-availability-editor">
    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{advancedLabels ? 'Availability model' : 'Response window'}</h3>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {[
        { value: 'OPEN_IMMEDIATELY' as const, label: 'Always open', detail: 'Accept responses while published.' },
        { value: 'RELATIVE_TO_EVENT_AREA' as const, label: advancedLabels ? 'Relative to session' : 'Schedule around this survey', detail: canScheduleAround ? null : unavailableReason },
        { value: 'CUSTOM_WINDOW' as const, label: advancedLabels ? 'Fixed window' : 'Choose exact dates & times', detail: 'Set a fixed response window.' },
      ].map((option) => {
        const unavailable = option.value === 'RELATIVE_TO_EVENT_AREA' && !canScheduleAround
        if (unavailable) return <InfoTooltip key={option.value} content={unavailableReason} ariaLabel={`${option.label} is unavailable: ${unavailableReason}`} trigger={<span className="block rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm opacity-50 dark:border-zinc-800"><span className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 h-4 w-4 rounded-full border border-zinc-400" /><span><span className="block font-medium">{option.label}</span></span></span></span>} />
        return <label key={option.value} className={`rounded-lg border px-3 py-2 text-sm ${value.mode === option.value ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-zinc-200 dark:border-zinc-800'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}><span className="flex items-start gap-2"><input type="radio" name="survey-availability-mode" checked={value.mode === option.value} disabled={disabled} onChange={() => setMode(option.value)} className="mt-0.5" /><span><span className="block font-medium">{option.label}</span>{option.detail && <span className="mt-0.5 block text-xs text-zinc-500">{option.detail}</span>}</span></span></label>
      })}
    </div>

    {value.mode === 'RELATIVE_TO_EVENT_AREA' && scheduleContext && <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/20"><p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Based on: {scheduleContext.label} · {formatRange(scheduleContext.startsAt, scheduleContext.endsAt, timezone)}</p>{advancedLabels && <div className="mt-3 flex flex-wrap gap-2" aria-label="Relative availability presets">{[
      { label: 'During session', openAnchor: 'START' as const, openOffsetMinutes: 0, closeAnchor: 'END' as const, closeOffsetMinutes: 0 },
      { label: '30 min before · 2 hr after', openAnchor: 'START' as const, openOffsetMinutes: -30, closeAnchor: 'END' as const, closeOffsetMinutes: 120 },
      { label: 'At session end · 24 hr after', openAnchor: 'END' as const, openOffsetMinutes: 0, closeAnchor: 'END' as const, closeOffsetMinutes: 1440 },
    ].map((preset) => <button key={preset.label} type="button" disabled={disabled} onClick={() => onChange({ ...value, timezone, openAnchor: preset.openAnchor, openOffsetMinutes: preset.openOffsetMinutes, closeAnchor: preset.closeAnchor, closeOffsetMinutes: preset.closeOffsetMinutes })} className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:border-blue-400 disabled:opacity-50 dark:border-blue-900 dark:bg-zinc-950 dark:text-blue-300">{preset.label}</button>)}</div>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><OffsetControl label="Starts" value={value.openOffsetMinutes ?? -60} anchor={value.openAnchor ?? 'START'} onChange={(patch) => updateOffset('open', patch)} fieldClass={fieldClass} /><OffsetControl label="Ends" value={value.closeOffsetMinutes ?? 120} anchor={value.closeAnchor ?? 'END'} onChange={(patch) => updateOffset('close', patch)} fieldClass={fieldClass} /></div></div>}
    {value.mode === 'CUSTOM_WINDOW' && <div className="mt-4 grid gap-3 sm:grid-cols-2"><DateTimeField label="Starts" value={value.opensAt} timezone={timezone} disabled={disabled} fieldClass={fieldClass} onChange={(opensAt) => onChange({ ...value, timezone, opensAt })} /><DateTimeField label="Ends" value={value.closesAt} timezone={timezone} disabled={disabled} fieldClass={fieldClass} onChange={(closesAt) => onChange({ ...value, timezone, closesAt })} /></div>}
    {value.mode !== 'OPEN_IMMEDIATELY' && <label className="mt-3 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Timezone<input value={timezone} onChange={(event) => onChange({ ...value, timezone: event.target.value })} disabled={disabled || lockTimezone} placeholder="America/New_York" className={`mt-1 ${fieldClass}`} /></label>}
    {preview && <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"><span className="font-semibold">Availability preview:</span> {preview.opensAt && preview.closesAt ? `Available ${formatDate(preview.opensAt, timezone)} → ${formatDate(preview.closesAt, timezone)}` : 'Choose both dates and times to preview this response window.'}</p>}
  </div>
}

/** Uses the Events calendar plus the existing plain time-field pattern. */
function DateTimeField({ label, value, timezone, disabled, fieldClass, onChange }: { label: string; value: string | null; timezone: string; disabled: boolean; fieldClass: string; onChange: (value: string | null) => void }) {
  const localValue = toZonedLocalInput(value, timezone)
  const [date = '', time = ''] = localValue.split('T')
  const [timeDraft, setTimeDraft] = useState(time)
  useEffect(() => setTimeDraft(time), [time])
  const updateDate = (nextDate: string) => onChange(nextDate ? zonedLocalInputToIso(`${nextDate}T${normaliseTime(timeDraft)}`, timezone) : null)
  const updateTime = (nextTime: string) => {
    setTimeDraft(nextTime)
    if (date && /^([01]\d|2[0-3]):[0-5]\d$/.test(nextTime)) onChange(zonedLocalInputToIso(`${date}T${nextTime}`, timezone))
  }
  return <fieldset className="min-w-0"><legend className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</legend><div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><EventDatePicker aria-label={`${label} date`} value={date} onChange={updateDate} disabled={disabled} placeholder="Choose a date" /><input aria-label={`${label} time`} value={timeDraft} onChange={(event) => updateTime(event.target.value)} disabled={disabled} placeholder="HH:MM" inputMode="numeric" className={fieldClass} /></div></fieldset>
}

function OffsetControl({ label, value, anchor, onChange, fieldClass }: { label: string; value: number; anchor: SurveyAvailabilityAnchorValue; onChange: (patch: Partial<{ amount: number; unit: OffsetUnit; relation: 'before' | 'after'; anchor: SurveyAvailabilityAnchorValue }>) => void; fieldClass: string }) {
  const parts = offsetParts(value)
  return <fieldset><legend className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</legend><div className="mt-1 grid grid-cols-[72px_1fr] gap-2"><input aria-label={`${label} amount`} type="number" min="0" max="10080" value={parts.amount} onChange={(event) => onChange({ amount: Math.max(0, Number(event.target.value) || 0) })} className={fieldClass} /><select aria-label={`${label} unit`} value={parts.unit} onChange={(event) => onChange({ unit: event.target.value as OffsetUnit })} className={fieldClass}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select><select aria-label={`${label} relation`} value={parts.relation} onChange={(event) => onChange({ relation: event.target.value as 'before' | 'after' })} className={fieldClass}><option value="before">before</option><option value="after">after</option></select><select aria-label={`${label} anchor`} value={anchor} onChange={(event) => onChange({ anchor: event.target.value as SurveyAvailabilityAnchorValue })} className={fieldClass}><option value="START">start</option><option value="END">end</option></select></div></fieldset>
}

function unitMinutes(unit: OffsetUnit) { return unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1 }
function offsetParts(offset: number): { amount: number; unit: OffsetUnit; relation: 'before' | 'after' } { const absolute = Math.abs(offset); const unit: OffsetUnit = absolute > 0 && absolute % 1440 === 0 ? 'days' : absolute > 0 && absolute % 60 === 0 ? 'hours' : 'minutes'; return { amount: absolute / unitMinutes(unit), unit, relation: offset < 0 ? 'before' : 'after' } }
function relativePreview(value: SurveyAvailabilityFormValue, context: SurveyScheduleContext, timezone: string) { const boundary = (anchor: SurveyAvailabilityAnchorValue | null, offset: number | null) => { const source = anchor === 'START' ? context.startsAt : context.endsAt; return source && Number.isInteger(offset) ? new Date(new Date(source).getTime() + (offset as number) * 60_000) : null }; return { opensAt: boundary(value.openAnchor, value.openOffsetMinutes), closesAt: boundary(value.closeAnchor, value.closeOffsetMinutes) } }
function formatDate(date: Date, timezone: string) { try { return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(date) } catch { return date.toLocaleString() } }
function formatRange(startsAt: string | null, endsAt: string | null, timezone: string) { return startsAt && endsAt ? `${formatDate(new Date(startsAt), timezone)}–${new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeStyle: 'short' }).format(new Date(endsAt))}` : 'Schedule not set' }
function browserTimezone(): string { return typeof Intl === 'undefined' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
function normaliseTime(value: string): string { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '00:00' }
function toZonedLocalInput(value: string | null, timezone: string): string { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; try { const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date); const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''; return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}` } catch { return '' } }
function zonedLocalInputToIso(value: string, timezone: string): string | null { if (!value) return null; const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value); if (!match) return null; const targetUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])); let guess = targetUtc; try { for (let iteration = 0; iteration < 3; iteration += 1) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess)); const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value); guess -= Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) - targetUtc } return new Date(guess).toISOString() } catch { return null } }
