import "server-only";

/**
 * Best-effort kick of the internal worker after a lead-captured emit.
 *
 * NEVER throws and NEVER blocks the caller for more than ~50ms (AbortSignal timeout).
 * Cron is the source of truth for liveness; this just removes tail latency on hot paths.
 *
 * Configuration:
 *   - WORKFLOW_TICK_URL    Absolute URL of the internal worker endpoint. If unset, we skip
 *                          the kick entirely (cron will pick the work up).
 *   - WORKFLOW_TICK_SECRET Bearer token expected by the worker.
 *
 * Note: this fires the request without awaiting the response. It's intentionally a
 * fire-and-forget so emit returns within microseconds. The Promise is intentionally
 * not exposed to callers.
 */
export function fireInternalWorkerTick(): void {
  const tickUrl = String(process.env.WORKFLOW_TICK_URL ?? "").trim();
  if (!tickUrl) return;

  const secret = String(process.env.WORKFLOW_TICK_SECRET ?? "").trim();
  if (!secret) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50);

    void fetch(tickUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ source: "lead_captured_kick" }),
      signal: controller.signal,
      cache: "no-store"
    })
      .catch(() => {
        // Swallow: cron will pick up.
      })
      .finally(() => {
        clearTimeout(timer);
      });
  } catch {
    // Swallow construction failures (e.g., AbortController unavailable in some test runtimes).
  }
}
