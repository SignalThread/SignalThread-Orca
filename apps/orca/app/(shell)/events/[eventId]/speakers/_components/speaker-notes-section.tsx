"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import {
  EmptyState,
  formatDateTime,
  FORM_TEXTAREA_CLASS,
  OverviewCard,
  SectionHeader,
  toErrorMessage,
  type SpeakerInternalNoteRecord,
} from "./speaker-detail-shared";
import type { SpeakerRecord } from "./speaker-profile-shared";

export function SpeakerNotesSection({
  eventId,
  speaker,
  onOpenProfile,
}: {
  eventId: string;
  speaker: SpeakerRecord;
  onOpenProfile: () => void;
}) {
  const [notes, setNotes] = useState<SpeakerInternalNoteRecord[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    async function loadNotes() {
      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speaker.id}/notes`);
        const payload = await response.json();
        if (!isActive) return;
        setNotes(response.ok && Array.isArray(payload) ? (payload as SpeakerInternalNoteRecord[]) : []);
      } catch {
        if (isActive) setNotes([]);
      }
    }
    void loadNotes();
    return () => {
      isActive = false;
    };
  }, [eventId, speaker.id]);

  async function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    setIsSavingNote(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speaker.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteDraft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to add note"));
      setNotes((current) => [payload as SpeakerInternalNoteRecord, ...current]);
      setNoteDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add note");
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <OverviewCard id="notes-section" title="Internal Notes">
      <SectionHeader
        eyebrow="Internal only"
        title="Planner notes"
        body="These notes are never speaker-facing. Speaker-visible messages belong in Communications."
        action={
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
            <Lock className="h-3 w-3" />
            Internal only
          </span>
        }
      />
      {speaker.notes ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-[12px] font-semibold text-amber-900">Profile note</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-700">{speaker.notes}</p>
          <button type="button" onClick={onOpenProfile} className="mt-2 rounded-md px-1 py-0.5 text-[12px] font-semibold text-[#4f46e5] hover:bg-violet-50 hover:text-[#28439A] focus:outline-none focus:ring-2 focus:ring-violet-100">
            Edit profile note
          </button>
        </div>
      ) : null}

      <form onSubmit={(event) => void handleSaveNote(event)} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={3} placeholder="Add an internal note..." className={FORM_TEXTAREA_CLASS} />
        <button type="submit" disabled={isSavingNote || !noteDraft.trim()} className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-[12px] font-semibold text-amber-800 shadow-sm hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-60">
          {isSavingNote ? "Saving..." : "Add Note"}
        </button>
      </form>
      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}

      {notes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-amber-200/70 bg-amber-50/30 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">{note.authorName ?? "Team member"} · {formatDateTime(note.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-800">{note.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState title="No internal notes" body="Add planner-only context here without exposing it to the speaker portal." />
        </div>
      )}
    </OverviewCard>
  );
}
