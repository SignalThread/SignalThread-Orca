export type SessionSnapshotShape<TSession extends { id: string }> = {
  event: { id: string };
  sessions: TSession[];
};

export type SessionDetailLoadResult<TSnapshot, TSession> =
  | { kind: "success"; snapshot: TSnapshot; session: TSession }
  | { kind: "not-found"; snapshot: TSnapshot };

export class SessionDetailLoadError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

function payloadErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

export async function fetchSessionDetailSnapshot<
  TSession extends { id: string },
  TSnapshot extends SessionSnapshotShape<TSession>,
>({
  eventId,
  sessionId,
  signal,
  fetcher = fetch,
}: {
  eventId: string;
  sessionId: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<SessionDetailLoadResult<TSnapshot, TSession>> {
  const response = await fetcher(`/api/events/${eventId}/matrix-2?source=session-detail-page`, { signal });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SessionDetailLoadError(
      response.ok ? "Session response was invalid. Please retry." : `Failed to load session (HTTP ${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    throw new SessionDetailLoadError(
      payloadErrorMessage(payload, `Failed to load session (HTTP ${response.status}).`),
      response.status,
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new SessionDetailLoadError("Session response was invalid. Please retry.");
  }

  const snapshot = payload as TSnapshot;
  if (snapshot.event?.id !== eventId || !Array.isArray(snapshot.sessions)) {
    throw new SessionDetailLoadError("Session data did not match the requested event.");
  }

  const session = snapshot.sessions.find((entry) => entry.id === sessionId);
  return session
    ? { kind: "success", snapshot, session }
    : { kind: "not-found", snapshot };
}
