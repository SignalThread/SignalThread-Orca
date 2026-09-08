function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function addDateKeyDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

export function weekStartDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addDateKeyDays(dateKey, -daysSinceMonday);
}

export function weekDateKeys(weekStart: string) {
  return Array.from({ length: 7 }, (_, offset) => addDateKeyDays(weekStart, offset));
}

export function setDateKeyWithTime(currentLocal: string, dateKey: string) {
  const time = currentLocal.split("T")[1] || "09:00";
  return `${dateKey}T${time}`;
}

export function monthKeyForDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function addMonthKey(monthKey: string, months: number) {
  const date = parseMonthKey(monthKey);
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarMonthDays(monthKey: string) {
  const month = parseMonthKey(monthKey);
  const leadingDays = (month.getUTCDay() + 6) % 7;
  const first = new Date(month);
  first.setUTCDate(first.getUTCDate() - leadingDays);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(first.getUTCDate() + index);
    return { dateKey: toDateKey(day), inMonth: day.getUTCMonth() === month.getUTCMonth() };
  });
}
