"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Recipient = "hotel" | "venue" | "caterer" | "av" | "internal" | "public";
type Preview = {
  projection: {
    title: string;
    rows: string[][];
    rowCount: number;
    checksum: string;
    sensitiveFieldsExcluded: string[];
    metadata: { projectionVersion: number; dataAsOf: string; sourceVersion: string; filters: Record<string, string> };
  };
  history: Array<{ id: string; format: string; projectionVersion: number; rowCount: number; checksum: string; generatedFilename: string | null; generatedAt: string }>;
};

const RECIPIENTS: Array<{ value: Recipient; label: string; description: string }> = [
  { value: "hotel", label: "Hotel / venue", description: "Rooms, sets, guarantees, supplies, signage and approved operational notes." },
  { value: "caterer", label: "Caterer / banquet", description: "Selections, service, aggregate verified needs, modifications and permitted financial detail." },
  { value: "av", label: "AV / production", description: "Cues, timing, speakers, production requirements and signage dependencies." },
  { value: "internal", label: "Internal planner", description: "Full authorized operational specification, approvals, risks and unresolved work." },
  { value: "public", label: "Public attendee", description: "Published attendee-facing session fields only." },
];

function inputClass() {
  return "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
}

export function OperationalHandoffCenter({ eventId }: { eventId: string }) {
  const [recipient, setRecipient] = useState<Recipient>("hotel");
  const [filters, setFilters] = useState({ date: "", room: "", session: "", status: "", changedSince: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ role: recipient, format: "json", preview: "1" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, key === "changedSince" ? new Date(value).toISOString() : value);
    return params;
  }, [filters, recipient]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/exports?${query.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Unable to build handoff preview");
      setPreview(body as Preview);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "Unable to build handoff preview");
    } finally {
      setLoading(false);
    }
  }, [eventId, query]);

  useEffect(() => { void load(); }, [load]);

  function downloadUrl(format: "csv" | "xlsx" | "print") {
    const params = new URLSearchParams(query);
    params.delete("preview");
    params.set("format", format);
    return `/api/events/${eventId}/exports?${params.toString()}`;
  }

  const selected = RECIPIENTS.find((option) => option.value === recipient)!;
  const [headers = [], ...rows] = preview?.projection.rows ?? [];

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="handoff-center-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="handoff-center-heading" className="text-[22px] font-semibold leading-[26px] text-slate-900">Operational handoffs</h2>
          <p className="mt-1 max-w-3xl text-[14px] text-slate-600">Preview read-only, recipient-safe projections before generating a versioned spreadsheet or print-ready PDF view.</p>
        </div>
        {preview ? <div className="text-right text-[12px] text-slate-500"><p>Version {preview.projection.metadata.projectionVersion}</p><p>{preview.projection.rowCount} sessions · data as of {new Date(preview.projection.metadata.dataAsOf).toLocaleString()}</p><p>Source {preview.projection.metadata.sourceVersion.slice(0, 12)}</p></div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="text-[12px] font-medium text-slate-700">Recipient<select className={inputClass()} value={recipient} onChange={(event) => setRecipient(event.target.value as Recipient)}>{RECIPIENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="text-[12px] font-medium text-slate-700">Date<input className={inputClass()} type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /></label>
        <label className="text-[12px] font-medium text-slate-700">Room<input className={inputClass()} placeholder="Room name" value={filters.room} onChange={(event) => setFilters((current) => ({ ...current, room: event.target.value }))} /></label>
        <label className="text-[12px] font-medium text-slate-700">Session<input className={inputClass()} placeholder="Name or ID" value={filters.session} onChange={(event) => setFilters((current) => ({ ...current, session: event.target.value }))} /></label>
        <label className="text-[12px] font-medium text-slate-700">Status<select className={inputClass()} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Any status</option><option value="ready">Ready</option><option value="attention">Needs attention</option><option value="blocked">Blocked</option></select></label>
        <label className="text-[12px] font-medium text-slate-700">Changed since<input className={inputClass()} type="datetime-local" value={filters.changedSince} onChange={(event) => setFilters((current) => ({ ...current, changedSince: event.target.value }))} /></label>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900"><strong>{selected.label}:</strong> {selected.description}</div>
      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800"><span>{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">Retry</button></div> : null}

      <div className="flex flex-wrap gap-2" aria-label="Generate handoff formats">
        <a className="rounded-lg bg-slate-950 px-3 py-2 text-[13px] font-semibold text-white" href={downloadUrl("xlsx")}>Download spreadsheet</a>
        <a className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700" href={downloadUrl("csv")}>Download CSV</a>
        <a className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700" href={downloadUrl("print")} target="_blank" rel="noreferrer">Print / save PDF</a>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[15px] font-semibold text-slate-900">Safe preview</h3>{preview && preview.projection.sensitiveFieldsExcluded.length > 0 ? <p className="text-[12px] text-slate-500">Excluded: {preview.projection.sensitiveFieldsExcluded.join(", ")}</p> : null}</div>
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200" role="region" aria-label={`${selected.label} handoff preview`} tabIndex={0}>
          <table className="min-w-[900px] w-full border-collapse text-left text-[12px]">
            <thead className="sticky top-0 bg-slate-100 text-slate-700"><tr>{headers.map((header, index) => <th key={`${header}-${index}`} scope="col" className="border-b border-slate-200 px-3 py-2 font-semibold">{header}</th>)}</tr></thead>
            <tbody>{loading ? <tr><td className="px-3 py-6 text-slate-500" colSpan={Math.max(1, headers.length)}>Building preview…</td></tr> : rows.length === 0 ? <tr><td className="px-3 py-6 text-slate-500" colSpan={Math.max(1, headers.length)}>No sessions match these filters.</td></tr> : rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-slate-100 align-top last:border-0">{row.map((value, cellIndex) => <td key={cellIndex} className="max-w-xs whitespace-pre-wrap px-3 py-2 text-slate-700">{value || "—"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>

      <div><h3 className="text-[15px] font-semibold text-slate-900">Generation history</h3><p className="mt-1 text-[12px] text-slate-500">Previewing does not create an audit record. Every generated file does.</p><ul className="mt-2 grid gap-2 md:grid-cols-2">{(preview?.history.length ?? 0) === 0 ? <li className="text-[13px] text-slate-500">No files generated for this recipient yet.</li> : preview?.history.map((record) => <li key={record.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-600"><strong className="text-slate-800">v{record.projectionVersion} · {record.format.toUpperCase()}</strong><br />{record.rowCount} rows · {new Date(record.generatedAt).toLocaleString()}<br /><span className="font-mono">{record.checksum.slice(0, 12)}</span></li>)}</ul></div>
    </section>
  );
}
