"use client";

import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "@/components/date-field";
import { TimeField } from "@/components/time-field";

const ORG_ID = "a5bc8820-c2ab-498b-9500-58f56421c733";

type EventOption = {
  id: string;
  name: string;
};

type MatrixRow = {
  id: string;
  eventId: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  sessionName: string;
  setup: string;
  attendance: number | null;
  meal: string;
  avNeeds: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type MatrixResponse = {
  event: {
    id: string;
    name: string;
    startDate: string;
    slug: string;
  };
  availableDates: string[];
  rows: MatrixRow[];
};

type ToastState = {
  type: "error" | "success";
  message: string;
} | null;

type EditableField = "date" | "startTime" | "endTime" | "room" | "sessionName" | "setup" | "attendance" | "meal" | "avNeeds" | "notes";

const MEAL_OPTIONS = ["", "N/A", "Breakfast", "Break", "Lunch", "Reception", "Dinner", "Other"] as const;

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function toPrettyDate(dateValue: string): string {
  if (!dateValue) return "";
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

function sortRows(rows: MatrixRow[]): MatrixRow[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function parseFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
}

export default function MatrixPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedDateFilter, setSelectedDateFilter] = useState("all");

  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [draftRows, setDraftRows] = useState<MatrixRow[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const firstCellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocusRowId = useRef<string | null>(null);

  const showToast = useCallback((next: ToastState) => {
    setToast(next);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  const loadRows = useCallback(async (eventId: string, dateFilter: string) => {
    if (!eventId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/matrix-rows?date=${encodeURIComponent(dateFilter)}`);
      const payload = (await response.json()) as MatrixResponse | { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load matrix rows"));
      }

      const matrix = payload as MatrixResponse;
      setRows(sortRows(matrix.rows ?? []));
      setAvailableDates(matrix.availableDates ?? []);
      setDraftRows(sortRows(matrix.rows ?? []));
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load matrix rows");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events?orgId=${ORG_ID}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load events"));
      }

      const loadedEvents = Array.isArray(payload)
        ? payload.map((event) => ({ id: String(event.id), name: String(event.name) }))
        : [];

      setEvents(loadedEvents);
      if (loadedEvents.length > 0) {
        const nextEventId = loadedEvents[0].id;
        setSelectedEventId(nextEventId);
        setSelectedDateFilter("all");
        await loadRows(nextEventId, "all");
      } else {
        setRows([]);
        setAvailableDates([]);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, [loadRows]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const rowId = pendingFocusRowId.current;
    if (!rowId) return;

    const input = firstCellRefs.current[rowId];
    if (input) {
      input.focus();
      pendingFocusRowId.current = null;
    }
  }, [rows, draftRows, isEditing]);

  async function refresh() {
    if (!selectedEventId) return;
    await loadRows(selectedEventId, selectedDateFilter);
  }

  async function onChangeEvent(eventId: string) {
    setSelectedEventId(eventId);
    setSelectedDateFilter("all");
    setIsEditing(false);
    await loadRows(eventId, "all");
  }

  async function onChangeDateFilter(value: string) {
    setSelectedDateFilter(value);
    if (!selectedEventId) return;
    setIsEditing(false);
    await loadRows(selectedEventId, value);
  }

  function setCellValue(rowId: string, field: EditableField, value: string | number | null) {
    setDraftRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          [field]: field === "attendance" ? (typeof value === "number" || value === null ? value : null) : String(value ?? ""),
        };
      }),
    );
  }

  function startEditing() {
    if (!selectedEventId || isSaving) return;
    setDraftRows(sortRows(rows));
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftRows(sortRows(rows));
    setIsEditing(false);
  }

  async function saveChanges() {
    if (!selectedEventId || isSaving) return;

    const existingById = new Map(rows.map((row) => [row.id, row]));
    const draftById = new Map(draftRows.map((row) => [row.id, row]));
    const newRows = draftRows.filter((row) => row.id.startsWith("temp-"));
    const deletedRows = rows.filter((row) => !draftById.has(row.id));
    const editedRows = draftRows.filter((row) => {
      if (row.id.startsWith("temp-")) return false;
      const previous = existingById.get(row.id);
      if (!previous) return false;
      return (
        previous.date !== row.date ||
        previous.startTime !== row.startTime ||
        previous.endTime !== row.endTime ||
        previous.room !== row.room ||
        previous.sessionName !== row.sessionName ||
        previous.setup !== row.setup ||
        previous.attendance !== row.attendance ||
        previous.meal !== row.meal ||
        previous.avNeeds !== row.avNeeds ||
        previous.notes !== row.notes
      );
    });

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await Promise.all(
        deletedRows.map(async (row) => {
          const response = await fetch(`/api/events/${selectedEventId}/matrix-rows/${row.id}`, {
            method: "DELETE",
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(toErrorMessage(payload, "Failed to delete row"));
          }
        }),
      );

      await Promise.all(
        newRows.map(async (row) => {
          const response = await fetch(`/api/events/${selectedEventId}/matrix-rows`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: row.date,
              startTime: row.startTime,
              endTime: row.endTime,
              room: row.room,
              sessionName: row.sessionName,
              setup: row.setup,
              attendance: row.attendance,
              meal: row.meal,
              avNeeds: row.avNeeds,
              notes: row.notes,
            }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(toErrorMessage(payload, "Failed to create row"));
          }
        }),
      );

      await Promise.all(
        editedRows.map(async (row) => {
          const previous = existingById.get(row.id);
          if (!previous) return;

          const patch: Partial<Record<EditableField, string | number | null>> = {};
          if (row.date !== previous.date) patch.date = row.date;
          if (row.startTime !== previous.startTime) patch.startTime = row.startTime;
          if (row.endTime !== previous.endTime) patch.endTime = row.endTime;
          if (row.room !== previous.room) patch.room = row.room;
          if (row.sessionName !== previous.sessionName) patch.sessionName = row.sessionName;
          if (row.setup !== previous.setup) patch.setup = row.setup;
          if (row.attendance !== previous.attendance) patch.attendance = row.attendance;
          if (row.meal !== previous.meal) patch.meal = row.meal;
          if (row.avNeeds !== previous.avNeeds) patch.avNeeds = row.avNeeds;
          if (row.notes !== previous.notes) patch.notes = row.notes;

          if (Object.keys(patch).length === 0) return;

          const response = await fetch(`/api/events/${selectedEventId}/matrix-rows/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(toErrorMessage(payload, "Failed to save row"));
          }
        }),
      );

      await refresh();
      setIsEditing(false);
      showToast({ type: "success", message: "Changes saved" });
    } catch (error) {
      console.error(error);
      showToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save changes",
      });
      await refresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function addRow() {
    if (!selectedEventId || isSaving) return;

    const nextRow: MatrixRow = {
      id: `temp-${Date.now()}`,
      eventId: selectedEventId,
      date: selectedDateFilter === "all"
        ? new Date().toISOString().slice(0, 10)
        : selectedDateFilter,
      startTime: "08:00",
      endTime: "09:00",
      room: "",
      sessionName: "",
      setup: "",
      attendance: null,
      meal: "",
      avNeeds: "",
      notes: "",
      sortOrder:
        draftRows.length > 0
          ? Math.max(...draftRows.map((row) => row.sortOrder ?? 0)) + 1
          : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!isEditing) {
      setDraftRows(sortRows(rows));
      setIsEditing(true);
    }

    pendingFocusRowId.current = nextRow.id;
    setDraftRows((current) => [...current, nextRow]);
    setAvailableDates((current) =>
      current.includes(nextRow.date) ? current : [...current, nextRow.date].sort(),
    );
  }

  async function duplicateRow(rowId: string) {
    if (!isEditing || isSaving) return;

    const source = draftRows.find((row) => row.id === rowId);
    if (!source) return;

    const duplicated: MatrixRow = {
      ...source,
      id: `temp-${Date.now()}`,
      sortOrder:
        draftRows.length > 0
          ? Math.max(...draftRows.map((row) => row.sortOrder ?? 0)) + 1
          : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDraftRows((current) => [...current, duplicated]);
    pendingFocusRowId.current = duplicated.id;
  }

  async function deleteRow(rowId: string) {
    if (!isEditing || isSaving) return;
    const confirmed = window.confirm("Delete this row?");
    if (!confirmed) return;
    setDraftRows((current) => current.filter((row) => row.id !== rowId));
  }

  async function exportCsv() {
    if (!selectedEventId) return;
    try {
      const response = await fetch(
        `/api/events/${selectedEventId}/matrix-rows/export.csv?date=${encodeURIComponent(selectedDateFilter)}`,
      );

      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error(toErrorMessage(payload, "Failed to export CSV"));
      }

      const blob = await response.blob();
      const filename = parseFileName(response.headers.get("content-disposition")) ?? "matrix_export.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      console.error(error);
      showToast({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to export CSV",
      });
    }
  }

  const visibleRows = useMemo(
    () => (isEditing ? draftRows : rows),
    [draftRows, isEditing, rows],
  );

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[24px] leading-[28px] font-semibold text-slate-900">Run of Show</h2>
          <p className="mt-1 text-[14px] leading-[20px] text-slate-500">F&amp;B / AV / Room Setup Grid</p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => startEditing()}
              disabled={!selectedEventId || isSaving}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void saveChanges()}
                disabled={isSaving || !selectedEventId}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => cancelEditing()}
                disabled={isSaving}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void exportCsv()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white hover:bg-[#243d8e]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <span className="text-[14px] font-semibold text-slate-600">Event:</span>
          <select
            value={selectedEventId}
            onChange={(event) => {
              void onChangeEvent(event.target.value);
            }}
            className="bg-transparent text-[14px] text-slate-700 outline-none"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>

        <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <span className="text-[14px] font-semibold text-slate-600">Date:</span>
          <select
            value={selectedDateFilter}
            onChange={(event) => {
              void onChangeDateFilter(event.target.value);
            }}
            className="bg-transparent text-[14px] text-slate-700 outline-none"
          >
            <option value="all">All Dates</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {toPrettyDate(date)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage && <p className="mt-3 text-[14px] text-rose-600">{errorMessage}</p>}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1320px]">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              {["DATE", "START", "END", "ROOM", "SESSION NAME", "SETUP", "ATTENDANCE", "MEAL", "AV NEEDS", "NOTES", "ACTIONS"].map((label) => (
                <th
                  key={label}
                  className="px-3 py-3 text-[10px] leading-[16px] font-semibold uppercase tracking-wide text-slate-600"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-[13px] text-slate-500">
                  Loading matrix rows...
                </td>
              </tr>
            )}

            {!isLoading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-[13px] text-slate-500">
                  No rows yet. Add Row.
                </td>
              </tr>
            )}

            {!isLoading &&
              visibleRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2">
                    <DateField
                      ref={(element) => {
                        firstCellRefs.current[row.id] = element;
                      }}
                      value={row.date}
                      onChange={(value) => setCellValue(row.id, "date", value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      size="compact"
                      className="min-w-[128px]"
                      buttonClassName="h-9"
                      ariaLabel={`Date for ${row.sessionName || "matrix row"}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TimeField
                      value={row.startTime}
                      onChange={(value) => setCellValue(row.id, "startTime", value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      size="compact"
                      className="min-w-[124px]"
                      inputClassName="h-9 rounded-lg border-slate-200 px-2 text-[13px]"
                      ariaLabel={`Start time for ${row.sessionName || "matrix row"}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TimeField
                      value={row.endTime}
                      onChange={(value) => setCellValue(row.id, "endTime", value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      size="compact"
                      className="min-w-[124px]"
                      inputClassName="h-9 rounded-lg border-slate-200 px-2 text-[13px]"
                      ariaLabel={`End time for ${row.sessionName || "matrix row"}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.room}
                      onChange={(event) => setCellValue(row.id, "room", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.sessionName}
                      onChange={(event) => setCellValue(row.id, "sessionName", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.setup}
                      onChange={(event) => setCellValue(row.id, "setup", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[120px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={row.attendance === null ? "" : String(row.attendance)}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        setCellValue(row.id, "attendance", value ? Number(value) : null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[96px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.meal}
                      onChange={(event) => {
                        setCellValue(row.id, "meal", event.target.value);
                      }}
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[110px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    >
                      {MEAL_OPTIONS.map((option) => (
                        <option key={option || "blank"} value={option}>
                          {option || "—"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.avNeeds}
                      onChange={(event) => setCellValue(row.id, "avNeeds", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[170px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.notes}
                      onChange={(event) => setCellValue(row.id, "notes", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          (event.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="Add notes..."
                      disabled={!isEditing || isSaving}
                      className="h-9 w-full min-w-[170px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-2 text-slate-500">
                      <button
                        type="button"
                        onClick={() => void duplicateRow(row.id)}
                        disabled={!isEditing || isSaving}
                        className="rounded p-1 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        aria-label="Duplicate row"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteRow(row.id)}
                        disabled={!isEditing || isSaving}
                        className="rounded p-1 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
                        aria-label="Delete row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => void addRow()}
        disabled={isSaving || !selectedEventId}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-2 text-[14px] font-semibold text-[#28439A] hover:bg-blue-50 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add Row
      </button>

      {toast && (
        <div
          className={[
            "fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-[13px] font-semibold shadow-lg",
            toast.type === "error" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white",
          ].join(" ")}
        >
          {toast.message}
        </div>
      )}
    </section>
  );
}
