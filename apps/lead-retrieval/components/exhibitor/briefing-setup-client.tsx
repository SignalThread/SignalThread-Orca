"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, CalendarRange, Check, ChevronDown, Layers, Link2, Mic, Target } from "lucide-react";
import { BriefingSetupEventGoalCombobox } from "@/components/exhibitor/briefing-setup-event-goal-combobox";
import type { BriefingGuardrailsV1 } from "@/lib/import-wizard/batch-briefing-context";
import { defaultBriefingGuardrails, EVENT_GOAL_PRESETS } from "@/lib/import-wizard/batch-briefing-context";
import { exhibitorBriefingsIntroProseClass } from "@/lib/exhibitor-briefings-shell";
import { EXHIBITOR_BRIEFINGS_PATH } from "@/lib/import-wizard/paths";
import type { BriefingEventKnowledgeItem } from "@/lib/import-wizard/briefing-event-knowledge-types";

type ApiList = {
  items: BriefingEventKnowledgeItem[];
  counts: { total: number; website_sources: number; documents: number; briefing_notes: number };
  eventId: string | null;
  message?: string;
};

type FoundationsDraft = {
  productFocus: string;
  targetBuyerPersona: string;
  eventGoal: string;
  toneOfVoice: string;
  guardrails: BriefingGuardrailsV1;
};

const AUTOSAVE_DEBOUNCE_MS = 700;

const STRATEGY_CARD_IDS = ["product", "goal", "audience", "voice"] as const;
type StrategyCardId = (typeof STRATEGY_CARD_IDS)[number];

const STRATEGY_SECTION_TOTAL = STRATEGY_CARD_IDS.length;

const TONE_PILLS = ["Authoritative", "Strategic", "Analytical", "Concise"] as const;

