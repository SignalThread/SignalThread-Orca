"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Code2, Eye, FileText, PencilLine, Sparkles, UserCheck, X } from "lucide-react";
import { listTaskAssignees, type TaskAssignableUser } from "@/components/tasks/task-api";
import {
  copyToHtml,
  emailSendApprovalBlocksSending,
  evaluateSendReadiness,
  marketingApi,
  type MarketingAudience,
  type MarketingAudienceDetail,
  type MarketingAudienceRecipient,
  type MarketingCampaign,
  type MarketingEmailPreview,
  type MarketingEmailSend,
} from "./marketing-shared";
import {
  MarketingSchedulePicker,
  schedulePartsFromIso,
  schedulePartsToIso,
} from "./marketing-schedule-picker";

type EmailSendFormProps = {
  eventId: string;
  campaigns: MarketingCampaign[];
  audiences: MarketingAudience[];
  send?: MarketingEmailSend | null;
  defaultCampaignId?: string;
  onClose: () => void;
  onSaved: (send: MarketingEmailSend) => Promise<void> | void;
};

type ContentMode = "template" | "ai" | "write" | "import";
type MergeTarget = "subject" | "summary" | "copy" | "html" | "text";

// UI-only starter copy. No schema, no persistence — selecting one simply fills
// the editable Basics + content fields below. Bodies are written as plain copy
// and converted to simple HTML on save (see copyToHtml).
type StarterTemplate = {
  id: string;
  label: string;
  blurb: string;
  subject: string;
  previewText: string;
  copy: string;
};

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "registration-launch",
    label: "Registration launch",
    blurb: "Announce that registration is open.",
    subject: "Registration is now open for {{eventName}}",
    previewText: "Save your spot — secure your place today.",
    copy: "Hi {{firstName}},\n\nRegistration for {{eventName}} is officially open! Join us for a day of sessions, networking, and ideas you can put to work right away.\n\nSpaces are limited, so reserve your spot early.\n\nRegister now using the link below. We can't wait to see you there.",
  },
  {
    id: "early-bird-reminder",
    label: "Early bird reminder",
    blurb: "Nudge before early-bird pricing ends.",
    subject: "Early-bird pricing ends soon for {{eventName}}",
    previewText: "Lock in the best rate before it's gone.",
    copy: "Hi {{firstName}},\n\nA quick reminder that early-bird pricing for {{eventName}} ends soon. Register before the deadline to save on your ticket.\n\nDon't miss out — rates go up once early-bird closes.\n\nReserve your spot at today's price using the link below.",
  },
  {
    id: "speaker-announcement",
    label: "Speaker announcement",
    blurb: "Reveal a headline speaker or session.",
    subject: "Just announced: a new speaker at {{eventName}}",
    previewText: "See who's joining the lineup.",
    copy: "Hi {{firstName}},\n\nWe're thrilled to announce a new addition to the {{eventName}} lineup. Expect practical insights and a session you won't want to miss.\n\nThe full agenda is coming together fast.\n\nReview the lineup and secure your spot using the link below.",
  },
  {
    id: "last-chance-reminder",
    label: "Last chance reminder",
    blurb: "Final push before the event or deadline.",
    subject: "Last chance to register for {{eventName}}",
    previewText: "Registration closes soon.",
    copy: "Hi {{firstName}},\n\nThis is your final reminder — registration for {{eventName}} closes soon. If you've been meaning to sign up, now is the time.\n\nWe'd hate for you to miss it.\n\nClaim your spot before registration closes using the link below.",
  },
  {
    id: "general-update",
    label: "General event update",
    blurb: "Share news, logistics, or a schedule change.",
    subject: "An update about {{eventName}}",
    previewText: "Here's the latest.",
    copy: "Hi {{firstName}},\n\nWe wanted to share a quick update about {{eventName}}. Here's the latest information to help you plan ahead.\n\nThanks for being part of it — more details to follow soon.\n\nFind everything you need using the link below.",
  },
];

const MERGE_FIELD_GROUPS = [
  {
    label: "Recipient",
    fields: [
      { label: "First name", token: "firstName" },
      { label: "Last name", token: "lastName" },
      { label: "Email", token: "email" },
      { label: "Company", token: "company" },
      { label: "Job title", token: "title" },
      { label: "Registration type", token: "registrationType" },
      { label: "Status", token: "status" },
    ],
  },
  {
    label: "Event",
    fields: [
      { label: "Event name", token: "eventName" },
      { label: "Event start date", token: "eventStartDate" },
      { label: "Event end date", token: "eventEndDate" },
    ],
  },
];

