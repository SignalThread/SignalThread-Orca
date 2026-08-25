"use client";

import { type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  FileCheck,
  FileText,
  FolderOpen,
  History,
  Lock,
  MapPin,
  MessageSquare,
  Pencil,
  UserCircle,
} from "lucide-react";
import type { SpeakerConflict } from "@/lib/speaker-conflicts";
import type { SpeakerRecord } from "./speaker-profile-shared";

export type PortalLinkStatus = {
  tokenId: string;
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  revokedAt: string | null;
  isExpired: boolean;
  isActive: boolean;
};

export type SpeakerSubmissionSummary = {
  id: string;
  status: string;
  submittedAt: string;
  noteToPlanner: string | null;
};

export type SpeakerFileSummary = {
  id: string;
  filename: string;
  kind: string;
  reviewStatus: string;
  createdAt: string;
};

export type SpeakerMessageSummary = {
  id: string;
  senderType: "PLANNER" | "SPEAKER";
  body: string;
  createdAt: string;
};

export type SpeakerActivitySummary = {
  at: string;
  actorType: "PLANNER" | "SPEAKER" | "SYSTEM";
  action: string;
};

export type AssignedSessionSummary = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  roomName: string;
  sessionType: string;
  status: string;
  role: string;
};

export type OverviewData = {
  readinessFlags: string[];
  conflicts: SpeakerConflict[];
  portalStatus: PortalLinkStatus | null;
  pendingSubmission: SpeakerSubmissionSummary | null;
  files: SpeakerFileSummary[];
  messages: SpeakerMessageSummary[];
  activity: SpeakerActivitySummary[];
  assignedSessions: AssignedSessionSummary[];
};

export type SpeakerDetailSection =
  | "overview"
  | "profile"
  | "sessions"
  | "files"
  | "documents"
  | "communications"
  | "submissions"
  | "conflicts"
  | "activity"
  | "onsite"
  | "notes";

export type SpeakerFileReviewStatus = "RECEIVED" | "NEEDS_CHANGES" | "APPROVED" | "FINAL";

export type SpeakerFileRecord = {
  id: string;
  sessionId: string | null;
  kind: "SLIDES" | "AGREEMENT" | "OTHER";
  filename: string;
  fileSizeBytes: number;
  version: number;
  reviewStatus: SpeakerFileReviewStatus;
  reviewFeedback: string | null;
  uploadedViaPortal: boolean;
  createdAt: string;
};

export type SpeakerSubmissionRecord = {
  id: string;
  speakerId: string;
  status: string;
  name: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  phone: string | null;
  headshotUrl: string | null;
  avNeeds: string | null;
  travelNeeds: string | null;
  dietaryRestrictions: string | null;
  topics: string[];
  linkedinUrl: string | null;
  websiteUrl: string | null;
  noteToPlanner: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
};

export type SpeakerEmailLogRecord = {
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

export type SpeakerInternalNoteRecord = {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export const EMPTY_OVERVIEW: OverviewData = {
  readinessFlags: [],
  conflicts: [],
  portalStatus: null,
  pendingSubmission: null,
  files: [],
  messages: [],
  activity: [],
  assignedSessions: [],
};

export const COMPLETENESS_FIELD_COUNT = 4;

export const SUBNAV_ITEMS = [
  { key: "overview", label: "Overview", icon: UserCircle, count: null },
  { key: "profile", label: "Profile", icon: Pencil, count: null },
  { key: "sessions", label: "Sessions", icon: CalendarDays, count: "sessions" },
  { key: "files", label: "Files", icon: FolderOpen, count: "files" },
  { key: "documents", label: "Documents", icon: FileCheck, count: null },
  { key: "communications", label: "Communications", icon: MessageSquare, count: "messages" },
  { key: "submissions", label: "Submissions", icon: FileText, count: "submissions" },
  { key: "conflicts", label: "Conflicts", icon: AlertTriangle, count: "conflicts" },
  { key: "activity", label: "Activity", icon: History, count: "activity" },
  { key: "onsite", label: "Onsite", icon: MapPin, count: null },
  { key: "notes", label: "Notes", icon: Lock, count: null },
] as const satisfies Array<{
  key: SpeakerDetailSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count: "sessions" | "files" | "messages" | "submissions" | "conflicts" | "activity" | null;
}>;

export const SPEAKER_FILE_KINDS: Array<{ kind: SpeakerFileRecord["kind"]; label: string }> = [
  { kind: "SLIDES", label: "Slides" },
  { kind: "AGREEMENT", label: "Agreement" },
  { kind: "OTHER", label: "Other" },
];

export const SPEAKER_FILE_REVIEW_STATUSES: Array<{ status: SpeakerFileReviewStatus; label: string }> = [
  { status: "RECEIVED", label: "Received" },
  { status: "NEEDS_CHANGES", label: "Needs changes" },
  { status: "APPROVED", label: "Approved" },
  { status: "FINAL", label: "Final" },
];

export const FORM_INPUT_CLASS =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100";
export const FORM_TEXTAREA_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100";

export const SUBMISSION_PREVIEW_FIELDS: Array<{
  key: keyof SpeakerSubmissionRecord & keyof SpeakerRecord;
  label: string;
}> = [
  { key: "name", label: "Name" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "bio", label: "Bio" },
  { key: "phone", label: "Phone" },
  { key: "headshotUrl", label: "Headshot" },
  { key: "avNeeds", label: "AV Needs" },
  { key: "travelNeeds", label: "Travel Needs" },
  { key: "dietaryRestrictions", label: "Dietary" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "websiteUrl", label: "Website" },
];

export function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "SP";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function normalizeDateLike(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return "";
}

export function asPortalStatus(payload: unknown): PortalLinkStatus | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "status" in payload &&
    typeof payload.status === "object" &&
    payload.status !== null
  ) {
    return payload.status as PortalLinkStatus;
  }
  return null;
}