function parseToneTokens(tone: string): Set<string> {
  return new Set(
    tone
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function toggleToneToken(tone: string, pill: string): string {
  const set = parseToneTokens(tone);
  if (set.has(pill)) set.delete(pill);
  else set.add(pill);
  const ordered = TONE_PILLS.filter((p) => set.has(p));
  const extras = [...set].filter((p) => !TONE_PILLS.includes(p as (typeof TONE_PILLS)[number]));
  return [...ordered, ...extras].join(", ");
}

function BriefWorkspaceCard({
  icon: Icon,
  iconWrapClass,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  iconWrapClass: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.03] sm:p-5">
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${iconWrapClass}`}
        >
          <Icon className="h-[1.1rem] w-[1.1rem] text-slate-800" strokeWidth={1.85} aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1 pt-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          <p className="text-sm leading-snug text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BriefFieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[12px] leading-snug text-slate-500">{children}</p>;
}

function isSectionComplete(id: StrategyCardId, d: FoundationsDraft): boolean {
  switch (id) {
    case "product":
      return d.productFocus.trim().length > 0;
    case "goal":
      return d.eventGoal.trim().length > 0;
    case "audience":
      return d.targetBuyerPersona.trim().length > 0;
    case "voice":
      return parseToneTokens(d.toneOfVoice).size > 0;
    default:
      return false;
  }
}

function referenceCollapsedSummary(sourceTotal: number, counts: ApiList["counts"] | undefined): string {
  if (sourceTotal === 0) return "None yet";
  const links = counts?.website_sources ?? 0;
  const files = counts?.documents ?? 0;
  const notes = counts?.briefing_notes ?? 0;
  const tail =
    notes > 0 ? ` (${notes} note${notes === 1 ? "" : "s"})` : "";
  return `${sourceTotal} item${sourceTotal === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"}${links > 0 ? `, ${links} link${links === 1 ? "" : "s"}` : ""}${tail}`;
}

function normalizeFoundations(c: FoundationsDraft): FoundationsDraft {
  return {
    productFocus: c.productFocus ?? "",
    targetBuyerPersona: c.targetBuyerPersona ?? "",
    eventGoal: c.eventGoal ?? "",
    toneOfVoice: c.toneOfVoice ?? "",
    guardrails: { ...defaultBriefingGuardrails(), ...c.guardrails },
  };
}

function serializeFoundations(c: FoundationsDraft): string {
  return JSON.stringify(normalizeFoundations(c));
}

function emptyFoundations(): FoundationsDraft {
  return {
    productFocus: "",
    targetBuyerPersona: "",
    eventGoal: "",
    toneOfVoice: "",
    guardrails: defaultBriefingGuardrails(),
  };
}

function strategyFromApi(strategy: Partial<FoundationsDraft> | undefined): FoundationsDraft {
  const g = strategy?.guardrails;
  return normalizeFoundations({
    productFocus: strategy?.productFocus ?? "",
    targetBuyerPersona: strategy?.targetBuyerPersona ?? "",
    eventGoal: strategy?.eventGoal ?? "",
    toneOfVoice: strategy?.toneOfVoice ?? "",
    guardrails: g ? { ...defaultBriefingGuardrails(), ...g } : defaultBriefingGuardrails(),
  });
}

function payloadForPut(current: FoundationsDraft, saved: FoundationsDraft): Record<string, unknown> {
  const next = normalizeFoundations(current);
  const baseline = normalizeFoundations(saved);
  const patch: Record<string, unknown> = {};
  for (const key of ["productFocus", "targetBuyerPersona", "eventGoal", "toneOfVoice"] as const) {
    if (next[key] !== baseline[key]) patch[key] = next[key];
  }

  const nextGuardrails = { ...next.guardrails, realtimeDriftDetection: true };
  const savedGuardrails = { ...baseline.guardrails, realtimeDriftDetection: true };
  if (JSON.stringify(nextGuardrails) !== JSON.stringify(savedGuardrails)) {
    patch.guardrails = nextGuardrails;
  }
  return patch;
}

export function BriefingSetupClient() {
  const [data, setData] = useState<ApiList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [sourceActionBusy, setSourceActionBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [sourcesStatusMsg, setSourcesStatusMsg] = useState<string | null>(null);

  const [strategyDraft, setStrategyDraft] = useState<FoundationsDraft>(emptyFoundations);
  const [foundationsLoading, setFoundationsLoading] = useState(true);
  const [foundationsHydrated, setFoundationsHydrated] = useState(false);
  /** idle | saving | saved | error */
  const [foundationsSaveUi, setFoundationsSaveUi] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [foundationsErrorMsg, setFoundationsErrorMsg] = useState<string | null>(null);

  const baselineRef = useRef<string>(serializeFoundations(emptyFoundations()));
  const savedFoundationsRef = useRef<FoundationsDraft>(emptyFoundations());
  const draftRef = useRef<FoundationsDraft>(emptyFoundations());
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  draftRef.current = strategyDraft;

  const [goalCustomActive, setGoalCustomActive] = useState(false);
  const goalInitRef = useRef(false);
  useEffect(() => {
    if (!foundationsHydrated || foundationsLoading) return;
    if (goalInitRef.current) return;
    goalInitRef.current = true;
    const m = EVENT_GOAL_PRESETS.find((p) => p.value === strategyDraft.eventGoal);
    setGoalCustomActive(!m && strategyDraft.eventGoal.trim() !== "");
  }, [foundationsHydrated, foundationsLoading, strategyDraft.eventGoal]);

  const matchedGoalPreset = EVENT_GOAL_PRESETS.find((p) => p.value === strategyDraft.eventGoal);
  const showGoalCustomTextarea =
    goalCustomActive || (strategyDraft.eventGoal.trim() !== "" && !matchedGoalPreset);

  /** Single parent Strategy card — collapsed when every subsection is complete (initial layout only). */
  const [strategyExpanded, setStrategyExpanded] = useState<boolean | null>(null);
  const strategyExpandInitRef = useRef(false);
  const accordionInitReady = foundationsHydrated && !foundationsLoading && !loading;

  useLayoutEffect(() => {
    if (!accordionInitReady || strategyExpandInitRef.current) return;
    strategyExpandInitRef.current = true;
    const d = draftRef.current;
    const st = data?.counts.total ?? 0;
    const allComplete = STRATEGY_CARD_IDS.every((id) => isSectionComplete(id, d));
    setStrategyExpanded(!allComplete);
  }, [accordionInitReady, data?.counts.total]);

  const toggleStrategyBlock = useCallback(() => {
    setStrategyExpanded((prev) => (prev === null ? true : !prev));
  }, []);

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exhibitor/briefing-knowledge?setup=1`, {
        credentials: "include",
      });
      const json = (await res.json()) as ApiList & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load.");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKnowledge();
  }, [loadKnowledge]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        setFoundationsLoading(true);
        const res = await fetch("/api/exhibitor/briefing-setup", { credentials: "include" });
        if (res.ok) {
          const json = (await res.json()) as { strategy?: Partial<FoundationsDraft> };
          if (!c) {
            const normalized = strategyFromApi(json.strategy);
            setStrategyDraft(normalized);
            baselineRef.current = serializeFoundations(normalized);
            savedFoundationsRef.current = normalized;
            setFoundationsSaveUi("saved");
          }
        }
      } finally {
        if (!c) {
          setFoundationsLoading(false);
          setFoundationsHydrated(true);
        }
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const flushFoundationsSave = useCallback(async (): Promise<boolean> => {
    if (!foundationsHydrated || foundationsLoading) return true;
    if (saveInFlightRef.current) return saveInFlightRef.current;

    const save = (async (): Promise<boolean> => {
      for (;;) {
        if (serializeFoundations(draftRef.current) === baselineRef.current) {
          setFoundationsSaveUi("saved");
          return true;
        }

        setFoundationsSaveUi("saving");
        setFoundationsErrorMsg(null);

        const sentDraft = normalizeFoundations(draftRef.current);
        const patch = payloadForPut(sentDraft, savedFoundationsRef.current);
        if (Object.keys(patch).length === 0) {
          baselineRef.current = serializeFoundations(savedFoundationsRef.current);
          continue;
        }

        try {
          const res = await fetch("/api/exhibitor/briefing-setup", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ strategy: patch }),
          });
          const json = (await res.json().catch(() => ({}))) as { error?: string; strategy?: Partial<FoundationsDraft> };
          if (!res.ok) throw new Error(json.error ?? "Save failed.");
          const confirmed = strategyFromApi(json.strategy);
          savedFoundationsRef.current = confirmed;
          baselineRef.current = serializeFoundations(confirmed);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Save failed.";
          setFoundationsErrorMsg(msg);
          setFoundationsSaveUi("error");
          return false;
        }
      }
    })();
    saveInFlightRef.current = save;
    try {
      return await save;
    } finally {
      if (saveInFlightRef.current === save) saveInFlightRef.current = null;
    }
  }, [foundationsHydrated, foundationsLoading]);

  useEffect(() => {
    if (!foundationsHydrated || foundationsLoading) return;
    if (serializeFoundations(strategyDraft) === baselineRef.current) {
      return;
    }

    const t = window.setTimeout(() => {
      void flushFoundationsSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [strategyDraft, foundationsHydrated, foundationsLoading, flushFoundationsSave]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (serializeFoundations(draftRef.current) === baselineRef.current) return;
      void flushFoundationsSave();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [flushFoundationsSave]);

  const retryFoundationsSave = useCallback(() => {
    void flushFoundationsSave();
  }, [flushFoundationsSave]);

  async function addUrl() {
    setSourceActionBusy(true);
    setSourcesStatusMsg(null);
    try {
      const res = await fetch("/api/exhibitor/briefing-knowledge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup: true, kind: "url", url: urlInput.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save URL.");
      setUrlInput("");
      setSourcesStatusMsg("URL added.");
      await loadKnowledge();
    } catch (e) {
      setSourcesStatusMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setSourceActionBusy(false);
    }
  }

  async function uploadFile(f: File) {
    setUploadBusy(true);
    setSourcesStatusMsg(null);
    try {
      const fd = new FormData();
      fd.set("setup", "1");
      fd.set("file", f);
      const res = await fetch("/api/exhibitor/briefing-knowledge/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      setSourcesStatusMsg("File stored for this event.");
      await loadKnowledge();
    } catch (e) {
      setSourcesStatusMsg(e instanceof Error ? e.message : "Upload error.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Remove this item?")) return;
    setSourcesStatusMsg(null);
    try {
      const res = await fetch(`/api/exhibitor/briefing-knowledge/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed.");
      setSourcesStatusMsg("Removed.");
      await loadKnowledge();
    } catch (e) {
      setSourcesStatusMsg(e instanceof Error ? e.message : "Error");
    }
  }

  const items = data?.items ?? [];
  const noEvent = data?.eventId == null && data?.message;
  const sourceTotal = data?.counts.total ?? 0;
  const completedStrategySections = STRATEGY_CARD_IDS.filter((id) =>
    isSectionComplete(id, strategyDraft)
  ).length;
  const foundationsDirty =
    foundationsHydrated && !foundationsLoading && serializeFoundations(strategyDraft) !== baselineRef.current;

  const foundationsStatusLine = (() => {
    if (foundationsLoading || !foundationsHydrated) return "Loading…";
    if (foundationsSaveUi === "saving") return "Saving…";
    if (foundationsSaveUi === "error") return foundationsErrorMsg ?? "Couldn’t save.";
    if (foundationsDirty) return "Unsaved changes — saving soon…";
    return "All changes saved";
  })();

  const sortedSources = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  function sourceKindLabel(kind: BriefingEventKnowledgeItem["kind"]): string {
    switch (kind) {
      case "url":
        return "Link";
      case "file":
        return "File";
      case "notes":
        return "Note";
      default:
        return kind;
    }
  }

  return (
    <div className="w-full" data-testid="briefing-setup-root">
      {noEvent ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          {data?.message}
        </div>
      ) : null}

      <div className="space-y-4" data-testid="briefing-setup-main">
        <section
          data-testid="briefing-knowledge-strategy"
          className="rounded-[1.75rem] border border-slate-200/85 bg-[radial-gradient(circle_at_top_left,rgba(238,242,255,0.65),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-3 shadow-[0_18px_60px_rgba(15,23,42,0.07)] ring-1 ring-slate-900/[0.03] sm:p-4"
        >
          {foundationsLoading || !accordionInitReady || strategyExpanded === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div
              className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.02]"
              data-testid="briefing-strategy-main-accordion"
            >
              <div data-testid="briefing-strategy-status-summary">
                <button
                  type="button"
                  id="briefing-strategy-header"
                  aria-expanded={strategyExpanded}
                  aria-controls="briefing-strategy-panel"
                  onClick={toggleStrategyBlock}
                  className={`flex w-full items-start gap-3 px-4 text-left transition hover:bg-slate-50/80 sm:gap-4 sm:px-5 ${
                    strategyExpanded ? "py-4 sm:py-5" : "py-3.5 sm:py-4"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ring-1 ring-indigo-200/70">
                    <Layers className="h-[1.2rem] w-[1.2rem] text-indigo-950" strokeWidth={1.85} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold tracking-tight text-slate-900">Strategy</h2>
                      {completedStrategySections === STRATEGY_SECTION_TOTAL ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200/70">
                          <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                          Ready
                        </span>
                      ) : null}
                    </div>
                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 ${strategyExpanded ? "mt-2" : "mt-1.5"}`}>
                      <span>{completedStrategySections} of {STRATEGY_SECTION_TOTAL} configured</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
                      <span>Advanced context optional</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
                      <span data-testid="briefing-knowledge-strategy-save-status">
                        {foundationsStatusLine}
                        {foundationsSaveUi === "error" ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              onClick={() => retryFoundationsSave()}
                              className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-900"
                              data-testid="briefing-knowledge-strategy-retry"
                            >
                              Retry
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                    {strategyExpanded ? (
                      <p className={`mt-2 text-sm leading-snug text-slate-600 ${exhibitorBriefingsIntroProseClass}`}>
                        Configure the strategy AI uses across imports and briefings.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 self-start">
                    <span className="text-[11px] font-semibold text-indigo-600">
                      {strategyExpanded ? "Collapse" : "Edit strategy"}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ease-out ${strategyExpanded ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </div>
                </button>
              </div>

              <div
                id="briefing-strategy-panel"
                role="region"
                aria-labelledby="briefing-strategy-header"
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${strategyExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-slate-100 px-4 pb-5 pt-5 sm:px-5 sm:pb-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <BriefWorkspaceCard
                        icon={Building2}
                        iconWrapClass="bg-violet-100/90 text-violet-900 ring-1 ring-violet-200/70"
                        title="Product Focus"
                        description="Anchor the brief in the exact product, offer, or solution you are promoting at this event."
                      >
                        <input
                          id="bk-product"
                          type="text"
                          disabled={foundationsLoading}
                          className="w-full rounded-xl border border-slate-200/95 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:italic placeholder:text-slate-400 transition hover:border-slate-300/90 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                          placeholder="e.g. Registration, housing, and lead retrieval platform…"
                          value={strategyDraft.productFocus}
                          onChange={(e) => setStrategyDraft((d) => ({ ...d, productFocus: e.target.value }))}
                          data-testid="batch-context-product"
                        />
                        <BriefFieldHint>
                          Helps the AI tailor examples and talking points to your offering.
                        </BriefFieldHint>
                      </BriefWorkspaceCard>

                      <BriefWorkspaceCard
                        icon={CalendarRange}
                        iconWrapClass="bg-emerald-100/90 text-emerald-900 ring-1 ring-emerald-200/70"
                        title="Event Goal"
                        description="Define the outcome this event should drive so briefs stay aligned to the right narrative."
                      >
                        <div className="space-y-2.5">
                          <BriefingSetupEventGoalCombobox
                            value={strategyDraft.eventGoal}
                            disabled={foundationsLoading}
                            onSelectPreset={(slug) => {
                              setGoalCustomActive(false);
                              setStrategyDraft((d) => ({ ...d, eventGoal: slug }));
                            }}
                            onPickCustom={() => {
                              setGoalCustomActive(true);
                              setStrategyDraft((d) => {
                                const wasPreset = EVENT_GOAL_PRESETS.some((p) => p.value === d.eventGoal);
                                return { ...d, eventGoal: wasPreset ? "" : d.eventGoal };
                              });
                            }}
                          />
                          {showGoalCustomTextarea ? (
                            <textarea
                              id="bk-goal"
                              rows={3}
                              disabled={foundationsLoading}
                              className="min-h-[5rem] w-full resize-y rounded-xl border border-slate-200/95 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:italic placeholder:text-slate-400 transition hover:border-slate-300/90 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                              placeholder="Describe your goal in your own words if it isn’t covered above."
                              value={strategyDraft.eventGoal}
                              onChange={(e) => setStrategyDraft((d) => ({ ...d, eventGoal: e.target.value }))}
                              data-testid="batch-context-goal-custom"
                            />
                          ) : null}
                        </div>
                        <BriefFieldHint>
                          Sets the narrative arc for every brief, from demos booked to pipeline advanced.
                        </BriefFieldHint>
                      </BriefWorkspaceCard>

                      <BriefWorkspaceCard
                        icon={Target}
                        iconWrapClass="bg-sky-100/90 text-sky-900 ring-1 ring-sky-200/70"
                        title="Target Audience"
                        description="Focus the language, pains, and proof points on the buyers you want to reach."
                      >
                        <textarea
                          id="bk-persona"
                          rows={6}
                          disabled={foundationsLoading}
                          className="min-h-[12rem] w-full resize-y rounded-xl border border-slate-200/95 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:italic placeholder:text-slate-400 transition hover:border-slate-300/90 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                          placeholder="e.g. Event marketers, field marketing leaders, and exhibitor teams focused on measurable pipeline impact…"
                          value={strategyDraft.targetBuyerPersona}
                          onChange={(e) => setStrategyDraft((d) => ({ ...d, targetBuyerPersona: e.target.value }))}
                          data-testid="batch-context-persona"
                        />
                        <BriefFieldHint>
                          Narrows the pain points and buying context the brief should emphasize.
                        </BriefFieldHint>
                      </BriefWorkspaceCard>

                      <div data-testid="briefing-knowledge-ai-behavior">
                        <BriefWorkspaceCard
                          icon={Mic}
                          iconWrapClass="bg-amber-100/85 text-amber-950 ring-1 ring-amber-200/70"
                          title="Tone / Voice"
                          description="Shape how assisted copy sounds when it speaks on your behalf."
                        >
                          <div
                            data-testid="batch-context-tone"
                            className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                          >
                            <div className="flex flex-wrap gap-2" data-testid="batch-context-tone-pills">
                              {TONE_PILLS.map((pill) => {
                                const on = parseToneTokens(strategyDraft.toneOfVoice).has(pill);
                                return (
                                  <button
                                    key={pill}
                                    type="button"
                                    onClick={() =>
                                      setStrategyDraft((d) => ({
                                        ...d,
                                        toneOfVoice: toggleToneToken(d.toneOfVoice, pill),
                                      }))
                                    }
                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                                      on
                                        ? "border-indigo-400 bg-white text-indigo-900 shadow-sm shadow-indigo-900/10 ring-1 ring-indigo-200/80"
                                        : "border-slate-200/95 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                  >
                                    {pill}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <BriefFieldHint>
                            Stack a few traits to steer assisted copy without over-constraining it.
                          </BriefFieldHint>
                        </BriefWorkspaceCard>
                      </div>
                    </div>

                    <div data-testid="briefing-knowledge-sources" className="mt-5">
                      <details className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-3.5 text-left marker:content-none [&::-webkit-details-marker]:hidden hover:bg-white/60 sm:px-5">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200/70">
                              <Link2 className="h-4.5 w-4.5" strokeWidth={1.9} aria-hidden />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">Supporting Context (Advanced)</span>
                                <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-200/80">
                                  Optional
                                </span>
                              </div>
                              <p className="mt-1 text-sm leading-snug text-slate-600">
                                Add trusted links and files when you want more grounding, but keep this tucked away by default.
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 pl-2">
                            {!loading && data ? (
                              <span className="text-[11px] font-medium text-slate-500" data-testid="briefing-knowledge-sources-count">
                                {referenceCollapsedSummary(sourceTotal, data.counts)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-400" data-testid="briefing-knowledge-sources-count">
                                …
                              </span>
                            )}
                            <ChevronDown className="h-4.5 w-4.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
                          </div>
                        </summary>

                        <div className="space-y-2.5 border-t border-slate-200/70 px-4 pb-4 pt-3 sm:px-5">
                          <BriefFieldHint>
                            Separate from the primary cards above. Use Manage sources only when extra grounding will improve the briefs.
                          </BriefFieldHint>

                          <details className="group mt-3 rounded-xl border border-slate-200/85 bg-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-left marker:content-none [&::-webkit-details-marker]:hidden hover:bg-white/70">
                              <span className="text-sm font-semibold text-slate-800">Manage sources</span>
                              {!loading && data ? (
                                <span className="text-[11px] font-medium text-slate-500">
                                  {sourceTotal === 0
                                    ? "None saved"
                                    : `${sourceTotal} saved · ${data.counts.website_sources} links · ${data.counts.documents} files · ${data.counts.briefing_notes} notes`}
                                </span>
                              ) : (
                                <span className="text-[11px] font-medium text-slate-400">…</span>
                              )}
                            </summary>

                            <div className="space-y-2.5 border-t border-slate-200/70 px-4 pb-4 pt-3">
                              {sourcesStatusMsg ? (
                                <div className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-xs text-slate-800">
                                  {sourcesStatusMsg}
                                </div>
                              ) : null}

                              {loading ? <p className="text-xs text-slate-500">Loading sources…</p> : null}
                              {error ? <p className="text-xs text-rose-600">{error}</p> : null}

                              <div className="grid gap-2.5 sm:grid-cols-2">
                                <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200/75 shadow-sm shadow-slate-900/[0.03]">
                                  <h3 className="text-xs font-semibold text-slate-800">Add a link</h3>
                                  <p className="mt-0.5 text-[11px] text-slate-500">Trusted URL for this event.</p>
                                  <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
                                    <input
                                      type="url"
                                      placeholder="https://…"
                                      value={urlInput}
                                      onChange={(e) => setUrlInput(e.target.value)}
                                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
                                      data-testid="briefing-knowledge-url-input"
                                    />
                                    <button
                                      type="button"
                                      disabled={sourceActionBusy || !urlInput.trim() || !!noEvent}
                                      onClick={() => void addUrl()}
                                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                                      data-testid="briefing-knowledge-add-url"
                                    >
                                      Add
                                    </button>
                                  </div>
                                </div>

                                <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200/75 shadow-sm shadow-slate-900/[0.03]">
                                  <h3 className="text-xs font-semibold text-slate-800">Upload a file</h3>
                                  <p className="mt-0.5 text-[11px] text-slate-500">PDF, Word, or text — up to 20 MB.</p>
                                  <label className="mt-2 flex cursor-pointer flex-col items-start gap-1">
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                                      disabled={uploadBusy || !!noEvent}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = "";
                                        if (f) void uploadFile(f);
                                      }}
                                      className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2 file:py-0.5 file:font-medium file:text-indigo-800"
                                      data-testid="briefing-knowledge-file-input"
                                    />
                                    {uploadBusy ? <span className="text-[11px] text-slate-500">Uploading…</span> : null}
                                  </label>
                                </div>
                              </div>

                              {sortedSources.length > 0 ? (
                                <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70">
                                  <div className="border-b border-slate-100 bg-slate-50/90 px-3 py-2">
                                    <h3 className="text-xs font-semibold text-slate-800">Saved sources</h3>
                                    <p className="text-[10px] text-slate-500">Newest first.</p>
                                  </div>
                                  <ul className="divide-y divide-slate-100">
                                    {sortedSources.map((i) => (
                                      <li
                                        key={i.id}
                                        className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                            {sourceKindLabel(i.kind)}
                                          </span>
                                          {i.kind === "url" && i.url ? (
                                            <a
                                              href={i.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="mt-1 block break-all text-xs font-medium text-indigo-700 hover:underline"
                                            >
                                              {i.url}
                                            </a>
                                          ) : null}
                                          {i.kind === "file" ? (
                                            <p className="mt-1 text-xs font-medium text-slate-900">
                                              {i.file_name}
                                              {i.byte_size != null ? (
                                                <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                                                  ({Math.round(i.byte_size / 1024)} KB)
                                                </span>
                                              ) : null}
                                            </p>
                                          ) : null}
                                          {i.kind === "notes" ? (
                                            <div className="mt-1 text-xs text-slate-800">
                                              {i.notes_title ? (
                                                <p className="font-semibold text-slate-900">{i.notes_title}</p>
                                              ) : null}
                                              <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{i.notes_body}</p>
                                            </div>
                                          ) : null}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void removeItem(i.id)}
                                          className="shrink-0 self-start text-[11px] font-semibold text-rose-600 hover:underline sm:pt-0.5"
                                        >
                                          Remove
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : !loading && !error ? (
                                <p className="text-xs text-slate-500">No sources saved yet — add a link or file above.</p>
                              ) : null}
                            </div>
                          </details>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-slate-100 pt-3">
        <a
          href={`${EXHIBITOR_BRIEFINGS_PATH}#briefings-workspaces`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
          data-testid="setup-back-batches"
        >
          Jump to workspaces
        </a>
      </footer>
    </div>
  );
}
