"use client";

import {
  AlertTriangle,
  Check,
  Circle,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { DateTimeField } from "@/components/date-time-field";
import {
  addTaskComment,
  assignTask,
  blockTask,
  completeTask,
  createManualTask,
  isReadOnlyTaskApiError,
  listTaskAssignees,
  reopenTask,
  type TaskAssignableUser,
  type TaskLinkObjectType,
  type TaskPriority,
  type TaskRecord,
  updateTask,
} from "./task-api";

type TaskDrawerProps = {
  isOpen: boolean;
  eventId: string;
  objectType?: TaskLinkObjectType;
  objectId?: string;
  objectLabel: string;
  tasks: TaskRecord[];
  selectedTaskId: string | null;
  readOnly: boolean;
  allowCreateWithoutLink?: boolean;
  createHelperCopy?: string;
  createLinkLabel?: string;
  createLinkOptions?: TaskCreateLinkOption[];
  openWithoutSelectionInCreateMode?: boolean;
  onClose: () => void;
  onSelectedTaskIdChange: (taskId: string | null) => void;
  onTasksChange: (tasks: TaskRecord[]) => void;
  onReadOnlyChange: (readOnly: boolean) => void;
};

export type TaskCreateLinkOption = {
  objectType: TaskLinkObjectType;
  objectId: string;
  label: string;
  description?: string;
};

const PRIORITY_OPTIONS: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatDateTime(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function toDateTimeInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusClasses(status: TaskRecord["status"]): string {
  if (status === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "DONE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "IN_PROGRESS") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "CANCELED") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-slate-200 bg-white text-slate-700";
}

function statusLabel(status: TaskRecord["status"]): string {
  if (status === "DONE") return "COMPLETE";
  return status.replaceAll("_", " ");
}

function priorityClasses(priority: TaskPriority): string {
  if (priority === "CRITICAL") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "HIGH") return "border-amber-200 bg-amber-50 text-amber-800";
  if (priority === "LOW") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function normalizeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function taskIsClosed(task: TaskRecord): boolean {
  return task.status === "DONE" || task.status === "CANCELED";
}

function assigneeLabel(user: TaskAssignableUser): string {
  const name = user.name?.trim();
  return name ? `${name} (${user.email})` : user.email;
}

function roleLabel(role: string): string {
  return role.replaceAll("_", " ").toLowerCase();
}

function blockedContextForTask(task: TaskRecord): string | null {
  const latestBlockedActivity = task.activity
    .slice()
    .reverse()
    .find((entry) => entry.message.startsWith("Task blocked: "));
  return latestBlockedActivity?.message.replace(/^Task blocked:\s*/, "").trim() || null;
}

function linkOptionKey(option: Pick<TaskCreateLinkOption, "objectType" | "objectId">): string {
  return `${option.objectType}:${option.objectId}`;
}

export function TaskDrawer({
  isOpen,
  eventId,
  objectType,
  objectId,
  objectLabel,
  tasks,
  selectedTaskId,
  readOnly,
  allowCreateWithoutLink = false,
  createHelperCopy,
  createLinkLabel = "Attach to session",
  createLinkOptions = [],
  openWithoutSelectionInCreateMode = false,
  onClose,
  onSelectedTaskIdChange,
  onTasksChange,
  onReadOnlyChange,
}: TaskDrawerProps) {
  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null),
    [selectedTaskId, tasks],
  );
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [dueAt, setDueAt] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<TaskAssignableUser[]>([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [selectedAssigneeUserId, setSelectedAssigneeUserId] = useState("");
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [selectedCreateLinkKey, setSelectedCreateLinkKey] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);

  const canWrite = !readOnly && !workingAction;
  const assignableUsersById = useMemo(
    () => new Map(assignableUsers.map((user) => [user.id, user])),
    [assignableUsers],
  );
  const defaultCreateLink = objectType && objectId ? { objectType, objectId, label: objectLabel } : null;
  const selectedCreateLink = useMemo(() => {
    if (!selectedCreateLinkKey) return null;
    return createLinkOptions.find((option) => linkOptionKey(option) === selectedCreateLinkKey) ?? null;
  }, [createLinkOptions, selectedCreateLinkKey]);
  const createRequiresLink = !allowCreateWithoutLink && !defaultCreateLink;
  const createLinkMissing = createRequiresLink && !selectedCreateLink;
  const createContextLabel = objectType ? objectType.replaceAll("_", " ").toLowerCase() : "event";

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setIsLoadingAssignees(true);
    setAssigneeError(null);
    void listTaskAssignees(eventId, controller.signal)
      .then((users) => setAssignableUsers(users))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (isReadOnlyTaskApiError(error)) {
          onReadOnlyChange(true);
        }
        setAssigneeError(normalizeError(error, "Failed to load assignable users"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingAssignees(false);
      });

    return () => controller.abort();
  }, [eventId, isOpen, onReadOnlyChange]);

  useEffect(() => {
    if (!selectedTask) {
      if (tasks.length === 0 || openWithoutSelectionInCreateMode) {
        setIsCreating(true);
      }
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setDueAt("");
      setSelectedAssigneeUserId("");
      setSelectedCreateLinkKey("");
      return;
    }
    setIsCreating(false);
    setTitle(selectedTask.title);
    setDescription(selectedTask.description ?? "");
    setPriority(selectedTask.priority);
    setDueAt(toDateTimeInputValue(selectedTask.dueAt));
    setBlockReason("");
    setCommentBody("");
    setSelectedAssigneeUserId("");
    setAssigneeError(null);
  }, [openWithoutSelectionInCreateMode, selectedTask, tasks.length]);

  function replaceTask(nextTask: TaskRecord): void {
    const exists = tasks.some((task) => task.id === nextTask.id);
    const nextTasks = exists ? tasks.map((task) => (task.id === nextTask.id ? nextTask : task)) : [nextTask, ...tasks];
    onTasksChange(nextTasks);
    onSelectedTaskIdChange(nextTask.id);
  }

  function handleMutationError(error: unknown, fallback: string): void {
    if (isReadOnlyTaskApiError(error)) {
      onReadOnlyChange(true);
      setErrorMessage("You can view tasks for this event, but editing requires event editor access.");
      return;
    }
    setErrorMessage(normalizeError(error, fallback));
  }

  async function runTaskAction(action: string, fn: () => Promise<TaskRecord>, successMessage: string): Promise<boolean> {
    setWorkingAction(action);
    setErrorMessage(null);
    setNotice(null);
    try {
      const task = await fn();
      replaceTask(task);
      setNotice(action === "block" ? "Task blocked. Status changed to BLOCKED." : successMessage);
      return true;
    } catch (error) {
      handleMutationError(error, successMessage);
      return false;
    } finally {
      setWorkingAction(null);
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canWrite || !title.trim() || createLinkMissing) return;
    const link = selectedCreateLink ?? defaultCreateLink;
    const created = await runTaskAction(
      "create",
      () =>
        createManualTask({
          eventId,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueAt: toIsoOrNull(dueAt),
          assigneeUserIds: selectedAssigneeUserId ? [selectedAssigneeUserId] : [],
          links: link ? [{ objectType: link.objectType, objectId: link.objectId }] : [],
        }),
      "Task added.",
    );
    if (created) setIsCreating(false);
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTask || !canWrite || !title.trim()) return;
    await runTaskAction(
      "update",
      () =>
        updateTask(eventId, selectedTask.id, {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueAt: toIsoOrNull(dueAt),
        }),
      "Task updated.",
    );
  }

  async function submitComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTask || !canWrite || !commentBody.trim()) return;
    const body = commentBody.trim();
    await runTaskAction("comment", () => addTaskComment(eventId, selectedTask.id, body), "Comment added.");
    setCommentBody("");
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTask || !canWrite || !selectedAssigneeUserId) return;
    const userId = selectedAssigneeUserId;
    setWorkingAction("assign");
    setAssigneeError(null);
    setErrorMessage(null);
    setNotice(null);
    try {
      const task = await assignTask(eventId, selectedTask.id, userId);
      replaceTask(task);
      setNotice("Task assigned.");
      setSelectedAssigneeUserId("");
    } catch (error) {
      if (isReadOnlyTaskApiError(error)) {
        onReadOnlyChange(true);
        setAssigneeError("Event editor access is required to assign tasks.");
      } else {
        setAssigneeError(normalizeError(error, "Failed to assign task"));
      }
    } finally {
      setWorkingAction(null);
    }
  }

  async function submitBlock(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTask || !canWrite || !blockReason.trim()) return;
    const reason = blockReason.trim();
    await runTaskAction("block", () => blockTask(eventId, selectedTask.id, reason), "Task blocked.");
    setBlockReason("");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/30 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Task drawer">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close task drawer" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[760px] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Tasks</p>
            <h2 className="mt-0.5 truncate text-[20px] font-semibold text-slate-950">{objectLabel}</h2>
            <p className="mt-1 truncate text-[12px] text-slate-500">
              {createContextLabel} linked work
            </p>
            <p className="mt-2 max-w-[620px] text-[12px] leading-5 text-slate-500">
              {createHelperCopy ?? "These are manual tasks linked to this session. They do not change module readiness automatically."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            aria-label="Close task drawer"
            title="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {readOnly ? (
          <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>Read-only access. Event editor access is required to change tasks.</p>
          </div>
        ) : null}
        {errorMessage ? <p className="mx-5 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{errorMessage}</p> : null}
        {notice ? <p className="mx-5 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{notice}</p> : null}

        <div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)] overflow-hidden max-[760px]:grid-cols-1">
          <section className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 max-[760px]:max-h-56 max-[760px]:border-b max-[760px]:border-r-0">
              <button
                type="button"
                onClick={() => {
                setIsCreating(true);
                onSelectedTaskIdChange(null);
                setTitle("");
                setDescription("");
                setPriority("MEDIUM");
                setDueAt("");
                setSelectedCreateLinkKey("");
                }}
                disabled={readOnly}
                title={readOnly ? "Event editor access is required to add tasks." : "Add task"}
                className="mb-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add task
            </button>

            {tasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-[12px] text-slate-500">
                No tasks yet. Add a manual task.
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => {
                  const selected = !isCreating && selectedTask?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setIsCreating(false);
                        onSelectedTaskIdChange(task.id);
                      }}
                      className={[
                        "w-full rounded-lg border bg-white px-3 py-2 text-left transition hover:border-[#28439A]/30",
                        selected ? "border-[#28439A] shadow-sm" : "border-slate-200",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-2">
                        {taskIsClosed(task) ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-slate-900">{task.title}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusClasses(task.status)}`}>
                              {statusLabel(task.status)}
                            </span>
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${priorityClasses(task.priority)}`}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="min-h-0 overflow-y-auto p-5">
            {isCreating ? (
              <form className="space-y-4" onSubmit={(event) => void submitCreate(event)}>
                <div>
                  <h3 className="text-[17px] font-semibold text-slate-950">Add task</h3>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {createHelperCopy ?? `Creates a manual internal task linked to ${objectLabel}.`}
                  </p>
                </div>
                {createLinkOptions.length > 0 ? (
                  <div>
                    <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-create-link-picker">
                      {createLinkLabel}
                    </label>
                    <select
                      id="task-create-link-picker"
                      value={selectedCreateLinkKey}
                      onChange={(event) => setSelectedCreateLinkKey(event.target.value)}
                      disabled={!canWrite}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
                    >
                      {allowCreateWithoutLink ? <option value="">No session attachment</option> : <option value="">Select a session</option>}
                      {createLinkOptions.map((option) => (
                        <option key={linkOptionKey(option)} value={linkOptionKey(option)}>
                          {option.description ? `${option.label} - ${option.description}` : option.label}
                        </option>
                      ))}
                    </select>
                    {createLinkMissing ? <p className="mt-1 text-[12px] text-slate-500">Select a session to attach this task.</p> : null}
                  </div>
                ) : null}
                <TaskFields
                  title={title}
                  description={description}
                  priority={priority}
                  dueAt={dueAt}
                  disabled={!canWrite}
                  assignableUsers={assignableUsers}
                  selectedAssigneeUserId={selectedAssigneeUserId}
                  isLoadingAssignees={isLoadingAssignees}
                  assigneeError={assigneeError}
                  onTitleChange={setTitle}
                  onDescriptionChange={setDescription}
                  onPriorityChange={setPriority}
                  onDueAtChange={setDueAt}
                  onAssigneeChange={setSelectedAssigneeUserId}
                />
                <button
                  type="submit"
                  disabled={!canWrite || !title.trim() || createLinkMissing}
                  title={
                    readOnly
                      ? "Event editor access is required to add tasks."
                      : !title.trim()
                        ? "Enter a title to add this task."
                        : createLinkMissing
                          ? "Select a session to attach this task."
                          : "Add task"
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {workingAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  Add task
                </button>
                {!title.trim() ? <p className="text-[12px] text-slate-500">Enter a title to add this task.</p> : null}
              </form>
            ) : selectedTask ? (
              <div className="space-y-5">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-slate-800">Status</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusClasses(selectedTask.status)}`}>
                          {statusLabel(selectedTask.status)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${priorityClasses(selectedTask.priority)}`}>
                          {selectedTask.priority}
                        </span>
                      </div>
                      {selectedTask.status === "BLOCKED" ? (
                        <p className="mt-2 text-[12px] text-rose-700">
                          {blockedContextForTask(selectedTask)
                            ? `Blocked: ${blockedContextForTask(selectedTask)}`
                            : "This task is blocked."}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedTask.status === "DONE" ? (
                        <button
                          type="button"
                          onClick={() =>
                            void runTaskAction(
                              "reopen",
                              () => reopenTask(eventId, selectedTask.id),
                              "Task reopened. Status changed to OPEN.",
                            )
                          }
                          disabled={!canWrite}
                          title={readOnly ? "Event editor access is required to reopen tasks." : workingAction ? "Task action in progress." : "Reopen task"}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          Reopen
                        </button>
                      ) : (
                        <>
                          {selectedTask.status === "BLOCKED" ? (
                            <button
                              type="button"
                              onClick={() =>
                                void runTaskAction(
                                  "reopen",
                                  () => reopenTask(eventId, selectedTask.id),
                                  "Task reopened. Status changed to OPEN.",
                                )
                              }
                              disabled={!canWrite}
                              title={readOnly ? "Event editor access is required to reopen tasks." : workingAction ? "Task action in progress." : "Reopen task"}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              Reopen
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              void runTaskAction(
                                "complete",
                                () => completeTask(eventId, selectedTask.id),
                                "Task completed. Status changed to COMPLETE.",
                              )
                            }
                            disabled={!canWrite}
                            title={readOnly ? "Event editor access is required to complete tasks." : workingAction ? "Task action in progress." : "Complete task"}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            Complete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {selectedTask.status !== "DONE" && selectedTask.status !== "CANCELED" ? (
                    <form className="mt-3 rounded-lg border border-rose-200 bg-white p-3" onSubmit={(event) => void submitBlock(event)}>
                      <label className="text-[12px] font-semibold text-rose-800" htmlFor="task-block-reason">
                        Block reason
                      </label>
                      <div className="mt-2 flex gap-2">
                        <input
                          id="task-block-reason"
                          value={blockReason}
                          onChange={(event) => setBlockReason(event.target.value)}
                          disabled={!canWrite}
                          className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-rose-400 disabled:bg-slate-100"
                          placeholder="What is blocking this?"
                        />
                        <button
                          type="submit"
                          disabled={!blockReason.trim()}
                          title={readOnly ? "Event editor access is required to block tasks." : !blockReason.trim() ? "Enter a reason to block this task." : "Block task"}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          Block
                        </button>
                      </div>
                      <p className="mt-2 text-[12px] text-rose-700">Enter a reason to block this task.</p>
                    </form>
                  ) : null}
                </section>

                <form className="space-y-4" onSubmit={(event) => void submitUpdate(event)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses(selectedTask.status)}`}>
                          {statusLabel(selectedTask.status)}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClasses(selectedTask.priority)}`}>
                          {selectedTask.priority}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] text-slate-500">{formatDateTime(selectedTask.dueAt)}</p>
                    </div>
                  </div>

                  <TaskFields
                    title={title}
                    description={description}
                    priority={priority}
                    dueAt={dueAt}
                    disabled={!canWrite}
                    onTitleChange={setTitle}
                    onDescriptionChange={setDescription}
                    onPriorityChange={setPriority}
                    onDueAtChange={setDueAt}
                  />
                  <button
                    type="submit"
                    disabled={!canWrite || !title.trim()}
                    title={readOnly ? "Event editor access is required to save task changes." : !title.trim() ? "Enter a title to save changes." : "Save changes"}
                    className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {workingAction === "update" ? "Saving..." : "Save changes"}
                  </button>
                  {!title.trim() ? <p className="text-[12px] text-slate-500">Enter a title to save changes.</p> : null}
                </form>

                <div className="grid gap-3 sm:grid-cols-2">
                  <section className="rounded-lg border border-slate-200 p-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Assignment</h4>
                    <div className="mt-2 space-y-1.5">
                      {selectedTask.assignments.length === 0 ? (
                        <p className="text-[12px] text-slate-500">Unassigned</p>
                      ) : (
                        selectedTask.assignments.map((assignment) => {
                          const user = assignableUsersById.get(assignment.userId);
                          return (
                            <div key={assignment.userId} className="rounded-lg bg-slate-50 px-2.5 py-2">
                              <p className="truncate text-[12px] font-semibold text-slate-800">
                                {user ? assigneeLabel(user) : "Assigned user"}
                              </p>
                              <p className="mt-0.5 text-[10px] font-semibold uppercase text-slate-500">
                                {user ? roleLabel(user.role) : assignment.role.toLowerCase()}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {readOnly ? (
                      <p className="mt-3 text-[11px] text-slate-500">Event editor access is required to assign tasks.</p>
                    ) : (
                      <form className="mt-3 space-y-2" onSubmit={(event) => void submitAssignment(event)}>
                        <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-assignee-picker">
                          Assign to...
                        </label>
                        <div className="flex gap-2">
                          <select
                            id="task-assignee-picker"
                            value={selectedAssigneeUserId}
                            onChange={(event) => setSelectedAssigneeUserId(event.target.value)}
                            disabled={!canWrite || isLoadingAssignees || assignableUsers.length === 0}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
                          >
                            <option value="">{isLoadingAssignees ? "Loading users..." : "Assign to..."}</option>
                            {assignableUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {assigneeLabel(user)} - {roleLabel(user.role)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            disabled={!canWrite || !selectedAssigneeUserId}
                            title={
                              !selectedAssigneeUserId
                                ? "Choose an event user to assign this task."
                                : "Assign task"
                            }
                            className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-3 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Assign
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">Tasks can have multiple assignees.</p>
                        {assigneeError ? <p className="text-[12px] text-rose-600">{assigneeError}</p> : null}
                      </form>
                    )}
                  </section>

                  <section className="rounded-lg border border-slate-200 p-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Watchers</h4>
                    <div className="mt-2 space-y-1.5">
                      {selectedTask.watchers.length === 0 ? (
                        <p className="text-[12px] text-slate-500">No watchers</p>
                      ) : (
                        selectedTask.watchers.map((watcher) => {
                          const user = assignableUsersById.get(watcher.userId);
                          return (
                            <div key={watcher.userId} className="rounded-lg bg-slate-50 px-2.5 py-2">
                              <p className="truncate text-[12px] font-semibold text-slate-800">
                                {user ? assigneeLabel(user) : "Watcher"}
                              </p>
                              {user ? <p className="mt-0.5 text-[10px] font-semibold uppercase text-slate-500">{roleLabel(user.role)}</p> : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500">Watcher editing is secondary for Phase 2A.</p>
                  </section>
                </div>

                <form className="rounded-lg border border-slate-200 p-3" onSubmit={(event) => void submitComment(event)}>
                  <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-comment-body">
                    Comment
                  </label>
                  <textarea
                    id="task-comment-body"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    disabled={!canWrite}
                    className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
                    placeholder="Add an internal task comment"
                  />
                  <button
                    type="submit"
                    disabled={!canWrite || !commentBody.trim()}
                    title={readOnly ? "Event editor access is required to comment on tasks." : !commentBody.trim() ? "Enter a comment before posting." : "Add comment"}
                    className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    Add comment
                  </button>
                </form>

                <div className="grid gap-3 lg:grid-cols-2">
                  <section className="rounded-lg border border-slate-200 p-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Comments</h4>
                    <div className="mt-2 space-y-2">
                      {selectedTask.comments.length === 0 ? <p className="text-[12px] text-slate-500">No comments yet.</p> : null}
                      {selectedTask.comments.map((comment) => (
                        <div key={comment.id} className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[12px] text-slate-800">{comment.body}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(comment.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 p-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Activity</h4>
                    <div className="mt-2 space-y-2">
                      {selectedTask.activity.length === 0 ? <p className="text-[12px] text-slate-500">No activity yet.</p> : null}
                      {selectedTask.activity.slice().reverse().map((entry) => (
                        <div key={entry.id} className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[12px] font-medium text-slate-800">{entry.message}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(entry.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center">
                <p className="text-[14px] font-semibold text-slate-900">No task selected</p>
                <p className="mt-1 text-[12px] text-slate-500">Choose a task or add one for this object.</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function TaskFields({
  title,
  description,
  priority,
  dueAt,
  disabled,
  assignableUsers,
  selectedAssigneeUserId,
  isLoadingAssignees = false,
  assigneeError,
  onTitleChange,
  onDescriptionChange,
  onPriorityChange,
  onDueAtChange,
  onAssigneeChange,
}: {
  title: string;
  description: string;
  priority: TaskPriority;
  dueAt: string;
  disabled: boolean;
  assignableUsers?: TaskAssignableUser[];
  selectedAssigneeUserId?: string;
  isLoadingAssignees?: boolean;
  assigneeError?: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPriorityChange: (value: TaskPriority) => void;
  onDueAtChange: (value: string) => void;
  onAssigneeChange?: (value: string) => void;
}) {
  const showAssigneePicker = Boolean(assignableUsers && onAssigneeChange);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
          placeholder="Task title"
        />
      </div>
      {showAssigneePicker ? (
        <div>
          <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-create-assignee">
            Owner
          </label>
          <select
            id="task-create-assignee"
            value={selectedAssigneeUserId ?? ""}
            onChange={(event) => onAssigneeChange?.(event.target.value)}
            disabled={disabled || isLoadingAssignees || (assignableUsers?.length ?? 0) === 0}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
          >
            <option value="">{isLoadingAssignees ? "Loading owners..." : "Unassigned"}</option>
            {(assignableUsers ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {assigneeLabel(user)} - {roleLabel(user.role)}
              </option>
            ))}
          </select>
          {assigneeError ? <p className="mt-1 text-[12px] text-rose-600">{assigneeError}</p> : null}
        </div>
      ) : null}
      <div>
        <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-description">
          Details
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          disabled={disabled}
          className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
          placeholder="Add context"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[12px] font-semibold text-slate-800" htmlFor="task-priority">
            Priority
          </label>
          <select
            id="task-priority"
            value={priority}
            onChange={(event) => onPriorityChange(event.target.value as TaskPriority)}
            disabled={disabled}
            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-[#28439A] disabled:bg-slate-100"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="text-[12px] font-semibold text-slate-800">
            Due
          </span>
          <DateTimeField
            value={dueAt}
            onChange={onDueAtChange}
            disabled={disabled}
            ariaLabel="Task due date and time"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