export function asPendingSubmission(payload: unknown): SpeakerSubmissionSummary | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "submission" in payload &&
    typeof payload.submission === "object" &&
    payload.submission !== null
  ) {
    const submission = payload.submission as Record<string, unknown>;
    return {
      id: typeof submission.id === "string" ? submission.id : "pending-submission",
      status: typeof submission.status === "string" ? submission.status : "PENDING",
      submittedAt: normalizeDateLike(submission.submittedAt),
      noteToPlanner: typeof submission.noteToPlanner === "string" ? submission.noteToPlanner : null,
    };
  }
  return null;
}

export function asFiles(payload: unknown): SpeakerFileSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((entry) => {
    const file = entry as Record<string, unknown>;
    return {
      id: typeof file.id === "string" ? file.id : `${file.filename ?? "file"}`,
      filename: typeof file.filename === "string" ? file.filename : "Untitled file",
      kind: typeof file.kind === "string" ? file.kind : "OTHER",
      reviewStatus: typeof file.reviewStatus === "string" ? file.reviewStatus : "RECEIVED",
      createdAt: normalizeDateLike(file.createdAt),
    };
  });
}

export function asMessages(payload: unknown): SpeakerMessageSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((entry) => {
    const message = entry as Record<string, unknown>;
    return {
      id: typeof message.id === "string" ? message.id : `${message.createdAt ?? "message"}`,
      senderType: message.senderType === "SPEAKER" ? "SPEAKER" : "PLANNER",
      body: typeof message.body === "string" ? message.body : "",
      createdAt: normalizeDateLike(message.createdAt),
    };
  });
}

export function asActivity(payload: unknown): SpeakerActivitySummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((entry) => {
    const activity = entry as Record<string, unknown>;
    const actorType = activity.actorType === "SPEAKER" || activity.actorType === "SYSTEM" ? activity.actorType : "PLANNER";
    return {
      at: normalizeDateLike(activity.at),
      actorType,
      action: typeof activity.action === "string" ? activity.action : "Speaker activity recorded",
    };
  });
}

export function profileLine(speaker: SpeakerRecord): string {
  return [speaker.title, speaker.company].filter(Boolean).join(" · ") || "No title/company on file";
}

export function navCount(itemCount: (typeof SUBNAV_ITEMS)[number]["count"], overview: OverviewData): number | null {
  if (itemCount === "sessions") return overview.assignedSessions.length;
  if (itemCount === "files") return overview.files.length;
  if (itemCount === "messages") return overview.messages.length;
  if (itemCount === "submissions") return overview.pendingSubmission ? 1 : 0;
  if (itemCount === "conflicts") return overview.conflicts.length;
  if (itemCount === "activity") return overview.activity.length;
  return null;
}

export function fileReviewStatusClasses(status: SpeakerFileReviewStatus): string {
  if (status === "APPROVED" || status === "FINAL") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "NEEDS_CHANGES") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export function emailStatusClasses(status: SpeakerEmailLogRecord["status"]): string {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function MetricCard({
  title,
  value,
  detail,
  icon,
  tone,
  onAction,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "green" | "amber" | "red" | "blue";
  onAction?: () => void;
}) {
  const toneClasses = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneClasses}`}>{icon}</span>
      </div>
      <p className="mt-3 truncate text-[19px] font-semibold leading-none text-slate-950">{value}</p>
      <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-500">{detail}</p>
    </>
  );

  if (onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        className="min-h-[116px] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/30 hover:shadow-[0_16px_34px_rgba(79,70,229,0.08)] focus:outline-none focus:ring-2 focus:ring-violet-100"
      >
        {content}
      </button>
    );
  }

  return <article className="min-h-[116px] rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">{content}</article>;
}

export function OverviewCard({
  id,
  title,
  children,
  actionLabel,
  onAction,
  compact = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.045)] ${compact ? "p-4" : "p-5"}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
        {actionLabel ? (
          onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-violet-50 hover:text-[#28439A] focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              {actionLabel}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4f46e5]">
              {actionLabel}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  body,
  action,
}: {
  title: string;
  eyebrow?: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div>
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p> : null}
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
        {body ? <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-500">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
      <p className="text-[13px] font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-slate-500">{body}</p>
    </div>
  );
}
