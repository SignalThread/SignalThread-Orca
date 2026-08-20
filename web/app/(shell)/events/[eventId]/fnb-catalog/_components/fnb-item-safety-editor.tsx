"use client";

import { FormEvent, useState } from "react";
import type { FnbCatalogItemRecord } from "@/lib/fnb-catalog";
import { ALLERGEN_CODES, DIETARY_CODES } from "@/lib/fnb-safety-domain";

export function FnbItemSafetyEditor({ eventId, item, onSaved, onClose }: { eventId: string; item: FnbCatalogItemRecord; onSaved: (item: FnbCatalogItemRecord) => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = new Set(item.claims.map((claim) => `${claim.kind}:${claim.code}`));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    const verificationStatus = String(data.get("verificationStatus"));
    const claims = Array.from(data.getAll("claim")).map((value) => {
      const [kind, code] = String(value).split(":");
      return { kind, code, verificationStatus, evidenceSource: data.get("verificationSource") };
    });
    for (const [field, kind] of [["customSuitability", "SUITABILITY"], ["customContains", "CONTAINS"], ["customFreeOf", "FREE_OF"]] as const) {
      const customLabel = String(data.get(field) || "").trim();
      if (customLabel) claims.push({ kind, code: "CUSTOM", customLabel, verificationStatus, evidenceSource: data.get("verificationSource") } as (typeof claims)[number]);
    }
    const body = {
      expectedVersion: item.version,
      itemName: data.get("itemName"),
      description: data.get("description"),
      category: data.get("category"),
      unit: data.get("unit"),
      claims,
      verificationStatus,
      verificationSource: data.get("verificationSource"),
      verificationNotes: data.get("verificationNotes"),
      crossContactNotes: data.get("crossContactNotes"),
      preparationNotes: data.get("preparationNotes"),
      modificationStatus: data.get("modificationStatus"),
      modificationEvidenceSource: data.get("modificationEvidenceSource"),
      serviceNotes: data.get("serviceNotes"),
      vendorNotes: data.get("vendorNotes"),
      internalNotes: data.get("internalNotes"),
      publishedPriceCents: data.get("publishedPriceCents"),
      negotiatedPriceCents: data.get("negotiatedPriceCents"),
      discountCents: data.get("discountCents"),
      currency: data.get("currency"),
      pricingUnit: data.get("pricingUnit"),
      minimumQuantity: data.get("minimumQuantity"),
      taxable: data.get("taxable") === "on",
      isCustom: data.get("isCustom") === "on",
      reason: "Menu safety review",
    };
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/${item.id}/safety`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as FnbCatalogItemRecord & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save item review");
      onSaved(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save item review"); }
    finally { setBusy(false); }
  }

  const customClaim = (kind: string) => item.claims.find((claim) => claim.kind === kind && claim.code === "CUSTOM")?.customLabel ?? "";

  return <form onSubmit={submit} className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm" aria-label={`Review ${item.itemName}`}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">Review {item.itemName}</h2><p className="text-xs text-slate-500">Claims are operational source facts, not medical guarantees.</p></div><button type="button" onClick={onClose} className="text-sm font-semibold text-slate-600">Close</button></div>
    <fieldset className="mt-4 grid gap-3 sm:grid-cols-2"><legend className="sr-only">Item details</legend><label className="text-xs font-semibold">Item name<input required name="itemName" defaultValue={item.itemName} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold">Category<input name="category" defaultValue={item.category ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold sm:col-span-2">Source description<textarea name="description" defaultValue={item.description ?? ""} className="mt-1 min-h-16 w-full rounded-lg border p-2" /></label></fieldset>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <fieldset><legend className="text-xs font-semibold uppercase text-slate-600">Suitability</legend><div className="mt-2 grid grid-cols-2 gap-2">{DIETARY_CODES.map((code) => <label key={code} className="flex items-center gap-2 text-xs"><input type="checkbox" name="claim" value={`SUITABILITY:${code}`} defaultChecked={selected.has(`SUITABILITY:${code}`)} />{code.replaceAll("_", " ")}</label>)}</div><label className="mt-3 block text-xs font-semibold">Custom suitability<input name="customSuitability" defaultValue={customClaim("SUITABILITY")} className="mt-1 h-9 w-full rounded-lg border px-2" /></label></fieldset>
      <fieldset><legend className="text-xs font-semibold uppercase text-slate-600">Contains</legend><div className="mt-2 grid grid-cols-2 gap-2">{ALLERGEN_CODES.map((code) => <label key={code} className="flex items-center gap-2 text-xs"><input type="checkbox" name="claim" value={`CONTAINS:${code}`} defaultChecked={selected.has(`CONTAINS:${code}`)} />{code.replaceAll("_", " ")}</label>)}</div><label className="mt-3 block text-xs font-semibold">Custom Contains<input name="customContains" defaultValue={customClaim("CONTAINS")} className="mt-1 h-9 w-full rounded-lg border px-2" /></label></fieldset>
      <fieldset><legend className="text-xs font-semibold uppercase text-slate-600">Explicitly Free Of</legend><div className="mt-2 grid grid-cols-2 gap-2">{ALLERGEN_CODES.map((code) => <label key={code} className="flex items-center gap-2 text-xs"><input type="checkbox" name="claim" value={`FREE_OF:${code}`} defaultChecked={selected.has(`FREE_OF:${code}`)} />{code.replaceAll("_", " ")}</label>)}</div><label className="mt-3 block text-xs font-semibold">Custom Free Of<input name="customFreeOf" defaultValue={customClaim("FREE_OF")} className="mt-1 h-9 w-full rounded-lg border px-2" /></label></fieldset>
    </div>
    <fieldset className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><legend className="sr-only">Pricing</legend><label className="text-xs font-semibold">Published cents<input name="publishedPriceCents" inputMode="numeric" defaultValue={item.publishedPriceCents ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold">Negotiated cents<input name="negotiatedPriceCents" inputMode="numeric" defaultValue={item.negotiatedPriceCents ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold">Discount cents<input name="discountCents" inputMode="numeric" defaultValue={item.discountCents ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold">Currency<input name="currency" defaultValue={item.currency} maxLength={3} className="mt-1 h-9 w-full rounded-lg border px-2 uppercase" /></label><label className="text-xs font-semibold">Pricing unit<select name="pricingUnit" defaultValue={item.pricingUnit ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2"><option value="">Not set</option><option value="PER_PERSON">Per person</option><option value="PER_ITEM">Per item</option><option value="PER_DOZEN">Per dozen</option><option value="FLAT">Flat</option></select></label><label className="text-xs font-semibold">Source unit<input name="unit" defaultValue={item.unit ?? ""} placeholder="each, tray, dozen" className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold">Minimum quantity<input name="minimumQuantity" inputMode="numeric" defaultValue={item.minimumQuantity ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="flex items-end gap-2 pb-2 text-xs font-semibold"><input type="checkbox" name="taxable" defaultChecked={item.taxable} />Taxable</label><label className="flex items-end gap-2 pb-2 text-xs font-semibold"><input type="checkbox" name="isCustom" defaultChecked={item.isCustom} />Custom/off-menu</label></fieldset>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Cross-contact notes<textarea name="crossContactNotes" defaultValue={item.crossContactNotes ?? ""} className="mt-1 min-h-16 w-full rounded-lg border p-2" /></label><label className="text-xs font-semibold">Preparation/modification notes<textarea name="preparationNotes" defaultValue={item.preparationNotes ?? ""} className="mt-1 min-h-16 w-full rounded-lg border p-2" /></label><label className="text-xs font-semibold">Service/accessibility notes<textarea name="serviceNotes" defaultValue={item.serviceNotes ?? ""} className="mt-1 min-h-16 w-full rounded-lg border p-2" /></label><label className="text-xs font-semibold">Vendor-facing notes<textarea name="vendorNotes" defaultValue={item.vendorNotes ?? ""} className="mt-1 min-h-16 w-full rounded-lg border p-2" /></label><label className="text-xs font-semibold sm:col-span-2">Internal notes<textarea name="internalNotes" defaultValue={item.internalNotes ?? ""} className="mt-1 min-h-16 w-full rounded-lg border p-2" /></label></div>
    <fieldset className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2"><legend className="px-1 text-xs font-semibold uppercase text-slate-600">Modification verification</legend><p className="text-xs text-slate-500 sm:col-span-2">A modification never clears or hides the base item conflict. Verify it independently with vendor evidence.</p><label className="text-xs font-semibold">Modification decision<select name="modificationStatus" defaultValue={item.modificationStatus ?? "UNVERIFIED"} className="mt-1 h-9 w-full rounded-lg border px-2"><option value="UNVERIFIED">Proposed / unverified</option><option value="NEEDS_REVIEW">Needs review</option><option value="VERIFIED">Verified modification</option><option value="REJECTED">Rejected</option><option value="STALE">Stale</option></select></label><label className="text-xs font-semibold">Modification evidence/source<input name="modificationEvidenceSource" defaultValue={item.modificationEvidenceSource ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label></fieldset>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Review decision<select name="verificationStatus" defaultValue={item.verificationStatus} className="mt-1 h-9 w-full rounded-lg border px-2"><option value="UNVERIFIED">Proposed / unverified</option><option value="NEEDS_REVIEW">Needs review</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="STALE">Stale</option></select></label><label className="text-xs font-semibold">Evidence/source<input name="verificationSource" defaultValue={item.verificationSource ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label><label className="text-xs font-semibold">Verification notes<input name="verificationNotes" defaultValue={item.verificationNotes ?? ""} className="mt-1 h-9 w-full rounded-lg border px-2" /></label></div>
    {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}<button disabled={busy} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save safety review"}</button>
  </form>;
}
