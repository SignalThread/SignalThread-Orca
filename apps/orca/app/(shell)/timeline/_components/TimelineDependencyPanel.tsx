"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Trash2 } from "lucide-react";
import type { TimelineItemRecord } from "./types";

type Dependency = {
  id: string;
  type: "FINISH_TO_START";
  predecessor: { id: string; title: string; status: string; disposition: "ACTIVE" | "NOT_NEEDED" };
  successor: { id: string; title: string; status: string; disposition: "ACTIVE" | "NOT_NEEDED" };
  blocked: boolean;
};

function errorMessage(payload: unknown, fallback: string): string {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}

export function TimelineDependencyPanel({ eventId, items, canEdit, onDependenciesChanged }: { eventId: string; items: TimelineItemRecord[]; canEdit: boolean; onDependenciesChanged?: () => void }) {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [predecessorId, setPredecessorId] = useState("");
  const [successorId, setSuccessorId] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeItems = useMemo(() => items.filter((item) => item.disposition === "ACTIVE"), [items]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    try {
      const response = await fetch(`/api/events/${eventId}/timeline-dependencies`, { credentials: "include", signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload)) throw new Error(errorMessage(payload, "Unable to load dependencies"));
      setDependencies(payload as Dependency[]);
      setState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Unable to load dependencies");
      setState("error");
    }
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function createDependency() {
    if (!predecessorId || !successorId || saving) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/timeline-dependencies`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ predecessorItemId: predecessorId, successorItemId: successorId }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to add dependency"));
      setPredecessorId(""); setSuccessorId("");
      await load();
      onDependenciesChanged?.();
      setMessage("Dependency added.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add dependency"); }
    finally { setSaving(false); }
  }

  async function removeDependency(id: string) {
    if (saving) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/timeline-dependencies?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Unable to remove dependency"));
      setDependencies((current) => current.filter((entry) => entry.id !== id));
      onDependenciesChanged?.();
      setMessage("Dependency removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to remove dependency"); }
    finally { setSaving(false); }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white" data-timeline-dependencies>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Link2 className="h-4 w-4 text-blue-700" aria-hidden />Dependencies</span>
        <span className="text-xs font-medium text-slate-500">{dependencies.length} link{dependencies.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="space-y-3 border-t border-slate-200 p-4">
        {canEdit ? <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Must finish first<select value={predecessorId} onChange={(event) => setPredecessorId(event.target.value)} className="h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">Select item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <span className="hidden pb-2 text-slate-400 sm:block" aria-hidden>→</span>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Blocked item<select value={successorId} onChange={(event) => setSuccessorId(event.target.value)} className="h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm"><option value="">Select item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <button type="button" disabled={!predecessorId || !successorId || saving} onClick={() => void createDependency()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}Add link</button>
        </div> : null}
        {message ? <p className="text-xs text-slate-700" role="status">{message}</p> : null}
        {state === "loading" ? <p className="text-sm text-slate-500" aria-busy="true">Loading dependencies…</p> : null}
        {state === "error" ? <button type="button" onClick={() => void load()} className="text-sm font-semibold text-blue-700">Try again</button> : null}
        {state === "ready" && dependencies.length === 0 ? <p className="text-sm text-slate-500">No dependency links yet.</p> : null}
        {dependencies.length > 0 ? <ul className="grid gap-2" aria-label="Roadmap dependencies">{dependencies.map((dependency) => <li key={dependency.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="min-w-0 flex-1"><strong>{dependency.predecessor.title}</strong> → {dependency.successor.title}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dependency.blocked ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{dependency.blocked ? "Blocked" : "Clear"}</span>{canEdit ? <button type="button" onClick={() => void removeDependency(dependency.id)} disabled={saving} aria-label={`Remove dependency from ${dependency.predecessor.title} to ${dependency.successor.title}`} className="rounded p-1 text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500"><Trash2 className="h-4 w-4" aria-hidden /></button> : null}</li>)}</ul> : null}
      </div>
    </details>
  );
}
