import { isIanaTimeZone } from "@/lib/integrations/google/calendar-core";

export function isCalendarOperationKey(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function validateCalendarMeetingInput(input: {
  startsAt: string;
  endsAt: string;
  timezone: string;
  title: string;
}) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const title = String(input.title ?? "").trim();
  if (
    !isIanaTimeZone(input.timezone) ||
    !title ||
    title.length > 200 ||
    /[\r\n]/.test(title)
  ) {
    return null;
  }
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return null;
  }
  if (endsAt.getTime() - startsAt.getTime() > 8 * 60 * 60_000) return null;
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: input.timezone,
    title
  };
}
