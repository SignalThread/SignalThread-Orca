"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import type { ExecutiveBriefing } from "@/lib/executive-briefing";
import { EventModuleSurface } from "../../_components/event-module-header";

function isInternalEvidenceHref(eventId: string, href: unknown): href is string {
  return typeof href === "string" && (href === `/events/${eventId}` || href.startsWith(`/events/${eventId}/`) || href.startsWith(`/events/${eventId}?`));
}

export function isExecutiveBriefing(value: unknown, eventId: string): value is ExecutiveBriefing {
  if (!value || typeof value !== "object") return false;
  const briefing = value as Record<string, unknown>;
  const event = briefing.event as Record<string, unknown> | undefined;
  const generation = briefing.generation as Record<string, unknown> | undefined;
  if (!event || event.id !== eventId || typeof event.name !== "string" || typeof briefing.dataAsOf !== "string") return false;
  if (!generation || generation.mode !== "deterministic_fallback" || !["unavailable", "partial"].includes(String(generation.status)) || typeof generation.message !== "string") return false;
  if (!["current", "stale", "partial"].includes(String(briefing.freshness)) || !Array.isArray(briefing.facts) || !Array.isArray(briefing.recommendations)) return false;
  return briefing.facts.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const fact = entry as Record<string, unknown>;
    const evidence = fact.evidence as Record<string, unknown> | undefined;
    return typeof fact.id === "string" && typeof fact.title === "string" && typeof fact.detail === "string" && evidence && typeof evidence.id === "string" && typeof evidence.label === "string" && isInternalEvidenceHref(eventId, evidence.href);
  }) && briefing.recommendations.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const recommendation = entry as Record<string, unknown>;
    return typeof recommendation.id === "string" && typeof recommendation.title === "string" && typeof recommendation.reason === "string" && isInternalEvidenceHref(eventId, recommendation.href) && Array.isArray(recommendation.evidenceIds) && ["editable", "view_only"].includes(String(recommendation.actionMode));
  });
}

function formatDataAsOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

export function ExecutiveBriefingPanel({ eventId }: { eventId: string }) {
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const sequence = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++sequence.current;
    setState("loading");
    try {
      const response = await fetch(`/api/events/${eventId}/ai-workspace/executive-briefing`, { credentials: "include", signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 403 ? "You do not have access to this event briefing." : "Unable to load the executive briefing.");
      if (!isExecutiveBriefing(payload, eventId)) throw new Error("The executive briefing response was incomplete.");
      if (requestId !== sequence.current) return;
      setBriefing(payload);
      setState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === sequence.current) setState("error");
    }
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { sequence.current += 1; controller.abort(); };
  }, [load]);

  if (state === "loading") return <EventModuleSurface paddingClassName="p-5"><div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Loading executive briefing" aria-busy="true" /></EventModuleSurface>;
  if (state === "error" || !briefing) return (
    <EventModuleSurface paddingClassName="p-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
        <CircleAlert className="h-5 w-5 text-amber-800" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-amber-950">The briefing endpoint is unavailable. Canonical attention findings below remain available.</p>
        <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"><RefreshCw className="h-4 w-4" aria-hidden />Retry</button>
      </div>
    </EventModuleSurface>
  );

  return (
    <EventModuleSurface paddingClassName="p-4 sm:p-5">
      <section aria-labelledby="executive-briefing-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#28439A]">Evidence-grounded summary</p>
            <h2 id="executive-briefing-heading" className="mt-1 text-xl font-semibold text-slate-950">Executive Briefing</h2>
            <p className="mt-1 text-xs text-slate-500">{briefing.event.name} · Data as of {formatDataAsOf(briefing.dataAsOf)}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{briefing.freshness === "current" ? "Current" : briefing.freshness === "stale" ? "Stale data" : "Partial data"}</span>
        </div>
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">{briefing.generation.message}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="briefing-facts-heading">
            <h3 id="briefing-facts-heading" className="text-sm font-semibold text-slate-950">Facts</h3>
            <ul className="mt-2 space-y-2">
              {briefing.facts.map((fact) => <li key={fact.id} className="rounded-xl border border-slate-200 p-3"><strong className="block text-sm text-slate-950">{fact.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{fact.detail}</span><Link href={fact.evidence.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#28439A] focus:outline-none focus:ring-2 focus:ring-[#28439A]/40">{fact.evidence.label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link></li>)}
            </ul>
          </section>
          <section aria-labelledby="briefing-recommendations-heading">
            <h3 id="briefing-recommendations-heading" className="text-sm font-semibold text-slate-950">Recommended next actions</h3>
            <ul className="mt-2 space-y-2">
              {briefing.recommendations.map((recommendation) => <li key={recommendation.id} className="rounded-xl border border-slate-200 p-3"><strong className="block text-sm text-slate-950">{recommendation.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{recommendation.reason}</span><Link href={recommendation.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#28439A] focus:outline-none focus:ring-2 focus:ring-[#28439A]/40">{recommendation.actionMode === "editable" ? "Take action" : "View evidence"}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link></li>)}
            </ul>
          </section>
        </div>
      </section>
    </EventModuleSurface>
  );
}
