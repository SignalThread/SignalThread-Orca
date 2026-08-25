"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Eye, Lock, MessageSquare } from "lucide-react";

type SpeakerMessageRecord = {
  id: string;
  senderType: "PLANNER" | "SPEAKER";
  senderName: string | null;
  body: string;
  createdAt: string;
};

type SpeakerInternalNoteRecord = {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

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

type SpeakerCommsSectionProps = {
  eventId: string;
  speakerId: string;
  embeddedInForm?: boolean;
};

export function SpeakerCommsSection({ eventId, speakerId, embeddedInForm = false }: SpeakerCommsSectionProps) {
  const [messages, setMessages] = useState<SpeakerMessageRecord[]>([]);
  const [notes, setNotes] = useState<SpeakerInternalNoteRecord[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadComms() {
      try {
        const [messagesResponse, notesResponse] = await Promise.all([
          fetch(`/api/events/${eventId}/speakers/${speakerId}/messages`),
          fetch(`/api/events/${eventId}/speakers/${speakerId}/notes`),
        ]);
        const messagesPayload = await messagesResponse.json();
        const notesPayload = await notesResponse.json();
        if (!isActive) return;

        setMessages(
          messagesResponse.ok && Array.isArray(messagesPayload)
            ? (messagesPayload as SpeakerMessageRecord[])
            : [],
        );
        setNotes(
          notesResponse.ok && Array.isArray(notesPayload)
            ? (notesPayload as SpeakerInternalNoteRecord[])
            : [],
        );
      } catch {
        if (!isActive) return;
        setMessages([]);
        setNotes([]);
      }
    }

    void loadComms();

    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  async function sendMessage() {
    if (!messageDraft.trim()) return;

    setIsSendingMessage(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageDraft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to send message"));
      }

      setMessages((current) => [...current, payload as SpeakerMessageRecord]);
      setMessageDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSendingMessage(false);
    }
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  async function saveNote() {
    if (!noteDraft.trim()) return;

    setIsSavingNote(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteDraft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to add note"));
      }

      setNotes((current) => [payload as SpeakerInternalNoteRecord, ...current]);
      setNoteDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add note");
    } finally {
      setIsSavingNote(false);
    }
  }

  function handleSaveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveNote();
  }

  const messageComposer = (
    <>
      <textarea
        value={messageDraft}
        onChange={(event) => setMessageDraft(event.target.value)}
        rows={2}
        placeholder="Message the speaker (they will see this in their portal)..."
        className="w-full rounded-lg border border-blue-100 px-3 py-2 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
        aria-label="Message to speaker"
      />
      <button
        type={embeddedInForm ? "button" : "submit"}
        onClick={embeddedInForm ? () => void sendMessage() : undefined}
        disabled={isSendingMessage || !messageDraft.trim()}
        className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[#28439A] px-4 text-[12px] font-semibold text-white hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
      >
        {isSendingMessage ? "Sending..." : "Send"}
      </button>
    </>
  );

  const noteComposer = (
    <>
      <textarea
        value={noteDraft}
        onChange={(event) => setNoteDraft(event.target.value)}
        rows={2}
        placeholder="Add an internal note (speaker never sees this)..."
        className="w-full rounded-lg border border-amber-200 px-3 py-2 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
        aria-label="Internal note"
      />
      <button
        type={embeddedInForm ? "button" : "submit"}
        onClick={embeddedInForm ? () => void saveNote() : undefined}
        disabled={isSavingNote || !noteDraft.trim()}
        className="inline-flex h-9 shrink-0 items-center rounded-lg border border-amber-300 bg-white px-4 text-[12px] font-semibold text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
      >
        {isSavingNote ? "Saving..." : "Add Note"}
      </button>
    </>
  );

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-white p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <h5 className="text-[16px] font-semibold text-slate-900">Messages</h5>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
            <Eye className="h-3 w-3" />
            Visible to speaker
          </span>
        </div>

        {messages.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`max-w-[85%] rounded-lg border px-3 py-2 ${
                  message.senderType === "PLANNER"
                    ? "ml-auto border-blue-200 bg-blue-50 text-slate-800"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
              >
                <p className="text-[11px] font-semibold opacity-70">
                  {message.senderType === "PLANNER"
                    ? message.senderName ?? "Event team"
                    : "Speaker"}{" "}
                  · {new Date(message.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{message.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">No messages with this speaker yet.</p>
        )}

        {embeddedInForm ? (
          <div className="mt-3 flex items-end gap-2">{messageComposer}</div>
        ) : (
          <form onSubmit={handleSendMessage} className="mt-3 flex items-end gap-2">{messageComposer}</form>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-700" />
          <h5 className="text-[16px] font-semibold text-slate-900">Internal Notes</h5>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
            <Lock className="h-3 w-3" />
            Internal only — never shown to speaker
          </span>
        </div>

        {notes.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-amber-200/60 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">
                  {note.authorName ?? "Team member"} · {new Date(note.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-800">{note.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">No internal notes yet.</p>
        )}

        {embeddedInForm ? (
          <div className="mt-3 flex items-end gap-2">{noteComposer}</div>
        ) : (
          <form onSubmit={handleSaveNote} className="mt-3 flex items-end gap-2">{noteComposer}</form>
        )}
      </div>

      {errorMessage ? <p className="text-[13px] text-rose-600">{errorMessage}</p> : null}
    </section>
  );
}
