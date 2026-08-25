"use client";

import { type FormEvent, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";

type PortalMessage = {
  id: string;
  senderType: "PLANNER" | "SPEAKER";
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

type SpeakerPortalMessagesProps = {
  token: string;
};

export function SpeakerPortalMessages({ token }: SpeakerPortalMessagesProps) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadMessages() {
      try {
        const response = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/messages`);
        const payload = await response.json();
        if (!isActive) return;
        setMessages(response.ok && Array.isArray(payload) ? (payload as PortalMessage[]) : []);
      } catch {
        if (!isActive) return;
        setMessages([]);
      }
    }

    void loadMessages();

    return () => {
      isActive = false;
    };
  }, [token]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to send message"));
      }

      setMessages((current) => [...current, payload as PortalMessage]);
      setDraft("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-slate-500" />
        <h2 className="text-[16px] font-semibold text-slate-900">Message the event team</h2>
      </div>
      <p className="mt-1 text-[13px] text-slate-500">
        Questions for the event team? Send a message — replies show up here.
      </p>

      {messages.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                message.senderType === "SPEAKER"
                  ? "ml-auto bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              <p className="text-[11px] font-semibold opacity-70">
                {message.senderType === "SPEAKER" ? "You" : "Event team"} ·{" "}
                {new Date(message.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">{message.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
          <p className="text-[14px] font-semibold text-slate-900">No messages yet</p>
          <p className="mt-2 text-[13px] text-slate-500">
            Send a question or note to the event team. Their replies will appear here.
          </p>
        </div>
      )}

      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}

      <form onSubmit={(event) => void handleSend(event)} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder="Write a message to the event team..."
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-300"
          aria-label="Message to the event team"
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
}
