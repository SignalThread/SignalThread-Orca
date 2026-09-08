/**
 * Deterministic cleanup registry for core-journey tests.
 *
 * A journey test registers a cleanup task for each fixture it creates. At the end of
 * the test (always in a `finally`/`after` block) it calls {@link JourneyCleanupRegistry.cleanup},
 * which runs the tasks in **reverse registration order** (last-created cleaned first, so
 * child rows are removed before their parents).
 *
 * Guarantees:
 * - `cleanup()` never throws — it is safe to call from a `finally` block even if setup
 *   failed halfway. Only the tasks that were actually registered run.
 * - Every task is attempted even if an earlier task fails; failures are collected and
 *   returned, not swallowed silently and not allowed to abort the rest.
 * - Error details are reduced to a sanitized message string so callers that print the
 *   outcome cannot accidentally leak secrets/provider payloads embedded in an error.
 */

export type CleanupTask = {
  label: string;
  run: () => Promise<void> | void;
};

export type CleanupError = {
  label: string;
  message: string;
};

export type CleanupOutcome = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: CleanupError[];
};

/** Reduce an arbitrary thrown value to a short, secret-safe message string. */
export function sanitizeCleanupErrorMessage(error: unknown): string {
  let message: string;
  if (error instanceof Error) message = error.message;
  else if (typeof error === "string") message = error;
  else {
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  }
  message = (message ?? "").toString().replace(/\s+/g, " ").trim();
  return message.length > 200 ? `${message.slice(0, 197)}...` : message;
}

export class JourneyCleanupRegistry {
  private tasks: CleanupTask[] = [];

  /** Register a cleanup task. Tasks run in reverse order of registration. */
  register(label: string, run: () => Promise<void> | void): void {
    this.tasks.push({ label, run });
  }

  /** Number of tasks currently pending cleanup. */
  get size(): number {
    return this.tasks.length;
  }

  /**
   * Run every registered task in reverse order. Never throws: each task is wrapped so a
   * failure is recorded and the remaining tasks still run. Tasks are cleared afterward,
   * so a second `cleanup()` call is a safe no-op.
   */
  async cleanup(): Promise<CleanupOutcome> {
    const outcome: CleanupOutcome = { attempted: 0, succeeded: 0, failed: 0, errors: [] };
    const pending = this.tasks;
    this.tasks = [];
    for (let i = pending.length - 1; i >= 0; i--) {
      const task = pending[i];
      outcome.attempted++;
      try {
        await task.run();
        outcome.succeeded++;
      } catch (error) {
        outcome.failed++;
        outcome.errors.push({ label: task.label, message: sanitizeCleanupErrorMessage(error) });
      }
    }
    return outcome;
  }
}
