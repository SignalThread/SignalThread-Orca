export type Matrix2SnapshotScope = Readonly<{
  event: Readonly<{
    id: string;
    startDate: string;
  }>;
  sessions: readonly Readonly<{
    id: string;
    eventId: string;
    date: string;
  }>[];
}>;

/** The snapshot must remain wholly inside the event selected by the route. */
export function isMatrix2SnapshotForEvent(snapshot: unknown, eventId: string): snapshot is Matrix2SnapshotScope {
  if (!snapshot || typeof snapshot !== "object") return false;

  const candidate = snapshot as Partial<Matrix2SnapshotScope>;
  if (!candidate.event || candidate.event.id !== eventId || !Array.isArray(candidate.sessions)) return false;

  return candidate.sessions.every((session) => session.eventId === eventId);
}

export function isCurrentMatrix2SnapshotRequest(requestVersion: number, currentRequestVersion: number): boolean {
  return requestVersion === currentRequestVersion;
}

export function earliestMatrix2SessionDate(snapshot: Matrix2SnapshotScope): string {
  return snapshot.sessions.reduce<string | null>((earliest, session) => {
    if (!earliest || session.date < earliest) return session.date;
    return earliest;
  }, null) ?? snapshot.event.startDate;
}

export function resolveMatrix2SelectedDate(input: {
  snapshot: Matrix2SnapshotScope;
  currentDate: string;
  preserveCurrentDate: boolean;
}): string {
  const { snapshot, currentDate, preserveCurrentDate } = input;
  if (preserveCurrentDate && snapshot.sessions.some((session) => session.date === currentDate)) {
    return currentDate;
  }
  return earliestMatrix2SessionDate(snapshot);
}

export function matrix2SessionsForEventDate<T extends Matrix2SnapshotScope["sessions"][number]>(input: {
  snapshot: { sessions: readonly T[] };
  eventId: string;
  date: string;
}): T[] {
  return input.snapshot.sessions.filter((session) => session.eventId === input.eventId && session.date === input.date);
}
