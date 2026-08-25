"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import {
  asMessages,
  EmptyState,
  emailStatusClasses,
  formatDateTime,
  FORM_TEXTAREA_CLASS,
  OverviewCard,
  SectionHeader,
  toErrorMessage,
  type SpeakerEmailLogRecord,
  type SpeakerMessageSummary,
} from "./speaker-detail-shared";
import type { SpeakerRecord } from "./speaker-profile-shared";

export function SpeakerCommunicationsSection({
  eventId,
  speakerId,
  speaker,
}: {
  eventId: string;
  speakerId: string;
  speaker: SpeakerRecord;
}) {
  const [messages, setMessages] = useState<SpeakerMessageSummary[]>([]);
  const [emails, setEmails] = useState<SpeakerEmailLogRecord[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isMarkingReminder, setIsMarkingReminder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    async function loadComms() {
      try {
        const [messagesResponse, emailsResponse] = await Promise.all([
          fetch(`/api/events/${eventId}/speakers/${speakerId}/messages`),
          fetch(`/api/events/${eventId}/speakers/${speakerId}/emails`),
        ]);
        const messagesPayload = await messagesResponse.json();
        const emailsPayload = await emailsResponse.json();
        if (!isActive) return;
        setMessages(messagesResponse.ok ? asMessages(messagesPayload) : []);
        setEmails(emailsResponse.ok && Array.isArray(emailsPayload) ? (emailsPayload as SpeakerEmailLogRecord[]) : []);
      } catch {
        if (!isActive) return;
        setMessages([]);
        setEmails([]);
      }
    }
    void loadComms();
    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!messageDraft.trim()) return;

    setIsSendingMessage(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageDraft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to send message"));
      setMessages((current) => [...current, asMessages([payload])[0]!]);
      setMessageDraft("");
      setNotice("Message sent to speaker portal.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleMarkReminderSent() {
    setIsMarkingReminder(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/reminder`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to record reminder"));
      setNotice("Reminder recorded.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to record reminder");
    } finally {
      setIsMarkingReminder(false);
    }
  }

  return (
    <section className="space-y-4">
      <OverviewCard id="speaker-messages" title="Speaker-Visible Messages">
        <SectionHeader
          eyebrow="Communications"
          title="Messages"
          body="These messages are visible to the speaker in their portal. Internal-only context belongs in Notes."
          action={
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
              <Eye className="h-3 w-3" />
              Speaker visible
            </span>
          }
        />
        {messages.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {messages.map((message) => (
              <li key={message.id} className={`max-w-[88%] rounded-xl border px-3 py-2 shadow-sm ${message.senderType === "PLANNER" ? "ml-auto border-blue-200 bg-blue-50 text-slate-800" : "border-slate-200 bg-white text-slate-800"}`}>
                <p className="text-[11px] font-semibold opacity-70">
                  {message.senderType === "SPEAKER" ? "Speaker" : "Event team"} · {formatDateTime(message.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{message.body || "Message recorded"}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState title="No speaker-visible messages" body="Messages sent from here will appear in the speaker portal." />
          </div>
        )}

        <form onSubmit={(event) => void handleSendMessage(event)} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} rows={3} placeholder={`Message ${speaker.name}`} className={FORM_TEXTAREA_CLASS} />
          <button type="submit" disabled={isSendingMessage || !messageDraft.trim()} className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#28439A] px-4 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(40,67,154,0.18)] hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60">
            {isSendingMessage ? "Sending..." : "Send Message"}
          </button>
        </form>
        {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}
        {notice ? <p className="mt-3 text-[13px] text-emerald-700">{notice}</p> : null}
      </OverviewCard>

      <OverviewCard id="email-history" title="Reminders & Email History">
        <SectionHeader
          eyebrow="Email"
          title="Reminder history"
          body="Email logs and manual reminder records are listed separately from portal messages."
          action={
            <button type="button" onClick={() => void handleMarkReminderSent()} disabled={isMarkingReminder} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60">
              {isMarkingReminder ? "Recording..." : "Mark reminder sent"}
            </button>
          }
        />
        {emails.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {emails.map((email) => (
              <li key={email.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-950">{email.subject}</p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    To {email.toEmail} · {formatDateTime(email.createdAt)} · {email.reason}
                  </p>
                  {email.error ? <p className="mt-1 text-[12px] text-rose-600">{email.error}</p> : null}
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${emailStatusClasses(email.status)}`}>
                  {email.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState title="No email history" body="Reminder sends and recorded reminder nudges will appear here." />
          </div>
        )}
      </OverviewCard>
    </section>
  );
}
