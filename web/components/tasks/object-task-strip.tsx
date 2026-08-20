"use client";

import { AlertTriangle, CheckCircle2, Loader2, Plus, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FEATURES } from "@/config/features";
import { TaskDrawer } from "./task-drawer";
import {
  isReadOnlyTaskApiError,
  listObjectTasks,
  summarizeTasks,
  type TaskLinkObjectType,
  type TaskRecord,
} from "./task-api";

type ObjectTaskStripProps = {
  eventId: string;
  objectType: TaskLinkObjectType;
  objectId: string;
  objectLabel: string;
  className?: string;
};

function normalizeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ObjectTaskStrip({ eventId, objectType, objectId, objectLabel, className }: ObjectTaskStripProps) {
  const genericTaskingUiEnabled = FEATURES.ENABLE_GENERIC_TASKING_UI;
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);

  useEffect(() => {
    if (!genericTaskingUiEnabled) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setIsLoading(true);
      setErrorMessage(null);
    });
    void listObjectTasks(eventId, objectType, objectId, controller.signal)
      .then((nextTasks) => {
        setTasks(nextTasks);
        setSelectedTaskId((currentTaskId) =>
          nextTasks.some((task) => task.id === currentTaskId) ? currentTaskId : nextTasks[0]?.id ?? null,
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (isReadOnlyTaskApiError(error)) setReadOnly(true);
        setErrorMessage(normalizeError(error, "Failed to load tasks"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [eventId, genericTaskingUiEnabled, objectType, objectId]);

  if (!genericTaskingUiEnabled) {
    return null;
  }

  const statusText = summary.total === 0 ? "No tasks yet" : `${summary.blocked} blocked, ${summary.open} open`;
  const stripLabel = summary.total === 0 ? "Tasks 0" : `Tasks ${summary.total}: ${summary.blocked} blocked, ${summary.open} open`;

  return (
    <>
      <div className={["flex min-w-0 flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          aria-label={`${objectType === "MATRIX_ROW" ? "Session-linked" : "Object-linked"} ${stripLabel}`}
          className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-left text-[12px] font-semibold text-slate-700 shadow-sm transition hover:border-[#28439A]/25 hover:bg-slate-50 hover:text-[#28439A]"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" aria-hidden />
          ) : summary.blocked > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          )}
          <span className="whitespace-nowrap">Tasks {summary.total}</span>
          <span className="hidden max-w-[240px] truncate text-[11px] font-medium text-slate-500 sm:inline">
            {isLoading ? (
              "Loading"
            ) : summary.total === 0 ? (
              statusText
            ) : (
              <>
                &middot; {summary.blocked} blocked &middot; {summary.open} open.
              </>
            )}
          </span>
          {readOnly ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Read-only tasks" /> : null}
        </button>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => {
              setSelectedTaskId(null);
              setIsDrawerOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:border-[#28439A]/25 hover:bg-slate-50 hover:text-[#28439A]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add task
          </button>
        ) : null}
        {errorMessage ? <span className="text-[11px] text-rose-600">{errorMessage}</span> : null}
      </div>

      <TaskDrawer
        isOpen={isDrawerOpen}
        eventId={eventId}
        objectType={objectType}
        objectId={objectId}
        objectLabel={objectLabel}
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        readOnly={readOnly}
        onClose={() => setIsDrawerOpen(false)}
        onSelectedTaskIdChange={setSelectedTaskId}
        onTasksChange={setTasks}
        onReadOnlyChange={setReadOnly}
      />
    </>
  );
}
