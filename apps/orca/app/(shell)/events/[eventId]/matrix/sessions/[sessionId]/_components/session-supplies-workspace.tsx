"use client";

import { Check, Package, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Person = { id: string; name: string | null; email: string };
type Allocation = {
  id: string;
  revision: number;
  oneOffName: string | null;
  quantity: number | null;
  unit: string;
  source: string | null;
  responsibleUserId: string | null;
  responsibleUser: Person | null;
  setupDeadline: string | null;
  fulfillment: string;
  notes: string | null;
  supplyItem: { name: string } | null;
};
type Suggestion = {
  templateItemId: string;
  name: string;
  category: string;
  unit: string;
  rationale: string;
  quantity: number | null;
  alreadyApplied: boolean;
};
type Snapshot = {
  session: { name: string; attendance: number | null };
  state: { sessionNotes: string; revision: number };
  readiness: string;
  suggestions: Suggestion[];
  allocations: Allocation[];
  assignableUsers: Person[];
};
type Draft = {
  key: string;
  templateItemId?: string;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  responsibleUserId: string;
  source: string;
  setupDeadline: string;
  fulfillment: string;
  notes: string;
};
const STATES = ["PLANNED", "CONFIRMED", "PACKED", "DELIVERED", "SET"];
const field =
  "h-8 rounded border border-slate-200 bg-white px-2 text-xs focus:border-[#28439A] focus:outline-none focus:ring-1 focus:ring-[#28439A]";
const name = (item: Allocation) =>
  item.supplyItem?.name ?? item.oneOffName ?? "Untitled supply";
const label = (person: Person) => person.name?.trim() || person.email;
const blank = (): Draft => ({
  key: crypto.randomUUID(),
  name: "",
  category: "Other",
  quantity: "",
  unit: "each",
  responsibleUserId: "",
  source: "",
  setupDeadline: "",
  fulfillment: "PLANNED",
  notes: "",
});

export function SessionSuppliesWorkspace({
  eventId,
  sessionId,
}: {
  eventId: string;
  sessionId: string;
}) {
  const url = `/api/events/${eventId}/matrix-2/sessions/${sessionId}/supplies`;
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Supplies could not load");
      setData(body);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Supplies could not load",
      );
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  const addSuggestion = (suggestion: Suggestion) =>
    setDrafts((current) =>
      current.some(
        (draft) => draft.templateItemId === suggestion.templateItemId,
      )
        ? current
        : [
            ...current,
            {
              ...blank(),
              templateItemId: suggestion.templateItemId,
              name: suggestion.name,
              category: suggestion.category,
              quantity: suggestion.quantity?.toString() ?? "",
              unit: suggestion.unit,
            },
          ],
    );
  if (!data)
    return (
      <div role="status" className="p-4 text-sm">
        Loading supplies…
      </div>
    );
  return (
    <div className="space-y-4" data-testid="session-supplies-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Supplies for {data.session.name}
          </h2>
          <p className="text-sm text-slate-600">
            Complete and save each physical-readiness requirement inline.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">
          Supplies: {data.readiness.replaceAll("_", " ")}
        </span>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Session notes</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {data.state.sessionNotes || "No session-wide instructions yet."}
            </p>
          </div>
        </div>
      </section>
      {error ? (
        <p
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="font-semibold">Supplies register</h3>
            <p className="text-xs text-slate-500">
              Fields save only when their row is saved.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDrafts((current) => [blank(), ...current])}
              className="inline-flex h-9 items-center gap-1 rounded border border-slate-200 px-3 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add supply
            </button>
            <button
              onClick={() => setShowSuggestions((value) => !value)}
              className="inline-flex h-9 items-center gap-1 rounded border border-slate-200 px-3 text-sm font-semibold"
            >
              <Package className="h-4 w-4" />
              Add from suggestions
            </button>
            <a
              href={`/events/${eventId}/matrix/supplies`}
              className="inline-flex h-9 items-center px-3 text-sm font-semibold text-[#28439A]"
            >
              All session supplies
            </a>
          </div>
        </div>
        {showSuggestions ? (
          <div className="border-b border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              Select suggestions to insert editable draft rows. Nothing is
              created until a row is saved.
            </p>
            <div className="flex flex-wrap gap-2">
              {data.suggestions
                .filter((item) => !item.alreadyApplied)
                .map((item) => (
                  <button
                    key={item.templateItemId}
                    onClick={() => addSuggestion(item)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <Check className="mr-1 inline h-3.5 w-3.5" />
                    {item.name}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                {[
                  "Supply",
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
              {drafts.map((draft) => (
                <DraftRow
                  key={draft.key}
                  draft={draft}
                  setDraft={(next) =>
                    setDrafts((current) =>
                      current.map((item) =>
                        item.key === draft.key ? next : item,
                      ),
                    )
                  }
                  people={data.assignableUsers}
                  onCancel={() =>
                    setDrafts((current) =>
                      current.filter((item) => item.key !== draft.key),
                    )
                  }
                  onSaved={() => {
                    setDrafts((current) =>
                      current.filter((item) => item.key !== draft.key),
                    );
                    void load();
                  }}
                  url={url}
                />
              ))}
              {data.allocations.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  people={data.assignableUsers}
                  eventId={eventId}
                  onSaved={load}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!data.allocations.length && !drafts.length ? (
          <p className="p-5 text-sm text-slate-500">
            No requirements yet. Choose suggested physical supplies or add a
            custom Supply.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Row({
  item,
  people,
  eventId,
  onSaved,
}: {
  item: Allocation;
  people: Person[];
  eventId: string;
  onSaved: () => void;
}) {
  const original = {
    name: name(item),
    quantity: item.quantity?.toString() ?? "",
    unit: item.unit,
    responsibleUserId: item.responsibleUserId ?? "",
    source: item.source ?? "",
    setupDeadline: item.setupDeadline?.slice(0, 16) ?? "",
    fulfillment: item.fulfillment,
    notes: item.notes ?? "",
  };
  const [draft, setDraft] = useState(original);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setMessage(null);
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
      setMessage("Saved");
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <tr>
        <td className="p-2">
          <input
            aria-label={`Supply ${name(item)}`}
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            className={`${field} w-36`}
          />
        </td>
        <td className="p-2">
          <input
            aria-label={`Quantity ${name(item)}`}
            type="number"
            value={draft.quantity}
            onChange={(event) => update("quantity", event.target.value)}
            className={`${field} w-16`}
          />
          <input
            aria-label={`Unit ${name(item)}`}
            value={draft.unit}
            onChange={(event) => update("unit", event.target.value)}
            className={`${field} ml-1 w-16`}
          />
        </td>
        <td className="p-2">
          <select
            aria-label={`Responsible ${name(item)}`}
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
            aria-label={`Provided by ${name(item)}`}
            value={draft.source}
            onChange={(event) => update("source", event.target.value)}
            className={`${field} w-32`}
          />
        </td>
        <td className="p-2">
          <input
            aria-label={`Need by ${name(item)}`}
            type="datetime-local"
            value={draft.setupDeadline}
            onChange={(event) => update("setupDeadline", event.target.value)}
            className={`${field} w-40`}
          />
        </td>
        <td className="p-2">
          <select
            aria-label={`Status ${name(item)}`}
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
            aria-label={`Notes ${name(item)}`}
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            className={`${field} min-h-8 w-48`}
          />
        </td>
        <td className="p-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="h-8 rounded bg-[#28439A] px-2 text-xs font-semibold text-white"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </td>
      </tr>
      {message ? (
        <tr>
          <td
            colSpan={8}
            className={
              message === "Saved"
                ? "px-2 pb-2 text-xs text-emerald-700"
                : "px-2 pb-2 text-xs text-rose-700"
            }
          >
            {message}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DraftRow({
  draft,
  setDraft,
  people,
  onCancel,
  onSaved,
  url,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  people: Person[];
  onCancel: () => void;
  onSaved: () => void;
  url: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: draft.templateItemId ? "custom" : "custom",
          ...draft,
          quantity: draft.quantity === "" ? null : Number(draft.quantity),
          responsibleUserId: draft.responsibleUserId || null,
          setupDeadline: draft.setupDeadline || null,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
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
      <tr className="bg-indigo-50/50">
        <td className="p-2">
          <input
            autoFocus
            aria-label="New supply name"
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            className={`${field} w-36`}
          />
        </td>
        <td className="p-2">
          <input
            aria-label="New quantity"
            type="number"
            value={draft.quantity}
            onChange={(event) => update("quantity", event.target.value)}
            className={`${field} w-16`}
          />
          <input
            aria-label="New unit"
            value={draft.unit}
            onChange={(event) => update("unit", event.target.value)}
            className={`${field} ml-1 w-16`}
          />
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
            className={`${field} min-h-8 w-48`}
          />
        </td>
        <td className="p-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="mr-1 h-8 rounded bg-[#28439A] px-2 text-xs font-semibold text-white"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="h-8 rounded border border-slate-200 px-2 text-xs"
          >
            Cancel
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={8} className="px-2 pb-2 text-xs text-rose-700">
            {error}
          </td>
        </tr>
      ) : null}
    </>
  );
}
