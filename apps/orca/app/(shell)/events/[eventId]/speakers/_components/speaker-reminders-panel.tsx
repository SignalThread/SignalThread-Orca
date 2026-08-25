"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";

type ReminderKind = "INCOMPLETE_PROFILE" | "MISSING_DECK" | "MISSING_DOCUMENT";

type ReminderCandidate = {
  speakerId: string;
  name: string;
  email: string | null;
  reasons: string[];
};

type ReminderSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  skippedNoProvider: number;
  skippedNoEmail: number;
};

const REMINDER_RULES: Array<{ kind: ReminderKind; label: string; description: string }> = [
  {
    kind: "INCOMPLETE_PROFILE",
    label: "Incomplete profile",
    description: "Missing bio, headshot, or title/company",
  },
  { kind: "MISSING_DECK", label: "Missing deck", description: "No presentation uploaded yet" },
  {
    kind: "MISSING_DOCUMENT",
    label: "Missing required document",
    description: "Assigned documents not yet submitted",
  },
];

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

type SpeakerRemindersPanelProps = {
  eventId: string;
  variant?: "card" | "compact" | "inline";
};

export function SpeakerRemindersPanel({ eventId, variant = "card" }: SpeakerRemindersPanelProps) {
  const [activeKind, setActiveKind] = useState<ReminderKind>("INCOMPLETE_PROFILE");
  const [candidates, setCandidates] = useState<ReminderCandidate[] | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePreview(kind: ReminderKind) {
    setActiveKind(kind);
    setIsPreviewing(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/speaker-reminders?kind=${encodeURIComponent(kind)}`,
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to preview reminders"));
      }
      setCandidates((payload as { candidates: ReminderCandidate[] }).candidates);
    } catch (error) {
      setCandidates(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to preview reminders");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSend() {
    if (!candidates || candidates.length === 0) return;

    setIsSending(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speaker-reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: activeKind }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to send reminders"));
      }

      const result = payload as ReminderSendResult;
      const parts = [`${result.attempted} selected`];
      if (result.sent > 0) parts.push(`${result.sent} sent`);
      if (result.skippedNoProvider > 0) {
        parts.push(`${result.skippedNoProvider} logged (no email provider configured — not delivered)`);
      }
      if (result.skippedNoEmail > 0) parts.push(`${result.skippedNoEmail} skipped (no email on file)`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      setNotice(`Reminders recorded: ${parts.join(", ")}.`);
      setCandidates(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send reminders");
    } finally {
      setIsSending(false);
    }
  }

  const isCompact = variant === "compact" || variant === "inline";
  const isInline = variant === "inline";

  return (
    <div
      className={
        isInline
          ? "min-w-0"
          : isCompact
            ? "rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            : "rounded-2xl border border-slate-200 bg-white p-4"
      }
      aria-label="Speaker reminders"
    >
      <div className={isCompact ? "flex flex-wrap items-center justify-between gap-2" : "flex flex-wrap items-start justify-between gap-3"}>
        <div className={isCompact ? "flex min-w-[180px] items-center gap-2" : "flex items-start gap-2"}>
          <BellRing className="h-4 w-4 text-slate-500" />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Reminders</p>
            <p className={isCompact ? "mt-0.5 text-[12px] text-slate-500" : "mt-1 text-[13px] text-slate-600"}>
              Preview recipients first. Nothing is sent without preview + confirm.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {REMINDER_RULES.map((rule) => (
            <button
              key={rule.kind}
              type="button"
              onClick={() => void handlePreview(rule.kind)}
              disabled={isPreviewing}
              title={rule.description}
              className={`inline-flex ${isCompact ? "h-8" : "h-9"} items-center rounded-lg border px-3 text-[12px] font-semibold disabled:opacity-60 ${
                activeKind === rule.kind && candidates !== null
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {rule.label}
            </button>
          ))}
        </div>
      </div>

      {notice ? <p className="mt-3 text-[13px] text-emerald-700">{notice}</p> : null}
      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}

      {candidates !== null ? (
        candidates.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-slate-700">Preview recipients</p>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending}
                className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {isSending ? "Recording..." : `Confirm send to ${candidates.length}`}
              </button>
            </div>
            <ul className="mt-3 space-y-1.5">
              {candidates.map((candidate) => (
                <li
                  key={candidate.speakerId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{candidate.name}</p>
                    <p className="text-[12px] text-slate-500">{candidate.reasons.join(" · ")}</p>
                  </div>
                  <span className="text-[12px] text-slate-500">
                    {candidate.email ?? "No email on file — will be skipped"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">
            No speakers match this rule — everyone is up to date.
          </p>
        )
      ) : null}
    </div>
  );
}