const PERSONALIZE_POPOVER_WIDTH = 320;
const PERSONALIZE_POPOVER_MAX_HEIGHT = 360;
const PERSONALIZE_POPOVER_PADDING = 16;
const PERSONALIZE_POPOVER_OFFSET = 8;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function appendCtaToHtml(html: string | null, buttonText: string, buttonUrl: string): string | null {
  const text = buttonText.trim();
  const url = buttonUrl.trim();
  if (!url) return html;
  const label = text || "Learn more";
  const cta = `<p><a href="${escapeAttribute(url)}">${escapeText(label)}</a></p>`;
  return html ? `${html}\n${cta}` : cta;
}

function appendCtaToText(text: string | null, buttonText: string, buttonUrl: string): string | null {
  const label = buttonText.trim();
  const url = buttonUrl.trim();
  if (!url) return text;
  const cta = label ? `${label}: ${url}` : url;
  return text ? `${text}\n\n${cta}` : cta;
}

function normalizeReplyToAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : trimmed;
}

function fieldDisplayName(recipient: Pick<MarketingAudienceRecipient, "firstName" | "lastName" | "email">): string {
  const name = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} (${recipient.email})` : recipient.email;
}

function assigneeLabel(user: TaskAssignableUser | null): string {
  if (!user) return "selected approver";
  return user.name?.trim() ? `${user.name} (${user.email})` : user.email;
}

export function EmailSendForm({
  eventId,
  campaigns,
  audiences,
  send,
  defaultCampaignId,
  onClose,
  onSaved,
}: EmailSendFormProps) {
  const isEdit = Boolean(send);
  const [campaignId, setCampaignId] = useState(send?.campaignId ?? defaultCampaignId ?? campaigns[0]?.id ?? "");
  const [audienceId, setAudienceId] = useState(send?.audienceId ?? "");
  const [subject, setSubject] = useState(send?.subject ?? "");
  const [previewText, setPreviewText] = useState(send?.previewText ?? "");

  // Content is edited as one of two shapes: planner copy (write/template) which
  // we convert to HTML on save, or pasted HTML (import) kept verbatim. We seed
  // the mode from whichever an existing send already has.
  const initialMode: ContentMode = !isEdit
    ? "write"
    : send?.bodyText
      ? "write"
      : send?.bodyHtml
        ? "import"
        : "write";
  const [contentMode, setContentMode] = useState<ContentMode>(initialMode);
  const [copyText, setCopyText] = useState(send?.bodyText ?? "");
  const [importHtml, setImportHtml] = useState(initialMode === "import" ? send?.bodyHtml ?? "" : "");
  const [importText, setImportText] = useState(initialMode === "import" ? send?.bodyText ?? "" : "");

  const [buttonText, setButtonText] = useState(send?.utmUrl ?? "");
  const [buttonUrl, setButtonUrl] = useState(send?.registrationUrl ?? "");
  const [fromEmail, setFromEmail] = useState(send?.fromEmail ?? "");
  const [replyTo, setReplyTo] = useState(send?.replyTo ?? "");
  const [senderOpen, setSenderOpen] = useState(false);
  const initialSchedule = schedulePartsFromIso(send?.scheduledSendAt);
  const [plannedSendDate, setPlannedSendDate] = useState(initialSchedule.date);
  const [plannedSendTime, setPlannedSendTime] = useState(initialSchedule.time);
  const [activeMergeTarget, setActiveMergeTarget] = useState<MergeTarget>("copy");
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [audienceDetail, setAudienceDetail] = useState<MarketingAudienceDetail | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [previewRecipientId, setPreviewRecipientId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<MarketingEmailPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [defaultsMissing, setDefaultsMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [isDecidingApproval, setIsDecidingApproval] = useState<"approve" | "changes" | "reject" | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<TaskAssignableUser[]>([]);
  const [approverUserId, setApproverUserId] = useState(send?.approval?.assigneeUserIds[0] ?? "");
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const timezoneLabel = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "browser timezone", []);

  const selectedAudience = useMemo(
    () => audiences.find((audience) => audience.id === audienceId) ?? null,
    [audiences, audienceId],
  );
  const approvalBlocksSending = send ? emailSendApprovalBlocksSending(send) : false;

  // The body values that will actually be submitted, derived from the active
  // content mode. Import keeps HTML verbatim; write/template convert copy.
  const composed = useMemo(() => {
    if (contentMode === "import") {
      return { bodyHtml: importHtml.trim() || null, bodyText: importText.trim() || null };
    }
    const copy = copyText.trim();
    return { bodyHtml: copy ? copyToHtml(copy) : null, bodyText: copy || null };
  }, [contentMode, importHtml, importText, copyText]);

  const composedWithCta = useMemo(
    () => ({
      bodyHtml: appendCtaToHtml(composed.bodyHtml, buttonText, buttonUrl),
      bodyText: appendCtaToText(composed.bodyText, buttonText, buttonUrl),
    }),
    [buttonText, buttonUrl, composed.bodyHtml, composed.bodyText],
  );

  const readiness = evaluateSendReadiness({
    hasAudience: Boolean(audienceId),
    recipientCount: selectedAudience?.recipientCount ?? 0,
    hasSubject: Boolean(subject.trim()),
    hasContent: Boolean(composedWithCta.bodyHtml || composedWithCta.bodyText),
    fromEmailProvided: Boolean(fromEmail.trim()),
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const defaults = await marketingApi.getEmailDefaults(eventId);
        if (!active) return;
        if (!isEdit) {
          setFromEmail((current) => current || defaults.fromEmail || "");
          setReplyTo((current) => current || defaults.replyTo || "");
        }
        setDefaultsMissing(!defaults.fromEmail);
      } catch {
        if (active) setDefaultsMissing(true);
      } finally {
        if (active) setDefaultsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [eventId, isEdit]);

  useEffect(() => {
    const controller = new AbortController();
    setAssigneesLoading(true);
    void (async () => {
      try {
        const users = await listTaskAssignees(eventId, controller.signal);
        setAssignableUsers(users);
        setApproverUserId((current) => current || send?.approval?.assigneeUserIds[0] || users[0]?.id || "");
      } catch {
        setAssignableUsers([]);
      } finally {
        setAssigneesLoading(false);
      }
    })();
    return () => controller.abort();
  }, [eventId, send?.approval?.assigneeUserIds]);

  useEffect(() => {
    let active = true;
    setAudienceDetail(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewRecipientId("");
    if (!audienceId) return () => {
      active = false;
    };
    setAudienceLoading(true);
    void (async () => {
      try {
        const detail = await marketingApi.getAudience(eventId, audienceId);
        if (!active) return;
        setAudienceDetail(detail);
        setPreviewRecipientId(detail.recipients[0]?.id ?? "");
      } catch {
        if (active) setPreviewError("Choose an audience with recipients to preview personalization.");
      } finally {
        if (active) setAudienceLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [audienceId, eventId]);

  function applyTemplate(template: StarterTemplate) {
    setSubject(template.subject);
    setPreviewText(template.previewText);
    setCopyText(template.copy);
    setContentMode("write");
  }

  function appendMergeField(setter: (value: string) => void, currentValue: string, field: string) {
    const token = `{{${field}}}`;
    const spacer = currentValue && !/\s$/.test(currentValue) ? " " : "";
    setter(`${currentValue}${spacer}${token}`);
  }

  function insertMergeField(field: string) {
    const target = activeMergeTarget ?? (contentMode === "import" ? "html" : "copy");
    if (target === "subject") appendMergeField(setSubject, subject, field);
    else if (target === "summary") appendMergeField(setPreviewText, previewText, field);
    else if (target === "html") appendMergeField(setImportHtml, importHtml, field);
    else if (target === "text") appendMergeField(setImportText, importText, field);
    else appendMergeField(setCopyText, copyText, field);
    setPersonalizeOpen(false);
  }

  async function handlePreview() {
    setPreviewOpen(true);
    setPreview(null);
    setPreviewError(null);
    if (!audienceId || !audienceDetail || audienceDetail.recipients.length === 0) {
      setPreviewError("Choose an audience with recipients to preview personalization.");
      return;
    }
    const recipientId = previewRecipientId || audienceDetail.recipients[0]?.id;
    if (!recipientId) {
      setPreviewError("Choose an audience with recipients to preview personalization.");
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await marketingApi.previewEmail(eventId, {
        audienceId,
        recipientId,
        subject,
        previewText,
        bodyHtml: composedWithCta.bodyHtml,
        bodyText: composedWithCta.bodyText,
      });
      setPreview(result);
      setPreviewRecipientId(result.recipient.id);
    } catch (previewErrorValue) {
      setPreviewError(
        previewErrorValue instanceof Error
          ? previewErrorValue.message
          : "Choose an audience with recipients to preview personalization.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  function validateDraft({ requireReady, requireScheduleTime }: { requireReady: boolean; requireScheduleTime: boolean }) {
    if (!campaignId) {
      setError("Choose a campaign.");
      return false;
    }
    if (!subject.trim()) {
      setError("Add a subject line.");
      return false;
    }
    if (!fromEmail.trim() && defaultsLoaded && defaultsMissing) {
      setError("Add a sender email in Sender settings. No workspace default sender is configured.");
      setSenderOpen(true);
      return false;
    }
    if (requireReady && !readiness.ready) {
      setError(`Complete readiness first: ${readiness.blockingReason}.`);
      return false;
    }
    if (requireScheduleTime && (!plannedSendDate || !plannedSendTime)) {
      setError("Choose a scheduled send date and time.");
      return false;
    }
    if (requireScheduleTime) {
      const scheduledAt = schedulePartsToIso(plannedSendDate, plannedSendTime);
      if (!scheduledAt) {
        setError("Choose a valid scheduled send date and time.");
        return false;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setError("Choose a scheduled send time in the future.");
        return false;
      }
    }
    return true;
  }

  async function persistDraft() {
    if (isEdit && send) {
      return await marketingApi.updateEmailSend(eventId, send.id, {
        audienceId: audienceId || null,
        subject: subject.trim(),
        previewText: previewText.trim() || null,
        bodyHtml: composedWithCta.bodyHtml,
        bodyText: composedWithCta.bodyText,
        fromEmail: fromEmail.trim() || undefined,
        replyTo: normalizeReplyToAddress(replyTo),
        registrationUrl: buttonUrl.trim() || null,
        utmUrl: buttonText.trim() || null,
        scheduledSendAt: schedulePartsToIso(plannedSendDate, plannedSendTime),
      });
    }
    return await marketingApi.createEmailSend(eventId, {
      campaignId,
      audienceId: audienceId || null,
      subject: subject.trim(),
      previewText: previewText.trim() || null,
      bodyHtml: composedWithCta.bodyHtml,
      bodyText: composedWithCta.bodyText,
      fromEmail: fromEmail.trim() || null,
      replyTo: normalizeReplyToAddress(replyTo),
      registrationUrl: buttonUrl.trim() || null,
      utmUrl: buttonText.trim() || null,
      scheduledSendAt: schedulePartsToIso(plannedSendDate, plannedSendTime),
    });
  }

  async function handleSave() {
    if (isSaving || isScheduling || isSubmittingApproval || isDecidingApproval) return;
    if (!validateDraft({ requireReady: !isEdit, requireScheduleTime: false })) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await persistDraft();
      if (isEdit) {
        await onSaved(saved);
      } else {
        const result = await marketingApi.sendNow(eventId, saved.id);
        await onSaved(result.send);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : isEdit ? "Failed to save email send." : "Failed to send email.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSchedule() {
    if (isSaving || isScheduling || isSubmittingApproval || isDecidingApproval) return;
    if (!validateDraft({ requireReady: true, requireScheduleTime: true })) return;
    const scheduledAt = schedulePartsToIso(plannedSendDate, plannedSendTime);
    if (!scheduledAt) {
      setError("Choose a valid scheduled send date and time.");
      return;
    }
    setIsScheduling(true);
    setError(null);
    try {
      const saved = await persistDraft();
      const scheduled = await marketingApi.scheduleEmailSend(eventId, saved.id, scheduledAt);
      await onSaved(scheduled);
      onClose();
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Failed to schedule email send.");
    } finally {
      setIsScheduling(false);
    }
  }

  async function handleSubmitForApproval() {
    if (isSaving || isScheduling || isSubmittingApproval || isDecidingApproval) return;
    if (!validateDraft({ requireReady: false, requireScheduleTime: false })) return;
    if (!approverUserId) {
      setError("Choose an approver before sending this email for approval.");
      return;
    }
    setIsSubmittingApproval(true);
    setError(null);
    try {
      const saved = await persistDraft();
      const submitted = await marketingApi.submitEmailSendForApproval(eventId, saved.id, approverUserId);
      await onSaved(submitted);
      onClose();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Failed to send email for approval.");
    } finally {
      setIsSubmittingApproval(false);
    }
  }

  async function handleApprovalDecision(action: "approve" | "changes" | "reject") {
    if (!send || isSaving || isScheduling || isSubmittingApproval || isDecidingApproval) return;
    const note =
      action === "approve"
        ? ""
        : window.prompt(action === "changes" ? "What changes are needed?" : "Why reject this email?", "") ?? "";
    if (action !== "approve" && !note.trim()) return;
    setIsDecidingApproval(action);
    setError(null);
    try {
      const saved = await persistDraft();
      const decided =
        action === "approve"
          ? await marketingApi.approveEmailSend(eventId, saved.id)
          : action === "changes"
            ? await marketingApi.requestEmailSendChanges(eventId, saved.id, note.trim())
            : await marketingApi.rejectEmailSend(eventId, saved.id, note.trim());
      await onSaved(decided);
      onClose();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Failed to update approval.");
    } finally {
      setIsDecidingApproval(null);
    }
  }

  const approvalAssigneeName = send?.approval?.assigneeUserIds[0]
    ? assigneeLabel(assignableUsers.find((user) => user.id === send.approval?.assigneeUserIds[0]) ?? null)
    : null;
  const approvalDeciderName = send?.approval?.decidedByUserId
    ? assigneeLabel(assignableUsers.find((user) => user.id === send.approval?.decidedByUserId) ?? null)
    : null;

  const inputClass =
    "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email send</p>
            <h2 className="text-[18px] font-semibold text-slate-900">{isEdit ? "Edit email send" : "New email send"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {/* ----------------------------------------------------------- Basics */}
          <Section title="Basics" description="Who this goes to and what they'll see in their inbox.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Campaign</span>
                <select
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                  disabled={isEdit}
                  className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}
                >
                  <option value="">— select —</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Audience</span>
                <select value={audienceId} onChange={(event) => setAudienceId(event.target.value)} className={inputClass}>
                  <option value="">— none (select before sending) —</option>
                  {audiences.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.name} ({audience.recipientCount})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                onFocus={() => setActiveMergeTarget("subject")}
                placeholder="What's this email about?"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700">Short summary</span>
              <input
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
                onFocus={() => setActiveMergeTarget("summary")}
                placeholder="A quick line people may see before opening the email"
                className={inputClass}
              />
              <span className="mt-1 block text-[12px] text-slate-400">
                Optional. Some inboxes show this under the subject.
              </span>
            </label>
          </Section>

          {/* ---------------------------------------------------------- Content */}
          <Section title="Content" description="Choose how you'd like to create this email.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ModeButton
                active={contentMode === "write"}
                icon={<PencilLine className="h-4 w-4" />}
                label="Write copy"
                onClick={() => setContentMode("write")}
              />
              <ModeButton
                active={contentMode === "template"}
                icon={<FileText className="h-4 w-4" />}
                label="Start from template"
                onClick={() => setContentMode("template")}
              />
              <ModeButton
                active={contentMode === "ai"}
                icon={<Sparkles className="h-4 w-4" />}
                label="Generate with AI"
                onClick={() => setContentMode("ai")}
              />
              <ModeButton
                active={contentMode === "import"}
                icon={<Code2 className="h-4 w-4" />}
                label="Import HTML"
                onClick={() => setContentMode("import")}
              />
            </div>

            {contentMode === "template" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTER_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-[#28439A]/30 hover:bg-[#28439A]/5"
                  >
                    <div className="text-[13px] font-semibold text-slate-900">{template.label}</div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{template.blurb}</div>
                  </button>
                ))}
                <p className="text-[12px] text-slate-400 sm:col-span-2">
                  Pick a starter to fill in the subject, short summary, and copy — everything stays fully editable before
                  you send.
                </p>
              </div>
            ) : null}

            {contentMode === "ai" ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center">
                <Sparkles className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-2 text-[13px] font-semibold text-slate-700">AI copy generation is coming soon</p>
                <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
                  When it&apos;s available, generated copy will land in the editor for you to review and edit — nothing
                  is ever sent automatically. For now, start from a template or write your own copy.
                </p>
                <button
                  type="button"
                  disabled
                  className="mt-3 inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-400"
                >
                  <Sparkles className="h-4 w-4" /> Generate with AI
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <p className="text-[12px] text-slate-500">
                Personalize with recipient or event details. Missing values send as blanks.
              </p>
              <div className="flex items-center gap-2">
                <PersonalizePicker
                  open={personalizeOpen}
                  onOpenChange={setPersonalizeOpen}
                  onSelect={insertMergeField}
                />
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewLoading || audienceLoading}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Eye className="h-4 w-4" /> {previewLoading ? "Previewing..." : "Preview as recipient"}
                </button>
              </div>
            </div>

            {contentMode === "write" ? (
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Email copy</span>
                <textarea
                  value={copyText}
                  onChange={(event) => setCopyText(event.target.value)}
                  onFocus={() => setActiveMergeTarget("copy")}
                  rows={9}
                  placeholder={"Write your message here.\n\nLeave a blank line between paragraphs."}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] leading-relaxed text-slate-800 outline-none focus:border-slate-300"
                />
                <span className="mt-1 block text-[12px] text-slate-400">
                  Just write — we&apos;ll format your paragraphs into a simple email layout. No HTML needed.
                </span>
              </label>
            ) : null}

            {contentMode === "import" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">Paste HTML</span>
                  <textarea
                    value={importHtml}
                    onChange={(event) => setImportHtml(event.target.value)}
                    onFocus={() => setActiveMergeTarget("html")}
                    rows={8}
                    placeholder="<html>…</html>"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-[13px] text-slate-800 outline-none focus:border-slate-300"
                  />
                  <span className="mt-1 block text-[12px] text-slate-400">
                    Use this if your email was designed outside Orca.
                  </span>
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">
                    Plain text fallback <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    onFocus={() => setActiveMergeTarget("text")}
                    rows={3}
                    placeholder="Shown to recipients whose email client can't render HTML."
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                  />
                </label>
              </div>
            ) : null}

            {previewOpen ? (
              <EmailPreviewPanel
                audienceDetail={audienceDetail}
                selectedRecipientId={previewRecipientId}
                preview={preview}
                error={previewError}
                loading={previewLoading}
                onRecipientChange={setPreviewRecipientId}
                onRefresh={handlePreview}
              />
            ) : null}
          </Section>

          {/* ------------------------------------------------------------ Links */}
          <Section title="Button or link" description="Add the main button or link for this email.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Button text</span>
                <input
                  value={buttonText}
                  onChange={(event) => setButtonText(event.target.value)}
                  placeholder="Register now"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Button URL</span>
                <input
                  value={buttonUrl}
                  onChange={(event) => setButtonUrl(event.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </label>
            </div>
          </Section>

          {/* -------------------------------------------------- Sender settings */}
          <div className="rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setSenderOpen((open) => !open)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span>
                <span className="block text-[13px] font-semibold text-slate-800">Sender settings</span>
                <span className="block text-[12px] text-slate-400">
                  Advanced — using {fromEmail.trim() ? fromEmail.trim() : "the workspace default sender"}.
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition ${senderOpen ? "rotate-180" : ""}`}
              />
            </button>
            {defaultsLoaded && defaultsMissing && !fromEmail.trim() ? (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">
                No workspace default sender is configured. Add a From email here before saving this send.
              </div>
            ) : null}
            {senderOpen ? (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-200 px-4 py-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">From email</span>
                  <input
                    value={fromEmail}
                    onChange={(event) => setFromEmail(event.target.value)}
                    placeholder="Uses workspace default when blank"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-slate-700">Reply-to</span>
                  <input
                    value={replyTo}
                    onChange={(event) => setReplyTo(event.target.value)}
                    placeholder="Where replies should go (optional)"
                    className={inputClass}
                  />
                </label>
              </div>
            ) : null}
          </div>

          {/* --------------------------------------------------------- Planning */}
          <Section title="Schedule" description="Choose the date and time this email should be sent by the scheduler.">
            <MarketingSchedulePicker
              date={plannedSendDate}
              time={plannedSendTime}
              onDateChange={setPlannedSendDate}
              onTimeChange={setPlannedSendTime}
              timezoneLabel={timezoneLabel}
            />
            <p className="text-[12px] text-slate-400">Scheduling freezes the current audience recipients.</p>
          </Section>

          {/* -------------------------------------------------------- Readiness */}
          <Section title="Review" description="What's needed before this send can go out.">
            <ul className="space-y-1.5">
              {readiness.checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2 text-[13px]">
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                      check.ok ? "bg-emerald-100 text-emerald-700" : "border border-slate-300 text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className={check.ok ? "text-slate-700" : "text-slate-500"}>{check.label}</span>
                  {check.hint ? <span className="text-[12px] text-slate-400">· {check.hint}</span> : null}
                </li>
              ))}
            </ul>
            <p className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[12px] text-slate-500">
              {readiness.ready
                ? "Ready to send now or schedule. Scheduling freezes the current audience recipients."
                : "You can save this as a draft now. Send and schedule actions become available once every item above is checked off."}
            </p>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="flex items-start gap-2">
                <UserCheck className="mt-0.5 h-4 w-4 text-[#28439A]" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-800">Approval</div>
                  {send?.approval?.state === "PENDING" ? (
                    <p className="mt-1 text-[12px] text-slate-500">
                      Pending approval from {approvalAssigneeName ?? "selected approver"}.
                    </p>
                  ) : send?.approval?.state === "APPROVED" ? (
                    <p className="mt-1 text-[12px] text-emerald-700">
                      Approved by {approvalDeciderName ?? "the approver"}.
                    </p>
                  ) : send?.approval?.state === "CHANGES_REQUESTED" ? (
                    <p className="mt-1 text-[12px] text-amber-700">
                      Changes requested. Save updates here, then send it for approval again or approve when ready.
                    </p>
                  ) : send?.approval?.state === "REJECTED" ? (
                    <p className="mt-1 text-[12px] text-rose-700">Approval rejected. This email send is cancelled.</p>
                  ) : (
                    <p className="mt-1 text-[12px] text-slate-500">
                      Send this draft to a reviewer before sending or scheduling.
                    </p>
                  )}
                </div>
              </div>
              <label className="mt-3 block">
                <span className="text-[12px] font-semibold text-slate-700">Approver</span>
                <select
                  value={approverUserId}
                  onChange={(event) => setApproverUserId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">{assigneesLoading ? "Loading approvers..." : "— choose approver —"}</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {assigneeLabel(user)}
                    </option>
                  ))}
                </select>
              </label>
              {send?.approval?.state === "PENDING" || send?.approval?.state === "CHANGES_REQUESTED" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApprovalDecision("approve")}
                    disabled={Boolean(isDecidingApproval) || isSaving || isScheduling || isSubmittingApproval}
                    className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isDecidingApproval === "approve" ? "Approving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprovalDecision("changes")}
                    disabled={Boolean(isDecidingApproval) || isSaving || isScheduling || isSubmittingApproval}
                    className="inline-flex h-8 items-center rounded-lg border border-amber-200 px-3 text-[12px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                  >
                    {isDecidingApproval === "changes" ? "Requesting..." : "Request changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprovalDecision("reject")}
                    disabled={Boolean(isDecidingApproval) || isSaving || isScheduling || isSubmittingApproval}
                    className="inline-flex h-8 items-center rounded-lg border border-rose-200 px-3 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    {isDecidingApproval === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              ) : null}
            </div>
          </Section>

          {error ? <div className="text-[13px] text-rose-600">{error}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmitForApproval}
            disabled={isSaving || isScheduling || isSubmittingApproval || Boolean(isDecidingApproval) || !approverUserId}
            className="inline-flex h-10 items-center rounded-lg border border-[#28439A]/25 px-4 text-[13px] font-semibold text-[#28439A] hover:bg-[#28439A]/5 disabled:opacity-60"
          >
            {isSubmittingApproval ? "Sending for approval…" : "Send for approval"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isScheduling || isSubmittingApproval || Boolean(isDecidingApproval)}
            className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
          >
            {isSaving ? (isEdit ? "Saving…" : "Sending…") : isEdit ? "Save changes" : "Send"}
          </button>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={
              isSaving ||
              isScheduling ||
              isSubmittingApproval ||
              Boolean(isDecidingApproval) ||
              approvalBlocksSending ||
              !readiness.ready ||
              !plannedSendDate ||
              !plannedSendTime
            }
            className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isScheduling ? "Scheduling…" : "Schedule send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonalizePicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (field: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePopoverPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableBelow = viewportHeight - rect.bottom - PERSONALIZE_POPOVER_PADDING - PERSONALIZE_POPOVER_OFFSET;
      const availableAbove = rect.top - PERSONALIZE_POPOVER_PADDING - PERSONALIZE_POPOVER_OFFSET;
      const showAbove = availableBelow < PERSONALIZE_POPOVER_MAX_HEIGHT && availableAbove > availableBelow;
      const maxHeight = Math.max(
        220,
        Math.min(PERSONALIZE_POPOVER_MAX_HEIGHT, showAbove ? availableAbove : availableBelow),
      );
      const unclampedLeft = rect.left;
      const maxLeft = Math.max(
        PERSONALIZE_POPOVER_PADDING,
        viewportWidth - PERSONALIZE_POPOVER_WIDTH - PERSONALIZE_POPOVER_PADDING,
      );
      const left = Math.min(Math.max(unclampedLeft, PERSONALIZE_POPOVER_PADDING), maxLeft);
      const top = showAbove
        ? Math.max(PERSONALIZE_POPOVER_PADDING, rect.top - maxHeight - PERSONALIZE_POPOVER_OFFSET)
        : Math.min(
            rect.bottom + PERSONALIZE_POPOVER_OFFSET,
            viewportHeight - maxHeight - PERSONALIZE_POPOVER_PADDING,
          );

      setPopoverStyle({ top, left, maxHeight });
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e]"
      >
        <Sparkles className="h-4 w-4" /> Personalize
      </button>
      {open && mounted && popoverStyle
        ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[70] w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{
            top: popoverStyle.top,
            left: popoverStyle.left,
            maxHeight: popoverStyle.maxHeight,
          }}
        >
          <div className="mb-2">
            <div className="text-[13px] font-semibold text-slate-900">Add personalization</div>
            <div className="text-[12px] text-slate-500">Choose a friendly field to insert into the active editor.</div>
          </div>
          <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
            {MERGE_FIELD_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {group.fields.map((field) => (
                    <button
                      key={field.token}
                      type="button"
                      onClick={() => onSelect(field.token)}
                      className="rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                    >
                      <span className="block text-[13px] font-semibold text-slate-800">{field.label}</span>
                      <span className="block text-[11px] text-slate-400">{`{{${field.token}}}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}

function EmailPreviewPanel({
  audienceDetail,
  selectedRecipientId,
  preview,
  error,
  loading,
  onRecipientChange,
  onRefresh,
}: {
  audienceDetail: MarketingAudienceDetail | null;
  selectedRecipientId: string;
  preview: MarketingEmailPreview | null;
  error: string | null;
  loading: boolean;
  onRecipientChange: (recipientId: string) => void;
  onRefresh: () => void;
}) {
  const recipients = audienceDetail?.recipients ?? [];
  const selectedRecipient = recipients.find((recipient) => recipient.id === selectedRecipientId) ?? recipients[0] ?? null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-slate-900">Preview as recipient</div>
          <div className="text-[12px] text-slate-500">
            {selectedRecipient ? fieldDisplayName(selectedRecipient) : "Choose an audience with recipients to preview personalization."}
          </div>
        </div>
        {recipients.length > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedRecipient?.id ?? ""}
              onChange={(event) => onRecipientChange(event.target.value)}
              className="h-9 max-w-[220px] rounded-lg border border-slate-200 px-2 text-[12px] text-slate-700 outline-none focus:border-slate-300"
            >
              {recipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {fieldDisplayName(recipient)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="px-4 py-5 text-[13px] text-slate-500">{error}</div>
      ) : preview ? (
        <div className="space-y-3 px-4 py-4">
          <PreviewField label="Subject" value={preview.rendered.subject || "Untitled email"} />
          <PreviewField label="Short summary" value={preview.rendered.previewText || "No short summary"} />
          <p className="text-[12px] text-slate-400">Preview includes the automatically appended unsubscribe footer.</p>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Message</div>
            {preview.rendered.bodyText ? (
              <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-[13px] leading-relaxed text-slate-700">
                {preview.rendered.bodyText}
              </pre>
            ) : preview.rendered.bodyHtml ? (
              <div
                className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: preview.rendered.bodyHtml }}
              />
            ) : (
              <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-400">
                No message copy yet.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-5 text-[13px] text-slate-500">
          {loading ? "Building preview..." : "Choose an audience with recipients to preview personalization."}
        </div>
      )}
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        <p className="text-[12px] text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-[12px] font-semibold transition ${
        active
          ? "border-[#28439A]/30 bg-[#28439A]/5 text-[#28439A]"
          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
