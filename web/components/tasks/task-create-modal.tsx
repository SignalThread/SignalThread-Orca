"use client";

import { Loader2, Plus, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createManualTask,
  isReadOnlyTaskApiError,
  listTaskAssignees,
  type TaskAssignableUser,
  type TaskLinkObjectType,
  type TaskPriority,
  type TaskRecord,
} from "./task-api";

export type TaskCreateSource = "run-of-show" | "budget" | "roadmap";

export type TaskCreateAttachmentOption = {
  objectType: TaskLinkObjectType;
  objectId: string;
  label: string;
  description?: string;
};

type TaskCreateModalProps = {
  isOpen: boolean;
  eventId: string;
  source: TaskCreateSource;
  attachmentOptions?: TaskCreateAttachmentOption[];
  isLoadingAttachments?: boolean;
  onClose: () => void;
  onCreated?: (task: TaskRecord) => void;
};

type TaskCreateLauncherProps = {
  eventId: string;
  source: TaskCreateSource;
  attachmentOptions?: TaskCreateAttachmentOption[];
  loadAttachmentOptions?: () => Promise<TaskCreateAttachmentOption[]>;
  onTaskCreated?: (task: TaskRecord) => void;
  onOpenChange?: (isOpen: boolean) => void;
  disabled?: boolean;
  buttonLabel?: string;
  buttonClassName?: string;
};

const PRIORITY_OPTIONS: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const MONTH_OPTIONS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const date = new Date(2026, 0, 1, hours, minutes);
  return {
    value,
    label: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date),
  };
});

const SOURCE_COPY: Record<
  TaskCreateSource,
  {
    title: string;
    helper: string;
    attachLabel: string;
    emptyAttachmentLabel: string;
  }
> = {
  "run-of-show": {
    title: "Add Run of Show Task",
    helper: "Create a task for this event. Attach it to a session when it is session-specific.",
    attachLabel: "Attach to session",
    emptyAttachmentLabel: "No session attachment",
  },
  budget: {
    title: "Add Budget Task",
    helper:
      "Create a task for this event. Attach it to a budget item when it is tied to spend, approvals, or vendor follow-up.",
    attachLabel: "Attach to budget item",
    emptyAttachmentLabel: "No budget item attachment",
  },
  roadmap: {
    title: "Add Roadmap Task",
    helper: "Create a task for this event. Attach it to a roadmap item when it supports a milestone or deadline.",
    attachLabel: "Attach to roadmap item",
    emptyAttachmentLabel: "No roadmap item attachment",
  },
};

function attachmentKey(option: Pick<TaskCreateAttachmentOption, "objectType" | "objectId">): string {
  return `${option.objectType}:${option.objectId}`;
}

