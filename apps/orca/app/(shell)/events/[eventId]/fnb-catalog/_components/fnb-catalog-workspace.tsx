"use client";

import { AlertCircle, CheckCircle2, FileText, Loader2, Plus, Search, Upload } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { FnbCatalogItemRecord, FnbSourceMenuRecord } from "@/lib/fnb-catalog";
import { ALLERGEN_CODES, assessMenuCompatibility, DIETARY_CODES, explainCompatibilityReason, type CompatibilityResult, type MenuClaim, type SafetyRequirement } from "@/lib/fnb-safety-domain";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { FnbItemSafetyEditor } from "./fnb-item-safety-editor";

type Props = { eventId: string; eventName: string; initialItems: FnbCatalogItemRecord[]; initialSourceMenus: FnbSourceMenuRecord[] };
type Lifecycle = FnbSourceMenuRecord["operationalStatus"];
type OwnerOption = { id: string; name: string | null; email: string };
type AssessedItem = FnbCatalogItemRecord & { compatibility: CompatibilityResult | null };

const labels: Record<Lifecycle, string> = {
  OUTSTANDING: "Outstanding",
  RECEIVED: "Received",
  CODED: "Coded",
  CONFIRMED: "Confirmed",
  NEEDS_REVIEW: "Needs review",
};

const tones: Record<Lifecycle, string> = {
  OUTSTANDING: "border-slate-300 bg-slate-50 text-slate-700",
  RECEIVED: "border-blue-200 bg-blue-50 text-blue-700",
  CODED: "border-violet-200 bg-violet-50 text-violet-700",
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NEEDS_REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
};

const compatibilityTone: Record<CompatibilityResult["outcome"], string> = {
  VERIFIED_MATCH: "border-emerald-200 bg-emerald-50 text-emerald-800",
  POSSIBLE_MATCH: "border-blue-200 bg-blue-50 text-blue-800",
  STALE_VERIFICATION: "border-amber-200 bg-amber-50 text-amber-900",
  CONFLICT: "border-rose-200 bg-rose-50 text-rose-900",
  INSUFFICIENT_INFORMATION: "border-slate-300 bg-slate-50 text-slate-800",
};

