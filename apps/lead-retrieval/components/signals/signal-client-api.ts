import type { SignalMutationPayload, SignalRecord } from "@/components/signals/signal-types";

/** Single client entry for signal POST/PATCH — same contract as Campaign Agents. */
export async function requestSaveSignal(
  payload: SignalMutationPayload,
  signalId?: string,
  options?: { eventId?: string | null }
): Promise<SignalRecord> {
  const query = new URLSearchParams();
  const eventId = options?.eventId?.trim();
  if (eventId) query.set("eventId", eventId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const endpoint = signalId ? `/api/signals/${encodeURIComponent(signalId)}${suffix}` : `/api/signals${suffix}`;
  const method = signalId ? "PATCH" : "POST";
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { signal?: SignalRecord; error?: string };
  if (!response.ok || !result.signal) {
    throw new Error(result.error ?? "Failed to save Campaign Agent");
  }
  return result.signal;
}

export async function requestSignal(
  signalId: string,
  options?: { eventId?: string | null }
): Promise<SignalRecord> {
  const query = new URLSearchParams();
  const eventId = options?.eventId?.trim();
  if (eventId) query.set("eventId", eventId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/signals/${encodeURIComponent(signalId)}${suffix}`, { cache: "no-store" });
  const payload = (await response.json()) as { signal?: SignalRecord; error?: string };
  if (!response.ok || !payload.signal) {
    throw new Error(payload.error ?? "Failed to load Campaign Agent");
  }
  return payload.signal;
}
