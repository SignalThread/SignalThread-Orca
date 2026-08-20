"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Loader2,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

export type SessionFnbSafetyAlertSummary = {
  severity: "BLOCKING" | "ATTENTION" | "CLEAR";
  count: number;
  title: string;
  reasonCodes: string[];
  dedupeKey: string;
};

type Requirement = {
  id: string;
  kind: "DIETARY" | "ALLERGEN" | "ACCESSIBILITY";
  code: string;
  customLabel: string | null;
  quantity: number | null;
  disposition: "REQUIRED" | "COMPLETE" | "AT_RISK" | "MISSING" | "NOT_NEEDED";
  dispositionReason: string | null;
  href: string;
};

type CompatibilityPair = {
  assignmentId: string;
  requirementId: string;
  itemName: string;
  stale: boolean;
  baseOutcome: string;
  outcome: string;
  reasonCodes: string[];
  explanations: string[];
  evidence: Array<{
    kind: string;
    code: string;
    customLabel: string | null;
    verificationStatus: string;
    evidenceSource: string | null;
  }>;
  modification: { description: string | null; verificationStatus: string | null; evidenceSource: string | null } | null;
  resolution: {
    id: string;
    modification: string | null;
    modificationStatus: string | null;
    evidenceSource: string | null;
    resolvedAt: string | null;
  } | null;
  href: string;
};

type Summary = {
  overall: "NO_REQUIREMENTS" | "NO_MENU" | "VERIFIED_MATCH" | "POSSIBLE_MATCH" | "STALE_VERIFICATION" | "CONFLICT" | "INSUFFICIENT_INFORMATION";
  alert: SessionFnbSafetyAlertSummary;
  requirements: Requirement[];
  assignments: Array<{
    assignmentId: string;
    itemName: string;
    stale: boolean;
    href: string;
    compatibility: { outcome: string; reasonCodes: string[] };
  }>;
  compatibilityPairs: CompatibilityPair[];
};

const summaryCopy = {
  NO_REQUIREMENTS: ["No structured requirements", "Add aggregate dietary, allergen, or accessibility needs when applicable."],
  NO_MENU: ["Requirements need menu coverage", "Assign a catalog item to evaluate coverage."],
  VERIFIED_MATCH: ["Verified operational coverage", "Assigned evidence and verified resolutions cover active requirements."],
  POSSIBLE_MATCH: ["Possible, not verified", "Review source evidence before relying on this selection."],
  STALE_VERIFICATION: ["Stale verification", "The source or assigned item changed; verify the current version before relying on it."],
  CONFLICT: ["Confirmed conflict", "Change the selection or document and verify an assignment-specific modification."],
  INSUFFICIENT_INFORMATION: ["Insufficient information", "Missing evidence is not treated as safe."],
} as const;

const CODES = {
  DIETARY: ["VEGETARIAN", "VEGAN", "GLUTEN_FREE", "DAIRY_FREE", "KOSHER", "HALAL", "CUSTOM"],
  ALLERGEN: ["MILK", "EGG", "FISH", "SHELLFISH", "TREE_NUT", "PEANUT", "WHEAT", "SOY", "SESAME", "CUSTOM"],
  ACCESSIBILITY: ["MOBILITY", "VISION", "HEARING", "SENSORY", "COMMUNICATION", "SERVICE_ANIMAL", "OTHER", "CUSTOM"],
} as const;

