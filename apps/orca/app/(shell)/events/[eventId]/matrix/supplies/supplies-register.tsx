"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Person = { id: string; name: string | null; email: string };
type Requirement = {
  id: string;
  revision: number;
  name: string;
  quantity: number | null;
  unit: string;
  source: string | null;
  notes: string | null;
  setupDeadline: string | null;
  fulfillment: string;
  responsibleUserId: string | null;
  responsibleUser: Person | null;
  readiness: string;
  dependencies: Array<{
    label: string;
    blocking: boolean;
    resolvedAt: string | null;
  }>;
  session: {
    id: string;
    sessionName: string | null;
    dayDate: string;
    startTime: string | null;
    roomName: string | null;
    room: { name: string } | null;
  };
};
type Register = {
  event: { name: string };
  requirements: Requirement[];
  assignableUsers: Person[];
};
type Filters = {
  search: string;
  date: string;
  room: string;
  responsible: string;
  status: string;
  action: boolean;
};
const EMPTY: Filters = {
  search: "",
  date: "",
  room: "",
  responsible: "",
  status: "",
  action: false,
};
const STATES = ["PLANNED", "CONFIRMED", "PACKED", "DELIVERED", "SET"];
const label = (person: Person | null) =>
  person?.name?.trim() || person?.email || "";
