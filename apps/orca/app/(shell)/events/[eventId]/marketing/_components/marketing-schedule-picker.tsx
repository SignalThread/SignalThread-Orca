"use client";

import { useMemo } from "react";
import { MarketingDatePicker } from "./marketing-date-picker";

type ScheduleParts = {
  date: string;
  time: string;
};

type TimeOption = {
  value: string;
  label: string;
};

type MarketingSchedulePickerProps = ScheduleParts & {
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  timezoneLabel: string;
};

function twoDigit(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeInput(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function schedulePartsFromIso(value: string | null | undefined): ScheduleParts {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };

  return {
    date: `${date.getFullYear()}-${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())}`,
    time: `${twoDigit(date.getHours())}:${twoDigit(date.getMinutes())}`,
  };
}

export function schedulePartsToIso(dateValue: string, timeValue: string): string | null {
  if (!isValidDateInput(dateValue) || !isValidTimeInput(timeValue)) return null;
  const date = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== Number(dateValue.slice(0, 4)) ||
    date.getMonth() + 1 !== Number(dateValue.slice(5, 7)) ||
    date.getDate() !== Number(dateValue.slice(8, 10))
  ) {
    return null;
  }
  return date.toISOString();
}

export function formatScheduleTimeLabel(value: string): string {
  if (!isValidTimeInput(value)) return value;
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText} ${period}`;
}

export function scheduleTimeOptions(currentTime: string): TimeOption[] {
  const values = new Set<string>();
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      values.add(`${twoDigit(hour)}:${twoDigit(minute)}`);
    }
  }
  if (isValidTimeInput(currentTime)) values.add(currentTime);

  return Array.from(values)
    .sort()
    .map((value) => ({ value, label: formatScheduleTimeLabel(value) }));
}

export function MarketingSchedulePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  timezoneLabel,
}: MarketingSchedulePickerProps) {
  const timeOptions = useMemo(() => scheduleTimeOptions(time), [time]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <MarketingDatePicker label="Date" value={date} onChange={onDateChange} />
        <label className="block">
          <span className="text-[12px] font-semibold text-slate-700">Time</span>
          <select
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-800 outline-none focus:border-slate-300"
          >
            <option value="">Select time</option>
            {timeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 text-[12px] text-slate-400">Timezone: {timezoneLabel}</div>
    </div>
  );
}
