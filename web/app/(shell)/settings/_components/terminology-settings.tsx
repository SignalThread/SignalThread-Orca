"use client";

import { FormEvent, useEffect, useState } from "react";
import { ORCA_CANONICAL_TERMS, type OrcaTerminology } from "@/lib/orca-terminology-contract";

export function TerminologySettings() {
  const [terms, setTerms] = useState<OrcaTerminology>(ORCA_CANONICAL_TERMS);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error" | "saved">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => { void (async () => { try { const response = await fetch("/api/organization/terminology"); const payload = await response.json() as OrcaTerminology & { error?: string }; if (!response.ok) throw new Error(payload.error || "Unable to load terminology"); setTerms(payload); setState("ready"); } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Unable to load terminology"); } })(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setState("saving"); setMessage(""); try { const response = await fetch("/api/organization/terminology", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(terms) }); const payload = await response.json() as OrcaTerminology & { error?: string }; if (!response.ok) throw new Error(payload.error || "Unable to save terminology"); setTerms(payload); setState("saved"); setMessage("Display terminology saved."); } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Unable to save terminology"); } }
  return <form onSubmit={submit} className="mt-6 max-w-3xl rounded-xl border border-slate-200 p-5" aria-busy={state === "loading" || state === "saving"}>
    <h2 className="text-lg font-semibold text-slate-900">Event terminology</h2><p className="mt-1 text-sm text-slate-600">Choose the display labels your organization uses. Routes, permissions, analytics, and stored records remain unchanged.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{(Object.keys(ORCA_CANONICAL_TERMS) as Array<keyof OrcaTerminology>).map((key) => <label key={key} className="text-sm font-medium text-slate-800">{ORCA_CANONICAL_TERMS[key]}<input value={terms[key]} maxLength={60} disabled={state === "loading" || state === "saving"} onChange={(event) => setTerms((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3" /></label>)}</div>
    {message ? <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-emerald-700"}`} role={state === "error" ? "alert" : "status"}>{message}</p> : null}
    <button className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={state === "loading" || state === "saving"}>{state === "saving" ? "Saving…" : "Save terminology"}</button>
  </form>;
}
