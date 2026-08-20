import { useCallback, useEffect, useRef, useState } from "react";

export type FnbAutosaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string };

type AssignmentJob<AssignmentPayload> = {
  kind: "assignment";
  key: string;
  payload: AssignmentPayload;
  revision: number;
  sequence: number;
};

type PlanJob<PlanPayload> = {
  kind: "plan";
  key: string;
  payload: PlanPayload;
  revision: number;
  sequence: number;
};

type FnbAutosaveJob<AssignmentPayload, PlanPayload> =
  | AssignmentJob<AssignmentPayload>
  | PlanJob<PlanPayload>;

type FnbAutosaveCoordinatorOptions<AssignmentPayload, AssignmentResult, PlanPayload, PlanResult> = {
  saveAssignment: (payload: AssignmentPayload) => Promise<AssignmentResult>;
  savePlan: (payload: PlanPayload) => Promise<PlanResult>;
  onAssignmentSaved: (result: AssignmentResult) => void | Promise<void>;
  onPlanSaved: (result: PlanResult) => void | Promise<void>;
};

const DEFAULT_DEBOUNCE_MS = 450;

/**
 * Serializes all F&B writes while coalescing drafts by assignment (and by the
 * session-level plan). A single queue prevents a rate resync from racing an
 * assignment update; revisions prevent an older response from replacing a
 * newer local draft.
 */
export function useFnbAutosaveCoordinator<AssignmentPayload, AssignmentResult, PlanPayload, PlanResult>(
  options: FnbAutosaveCoordinatorOptions<AssignmentPayload, AssignmentResult, PlanPayload, PlanResult>,
) {
  const optionsRef = useRef(options);
  const mountedRef = useRef(true);
  const timersRef = useRef(new Map<string, number>());
  const pendingRef = useRef(new Map<string, FnbAutosaveJob<AssignmentPayload, PlanPayload>>());
  const revisionsRef = useRef(new Map<string, number>());
  const sequenceRef = useRef(0);
  const runningRef = useRef(false);
  const retryRef = useRef<FnbAutosaveJob<AssignmentPayload, PlanPayload> | null>(null);
  const [status, setStatus] = useState<FnbAutosaveStatus>({ state: "idle" });

  optionsRef.current = options;

  const hasPendingWork = useCallback(() => pendingRef.current.size > 0 || runningRef.current, []);

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    const next = [...pendingRef.current.values()]
      .sort((left, right) => left.sequence - right.sequence)[0];
    if (!next) {
      if (mountedRef.current && !retryRef.current) setStatus({ state: "saved" });
      return;
    }

    pendingRef.current.delete(next.key);
    runningRef.current = true;
    if (mountedRef.current) setStatus({ state: "saving" });

    try {
      if (next.kind === "assignment") {
        const result = await optionsRef.current.saveAssignment(next.payload);
        if (revisionsRef.current.get(next.key) === next.revision) {
          await optionsRef.current.onAssignmentSaved(result);
          retryRef.current = null;
        }
      } else {
        const result = await optionsRef.current.savePlan(next.payload);
        if (revisionsRef.current.get(next.key) === next.revision) {
          await optionsRef.current.onPlanSaved(result);
          retryRef.current = null;
        }
      }
    } catch (error) {
      if (revisionsRef.current.get(next.key) === next.revision) {
        retryRef.current = next;
        if (mountedRef.current) {
          setStatus({
            state: "error",
            message: error instanceof Error ? error.message : "F&B changes could not be saved.",
          });
        }
      }
    } finally {
      runningRef.current = false;
      if (hasPendingWork()) {
        void drain();
      } else if (mountedRef.current && !retryRef.current) {
        setStatus({ state: "saved" });
      }
    }
  }, [hasPendingWork]);

  const schedule = useCallback((job: FnbAutosaveJob<AssignmentPayload, PlanPayload>, debounceMs: number) => {
    const existingTimer = timersRef.current.get(job.key);
    if (existingTimer) window.clearTimeout(existingTimer);
    retryRef.current = null;
    if (mountedRef.current) setStatus({ state: "saving" });
    const timer = window.setTimeout(() => {
      timersRef.current.delete(job.key);
      pendingRef.current.set(job.key, job);
      void drain();
    }, debounceMs);
    timersRef.current.set(job.key, timer);
  }, [drain]);

  const scheduleAssignment = useCallback((key: string, payload: AssignmentPayload, immediate = false) => {
    const revision = (revisionsRef.current.get(key) ?? 0) + 1;
    revisionsRef.current.set(key, revision);
    schedule({ kind: "assignment", key, payload, revision, sequence: ++sequenceRef.current }, immediate ? 0 : DEFAULT_DEBOUNCE_MS);
  }, [schedule]);

  const schedulePlan = useCallback((key: string, payload: PlanPayload, immediate = false) => {
    const revision = (revisionsRef.current.get(key) ?? 0) + 1;
    revisionsRef.current.set(key, revision);
    schedule({ kind: "plan", key, payload, revision, sequence: ++sequenceRef.current }, immediate ? 0 : DEFAULT_DEBOUNCE_MS);
  }, [schedule]);

  const retry = useCallback(() => {
    const failed = retryRef.current;
    if (!failed) return;
    retryRef.current = null;
    schedule({ ...failed, sequence: ++sequenceRef.current }, 0);
  }, [schedule]);

  const markSaved = useCallback(() => {
    retryRef.current = null;
    if (mountedRef.current) setStatus({ state: "saved" });
  }, []);

  const reportError = useCallback((message: string) => {
    if (mountedRef.current) setStatus({ state: "error", message });
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  return {
    status,
    scheduleAssignment,
    schedulePlan,
    retry,
    markSaved,
    reportError,
  };
}