const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat([], {
        timeZone: "UTC",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "Time TBD";
const datetimeValue = (value: string | null) => value?.slice(0, 16) ?? "";
const field =
  "h-8 rounded border border-slate-200 bg-white px-2 text-xs focus:border-[#28439A] focus:outline-none focus:ring-1 focus:ring-[#28439A]";

export function SuppliesRegister({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Register | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/events/${eventId}/supplies`);
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Register could not be loaded");
      setData(body);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Register could not be loaded",
      );
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const requirements = useMemo(
    () =>
      (data?.requirements ?? []).filter((item) => {
        const searchable =
          `${item.name} ${item.notes ?? ""} ${item.source ?? ""} ${item.session.sessionName ?? ""} ${label(item.responsibleUser)}`.toLowerCase();
        return (
          (!filters.search ||
            searchable.includes(filters.search.toLowerCase())) &&
          (!filters.date ||
            item.session.dayDate.slice(0, 10) === filters.date) &&
          (!filters.room ||
            (item.session.room?.name ?? item.session.roomName) ===
              filters.room) &&
          (!filters.responsible ||
            label(item.responsibleUser) === filters.responsible) &&
          (!filters.status || item.fulfillment === filters.status) &&
          (!filters.action || item.readiness !== "ready")
        );
      }),
    [data, filters],
  );
  const groups = useMemo(
    () =>
      Object.values(
        requirements.reduce<
          Record<
            string,
            { session: Requirement["session"]; rows: Requirement[] }
          >
        >((all, row) => {
          (all[row.session.id] ??= {
            session: row.session,
            rows: [],
          }).rows.push(row);
          return all;
        }, {}),
      ).sort((a, b) =>
        `${a.session.dayDate}${a.session.startTime}`.localeCompare(
          `${b.session.dayDate}${b.session.startTime}`,
        ),
      ),
    [requirements],
  );
  const rooms = [
    ...new Set(
      (data?.requirements ?? [])
        .map((item) => item.session.room?.name ?? item.session.roomName)
        .filter(Boolean) as string[],
    ),
  ].sort();
  const people = [
    ...new Set(
      (data?.requirements ?? [])
        .map((item) => label(item.responsibleUser))
        .filter(Boolean),
    ),
  ].sort();
  if (!data && !error)
    return (
      <main className="p-6" role="status">
        Loading all session supplies…
      </main>
    );
  return (
    <main
      className="min-h-screen bg-slate-50 p-4 sm:p-6"
      data-testid="supplies-register"
    >
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#28439A]">
              Run of Show
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              All session supplies
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {data?.event.name} · edit operational readiness directly in the
              register.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/events/${eventId}/supplies/export?format=xlsx`}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
            >
              <Download className="h-4 w-4" />
              XLSX
            </a>
            <a
              target="_blank"
              href={`/api/events/${eventId}/supplies/export?format=pdf`}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
            >
              <FileText className="h-4 w-4" />
              PDF
            </a>
            <button
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </header>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {error}
          </p>
        ) : null}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          rooms={rooms}
          people={people}
        />
        {groups.map((group) => (
          <section
            key={group.session.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <button
                onClick={() =>
                  setOpen((value) => ({
                    ...value,
                    [group.session.id]: value[group.session.id] === false,
                  }))
                }
                className="flex items-center gap-2 text-left"
              >
                <span>
                  {open[group.session.id] === false ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
                <span>
                  <span className="font-semibold">
                    {group.session.sessionName ?? "Untitled session"}
                  </span>
                  <span className="ml-2 text-sm text-slate-500">
                    {group.session.dayDate.slice(0, 10)} ·{" "}
                    {time(group.session.startTime)} ·{" "}
                    {group.session.room?.name ??
                      group.session.roomName ??
                      "Room TBD"}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDraftSessionId(group.session.id)}
                  className="inline-flex h-8 items-center gap-1 rounded border border-slate-200 px-2 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add supply
                </button>
                <Link
                  className="text-xs font-semibold text-[#28439A]"
                  href={`/events/${eventId}/matrix/sessions/${group.session.id}?tab=supplies`}
                >
                  Open session
                </Link>
              </div>
            </div>
            {open[group.session.id] === false ? null : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1380px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      {[
                        "Supply",
                        "Session",
                        "Room",
                        "Qty",
                        "Responsible",
                        "Provided by",
                        "Need by",
                        "Status",
                        "Notes",
                        "",
                      ].map((heading) => (
                        <th key={heading} className="px-2 py-2 font-semibold">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftSessionId === group.session.id ? (
                      <DraftRow
                        eventId={eventId}
                        session={group.session}
                        people={data!.assignableUsers}
                        onCancel={() => setDraftSessionId(null)}
                        onSaved={() => {
                          setDraftSessionId(null);
                          void load();
                        }}
                      />
                    ) : null}
                    {group.rows.map((item) => (
                      <InlineRow
                        key={item.id}
                        eventId={eventId}
                        item={item}
                        people={data!.assignableUsers}
                        onSaved={load}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        {!groups.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No Supplies match these filters.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function FilterBar({
  filters,
  setFilters,
  rooms,
  people,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  rooms: string[];
  people: string[];
}) {
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters({ ...filters, [key]: value });
  return (
    <section
      className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-6"
      aria-label="All session Supplies filters"
    >
      <input
        aria-label="Search supplies"
        value={filters.search}
        onChange={(event) => update("search", event.target.value)}
        placeholder="Search supplies…"
        className={field}
      />
      <input
        aria-label="Filter by date"
        type="date"
        value={filters.date}
        onChange={(event) => update("date", event.target.value)}
        className={field}
      />
      <select
        aria-label="Filter by room"
        value={filters.room}
        onChange={(event) => update("room", event.target.value)}
        className={field}
      >
        <option value="">All rooms</option>
        {rooms.map((room) => (
          <option key={room}>{room}</option>
        ))}
      </select>
      <select
        aria-label="Filter by responsible person"
        value={filters.responsible}
        onChange={(event) => update("responsible", event.target.value)}
        className={field}
      >
        <option value="">All responsible people</option>
        {people.map((person) => (
          <option key={person}>{person}</option>
        ))}
      </select>
      <select
        aria-label="Filter by status"
        value={filters.status}
        onChange={(event) => update("status", event.target.value)}
        className={field}
      >
        <option value="">All statuses</option>
        {STATES.map((status) => (
          <option key={status}>{status}</option>
        ))}
      </select>
      <label className="flex h-9 items-center gap-2 rounded border border-slate-200 px-2">
        <input
          type="checkbox"
          checked={filters.action}
          onChange={(event) => update("action", event.target.checked)}
        />
        Needs action
      </label>
    </section>
  );
}

function InlineRow({
  eventId,
  item,
  people,
  onSaved,
}: {
  eventId: string;
  item: Requirement;
  people: Person[];
  onSaved: () => void;
}) {
  const original = {
    name: item.name,
    quantity: item.quantity?.toString() ?? "",
    unit: item.unit,
    responsibleUserId: item.responsibleUserId ?? "",
    source: item.source ?? "",
    setupDeadline: datetimeValue(item.setupDeadline),
    fulfillment: item.fulfillment,
    notes: item.notes ?? "",
  };
  const [draft, setDraft] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/events/${eventId}/supplies/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: item.revision,
            patch: {
              ...draft,
              quantity: draft.quantity === "" ? null : Number(draft.quantity),
              responsibleUserId: draft.responsibleUserId || null,
              setupDeadline: draft.setupDeadline || null,
            },
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <tr className="align-top">
        <td className="p-2">
          <input
            aria-label={`Supply ${item.name}`}
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            className={`${field} w-36`}
          />
        </td>
        <td className="p-2 whitespace-nowrap">
          {item.session.sessionName ?? "Untitled"}
        </td>
        <td className="p-2 whitespace-nowrap">
          {item.session.room?.name ?? item.session.roomName ?? "Room TBD"}
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <input
              aria-label={`Quantity ${item.name}`}
              type="number"
              min="0"
              value={draft.quantity}
              onChange={(event) => update("quantity", event.target.value)}
              className={`${field} w-16`}
            />
            <input
              aria-label={`Unit ${item.name}`}
              value={draft.unit}
              onChange={(event) => update("unit", event.target.value)}
              className={`${field} w-16`}
            />
          </div>
        </td>
        <td className="p-2">
          <select
            aria-label={`Responsible ${item.name}`}
            value={draft.responsibleUserId}
            onChange={(event) =>
              update("responsibleUserId", event.target.value)
            }
            className={`${field} w-36`}
          >
            <option value="">Assign responsible</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {label(person)}
              </option>
            ))}
          </select>
        </td>
        <td className="p-2">
          <input
            aria-label={`Provided by ${item.name}`}
            value={draft.source}
            onChange={(event) => update("source", event.target.value)}
            placeholder="Set provider"
            className={`${field} w-32`}
          />
        </td>
        <td className="p-2">
          <input
            aria-label={`Need by ${item.name}`}
            type="datetime-local"
            value={draft.setupDeadline}
            onChange={(event) => update("setupDeadline", event.target.value)}
            className={`${field} w-40`}
          />
        </td>
        <td className="p-2">
          <select
            aria-label={`Status ${item.name}`}
            value={draft.fulfillment}
            onChange={(event) => update("fulfillment", event.target.value)}
            className={`${field} w-28`}
          >
            {STATES.map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </td>
        <td className="p-2">
          <textarea
            aria-label={`Notes ${item.name}`}
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            className={`${field} min-h-9 w-52`}
          />
        </td>
        <td className="p-2">
          <button
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="h-8 rounded bg-[#28439A] px-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td
            colSpan={10}
            className="px-2 pb-2 text-xs text-rose-700"
            role="alert"
          >
            {error}
          </td>
        </tr>
      ) : null}
      {item.dependencies.length ? (
        <tr>
          <td colSpan={10} className="px-2 pb-2 text-xs text-slate-500">
            <details>
              <summary>Dependencies ({item.dependencies.length})</summary>
              {item.dependencies.map((dependency) => (
                <p
                  key={dependency.label}
                  className={
                    dependency.blocking && !dependency.resolvedAt
                      ? "text-rose-700"
                      : ""
                  }
                >
                  {dependency.label}
                  {dependency.blocking && !dependency.resolvedAt
                    ? " · blocking"
                    : ""}
                </p>
              ))}
            </details>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DraftRow({
  eventId,
  session,
  people,
  onCancel,
  onSaved,
}: {
  eventId: string;
  session: Requirement["session"];
  people: Person[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    quantity: "",
    unit: "each",
    responsibleUserId: "",
    source: "",
    setupDeadline: "",
    fulfillment: "PLANNED",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/events/${eventId}/matrix-2/sessions/${session.id}/supplies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "custom",
            ...draft,
            quantity: draft.quantity === "" ? null : Number(draft.quantity),
            responsibleUserId: draft.responsibleUserId || null,
            setupDeadline: draft.setupDeadline || null,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not create Supply");
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create Supply",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <tr className="bg-indigo-50/50 align-top">
        <td className="p-2">
          <input
            autoFocus
            aria-label="New supply name"
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Supply name"
            className={`${field} w-36`}
          />
        </td>
        <td className="p-2">{session.sessionName ?? "Untitled"}</td>
        <td className="p-2">
          {session.room?.name ?? session.roomName ?? "Room TBD"}
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <input
              aria-label="New quantity"
              type="number"
              min="0"
              value={draft.quantity}
              onChange={(event) => update("quantity", event.target.value)}
              className={`${field} w-16`}
            />
            <input
              aria-label="New unit"
              value={draft.unit}
              onChange={(event) => update("unit", event.target.value)}
              className={`${field} w-16`}
            />
          </div>
        </td>
        <td className="p-2">
          <select
            aria-label="New responsible"
            value={draft.responsibleUserId}
            onChange={(event) =>
              update("responsibleUserId", event.target.value)
            }
            className={`${field} w-36`}
          >
            <option value="">Assign responsible</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {label(person)}
              </option>
            ))}
          </select>
        </td>
        <td className="p-2">
          <input
            aria-label="New provided by"
            value={draft.source}
            onChange={(event) => update("source", event.target.value)}
            className={`${field} w-32`}
          />
        </td>
        <td className="p-2">
          <input
            aria-label="New need by"
            type="datetime-local"
            value={draft.setupDeadline}
            onChange={(event) => update("setupDeadline", event.target.value)}
            className={`${field} w-40`}
          />
        </td>
        <td className="p-2">
          <select
            aria-label="New status"
            value={draft.fulfillment}
            onChange={(event) => update("fulfillment", event.target.value)}
            className={`${field} w-28`}
          >
            {STATES.map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </td>
        <td className="p-2">
          <textarea
            aria-label="New notes"
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            className={`${field} min-h-9 w-52`}
          />
        </td>
        <td className="p-2 whitespace-nowrap">
          <button
            disabled={saving}
            onClick={() => void save()}
            className="mr-1 h-8 rounded bg-[#28439A] px-2 text-xs font-semibold text-white"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="h-8 rounded border border-slate-200 px-2 text-xs font-semibold"
          >
            Cancel
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td
            colSpan={10}
            className="px-2 pb-2 text-xs text-rose-700"
            role="alert"
          >
            {error}
          </td>
        </tr>
      ) : null}
    </>
  );
}