function messageFrom(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

function outcomeLabel(outcome: string) {
  return outcome.replaceAll("_", " ").toLowerCase();
}

function outcomeClass(outcome: string) {
  if (outcome === "VERIFIED_MATCH") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (outcome === "CONFLICT" || outcome === "INSUFFICIENT_INFORMATION") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function SessionFnbSafetySummary({
  eventId,
  sessionId,
  refreshKey,
  onSummaryChange,
}: {
  eventId: string;
  sessionId: string;
  refreshKey: string;
  onSummaryChange?: (alert: SessionFnbSafetyAlertSummary) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [kind, setKind] = useState<keyof typeof CODES>("DIETARY");
  const [code, setCode] = useState<string>(CODES.DIETARY[0]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/events/${eventId}/matrix-2/sessions/${sessionId}/fnb-safety?v=${encodeURIComponent(refreshKey)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to load safety summary"));
      const next = payload as Summary;
      setSummary(next);
      onSummaryChange?.(next.alert);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load safety summary");
    } finally {
      setLoading(false);
    }
  }, [eventId, onSummaryChange, refreshKey, sessionId]);

  useEffect(() => {
    void load();
    return () => setSummary(null);
  }, [load]);

  async function writeRequirement(payload: Record<string, unknown>, key: string) {
    setWorkingKey(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/fnb-safety`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(messageFrom(body, "Unable to save requirement"));
      setNotice("Aggregate requirement saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save requirement");
    } finally {
      setWorkingKey(null);
    }
  }

  async function addRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await writeRequirement(Object.fromEntries(form.entries()), "new-requirement");
    formElement.reset();
  }

  async function updateRequirement(event: FormEvent<HTMLFormElement>, requirement: Requirement) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await writeRequirement({
      ...Object.fromEntries(form.entries()),
      kind: requirement.kind,
      code: requirement.code,
      customLabel: requirement.customLabel,
      quantity: requirement.quantity,
    }, requirement.id);
  }

  async function resolve(event: FormEvent<HTMLFormElement>, pair: CompatibilityPair) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorkingKey(`pair-${pair.assignmentId}-${pair.requirementId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/fnb-safety`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "VERIFY_MODIFICATION",
          assignmentId: pair.assignmentId,
          requirementId: pair.requirementId,
          modification: form.get("modification"),
          evidenceSource: form.get("evidenceSource"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to verify modification"));
      setNotice("Assignment-specific modification verified.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify modification");
    } finally {
      setWorkingKey(null);
    }
  }

  async function clearResolution(pair: CompatibilityPair) {
    const key = `pair-${pair.assignmentId}-${pair.requirementId}`;
    setWorkingKey(key);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/fnb-safety`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "CLEAR_RESOLUTION",
          assignmentId: pair.assignmentId,
          requirementId: pair.requirementId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to clear resolution"));
      setNotice("Resolution cleared for re-review.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to clear resolution");
    } finally {
      setWorkingKey(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-label="Loading menu safety" />Loading menu safety…</div>;
  }
  if (error && !summary) {
    return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button></div>;
  }
  if (!summary) return null;

  const [title, description] = summaryCopy[summary.overall];
  const Icon = summary.alert.severity === "CLEAR" ? CheckCircle2 : summary.alert.severity === "BLOCKING" ? AlertTriangle : HelpCircle;
  const tone = summary.alert.severity === "BLOCKING"
    ? "border-rose-200 bg-rose-50 text-rose-950"
    : summary.alert.severity === "CLEAR"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <section className={`rounded-xl border p-3 ${tone}`} aria-label="Session dietary and accessibility safety">
      <div className="flex gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold">{summary.alert.title}</h3>
          <p className="text-xs">{title} · {description}</p>
          {summary.alert.count > 0 ? <p className="mt-1 text-[11px] font-semibold">{summary.alert.count} aggregate need{summary.alert.count === 1 ? " requires" : "s require"} action; duplicate assignment alerts are consolidated.</p> : null}
        </div>
      </div>

      {notice ? <p role="status" className="mt-3 rounded-lg border border-current/20 bg-white/70 px-3 py-2 text-xs">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-rose-800">{error}</p> : null}

      <div className="mt-3 space-y-2">
        {summary.requirements.map((requirement) => (
          <form key={requirement.id} onSubmit={(event) => void updateRequirement(event, requirement)} className="grid gap-2 rounded-lg border border-current/20 bg-white/70 p-2 sm:grid-cols-[minmax(150px,1fr)_150px_minmax(170px,1fr)_auto]">
            <div>
              <p className="text-xs font-semibold">{requirement.customLabel ?? outcomeLabel(requirement.code)}</p>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{requirement.kind}{requirement.quantity ? ` · qty ${requirement.quantity}` : ""}</p>
            </div>
            <select name="disposition" aria-label={`Disposition for ${requirement.customLabel ?? requirement.code}`} defaultValue={requirement.disposition} className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs">
              <option value="REQUIRED">Required</option>
              <option value="COMPLETE">Complete</option>
              <option value="AT_RISK">At risk</option>
              <option value="MISSING">Missing</option>
              <option value="NOT_NEEDED">Not needed</option>
            </select>
            <input name="dispositionReason" aria-label={`Disposition reason for ${requirement.customLabel ?? requirement.code}`} defaultValue={requirement.dispositionReason ?? ""} placeholder="Reason required for Not needed" className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs" />
            <button disabled={workingKey === requirement.id} className="h-9 rounded-lg border border-current/30 bg-white px-3 text-xs font-semibold disabled:opacity-50">{workingKey === requirement.id ? "Saving…" : "Update"}</button>
          </form>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {summary.compatibilityPairs.map((pair) => {
          const key = `pair-${pair.assignmentId}-${pair.requirementId}`;
          return (
            <article key={key} className="rounded-lg border border-current/20 bg-white/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">{pair.itemName}</p>
                  <p className="mt-0.5 text-[11px] opacity-75">Base evidence: {outcomeLabel(pair.baseOutcome)}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${outcomeClass(pair.outcome)}`}>{outcomeLabel(pair.outcome)}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {pair.explanations.map((explanation) => <li key={explanation} className="text-[11px] opacity-80">• {explanation}</li>)}
              </ul>
              {pair.evidence.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold">View source evidence</summary>
                  <div className="mt-2 space-y-1">
                    {pair.evidence.map((evidence, index) => (
                      <p key={`${evidence.kind}-${evidence.code}-${index}`} className="text-[11px]">
                        {evidence.kind} · {evidence.customLabel ?? evidence.code} · {outcomeLabel(evidence.verificationStatus)}
                        {evidence.evidenceSource ? ` · ${evidence.evidenceSource}` : ""}
                      </p>
                    ))}
                    <a href={pair.href} className="inline-flex items-center gap-1 text-[11px] font-semibold underline">Open catalog evidence <ChevronRight className="h-3 w-3" /></a>
                  </div>
                </details>
              ) : null}
              {pair.resolution ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                  <p className="flex items-center gap-1 text-[11px] font-semibold"><ShieldCheck className="h-3.5 w-3.5" />Verified assignment-specific modification</p>
                  <p className="mt-1 text-[11px]">{pair.resolution.modification}</p>
                  <p className="mt-1 text-[10px] opacity-75">Evidence: {pair.resolution.evidenceSource}</p>
                  <button type="button" disabled={workingKey === key} onClick={() => void clearResolution(pair)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold underline disabled:opacity-50"><Undo2 className="h-3 w-3" />Clear and re-review</button>
                </div>
              ) : pair.outcome !== "VERIFIED_MATCH" ? (
                <details className="mt-3 rounded-lg border border-current/20 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold">Resolve with a verified modification</summary>
                  <form onSubmit={(event) => void resolve(event, pair)} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input required name="modification" aria-label={`Verified modification for ${pair.itemName}`} placeholder="Exact assignment-specific modification" className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs" />
                    <input required name="evidenceSource" aria-label={`Modification evidence for ${pair.itemName}`} placeholder="Vendor/source evidence" className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs" />
                    <button disabled={workingKey === key} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2">{workingKey === key ? "Verifying…" : "Verify modification"}</button>
                  </form>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      <form onSubmit={addRequirement} className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_80px_minmax(150px,1fr)_auto]">
        <select
          name="kind"
          aria-label="Requirement kind"
          value={kind}
          onChange={(event) => {
            const nextKind = event.target.value as keyof typeof CODES;
            setKind(nextKind);
            setCode(CODES[nextKind][0]);
          }}
          className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs"
        >
          <option value="DIETARY">Dietary</option>
          <option value="ALLERGEN">Allergen</option>
          <option value="ACCESSIBILITY">Accessibility</option>
        </select>
        <select name="code" aria-label="Requirement code" value={code} onChange={(event) => setCode(event.target.value)} className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs">
          {CODES[kind].map((option) => <option key={option} value={option}>{outcomeLabel(option)}</option>)}
        </select>
        <input name="quantity" inputMode="numeric" aria-label="Quantity" placeholder="Qty" className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs" />
        <input name="customLabel" aria-label="Custom requirement label" disabled={code !== "CUSTOM"} required={code === "CUSTOM"} placeholder={code === "CUSTOM" ? "Custom aggregate need" : "Choose Custom to label"} className="h-9 rounded-lg border border-current/30 bg-white px-2 text-xs disabled:bg-slate-100" />
        <button disabled={workingKey === "new-requirement"} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white disabled:opacity-50">{workingKey === "new-requirement" ? "Adding…" : "Add need"}</button>
      </form>
      <p className="mt-2 text-[11px] opacity-75">Aggregate operational counts only. Do not enter attendee names, diagnoses, or person-level medical details.</p>
    </section>
  );
}
