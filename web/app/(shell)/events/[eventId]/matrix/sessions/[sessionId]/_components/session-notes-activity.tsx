"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { SessionActivityPayload } from "@/lib/session-activity";

type Props = {
  eventId: string;
  sessionId: string;
  sessionTitle: string;
  notes: string;
  /** The last value persisted by the server, used to detect unsaved changes. */
  persistedNotes: string;
  onNotesChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  isSaving: boolean;
  saveError: string | null;
  sessionUpdatedAt: string;
};

function timestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

/**
 * Session Notes editor plus the session's real activity timeline.
 *
 * The timeline is read from canonical `EventActivity` rows scoped to this session. It states
 * what it covers and what it does not, so an empty list reads as "nothing recorded here" rather
 * than "nothing happened".
 */
export function SessionNotesActivity({
  eventId,
  sessionId,
  sessionTitle,
  notes,
  persistedNotes,
  onNotesChange,
  onSave,
  isSaving,
  saveError,
  sessionUpdatedAt,
}: Props) {
  const notesFieldId = useId();
  const notesHintId = useId();
  const [activity, setActivity] = useState<SessionActivityPayload | null>(null);
  const [activityState, setActivityState] = useState<"loading" | "loaded" | "error">("loading");

  const hasUnsavedChanges = notes !== persistedNotes;

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/activity`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load activity");
        return (await response.json()) as SessionActivityPayload;
      })
      .then((payload) => {
        setActivity(payload);
        setActivityState("loaded");
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setActivityState("error");
      });

    return () => controller.abort();
  }, [eventId, sessionId, sessionUpdatedAt]);

  // Guard against losing unsaved notes to a reload or tab close.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor={notesFieldId} className="text-[13px] font-semibold text-slate-900">
            Session Notes
          </label>
          {hasUnsavedChanges ? (
            <span className="text-[12px] font-semibold text-amber-700">Unsaved changes</span>
          ) : (
            <span className="text-[12px] text-slate-500">All changes saved</span>
          )}
        </div>
        <p id={notesHintId} className="mt-1 text-[12px] text-slate-500">
          Internal planning notes for {sessionTitle}. Visible to event members only. Information
          pulled from other systems is shown separately with its source, never blended in here.
        </p>
        <textarea
          id={notesFieldId}
          aria-describedby={notesHintId}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={8}
          placeholder="Add planning notes for this session — decisions made, vendor commitments, follow-ups, and anything the onsite team needs to know."
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={isSaving || !hasUnsavedChanges}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isSaving ? "Saving…" : "Save notes"}
          </button>
          {!hasUnsavedChanges && !isSaving ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Saved
            </span>
          ) : null}
          <span className="text-[12px] text-slate-500">
            {activity?.lastNotesUpdate
              ? `Notes last changed ${timestamp(activity.lastNotesUpdate.at)} by ${activity.lastNotesUpdate.byLabel}.`
              : `Session last updated ${timestamp(sessionUpdatedAt)}.`}
          </span>
        </div>

        {saveError ? (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800"
          >
            <AlertCircle className="h-4 w-4" aria-hidden />
            <span className="min-w-0 flex-1">{saveError}</span>
            <button type="button" onClick={() => void onSave()} className="font-semibold underline">
              Retry save
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-[13px] font-semibold text-slate-900">Session activity</h3>

        {activityState === "loading" ? (
          <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading activity…
          </p>
        ) : activityState === "error" ? (
          <p role="alert" className="mt-2 text-[12px] text-rose-800">
            Activity could not be loaded. This is a loading failure, not an empty history.
          </p>
        ) : activity && activity.entries.length > 0 ? (
          <>
            <ol className="mt-3 space-y-2" aria-label="Session activity timeline">
              {activity.entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{entry.message}</span>
                    <span className="text-slate-500">{timestamp(entry.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-slate-600">
                    {entry.actorLabel}
                    {entry.module ? ` · ${entry.module.replaceAll("_", " ")}` : ""}
                    {entry.action ? ` · ${entry.action.replaceAll("_", " ").toLowerCase()}` : ""}
                  </p>
                  {entry.changes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-slate-600">
                      {entry.changes.map((change) => (
                        <li key={`${entry.id}-${change.field}`}>
                          {change.label}: {change.from ?? "not set"} → {change.to ?? "not set"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
            {activity.truncated ? (
              <p className="mt-2 text-[12px] text-slate-500">
                Showing the most recent {activity.entries.length} entries.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-[12px] text-slate-600">
            No changes have been recorded against this session yet.
          </p>
        )}

        {activity ? (
          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-slate-800">
              What this timeline covers
            </summary>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-700">
              {activity.coverage.includes.map((item) => (
                <li key={item}>Included: {item}</li>
              ))}
              {activity.coverage.excludes.map((item) => (
                <li key={item}>Not included: {item}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
