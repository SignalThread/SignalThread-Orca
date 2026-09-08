/**
 * Step handler contract for the workflow runtime.
 *
 * Phase 2 ships zero handlers. The runtime tolerates "unknown step type" by failing the
 * step run safely (with a typed error code), which lets the worker prove out claim/schedule
 * machinery before any handler exists.
 *
 * Subsequent phases register concrete handlers (enrich_lead, compose_email_draft, etc.)
 * by adding entries to {@link ./../step-handlers/index.ts}.
 *
 * Hard rules a handler MUST obey:
 *   - Idempotent. The runner can re-claim a step that crashed mid-flight.
 *   - Pure with respect to side effects: any external work (HTTP, OpenAI, DB writes)
 *     must be safe to repeat or guarded by the handler's own dedupe key.
 *   - Never auto-send AI artifacts from handlers. Approval-required terminal steps do not
 *     run from the normal worker path; the approval API executes them after review.
 *   - Honor the abort signal. Long calls should pass it through.
 */

import type {
  GeneratedDraftKind,
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepRunRow
} from "./workflow-types";

/**
 * Snapshot of context passed to a handler invocation.
 *
 * `previousStepOutputs` is keyed by `step_key` (NOT `step_id`) so handlers can refer to
 * earlier outputs by the stable user-visible key the template author chose. This is also
 * the single mechanism by which "later steps consume earlier outputs."
 */
export type WorkflowHandlerContext = {
  run: WorkflowRunRow;
  step: WorkflowStepRow;
  stepRun: WorkflowStepRunRow;
  /** All completed-step outputs keyed by step_key. */
  previousStepOutputs: Record<string, Record<string, unknown> | null>;
  /** Wall-clock budget the runner has already committed to; handler should respect. */
  abortSignal: AbortSignal;
};

export type WorkflowHandlerDraft = {
  kind: GeneratedDraftKind;
  content: Record<string, unknown>;
};

/**
 * Outcome of a single handler invocation.
 *
 * - ok            terminal success; output recorded; runner schedules next step
 * - draft         success that produced draft artifacts. Non-approval steps may promote or
 *                 complete immediately; approval-required steps are stopped before handler execution.
 * - retry         transient failure; runner re-queues with `scheduled_at = now() + retryAfterMs`
 * - wait          prerequisite data is not ready yet; runner pauses without failing
 * - fail          terminal failure; runner marks step + run as failed
 * - skipped       handler declined to run for this lead (e.g., missing prerequisites);
 *                 runner records and advances to next step
 */
export type WorkflowHandlerResult =
  | { kind: "ok"; output: Record<string, unknown> }
  | { kind: "draft"; output: Record<string, unknown>; drafts: WorkflowHandlerDraft[] }
  | {
      kind: "wait";
      waitingReason: "waiting_for_audio_transcript" | "waiting_for_conversation_insights";
      errorText: string;
      waitExpiresAt: string;
      output: Record<string, unknown>;
    }
  | {
      kind: "retry";
      retryAfterMs: number;
      errorText: string;
      errorCode?: string;
      output?: Record<string, unknown>;
    }
  | {
      kind: "fail";
      errorText: string;
      errorCode?: string;
      output?: Record<string, unknown>;
    }
  | { kind: "skipped"; reason: string; output?: Record<string, unknown> };

export type WorkflowHandler = {
  /** Stable string used as `workflow_steps.step_type`. */
  readonly stepType: string;
  /** Human-readable label (used by future UI). */
  readonly displayName: string;
  /** Per-handler default abort timeout in ms; runner caps at its own budget. */
  readonly defaultTimeoutMs?: number;
  run(ctx: WorkflowHandlerContext): Promise<WorkflowHandlerResult>;
};

export type WorkflowHandlerRegistry = ReadonlyMap<string, WorkflowHandler>;

/**
 * Test seam: build an isolated registry from explicit handlers without touching the
 * production singleton. Lives in the contracts module so tests can import it without
 * pulling the production handler implementations (and their server-only chains).
 */
export function buildWorkflowHandlerRegistry(
  handlers: ReadonlyArray<WorkflowHandler>
): WorkflowHandlerRegistry {
  const map = new Map<string, WorkflowHandler>();
  for (const h of handlers) {
    map.set(h.stepType, h);
  }
  return map;
}
