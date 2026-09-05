function wallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') }
}

/** Converts an HTML datetime-local wall time using the selected IANA timezone. */
export function eventLocalDateTimeToIso(localValue: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue)
  if (!match) throw new Error('Date and time must be valid')
  const target = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0),
  }
  const targetWall = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second)
  let instant = targetWall
  try {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const current = wallParts(new Date(instant), timeZone)
      const currentWall = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second)
      instant += targetWall - currentWall
    }
    const resolved = wallParts(new Date(instant), timeZone)
    if (Object.entries(target).some(([key, value]) => resolved[key as keyof typeof resolved] !== value)) {
      throw new Error('This local time does not exist in the selected timezone')
    }
    return new Date(instant).toISOString()
  } catch (error) {
    if (error instanceof RangeError) throw new Error('Timezone must be a valid IANA timezone')
    throw error
  }
}
