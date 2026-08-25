"use client";

import { DateField } from "./date-field";
import { TimeField } from "./time-field";

type DateTimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

function splitDateTimeValue(value: string): { date: string; time: string } {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/);
  return match ? { date: match[1], time: match[2] } : { date: "", time: "" };
}

export function DateTimeField({ value, onChange, disabled = false, ariaLabel = "Date and time", className }: DateTimeFieldProps) {
  const { date, time } = splitDateTimeValue(value);

  function updateDate(nextDate: string) {
    onChange(nextDate ? `${nextDate}T${time || "00:00"}` : "");
  }

  function updateTime(nextTime: string) {
    onChange(date && nextTime ? `${date}T${nextTime}` : "");
  }

  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      <div className="grid gap-2 sm:grid-cols-2">
        <DateField
          value={date}
          onChange={updateDate}
          disabled={disabled}
          ariaLabel={`${ariaLabel} date`}
          size="compact"
        />
        <TimeField
          value={time}
          onChange={updateTime}
          disabled={disabled}
          ariaLabel={`${ariaLabel} time`}
          size="compact"
        />
      </div>
    </div>
  );
}
