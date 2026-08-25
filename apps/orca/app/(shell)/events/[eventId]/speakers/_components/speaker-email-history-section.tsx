"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

type SpeakerEmailLogRecord = {
  id: string;
  kind: "INCOMPLETE_PROFILE" | "MISSING_DECK" | "MISSING_DOCUMENT";
  toEmail: string;
  subject: string;
  reason: string;
  status: "SENT" | "FAILED" | "SKIPPED_NO_PROVIDER";
  provider: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<SpeakerEmailLogRecord["status"], string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_NO_PROVIDER: "Not sent — no provider",
};

function statusClasses(status: SpeakerEmailLogRecord["status"]): string {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

type SpeakerEmailHistorySectionProps = {
  eventId: string;
  speakerId: string;
};

export function SpeakerEmailHistorySection({ eventId, speakerId }: SpeakerEmailHistorySectionProps) {
  const [logs, setLogs] = useState<SpeakerEmailLogRecord[]>([]);

  useEffect(() => {
    let isActive = true;

    async function loadLogs() {
      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/emails`);
        const payload = await response.json();
        if (!isActive) return;
        setLogs(response.ok && Array.isArray(payload) ? (payload as SpeakerEmailLogRecord[]) : []);
      } catch {
        if (!isActive) return;
        setLogs([]);
      }
    }

    void loadLogs();

    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-slate-500" />
        <h5 className="text-[16px] font-semibold text-slate-900">Email History</h5>
      </div>
      <p className="mt-1 text-[13px] text-slate-500">
        Reminders recorded for this speaker — what, when, to whom, and why.
      </p>

      {logs.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="rounded-xl border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{log.subject}</p>
                  <p className="text-[12px] text-slate-500">
                    To {log.toEmail} · {new Date(log.createdAt).toLocaleString()} · Why: {log.reason}
                  </p>
                  {log.error ? <p className="text-[12px] text-rose-600">{log.error}</p> : null}
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(log.status)}`}
                >
                  {STATUS_LABELS[log.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">No emails recorded for this speaker yet.</p>
      )}
    </section>
  );
}
