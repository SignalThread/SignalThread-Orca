/** Date inputs are calendar days in the selected event timezone, not UTC instants. */
export function isValidTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Resolve local noon: it avoids midnight DST gaps while retaining the selected calendar day. */
export function parseEventDate(value: FormDataEntryValue | null, timeZone = "UTC"): string | null | false {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !isValidTimeZone(timeZone)) return false;
  const desired = Date.parse(`${raw}T12:00:00Z`);
  if (!Number.isFinite(desired) || new Date(desired).toISOString().slice(0, 10) !== raw) return false;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(instant);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const local = Date.parse(`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`);
    if (local === desired) return new Date(instant).toISOString();
    instant += desired - local;
  }
  // Some timezones have skipped an entire date. Do not silently choose another day.
  return false;
}