function assigneeLabel(user: TaskAssignableUser): string {
  return user.name?.trim() || user.email;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function toIsoFromParts(month: number, day: number, year: number, time: string): string | null {
  if (!month || !day || !year || !time) return null;
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const safeDay = Math.min(day, daysInMonth(year, month));
  const date = new Date(year, month - 1, safeDay, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDueLabel(month: number, day: number, year: number, time: string): string {
  const iso = toIsoFromParts(month, day, year, time);
  if (!iso) return "Select due date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function normalizeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function TaskCreateModal({
  isOpen,
  eventId,
  source,
  attachmentOptions = [],
  isLoadingAttachments = false,
  onClose,
  onCreated,
}: TaskCreateModalProps) {
  const copy = SOURCE_COPY[source];
  const [selectedAttachmentKey, setSelectedAttachmentKey] = useState("");
  const [selectedAssigneeUserId, setSelectedAssigneeUserId] = useState("");
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<TaskAssignableUser[]>([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const now = useMemo(() => new Date(), []);
  const [dueMonth, setDueMonth] = useState(now.getMonth() + 1);
  const [dueDay, setDueDay] = useState(now.getDate());
  const [dueYear, setDueYear] = useState(now.getFullYear());
  const [dueTime, setDueTime] = useState("09:00");
  const [hasDueAt, setHasDueAt] = useState(false);
  const [isDuePickerOpen, setIsDuePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedAttachment = useMemo(() => {
    if (!selectedAttachmentKey) return null;
    return attachmentOptions.find((option) => attachmentKey(option) === selectedAttachmentKey) ?? null;
  }, [attachmentOptions, selectedAttachmentKey]);

  const filteredAssignees = useMemo(() => {
    const query = assigneeQuery.trim().toLowerCase();
    if (!query) return assigneeOptions;
    return assigneeOptions.filter((user) => {
      const label = assigneeLabel(user).toLowerCase();
      return label.includes(query) || user.email.toLowerCase().includes(query);
    });
  }, [assigneeOptions, assigneeQuery]);

  const selectedAssignee = useMemo(
    () => assigneeOptions.find((user) => user.id === selectedAssigneeUserId) ?? null,
    [assigneeOptions, selectedAssigneeUserId],
  );

  const titleIsEmpty = title.trim().length === 0;
  const maxDueDay = daysInMonth(dueYear, dueMonth);
  const dueLabel = hasDueAt ? formatDueLabel(dueMonth, dueDay, dueYear, dueTime) : "Select due date";

  const resetForm = useCallback(() => {
    setSelectedAttachmentKey("");
    setSelectedAssigneeUserId("");
    setAssigneeQuery("");
    setIsAssigneeOpen(false);
    setTitle("");
    setDetails("");
    setPriority("MEDIUM");
    setHasDueAt(false);
    setIsDuePickerOpen(false);
    setErrorMessage(null);
    setIsSubmitting(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) return;
    resetForm();
  }, [isOpen, resetForm]);

  useEffect(() => {
    if (!isOpen || !eventId) return;
    const controller = new AbortController();
    setIsLoadingAssignees(true);
    listTaskAssignees(eventId, controller.signal)
      .then((users) => setAssigneeOptions(users))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAssigneeOptions([]);
      })
      .finally(() => setIsLoadingAssignees(false));

    return () => controller.abort();
  }, [eventId, isOpen]);

  useEffect(() => {
    if (dueDay <= maxDueDay) return;
    setDueDay(maxDueDay);
  }, [dueDay, maxDueDay]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (titleIsEmpty || isSubmitting) {
      setErrorMessage("Enter a title to add this task.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const task = await createManualTask({
        eventId,
        title: title.trim(),
        description: details.trim() || null,
        priority,
        dueAt: hasDueAt ? toIsoFromParts(dueMonth, dueDay, dueYear, dueTime) : null,
        assigneeUserIds: selectedAssigneeUserId ? [selectedAssigneeUserId] : [],
        links: selectedAttachment
          ? [{ objectType: selectedAttachment.objectType, objectId: selectedAttachment.objectId }]
          : [],
      });
      onCreated?.(task);
      resetForm();
      onClose();
    } catch (error) {
      if (isReadOnlyTaskApiError(error)) {
        setErrorMessage("You can view tasks for this event, but editing requires event editor access.");
      } else {
        setErrorMessage(normalizeError(error, "Failed to create task"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-create-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="task-create-modal-title" className="text-[22px] font-semibold text-slate-950">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-6 text-slate-600">{copy.helper}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close add task modal"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-900">{copy.attachLabel}</span>
            <select
              value={selectedAttachmentKey}
              onChange={(event) => setSelectedAttachmentKey(event.target.value)}
              disabled={isSubmitting || isLoadingAttachments}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {isLoadingAttachments ? "Loading attachments..." : copy.emptyAttachmentLabel}
              </option>
              {attachmentOptions.map((option) => (
                <option key={attachmentKey(option)} value={attachmentKey(option)}>
                  {option.description ? `${option.label} - ${option.description}` : option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="relative">
            <label htmlFor="task-assignee-combobox" className="text-[13px] font-semibold text-slate-900">
              Assign to
            </label>
            <input
              id="task-assignee-combobox"
              role="combobox"
              aria-expanded={isAssigneeOpen}
              aria-controls="task-assignee-options"
              aria-autocomplete="list"
              value={isAssigneeOpen ? assigneeQuery : selectedAssignee ? assigneeLabel(selectedAssignee) : "Unassigned"}
              onFocus={() => {
                setAssigneeQuery("");
                setIsAssigneeOpen(true);
              }}
              onChange={(event) => {
                setAssigneeQuery(event.target.value);
                setIsAssigneeOpen(true);
              }}
              disabled={isSubmitting || isLoadingAssignees}
              placeholder={isLoadingAssignees ? "Loading team..." : "Search team members"}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {isAssigneeOpen ? (
              <div
                id="task-assignee-options"
                role="listbox"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedAssigneeUserId}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSelectedAssigneeUserId("");
                    setAssigneeQuery("");
                    setIsAssigneeOpen(false);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Unassigned
                </button>
                {isLoadingAssignees ? (
                  <p className="px-3 py-2 text-[13px] text-slate-500">Loading team...</p>
                ) : assigneeOptions.length === 0 ? (
                  <p className="px-3 py-2 text-[13px] text-slate-500">No team members available</p>
                ) : filteredAssignees.length === 0 ? (
                  <p className="px-3 py-2 text-[13px] text-slate-500">No matching team members</p>
                ) : (
                  filteredAssignees.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      role="option"
                      aria-selected={selectedAssigneeUserId === user.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedAssigneeUserId(user.id);
                        setAssigneeQuery("");
                        setIsAssigneeOpen(false);
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="block text-[13px] font-semibold text-slate-800">{assigneeLabel(user)}</span>
                      <span className="block text-[11px] text-slate-500">{user.email}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <label className="block">
            <span className="text-[13px] font-semibold text-slate-900">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Task title"
              disabled={isSubmitting}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-semibold text-slate-900">Details</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add context"
              disabled={isSubmitting}
              rows={4}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] font-semibold text-slate-900">Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                disabled={isSubmitting}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative">
              <span className="text-[13px] font-semibold text-slate-900">Due date</span>
              <button
                type="button"
                onClick={() => {
                  setHasDueAt(true);
                  setIsDuePickerOpen((current) => !current);
                }}
                disabled={isSubmitting}
                className="mt-2 flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-[14px] text-slate-700 outline-none transition hover:bg-slate-50 focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10 disabled:cursor-not-allowed disabled:opacity-60"
                aria-expanded={isDuePickerOpen}
              >
                <span>{dueLabel}</span>
                {hasDueAt ? (
                  <span className="text-[12px] font-semibold text-slate-400">Edit</span>
                ) : (
                  <span className="text-[12px] font-semibold text-slate-400">Optional</span>
                )}
              </button>
              {isDuePickerOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="grid grid-cols-[1fr_80px_96px] gap-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">Month</span>
                      <select
                        value={dueMonth}
                        onChange={(event) => setDueMonth(Number(event.target.value))}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700"
                      >
                        {MONTH_OPTIONS.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">Day</span>
                      <select
                        value={Math.min(dueDay, maxDueDay)}
                        onChange={(event) => setDueDay(Number(event.target.value))}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700"
                      >
                        {Array.from({ length: maxDueDay }, (_, index) => index + 1).map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">Year</span>
                      <input
                        inputMode="numeric"
                        value={dueYear}
                        onChange={(event) => setDueYear(Number(event.target.value.replace(/\D/g, "").slice(0, 4)) || now.getFullYear())}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="text-[11px] font-semibold text-slate-500">Time</span>
                    <select
                      value={dueTime}
                      onChange={(event) => setDueTime(event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700"
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time.value} value={time.value}>
                          {time.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHasDueAt(false);
                        setIsDuePickerOpen(false);
                      }}
                      className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Clear due date
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHasDueAt(true);
                        setIsDuePickerOpen(false);
                      }}
                      className="rounded-lg bg-[#28439A] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#243d8e]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={titleIsEmpty || isSubmitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Add task
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          {titleIsEmpty ? (
            <p className="text-[13px] font-medium text-slate-500">Enter a title to add this task.</p>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}

export function TaskCreateLauncher({
  eventId,
  source,
  attachmentOptions = [],
  loadAttachmentOptions,
  onTaskCreated,
  onOpenChange,
  disabled = false,
  buttonLabel = "Task",
  buttonClassName = "inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300",
}: TaskCreateLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadedAttachmentOptions, setLoadedAttachmentOptions] = useState<TaskCreateAttachmentOption[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);

  const modalAttachmentOptions = loadAttachmentOptions ? loadedAttachmentOptions : attachmentOptions;

  const setOpen = useCallback((nextOpen: boolean) => {
    setIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  async function openModal(): Promise<void> {
    if (disabled) return;
    setOpen(true);
    if (!loadAttachmentOptions) return;
    setIsLoadingAttachments(true);
    try {
      setLoadedAttachmentOptions(await loadAttachmentOptions());
    } catch {
      setLoadedAttachmentOptions([]);
    } finally {
      setIsLoadingAttachments(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openModal()}
        disabled={disabled}
        className={buttonClassName}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {buttonLabel}
      </button>
      <TaskCreateModal
        isOpen={isOpen}
        eventId={eventId}
        source={source}
        attachmentOptions={modalAttachmentOptions}
        isLoadingAttachments={isLoadingAttachments}
        onClose={() => setOpen(false)}
        onCreated={onTaskCreated}
      />
    </>
  );
}
