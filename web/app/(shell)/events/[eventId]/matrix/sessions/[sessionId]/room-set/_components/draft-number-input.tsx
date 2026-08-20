"use client";

import {
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  useState,
} from "react";

function clampDraftNumber(value: number, min: number | undefined, max: number | undefined): number {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}

function defaultFormatDraftNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(2)).toString();
}

type DraftNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange" | "onKeyDown" | "min" | "max" | "step"
> &
  Readonly<{
    value: number;
    min?: number;
    max?: number;
    step?: number;
    formatValue?: (value: number) => string;
    onCommit: (value: number) => void;
  }>;

export function DraftNumberInput({
  value,
  min,
  max,
  step,
  formatValue = defaultFormatDraftNumber,
  onCommit,
  ...inputProps
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const [focused, setFocused] = useState(false);

  const resetDraft = () => setDraft(formatValue(value));

  const commitDraft = (): boolean => {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === "." || trimmed === "-" || trimmed === "+") {
      resetDraft();
      return false;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      resetDraft();
      return false;
    }
    const next = clampDraftNumber(parsed, min, max);
    onCommit(next);
    setDraft(formatValue(next));
    return true;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetDraft();
      event.currentTarget.blur();
    }
  };

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={focused ? draft : formatValue(value)}
      onFocus={(event) => {
        setFocused(true);
        inputProps.onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        setFocused(false);
        commitDraft();
        inputProps.onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