function dateLabel(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function dateInputValue(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

export function FnbCatalogWorkspace({ eventId, eventName, initialItems, initialSourceMenus }: Props) {
  const [menus, setMenus] = useState(initialSourceMenus);
  const [items, setItems] = useState(initialItems);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dietaryFilters, setDietaryFilters] = useState<string[]>([]);
  const [allergenFilters, setAllergenFilters] = useState<string[]>([]);
  const [includePossible, setIncludePossible] = useState(false);
  const amendments: unknown[] = [];
  const isEmptyCatalog = items.length === 0 && menus.length === 0 && amendments.length === 0;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Lifecycle | "ALL">("ALL");
  const [showCreate, setShowCreate] = useState(initialSourceMenus.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetMenuRef = useRef<FnbSourceMenuRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/events/${eventId}/assignable-users`, { credentials: "include", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<OwnerOption[]> : [])
      .then((users) => setOwnerOptions(Array.isArray(users) ? users : []))
      .catch((cause: unknown) => { if (!(cause instanceof DOMException && cause.name === "AbortError")) setOwnerOptions([]); });
    return () => controller.abort();
  }, [eventId]);

  const filteredMenus = useMemo(() => menus.filter((menu) => {
    const matchesStatus = status === "ALL" || menu.operationalStatus === status;
    const haystack = [menu.menuName, menu.venueOrCaterer, menu.mealContext, menu.versionLabel].filter(Boolean).join(" ").toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }).sort((a, b) => a.menuName.localeCompare(b.menuName)), [menus, query, status]);

  const summary = useMemo(() => Object.fromEntries(Object.keys(labels).map((key) => [key, menus.filter((menu) => menu.operationalStatus === key).length])) as Record<Lifecycle, number>, [menus]);
  const requirements = useMemo<SafetyRequirement[]>(() => [
    ...dietaryFilters.map((code) => ({ kind: "DIETARY" as const, code })),
    ...allergenFilters.map((code) => ({ kind: "ALLERGEN" as const, code })),
  ], [allergenFilters, dietaryFilters]);
  const assessedItems = useMemo<AssessedItem[]>(() => items.map((item) => ({
    ...item,
    compatibility: requirements.length === 0 ? null : assessMenuCompatibility(item.claims as MenuClaim[], requirements, item.preparationNotes ? {
      description: item.preparationNotes,
      verificationStatus: item.modificationStatus,
      evidenceSource: item.modificationEvidenceSource,
    } : null),
  })), [items, requirements]);
  const filteredItems = useMemo(() => assessedItems.filter((item) => !item.compatibility || item.compatibility.outcome === "VERIFIED_MATCH" || (includePossible && (item.compatibility.outcome === "POSSIBLE_MATCH" || item.compatibility.outcome === "STALE_VERIFICATION"))), [assessedItems, includePossible]);
  const excludedItems = useMemo(() => requirements.length === 0 ? [] : assessedItems.filter((item) => !filteredItems.some((visible) => visible.id === item.id)), [assessedItems, filteredItems, requirements.length]);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const ownerNames = useMemo(() => new Map(ownerOptions.map((owner) => [owner.id, owner.name?.trim() || owner.email])), [ownerOptions]);

  function beginUpload(menu: FnbSourceMenuRecord | null = null) {
    uploadTargetMenuRef.current = menu;
    uploadRef.current?.click();
  }

  function renderCatalogItem(item: AssessedItem) {
    return <div key={item.id} className="flex flex-col gap-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><p className="font-medium text-slate-900">{item.itemName}</p><p className="text-xs text-slate-500">{item.category || "Uncoded"} · {item.sourceMenuFileName || "Manual"}{item.isCustom ? " · Custom/off-menu" : ""}</p>{item.description ? <p className="mt-1 text-xs text-slate-600">{item.description}</p> : null}{item.crossContactNotes ? <p className="mt-1 text-xs font-medium text-amber-800">Cross-contact: {item.crossContactNotes}</p> : null}
        {item.claims.length > 0 ? <ul aria-label={`${item.itemName} safety evidence`} className="mt-2 flex flex-wrap gap-1">{item.claims.slice(0, 8).map((claim) => <li key={claim.id} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700">{claim.kind.replaceAll("_", " ")} {claim.customLabel || claim.code.replaceAll("_", " ")} · {claim.verificationStatus.replaceAll("_", " ")}</li>)}</ul> : <p className="mt-2 text-xs font-medium text-slate-500">No structured safety claims recorded.</p>}
        {item.compatibility ? <div className="mt-2"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${compatibilityTone[item.compatibility.outcome]}`}>{item.compatibility.outcome.replaceAll("_", " ")}</span><ul className="mt-1 space-y-0.5 text-xs text-slate-600">{item.compatibility.reasonCodes.map((reason) => <li key={reason}>• {explainCompatibilityReason(reason)}</li>)}</ul></div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${item.verificationStatus === "VERIFIED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : item.verificationStatus === "STALE" || item.verificationStatus === "NEEDS_REVIEW" ? "border-amber-200 bg-amber-50 text-amber-800" : item.verificationStatus === "REJECTED" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{item.verificationStatus.replaceAll("_", " ")}</span><button type="button" onClick={() => setSelectedItemId(item.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">Review</button></div>
    </div>;
  }

  async function createMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusyId("create");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/source-menus`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as FnbSourceMenuRecord & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to create menu");
      setMenus((current) => [payload, ...current]);
      setShowCreate(false);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create menu");
    } finally {
      setBusyId(null);
    }
  }

  async function advance(menu: FnbSourceMenuRecord, next: Lifecycle) {
    setError(null);
    setBusyId(menu.id);
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/source-menus/${menu.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationalStatus: next, expectedVersion: menu.version, verificationSource: menu.verificationSource }),
      });
      const payload = await response.json() as FnbSourceMenuRecord & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update menu");
      setMenus((current) => current.map((entry) => entry.id === payload.id ? payload : entry));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update menu");
    } finally {
      setBusyId(null);
    }
  }

  async function saveMenu(event: FormEvent<HTMLFormElement>, menu: FnbSourceMenuRecord) {
    event.preventDefault();
    setError(null);
    setBusyId(menu.id);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/source-menus/${menu.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, operationalStatus: menu.operationalStatus, expectedVersion: menu.version }),
      });
      const payload = await response.json() as FnbSourceMenuRecord & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save menu details");
      setMenus((current) => current.map((entry) => entry.id === payload.id ? payload : entry));
      setEditingMenuId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save menu details");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadMenu(file: File, targetMenu: FnbSourceMenuRecord | null) {
    setError(null);
    setBusyId("upload");
    try {
      const presignResponse = await fetch(`/api/events/${eventId}/fnb-catalog/parse-menu/presign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/pdf", fileSizeBytes: file.size, sourceType: "ORIGINAL", sourceMenuId: targetMenu?.id, expectedVersion: targetMenu?.version }) });
      const presign = await presignResponse.json() as { error?: string; uploadUrl?: string; method?: string; headers?: Record<string, string>; sourceMenu?: FnbSourceMenuRecord };
      if (!presignResponse.ok || !presign.uploadUrl || !presign.sourceMenu) throw new Error(presign.error || "Unable to prepare upload");
      const uploadResponse = await fetch(presign.uploadUrl, { method: presign.method || "PUT", headers: presign.headers, body: file });
      if (!uploadResponse.ok) throw new Error("Menu file upload failed");
      const parseResponse = await fetch(`/api/events/${eventId}/fnb-catalog/parse-menu`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceMenuId: presign.sourceMenu.id, fileName: presign.sourceMenu.fileName }) });
      const parsed = await parseResponse.json() as { error?: string };
      if (!parseResponse.ok) throw new Error(parsed.error || "Menu parsing needs review");
      const refreshResponse = await fetch(`/api/events/${eventId}/fnb-catalog`, { cache: "no-store" });
      const refreshed = await refreshResponse.json() as { sourceMenus: FnbSourceMenuRecord[] };
      if (refreshResponse.ok) setMenus(refreshed.sourceMenus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload menu");
    } finally {
      setBusyId(null);
    }
  }

  return <div className="space-y-5 pb-8">
    <input ref={uploadRef} className="sr-only" tabIndex={-1} type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; const targetMenu = uploadTargetMenuRef.current; uploadTargetMenuRef.current = null; if (file) void uploadMenu(file, targetMenu); event.target.value = ""; }} />
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eventName}</p>
      <div className="mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-semibold text-slate-950">Menu workspace</h1><p className="mt-1 text-sm text-slate-600">Track expected menus, source review, coding, and vendor confirmation.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === "upload"} onClick={() => beginUpload()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800">{busyId === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload PDF</button><button type="button" onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden />Track menu</button></div>
      </div>
    </header>

    <section aria-label="Menu lifecycle summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {(Object.keys(labels) as Lifecycle[]).map((key) => <button key={key} type="button" onClick={() => setStatus(key)} className={`rounded-xl border p-3 text-left ${tones[key]}`}><span className="block text-2xl font-semibold">{summary[key]}</span><span className="text-xs font-semibold">{labels[key]}</span></button>)}
    </section>

    {showCreate ? <form onSubmit={createMenu} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Track an expected menu">
      <label className="text-xs font-semibold text-slate-700">Menu name<input required name="menuName" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">Venue or caterer<input name="venueOrCaterer" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">Meal or service context<input name="mealContext" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">Expected date<input name="expectedAt" type="date" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">Version label<input name="versionLabel" placeholder="e.g. Fall 2026" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">Owner<select name="ownerUserId" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"><option value="">Unassigned</option>{ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name?.trim() || owner.email}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Internal notes<textarea name="internalNotes" className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
      <div className="flex items-end gap-2"><button disabled={busyId === "create"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{busyId === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Save expected menu</button><button type="button" onClick={() => setShowCreate(false)} className="h-10 px-3 text-sm font-semibold text-slate-600">Cancel</button></div>
    </form> : null}

    {error ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4" />{error}</div> : null}

    {isEmptyCatalog ? <DashboardEmptyState title="No F&B catalog yet" description="Upload a menu or spreadsheet, or track an expected menu to begin." icon={<FileText className="h-6 w-6" aria-hidden />} primaryAction={<button type="button" onClick={() => beginUpload()} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Upload menu</button>} /> : null}

    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search menus</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search menu, venue, context, or version" className="h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm" /></label><select aria-label="Filter by lifecycle" value={status} onChange={(event) => setStatus(event.target.value as Lifecycle | "ALL")} className="h-10 rounded-xl border border-slate-300 px-3 text-sm"><option value="ALL">All lifecycle states</option>{(Object.keys(labels) as Lifecycle[]).map((key) => <option key={key} value={key}>{labels[key]}</option>)}</select></div>
      {filteredMenus.length === 0 ? <div className="py-12 text-center"><FileText className="mx-auto h-7 w-7 text-slate-400" /><h2 className="mt-3 font-semibold text-slate-900">No menus match this view</h2><p className="mt-1 text-sm text-slate-500">Track an expected menu or clear the filters.</p></div> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{filteredMenus.map((menu) => <article key={menu.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{menu.menuName}</h2><p className="text-xs text-slate-500">{menu.venueOrCaterer || "Venue not assigned"} · {menu.mealContext || "Context not set"}</p></div><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tones[menu.operationalStatus]}`}>{labels[menu.operationalStatus]}</span></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><div><dt className="text-slate-500">Expected</dt><dd className="font-medium text-slate-800">{dateLabel(menu.expectedAt)}</dd></div><div><dt className="text-slate-500">Received</dt><dd className="font-medium text-slate-800">{dateLabel(menu.receivedAt)}</dd></div><div><dt className="text-slate-500">Effective</dt><dd className="font-medium text-slate-800">{dateLabel(menu.effectiveAt)}</dd></div><div><dt className="text-slate-500">Source / version</dt><dd className="font-medium text-slate-800">{menu.fileName || "Not received"}{menu.versionLabel ? ` · ${menu.versionLabel}` : ""}</dd></div><div><dt className="text-slate-500">Owner</dt><dd className="font-medium text-slate-800">{menu.ownerUserId ? ownerNames.get(menu.ownerUserId) || "Assigned event member" : "Unassigned"}</dd></div><div><dt className="text-slate-500">Items</dt><dd className="font-medium text-slate-800">{menu.codedItems}/{menu.totalItems} coded · {menu.needsReviewItems} need review</dd></div><div><dt className="text-slate-500">Verification</dt><dd className="font-medium text-slate-800">{menu.verifiedItems}/{menu.totalItems} verified · {menu.verificationStatus.replaceAll("_", " ")}</dd></div></dl>
        <div className="mt-4 flex flex-wrap gap-2">{menu.operationalStatus === "OUTSTANDING" ? <button type="button" onClick={() => beginUpload(menu)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><Upload className="h-3.5 w-3.5" />Upload received PDF</button> : null}{menu.operationalStatus === "RECEIVED" ? <button type="button" disabled={busyId === menu.id} onClick={() => advance(menu, "CODED")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">Mark coded</button> : null}{menu.operationalStatus === "CODED" ? <button type="button" disabled={busyId === menu.id} onClick={() => advance(menu, "CONFIRMED")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"><CheckCircle2 className="h-3.5 w-3.5" />Confirm verification</button> : null}<button type="button" onClick={() => setEditingMenuId((current) => current === menu.id ? null : menu.id)} aria-expanded={editingMenuId === menu.id} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{editingMenuId === menu.id ? "Close details" : "Edit details"}</button></div>
        {editingMenuId === menu.id ? <form onSubmit={(event) => void saveMenu(event, menu)} aria-label={`Edit ${menu.menuName}`} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Menu name<input required name="menuName" defaultValue={menu.menuName} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Venue or caterer<input name="venueOrCaterer" defaultValue={menu.venueOrCaterer ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Meal or service context<input name="mealContext" defaultValue={menu.mealContext ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Version label<input name="versionLabel" defaultValue={menu.versionLabel ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Expected date<input name="expectedAt" type="date" defaultValue={dateInputValue(menu.expectedAt)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Received date<input name="receivedAt" type="date" defaultValue={dateInputValue(menu.receivedAt)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Effective date<input name="effectiveAt" type="date" defaultValue={dateInputValue(menu.effectiveAt)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700">Owner<select name="ownerUserId" defaultValue={menu.ownerUserId ?? ""} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"><option value="">Unassigned</option>{ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name?.trim() || owner.email}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Verification source<input name="verificationSource" defaultValue={menu.verificationSource ?? ""} placeholder="Vendor email, signed menu, or review reference" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Verification notes<textarea name="verificationNotes" defaultValue={menu.verificationNotes ?? ""} className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Internal notes<textarea name="internalNotes" defaultValue={menu.internalNotes ?? ""} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
          <div className="flex gap-2 sm:col-span-2"><button disabled={busyId === menu.id} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busyId === menu.id ? "Saving…" : "Save details"}</button><button type="button" onClick={() => setEditingMenuId(null)} className="px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button></div>
        </form> : null}
      </article>)}</div>}
    </section>

    {selectedItem ? <FnbItemSafetyEditor eventId={eventId} item={selectedItem} onClose={() => setSelectedItemId(null)} onSaved={(saved) => { setItems((current) => current.map((item) => item.id === saved.id ? saved : item)); setSelectedItemId(null); }} /> : null}
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-950">Catalog items</h2><p className="mt-1 text-xs text-slate-500">Parser proposals and manual items remain unverified until a planner records evidence. Missing Contains data never implies Free Of, and no result is a medical guarantee.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2"><fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold uppercase text-slate-600">Dietary needs</legend><div className="flex flex-wrap gap-3">{DIETARY_CODES.slice(0, 4).map((code) => <label key={code} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><input type="checkbox" checked={dietaryFilters.includes(code)} onChange={(event) => setDietaryFilters((current) => event.target.checked ? [...current, code] : current.filter((value) => value !== code))} />{code.replaceAll("_", " ")}</label>)}</div></fieldset><fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold uppercase text-slate-600">Allergen needs</legend><div className="flex flex-wrap gap-3">{ALLERGEN_CODES.map((code) => <label key={code} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><input type="checkbox" checked={allergenFilters.includes(code)} onChange={(event) => setAllergenFilters((current) => event.target.checked ? [...current, code] : current.filter((value) => value !== code))} />{code.replaceAll("_", " ")}</label>)}</div></fieldset></div>
      <label className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><input type="checkbox" checked={includePossible} onChange={(event) => setIncludePossible(event.target.checked)} />Include possible and stale matches; they remain visibly unverified</label>
      <div className="mt-3 divide-y divide-slate-100">{filteredItems.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No items match with the selected evidence level.</p> : filteredItems.slice(0, 100).map(renderCatalogItem)}</div>
      {excludedItems.length > 0 ? <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Why {excludedItems.length} {excludedItems.length === 1 ? "item was" : "items were"} excluded</summary><div className="mt-2 divide-y divide-slate-200">{excludedItems.slice(0, 100).map(renderCatalogItem)}</div></details> : null}
    </section>
  </div>;
}
