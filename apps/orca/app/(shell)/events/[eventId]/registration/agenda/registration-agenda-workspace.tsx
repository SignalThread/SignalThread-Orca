"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Pencil, Plus, RefreshCw, Upload } from "lucide-react";

type AgendaEntry = {
  id: string;
  source: "SHOWOPS" | "SPREADSHEET" | "MANUAL" | "PDF_REFERENCE";
  sourceSessionId: string | null;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  sessionType: string | null;
  officialStatus: string | null;
  sourceFileName: string | null;
  publicationStatus: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  updatedAt: string;
};

type SyncResult = {
  adapter: "INTERNAL_REGISTRATION_STAGING";
  externalSyncSucceeded: false;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  invalid: Array<{ sourceSessionId: string; errors: string[] }>;
  warnings: Array<{ sourceSessionId: string; message: string }>;
};

function errorMessage(payload: unknown, fallback: string): string {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export function RegistrationAgendaWorkspace({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [panel, setPanel] = useState<"none" | "manual" | "spreadsheet" | "pdf">("none");
  const [working, setWorking] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", description: "", date: "", startTime: "09:00", endTime: "10:00", location: "", sessionType: "", officialStatus: "Draft" });
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<{ headers: string[]; mapping: Record<string, string>; rows: Array<{ row: number; values: Record<string, unknown>; errors: string[] }>; validCount: number; invalidCount: number } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/registration/agenda/entries`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Failed to load Registration agenda"));
      if (version !== requestVersion.current) return;
      setEntries(Array.isArray(payload?.entries) ? payload.entries : []);
    } catch (caught) {
      if (version !== requestVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Failed to load Registration agenda");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  async function syncFromShowOps() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const response = await fetch(`/api/events/${eventId}/registration/agenda/showops-sync`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "ShowOps import failed"));
      setSyncResult(payload as SyncResult);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ShowOps import failed");
    } finally {
      setSyncing(false);
    }
  }

  function openManual(entry?: AgendaEntry) {
    setPanel("manual");
    setError(null);
    setImportMessage(null);
    setEditingEntryId(entry?.id ?? null);
    setDraft(entry ? {
      title: entry.title,
      description: entry.description ?? "",
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      location: entry.location ?? "",
      sessionType: entry.sessionType ?? "",
      officialStatus: entry.officialStatus ?? "Draft",
    } : { title: "", description: "", date: "", startTime: "09:00", endTime: "10:00", location: "", sessionType: "", officialStatus: "Draft" });
  }

  async function saveManual() {
    if (working) return;
    setWorking(true); setError(null);
    try {
      const url = editingEntryId
        ? `/api/events/${eventId}/registration/agenda/entries/${editingEntryId}`
        : `/api/events/${eventId}/registration/agenda/entries`;
      const response = await fetch(url, { method: editingEntryId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Failed to save agenda entry"));
      setImportMessage(editingEntryId ? "Agenda entry updated." : "Manual agenda entry created.");
      setPanel("none"); setEditingEntryId(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to save agenda entry"); }
    finally { setWorking(false); }
  }

  async function updateEntry(entry: AgendaEntry, action: "publish" | "unpublish" | "archive") {
    if (working) return;
    if (action === "archive" && !window.confirm(`Remove “${entry.title}” from the Registration agenda?`)) return;
    setWorking(true); setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/registration/agenda/entries/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, `Failed to ${action} agenda entry`));
      setImportMessage(action === "publish" ? "Registration published the agenda entry." : action === "unpublish" ? "Agenda entry unpublished." : "Agenda entry removed.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : `Failed to ${action} agenda entry`); }
    finally { setWorking(false); }
  }

  async function submitSpreadsheet(action: "preview" | "import") {
    if (!spreadsheetFile || working) return;
    setWorking(true); setError(null); setImportMessage(null);
    try {
      const form = new FormData(); form.set("file", spreadsheetFile); form.set("action", action);
      if (spreadsheetPreview) form.set("mapping", JSON.stringify(spreadsheetPreview.mapping));
      const response = await fetch(`/api/events/${eventId}/registration/agenda/spreadsheet`, { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "Spreadsheet processing failed"));
      if (action === "preview") setSpreadsheetPreview(payload);
      else {
        setImportMessage(`${payload.importedCount} imported · ${payload.duplicateCount} duplicates skipped · ${payload.invalidRows.length} invalid rows retained for correction.`);
        setPanel("none"); setSpreadsheetPreview(null); setSpreadsheetFile(null); await load();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Spreadsheet processing failed"); }
    finally { setWorking(false); }
  }

  async function submitPdfReference() {
    if (!pdfFile || working) return;
    setWorking(true); setError(null);
    try {
      const form = new FormData(); form.set("file", pdfFile);
      const response = await fetch(`/api/events/${eventId}/registration/agenda/pdf-reference`, { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, "PDF reference upload failed"));
      setImportMessage("PDF reference recorded. No agenda extraction was performed; create or import structured entries separately.");
      setPanel("none"); setPdfFile(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "PDF reference upload failed"); }
    finally { setWorking(false); }
  }

  return (
    <section className="space-y-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Registration</p>
          <h1 className="text-2xl font-semibold text-slate-950">Official agenda</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">
            Registration owns attendee formatting and publication. Import only sessions explicitly designated in ShowOps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncFromShowOps()}
          disabled={syncing || loading}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
          {syncing ? "Importing…" : "Import from ShowOps"}
        </button>
      </header>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
        Provider status: internal Registration staging only. No external registration platform is connected or reported as synced.
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Agenda entry paths">
        <button type="button" onClick={() => openManual()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700"><Plus className="h-4 w-4" />Manual agenda entry</button>
        <button type="button" onClick={() => { setPanel("spreadsheet"); setError(null); }} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700"><Upload className="h-4 w-4" />Spreadsheet upload</button>
        <button type="button" onClick={() => { setPanel("pdf"); setError(null); }} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700"><FileText className="h-4 w-4" />PDF reference</button>
      </div>

      {panel === "manual" ? <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">{editingEntryId ? "Edit agenda entry" : "Create agenda entry manually"}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2"><span className="text-[12px] font-semibold">Title *</span><input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
          <label className="grid gap-1 sm:col-span-2"><span className="text-[12px] font-semibold">Description</span><textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-semibold">Date *</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-semibold">Location</span><input value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-semibold">Start *</span><input type="time" value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-semibold">End *</span><input type="time" value={draft.endTime} onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-semibold">Session type</span><input value={draft.sessionType} onChange={(e) => setDraft((d) => ({ ...d, sessionType: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-semibold">Official status</span><input value={draft.officialStatus} onChange={(e) => setDraft((d) => ({ ...d, officialStatus: e.target.value }))} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px]" /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPanel("none")} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold">Cancel</button><button type="button" disabled={working} onClick={() => void saveManual()} className="h-9 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white disabled:opacity-60">{working ? "Saving…" : "Save entry"}</button></div>
      </div> : null}

      {panel === "spreadsheet" ? <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Spreadsheet agenda import</h2><p className="mt-1 text-[12px] text-slate-500">CSV, XLSX, or XLS. Preview and correct the detected mapping before importing.</p>
        <input className="mt-3 text-[12px]" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setSpreadsheetFile(e.target.files?.[0] ?? null); setSpreadsheetPreview(null); }} />
        {spreadsheetPreview ? <><div className="mt-3 grid gap-2 sm:grid-cols-4">{["title", "date", "startTime", "endTime", "description", "location", "sessionType", "officialStatus"].map((target) => <label key={target} className="grid gap-1 text-[11px] font-semibold capitalize">{target}<select value={spreadsheetPreview.mapping[target] ?? ""} onChange={(e) => setSpreadsheetPreview((p) => p ? { ...p, mapping: { ...p.mapping, [target]: e.target.value } } : p)} className="h-8 rounded border border-slate-200 bg-white px-2"><option value="">Not mapped</option>{spreadsheetPreview.headers.map((header) => <option key={header}>{header}</option>)}</select></label>)}</div>
          <p className="mt-3 text-[12px] font-semibold text-slate-700">{spreadsheetPreview.validCount} valid · {spreadsheetPreview.invalidCount} invalid</p>
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-[11px]"><thead className="bg-slate-50"><tr><th className="p-2">Row</th><th className="p-2">Title</th><th className="p-2">Validation</th></tr></thead><tbody>{spreadsheetPreview.rows.map((row) => <tr key={row.row} className="border-t"><td className="p-2">{row.row}</td><td className="p-2">{String(row.values.title ?? "")}</td><td className={`p-2 ${row.errors.length ? "text-rose-700" : "text-emerald-700"}`}>{row.errors.join("; ") || "Ready"}</td></tr>)}</tbody></table></div></> : null}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPanel("none")} className="h-9 rounded-lg border px-3 text-[12px] font-semibold">Cancel</button><button type="button" disabled={!spreadsheetFile || working} onClick={() => void submitSpreadsheet("preview")} className="h-9 rounded-lg border border-slate-300 px-3 text-[12px] font-semibold disabled:opacity-60">{working ? "Working…" : spreadsheetPreview ? "Refresh preview" : "Preview mapping"}</button>{spreadsheetPreview ? <button type="button" disabled={working || spreadsheetPreview.validCount === 0} onClick={() => void submitSpreadsheet("import")} className="h-9 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white disabled:opacity-60">Import valid rows</button> : null}</div>
      </div> : null}

      {panel === "pdf" ? <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"><h2 className="font-semibold text-slate-900">PDF agenda reference</h2><p className="mt-1 text-[12px] leading-5 text-slate-600">PDF extraction is not enabled. This records file metadata as a reference only; the original is not hosted here and no agenda entries are created.</p><input className="mt-3 text-[12px]" type="file" accept="application/pdf,.pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPanel("none")} className="h-9 rounded-lg border bg-white px-3 text-[12px] font-semibold">Cancel</button><button type="button" disabled={!pdfFile || working} onClick={() => void submitPdfReference()} className="h-9 rounded-lg bg-amber-700 px-3 text-[12px] font-semibold text-white disabled:opacity-60">{working ? "Recording…" : "Record PDF reference"}</button></div></div> : null}

      {syncResult ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800" role="status">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />ShowOps import completed in local Registration staging.</p>
          <p className="mt-1">{syncResult.created} created · {syncResult.updated} updated · {syncResult.unchanged} unchanged · {syncResult.removed} safely removed</p>
          {syncResult.warnings.map((warning) => <p key={`${warning.sourceSessionId}:${warning.message}`} className="mt-1">Warning: {warning.message}</p>)}
          {syncResult.invalid.map((item) => <p key={item.sourceSessionId} className="mt-1">Skipped {item.sourceSessionId}: {item.errors.join("; ")}</p>)}
        </div>
      ) : null}
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">{error}</p> : null}
      {importMessage ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700" role="status">{importMessage}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-[13px] text-slate-500">Loading Registration agenda…</p>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-2 text-[13px] font-semibold text-slate-700">No Registration agenda entries yet</p>
            <p className="mt-1 text-[12px] text-slate-500">Mark sessions for the official agenda in ShowOps, then import them here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-[12px]">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Session</th><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Reg status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{entries.map((entry) => (
                <tr key={entry.id}><td className="px-3 py-3 font-semibold text-slate-900">{entry.title}</td><td className="px-3 py-3 text-slate-600">{entry.date} · {entry.startTime}–{entry.endTime}</td><td className="px-3 py-3 text-slate-600">{entry.location || "Unassigned"}</td><td className="px-3 py-3"><span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">{entry.source === "SHOWOPS" ? "ShowOps" : entry.source === "SPREADSHEET" ? `Spreadsheet${entry.sourceFileName ? ` · ${entry.sourceFileName}` : ""}` : "Manual"}</span></td><td className="px-3 py-3 font-semibold text-slate-600">{entry.publicationStatus}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><button type="button" disabled={working} onClick={() => openManual(entry)} className="inline-flex h-7 items-center gap-1 rounded border px-2 font-semibold"><Pencil className="h-3 w-3" />Edit</button><button type="button" disabled={working} onClick={() => void updateEntry(entry, entry.publicationStatus === "PUBLISHED" ? "unpublish" : "publish")} className="h-7 rounded border px-2 font-semibold">{entry.publicationStatus === "PUBLISHED" ? "Unpublish" : "Publish"}</button><button type="button" disabled={working} onClick={() => void updateEntry(entry, "archive")} className="h-7 rounded border border-rose-200 px-2 font-semibold text-rose-700">Remove</button></div></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
