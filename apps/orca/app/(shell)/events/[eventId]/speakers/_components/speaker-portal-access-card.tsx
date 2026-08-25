"use client";

import Link from "next/link";
import { Copy, ExternalLink, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import type { SpeakerRecord } from "./speaker-profile-shared";
import { formatDateTime, type PortalLinkStatus } from "./speaker-detail-shared";

type SpeakerPortalAccessMode = "full" | "compact" | "summary";

type PortalAccessStatus = {
  label: "Active" | "Not sent" | "Pending" | "Expired" | "Revoked" | "Submitted";
  detail: string;
  tone: "green" | "amber" | "red" | "blue";
};

type SpeakerPortalAccessCardProps = {
  eventId: string;
  speakerId: string;
  speaker: Pick<SpeakerRecord, "intakeTokenSentAt" | "reminderSentAt">;
  status: PortalLinkStatus | null;
  generatedUrl?: string | null;
  mode?: SpeakerPortalAccessMode;
  isWorking?: boolean;
  error?: string | null;
  notice?: string | null;
  onGenerate?: () => void | Promise<void>;
  onCopy?: () => void | Promise<void>;
  onMarkReminderSent?: () => void | Promise<void>;
  onRevoke?: () => void | Promise<void>;
};

export function getPortalAccessStatus(
  status: PortalLinkStatus | null,
  speaker: SpeakerPortalAccessCardProps["speaker"],
): PortalAccessStatus {
  if (status?.submittedAt) {
    return {
      label: "Submitted",
      detail: `Submitted ${formatDateTime(status.submittedAt)}`,
      tone: "green",
    };
  }

  if (status?.revokedAt) {
    return {
      label: "Revoked",
      detail: `Revoked ${formatDateTime(status.revokedAt)}`,
      tone: "red",
    };
  }

  if (status?.isExpired) {
    return {
      label: "Expired",
      detail: `Expired ${formatDateTime(status.expiresAt)}`,
      tone: "amber",
    };
  }

  if (status?.isActive) {
    return {
      label: "Active",
      detail: `Expires ${formatDateTime(status.expiresAt)}`,
      tone: "green",
    };
  }

  if (speaker.intakeTokenSentAt) {
    return {
      label: "Pending",
      detail: `Last sent ${formatDateTime(speaker.intakeTokenSentAt)}`,
      tone: "blue",
    };
  }

  return {
    label: "Not sent",
    detail: "No secure portal link has been generated yet.",
    tone: "amber",
  };
}

function badgeClasses(tone: PortalAccessStatus["tone"]): string {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "red") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function secondaryButtonClasses(tone: "neutral" | "primary" | "danger" = "neutral"): string {
  if (tone === "primary") return "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100";
  if (tone === "danger") return "border-rose-200 bg-white text-rose-700 hover:bg-rose-50";
  return "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
}

export function SpeakerPortalAccessCard({
  eventId,
  speakerId,
  speaker,
  status,
  generatedUrl,
  mode = "full",
  isWorking = false,
  error,
  notice,
  onGenerate,
  onCopy,
  onMarkReminderSent,
  onRevoke,
}: SpeakerPortalAccessCardProps) {
  const access = getPortalAccessStatus(status, speaker);
  const isCompact = mode === "compact";
  const isSummary = mode === "summary";
  const showDirectActions = Boolean(onGenerate || onMarkReminderSent || onRevoke || onCopy);

  const shellClasses = isSummary
    ? "rounded-xl border border-slate-200 bg-slate-50/80 p-3"
    : `rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.045)] ${isCompact ? "p-4" : "p-5"}`;

  return (
    <section className={shellClasses}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Speaker Portal</p>
              <h3 className={`${isCompact || isSummary ? "text-[15px]" : "text-[17px]"} font-semibold tracking-[-0.01em] text-slate-950`}>
                Portal Access
              </h3>
            </div>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClasses(access.tone)}`}>
              {access.label}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] text-slate-600">
            {access.detail}
            {speaker.reminderSentAt ? ` Reminder last sent ${formatDateTime(speaker.reminderSentAt)}.` : ""}
          </p>
          {!isSummary ? (
            <p className="mt-1 text-[12px] text-slate-500">
              Portal submissions stay pending until a planner reviews and applies supported profile fields.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${eventId}/speakers/${speakerId}/preview`}
            target="_blank"
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition ${secondaryButtonClasses()}`}
          >
            Preview Portal
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {showDirectActions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {onGenerate ? (
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={isWorking}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold shadow-sm transition disabled:opacity-60 ${secondaryButtonClasses("primary")}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {isWorking ? "Working..." : status?.isActive ? "Regenerate Link" : "Generate Portal Link"}
            </button>
          ) : null}
          {status ? (
            <button
              type="button"
              onClick={() => void onMarkReminderSent?.()}
              disabled={isWorking || !onMarkReminderSent}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition disabled:opacity-60 ${secondaryButtonClasses()}`}
            >
              <Send className="h-3.5 w-3.5" />
              Mark Reminder Sent
            </button>
          ) : null}
          {status?.isActive && onRevoke ? (
            <button
              type="button"
              onClick={() => void onRevoke()}
              disabled={isWorking}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition disabled:opacity-60 ${secondaryButtonClasses("danger")}`}
            >
              <XCircle className="h-3.5 w-3.5" />
              Revoke Link
            </button>
          ) : null}
        </div>
      ) : null}

      {generatedUrl ? (
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
          <p className="text-[12px] font-semibold text-slate-800">Portal link, shown once</p>
          <p className="mt-1 break-all text-[13px] text-[#28439A]">{generatedUrl}</p>
          {onCopy ? (
            <button
              type="button"
              onClick={() => void onCopy()}
              className={`mt-3 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition ${secondaryButtonClasses()}`}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Link
            </button>
          ) : null}
        </div>
      ) : status?.isActive && !isSummary ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[12px] text-slate-600">
          Existing secure links are not re-displayed after generation. Regenerate a new link to copy and send it again.
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-rose-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-[13px] text-emerald-700">{notice}</p> : null}
    </section>
  );
}
