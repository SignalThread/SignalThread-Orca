"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Mail,
  Megaphone,
  MousePointerClick,
  PencilLine,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  CAMPAIGN_STATUS_META,
  type EmailSendAction,
  type ImportRecipientsResult,
  type MarketingAudience,
  type MarketingCampaign,
  type MarketingEmailSend,
  type MarketingSuppression,
  type SendNowResult,
  SEND_STATUS_META,
  campaignChannelLabel,
  campaignSummary,
  emailPerformanceLines,
  emailSendApprovalBlocksSending,
  emailSendActions,
  emailSendDisplayLabel,
  evaluateSendReadiness,
  displayMarketingTemplateText,
  formatDate,
  formatDateTime,
  formatDateRange,
  marketingApi,
  recipientStatusLabel,
  suppressionReasonLabel,
  suppressionSourceLabel,
  suppressedRecipientCount,
} from "./marketing-shared";
import { AudienceImportModal } from "./audience-import-modal";
import { CampaignForm } from "./campaign-form";
import { EmailSendForm } from "./email-send-form";
import {
  MarketingSchedulePicker,
  schedulePartsFromIso,
  schedulePartsToIso,
} from "./marketing-schedule-picker";

type MarketingWorkspaceProps = {
  eventId: string;
  eventName?: string;
};

type TabKey = "overview" | "campaigns" | "calendar" | "performance" | "compliance";
type CalendarView = "month" | "agenda";
type PerformanceFilterKey = "sent-outcomes" | "recipients" | "delivery" | "activity" | "unsubscribed";
type SentOutcomeFilter = "all" | "sent" | "failed" | "partial";

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "performance", label: "Performance", icon: Send },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
];

type MarketingTone = "blue" | "emerald" | "amber" | "rose" | "violet";

type CalendarItem = {
  id: string;
  date: string;
  label: string;
  detail: string;
  kind: "campaign" | "send";
  calendarKind: "campaign-start" | "campaign-end" | "send-target" | "send-sent";
  tone: MarketingTone;
  state: "default" | "overdue" | "inProgress";
  onClick: () => void;
};

type CalendarDay = {
  date: Date;
  isoDate: string;
  inSelectedMonth: boolean;
};

const PERFORMANCE_FILTER_LABELS: Record<PerformanceFilterKey, string> = {
  "sent-outcomes": "Sent outcomes",
  recipients: "Recipients targeted",
  delivery: "Delivered / opened",
  activity: "Clicked / bounced",
  unsubscribed: "Unsubscribed",
};

const SENT_OUTCOME_FILTER_LABELS: Record<SentOutcomeFilter, string> = {
  all: "All outcomes",
  sent: "Sent",
  failed: "Failed",
  partial: "Partial",
};

type CalendarRangeSegment = {
  id: string;
  kind: "campaign-window";
  label: string;
  campaign: MarketingCampaign;
  tone: MarketingTone;
  lane: number;
  starts: boolean;
  ends: boolean;
  overdue: boolean;
  onClick: () => void;
};

type PerformanceTotals = {
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
};

const toneStyles: Record<MarketingTone, { card: string; icon: string; accent: string }> = {
  blue: {
    card: "border-blue-100 bg-blue-50/35",
    icon: "border-blue-200 bg-blue-100 text-blue-700",
    accent: "bg-blue-500",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50/35",
    icon: "border-emerald-200 bg-emerald-100 text-emerald-700",
    accent: "bg-emerald-500",
  },
  amber: {
    card: "border-amber-100 bg-amber-50/35",
    icon: "border-amber-200 bg-amber-100 text-amber-800",
    accent: "bg-amber-500",
  },
  rose: {
    card: "border-rose-100 bg-rose-50/40",
    icon: "border-rose-200 bg-rose-100 text-rose-700",
    accent: "bg-rose-500",
  },
  violet: {
    card: "border-violet-100 bg-violet-50/35",
    icon: "border-violet-200 bg-violet-100 text-violet-700",
    accent: "bg-violet-500",
  },
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CAMPAIGN_RANGE_TONES: MarketingTone[] = ["blue", "violet", "emerald", "amber"];

function parseMarketingDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toCalendarIso(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameDate(a: Date, b: Date): boolean {
  return toCalendarIso(a) === toCalendarIso(b);
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return day >= start.getTime() && day <= end.getTime();
}

function dayStamp(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function compareMarketingDateToDay(value: string, today: Date): -1 | 0 | 1 {
  const parsed = parseMarketingDate(value);
  if (!parsed) return 1;
  const diff = dayStamp(parsed) - dayStamp(today);
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

function isCampaignInProgress(campaign: MarketingCampaign, today: Date): boolean {
  if (campaign.status !== "ACTIVE" || !campaign.startDate) return false;
  if (compareMarketingDateToDay(campaign.startDate, today) > 0) return false;
  if (!campaign.endDate) return true;
  return compareMarketingDateToDay(campaign.endDate, today) >= 0;
}

function campaignStartItemState(campaign: MarketingCampaign, today: Date): CalendarItem["state"] {
  if (!campaign.startDate) return "default";
  if (isCampaignInProgress(campaign, today)) return "inProgress";
  if (campaign.status === "DRAFT" && compareMarketingDateToDay(campaign.startDate, today) < 0) return "overdue";
  return "default";
}

function campaignStartItemDetail(campaign: MarketingCampaign, today: Date): string {
  return campaignStartItemState(campaign, today) === "inProgress" ? "Campaign started" : "Campaign starts";
}

function campaignEndItemState(campaign: MarketingCampaign, today: Date): CalendarItem["state"] {
  if (!campaign.endDate) return "default";
  if (
    compareMarketingDateToDay(campaign.endDate, today) < 0 &&
    campaign.status !== "COMPLETED" &&
    campaign.status !== "ARCHIVED"
  ) {
    return "overdue";
  }
  return "default";
}

function buildMonthGrid(month: Date): CalendarDay[] {
  const firstOfMonth = startOfMonth(month);
  const start = new Date(firstOfMonth);
  start.setDate(1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      isoDate: toCalendarIso(date),
      inSelectedMonth: isSameMonth(date, firstOfMonth),
    };
  });
}

function getCalendarItemStyles(item: Pick<CalendarItem, "calendarKind" | "state">): string {
  if (item.state === "overdue") return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";
  if (item.state === "inProgress") return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  if (item.calendarKind === "send-sent") return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  if (item.calendarKind === "send-target") return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";
  if (item.calendarKind === "campaign-end") return "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100";
  return "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100";
}

function campaignRangeTone(index: number): MarketingTone {
  return CAMPAIGN_RANGE_TONES[index % CAMPAIGN_RANGE_TONES.length] ?? "blue";
}

function getRangeSegmentStyles(segment: Pick<CalendarRangeSegment, "starts" | "ends" | "overdue" | "tone">): string {
  const rounded =
    segment.starts && segment.ends
      ? "rounded-md"
      : segment.starts
        ? "rounded-l-md"
        : segment.ends
          ? "rounded-r-md"
          : "rounded-none";
  const connected =
    segment.starts && segment.ends
      ? ""
      : segment.starts
        ? "-mr-2 border-r-0 pr-3"
        : segment.ends
          ? "-ml-2 border-l-0 pl-3"
          : "-mx-2 border-x-0 px-3";
  const toneClass =
    segment.overdue
      ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
      : segment.tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
        : segment.tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : segment.tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";
  return `${rounded} ${connected} ${toneClass}`;
}

function StatusBadge({ label, className, dot }: { label: string; className: string; dot?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {label}
    </span>
  );
}

function emailSendStatusMeta(send: MarketingEmailSend): { label: string; className: string; dot?: boolean } {
  if (send.approval?.state === "PENDING") {
    return { label: "Pending approval", className: "border-amber-200 bg-amber-50 text-amber-800", dot: true };
  }
  if (send.approval?.state === "APPROVED") {
    return { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (send.approval?.state === "CHANGES_REQUESTED") {
    return { label: "Changes requested", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (send.approval?.state === "REJECTED") {
    return { label: "Rejected", className: "border-rose-200 bg-rose-50 text-rose-700" };
  }
  return SEND_STATUS_META[send.status];
}

function OwnerCell({ ownerUserId }: { ownerUserId: string | null }) {
  if (!ownerUserId) return <span className="text-[13px] text-rose-600">Unassigned</span>;
  return <span className="text-[13px] text-slate-700">Assigned</span>;
}

function ChannelBadge({ sendCount }: { sendCount: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#28439A]/20 bg-[#28439A]/10 px-2.5 py-1 text-[11px] font-semibold text-[#28439A]">
      <Mail className="h-3.5 w-3.5" />
      {campaignChannelLabel(sendCount)}
    </span>
  );
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function OperationalKpiCard({
  title,
  icon: Icon,
  tone,
  children,
  footer,
}: {
  title: string;
  icon: LucideIcon;
  tone: MarketingTone;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const styles = toneStyles[tone];
  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm ${styles.card}`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${styles.accent}`} />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}>
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="text-[14px] font-semibold text-slate-950">{title}</h2>
        </div>
        <div className="mt-4">{children}</div>
      </div>
      {footer ? <div className="border-t border-slate-100 px-4 py-3">{footer}</div> : null}
    </article>
  );
}

function KpiStat({ label, value, tone = "slate" }: { label: string; value: ReactNode; tone?: MarketingTone | "slate" }) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : tone === "blue"
            ? "text-[#28439A]"
            : tone === "violet"
              ? "text-violet-700"
              : "text-slate-950";
  return (
    <div className="min-w-0">
      <div className={`text-[20px] leading-6 font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1 text-[12px] leading-4 text-slate-500">{label}</div>
    </div>
  );
}

function KpiFooterButton({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone: MarketingTone }) {
  const textClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : tone === "violet"
            ? "text-violet-700"
            : "text-[#28439A]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${textClass}`}
    >
      {children}
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

function SendOutcomeFunnel({
  sent,
  delivered,
  opened,
  clicked,
}: {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}) {
  const items = [
    { label: "Sent", value: sent, icon: Send },
    { label: "Delivered", value: delivered, icon: Mail },
    { label: "Opened", value: opened, icon: Eye },
    { label: "Clicked", value: clicked, icon: MousePointerClick },
  ];
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={`px-2 py-2 text-center ${index === 0 ? "" : "border-l border-slate-200"}`}>
            <Icon className="mx-auto h-3.5 w-3.5 text-slate-500" />
            <div className="mt-1 text-[18px] leading-5 font-semibold tabular-nums text-slate-950">{item.value}</div>
            <div className="mt-1 truncate text-[10px] uppercase tracking-wide text-slate-500">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function IssueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className={`text-[14px] font-semibold tabular-nums ${value > 0 ? "text-rose-700" : "text-slate-400"}`}>
        {value}
      </div>
      <div className={`mt-0.5 text-[11px] ${value > 0 ? "text-rose-700" : "text-slate-500"}`}>{label}</div>
    </div>
  );
}

function SectionChrome({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#28439A]/15 bg-[#28439A]/10 text-[#28439A]">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-slate-950">{title}</h2>
            {description ? <p className="mt-0.5 text-[12px] text-slate-500">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MarketingOverviewCard({
  title,
  description,
  icon: Icon,
  footer,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[360px]">
      <div className="flex min-h-[78px] items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#28439A]/15 bg-[#28439A]/10 text-[#28439A]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer ? (
        <div className="border-t border-slate-100 px-4 py-3 text-[12px] text-slate-500">{footer}</div>
      ) : null}
    </section>
  );
}

export function MarketingWorkspace({ eventId, eventName }: MarketingWorkspaceProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>("overview");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [audiences, setAudiences] = useState<MarketingAudience[]>([]);
  const [sends, setSends] = useState<MarketingEmailSend[]>([]);
  const [suppressions, setSuppressions] = useState<MarketingSuppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [trackingConfigured, setTrackingConfigured] = useState(false);

  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [defaultCampaignAudienceLabel, setDefaultCampaignAudienceLabel] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [editingSend, setEditingSend] = useState<MarketingEmailSend | null>(null);
  const [defaultSendCampaignId, setDefaultSendCampaignId] = useState<string | null>(null);
  const [pendingSend, setPendingSend] = useState<MarketingEmailSend | null>(null);
  const [scheduleDialog, setScheduleDialog] = useState<{
    send: MarketingEmailSend;
    mode: "schedule" | "reschedule";
  } | null>(null);
  const [viewingSend, setViewingSend] = useState<MarketingEmailSend | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [resubscribingId, setResubscribingId] = useState<string | null>(null);
  const [openedDeepLinkSendId, setOpenedDeepLinkSendId] = useState<string | null>(null);
  const [openedDeepLinkCampaignAudienceId, setOpenedDeepLinkCampaignAudienceId] = useState<string | null>(null);
  const [performanceCampaignId, setPerformanceCampaignId] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const [campaignList, audienceList, sendList, suppressionList, defaults] = await Promise.all([
      marketingApi.listCampaigns(eventId),
      marketingApi.listAudiences(eventId),
      marketingApi.listEmailSends(eventId),
      marketingApi.listSuppressions(eventId),
      marketingApi.getEmailDefaults(eventId),
    ]);
    setCampaigns(campaignList);
    setAudiences(audienceList);
    setSends(sendList);
    setSuppressions(suppressionList);
    setTrackingConfigured(defaults.trackingConfigured);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        await refreshAll();
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Failed to load marketing data.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshAll]);

  useEffect(() => {
    const emailSendId = searchParams.get("emailSendId");
    if (!emailSendId || openedDeepLinkSendId === emailSendId || sends.length === 0) return;
    const send = sends.find((candidate) => candidate.id === emailSendId);
    if (!send) return;
    setEditingSend(send);
    setDefaultSendCampaignId(null);
    setShowSendForm(true);
    setOpenedDeepLinkSendId(emailSendId);
  }, [openedDeepLinkSendId, searchParams, sends]);

  useEffect(() => {
    const audienceId = searchParams.get("audienceId");
    if (audienceId) setTab("campaigns");

    const campaignAudienceId = searchParams.get("createCampaignFromAudience");
    if (!campaignAudienceId || openedDeepLinkCampaignAudienceId === campaignAudienceId || audiences.length === 0) return;
    const audience = audiences.find((candidate) => candidate.id === campaignAudienceId);
    if (!audience) return;
    setTab("campaigns");
    setEditingCampaign(null);
    setDefaultCampaignAudienceLabel(audience.name);
    setShowCampaignForm(true);
    setOpenedDeepLinkCampaignAudienceId(campaignAudienceId);
  }, [audiences, openedDeepLinkCampaignAudienceId, searchParams]);

  const campaignsById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const audiencesById = useMemo(() => new Map(audiences.map((a) => [a.id, a])), [audiences]);
  const sendCountByCampaign = useMemo(() => {
    const counts = new Map<string, number>();
    for (const send of sends) counts.set(send.campaignId, (counts.get(send.campaignId) ?? 0) + 1);
    return counts;
  }, [sends]);

  const sendOutcomeCounts = useMemo(() => {
    let sent = 0;
    let failed = 0;
    let partial = 0;
    for (const send of sends) {
      if (send.status === "SENT") sent += 1;
      else if (send.status === "FAILED") failed += 1;
      else if (send.status === "PARTIALLY_SENT") partial += 1;
    }
    return { sent, failed, partial };
  }, [sends]);

  async function confirmSendNow() {
    if (!pendingSend) return;
    const send = pendingSend;
    setPendingSend(null);
    setSendingId(send.id);
    setBanner(null);
    try {
      const result: SendNowResult = await marketingApi.sendNow(eventId, send.id);
      const { summary } = result;
      const tone = summary.status === "FAILED" ? "error" : "ok";
      const skippedNote = summary.skippedSuppressedCount
        ? ` ${summary.skippedSuppressedCount} suppressed recipient${summary.skippedSuppressedCount === 1 ? " was" : "s were"} skipped.`
        : "";
      const message =
        summary.status === "SENT"
          ? `Sent to ${summary.sentCount} of ${summary.recipientCount} recipients.${skippedNote}`
          : summary.status === "PARTIALLY_SENT"
            ? `Partially sent: ${summary.sentCount} of ${summary.recipientCount} delivered, ${summary.failedCount} failed.${skippedNote}`
            : `Send failed — ${summary.failedCount} of ${summary.recipientCount} not delivered (status ${summary.status}).${skippedNote}`;
      setBanner({ tone, message });
      await refreshAll();
    } catch (error) {
      setBanner({ tone: "error", message: error instanceof Error ? error.message : "Send failed." });
    } finally {
      setSendingId(null);
    }
  }

  async function cancelSend(send: MarketingEmailSend) {
    const confirmed = window.confirm("Cancel this scheduled email send? It will remain visible in the send history.");
    if (!confirmed) return;
    setBanner(null);
    try {
      await marketingApi.cancelScheduledEmailSend(eventId, send.id);
      setBanner({ tone: "ok", message: "Scheduled email send cancelled." });
      await refreshAll();
    } catch (error) {
      setBanner({ tone: "error", message: error instanceof Error ? error.message : "Failed to cancel send." });
    }
  }

  function scheduleSend(send: MarketingEmailSend) {
    setScheduleDialog({ send, mode: "schedule" });
  }

  function rescheduleSend(send: MarketingEmailSend) {
    setScheduleDialog({ send, mode: "reschedule" });
  }

  async function handleScheduleDialogSubmit(send: MarketingEmailSend, mode: "schedule" | "reschedule", scheduledAt: string) {
    setBanner(null);
    try {
      if (mode === "schedule") {
        await marketingApi.scheduleEmailSend(eventId, send.id, scheduledAt);
      } else {
        await marketingApi.rescheduleEmailSend(eventId, send.id, scheduledAt);
      }
      setBanner({ tone: "ok", message: mode === "schedule" ? "Email send scheduled." : "Email send rescheduled." });
      setScheduleDialog(null);
      await refreshAll();
    } catch (error) {
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : `Failed to ${mode} send.`,
      });
    }
  }

  async function retrySend(send: MarketingEmailSend) {
    const confirmed = window.confirm("Retry this failed email send using its frozen recipient snapshot?");
    if (!confirmed) return;
    setSendingId(send.id);
    setBanner(null);
    try {
      const result = await marketingApi.retryFailedEmailSend(eventId, send.id);
      setBanner({
        tone: result.summary.status === "FAILED" ? "error" : "ok",
        message:
          result.summary.status === "FAILED"
            ? `Retry failed for ${result.summary.failedCount} recipients.`
            : `Retry submitted to ${result.summary.sentCount} of ${result.summary.recipientCount} recipients.${
                result.summary.skippedSuppressedCount
                  ? ` ${result.summary.skippedSuppressedCount} suppressed recipient${
                      result.summary.skippedSuppressedCount === 1 ? " was" : "s were"
                    } skipped.`
                  : ""
              }`,
      });
      await refreshAll();
    } catch (error) {
      setBanner({ tone: "error", message: error instanceof Error ? error.message : "Failed to retry send." });
    } finally {
      setSendingId(null);
    }
  }

  function handleImported(_audienceId: string, result: ImportRecipientsResult) {
    const invalidNote = result.invalid.length > 0 ? `, ${result.invalid.length} invalid` : "";
    setBanner({
      tone: "ok",
      message: `Imported ${result.imported} of ${result.totalRows} rows (${result.duplicates} duplicates${invalidNote}).`,
    });
    void refreshAll();
  }

  async function resubscribeRecipient(suppression: MarketingSuppression) {
    const confirmed = window.confirm(
      `Resubscribe ${suppression.email} for this event? This allows future marketing emails for this event only.`,
    );
    if (!confirmed) return;

    setResubscribingId(suppression.id);
    setBanner(null);
    try {
      await marketingApi.resubscribeSuppression(eventId, suppression.id);
      setBanner({
        tone: "ok",
        message: `${suppression.email} can receive future marketing emails for this event.`,
      });
      await refreshAll();
    } catch (error) {
      setBanner({ tone: "error", message: error instanceof Error ? error.message : "Failed to resubscribe recipient." });
    } finally {
      setResubscribingId(null);
    }
  }

  const draftCampaigns = campaigns.filter((campaign) => campaign.status === "DRAFT").length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const runningCampaigns = campaigns.filter((campaign) => isCampaignInProgress(campaign, new Date())).length;
  const unsentSends = sends.filter((send) => send.status === "DRAFT" || send.status === "READY").length;
  const plannedSends = sends.filter((send) => send.status === "SCHEDULED").length;
  const pendingApprovalSends = sends.filter((send) => send.approval?.state === "PENDING").length;
  const performanceTotals = useMemo(
    () =>
      sends.reduce(
        (totals, send) => ({
          recipients: totals.recipients + send.recipientCount,
          delivered: totals.delivered + send.deliveredCount,
          opened: totals.opened + send.openCount,
          clicked: totals.clicked + send.clickCount,
          bounced: totals.bounced + send.bounceCount,
          unsubscribed: totals.unsubscribed + send.unsubscribeCount,
        }),
        { recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      ),
    [sends],
  );
  const calendarItems = useMemo<CalendarItem[]>(() => {
    const now = new Date();
    const items: CalendarItem[] = [];

    for (const campaign of campaigns) {
      if (campaign.startDate) {
        const state = campaignStartItemState(campaign, now);
        items.push({
          id: `campaign-start-${campaign.id}`,
          date: campaign.startDate,
          label: campaign.name,
          detail: campaignStartItemDetail(campaign, now),
          kind: "campaign",
          calendarKind: "campaign-start",
          tone: state === "inProgress" ? "emerald" : "violet",
          state,
          onClick: () => {
            setEditingCampaign(campaign);
            setShowCampaignForm(true);
          },
        });
      }
      if (campaign.endDate) {
        const state = campaignEndItemState(campaign, now);
        items.push({
          id: `campaign-end-${campaign.id}`,
          date: campaign.endDate,
          label: campaign.name,
          detail: "Campaign ends",
          kind: "campaign",
          calendarKind: "campaign-end",
          tone: "amber",
          state,
          onClick: () => {
            setEditingCampaign(campaign);
            setShowCampaignForm(true);
          },
        });
      }
    }

    for (const send of sends) {
      const campaign = campaignsById.get(send.campaignId);
      const audience = send.audienceId ? audiencesById.get(send.audienceId) : undefined;
      const label = emailSendDisplayLabel(send, campaign, audience);
      if (send.scheduledSendAt) {
        const isScheduled = send.status === "SCHEDULED";
        items.push({
          id: `send-target-${send.id}`,
          date: send.scheduledSendAt,
          label,
          detail: `${isScheduled ? "Scheduled email" : "Target send date"}${campaign ? ` · ${campaign.name}` : ""}`,
          kind: "send",
          calendarKind: "send-target",
          tone: isScheduled ? "violet" : "blue",
          state:
            new Date(send.scheduledSendAt) < now &&
            !send.actualSentAt &&
            !["SENT", "PARTIALLY_SENT", "FAILED", "CANCELED"].includes(send.status)
              ? "overdue"
              : "default",
          onClick: () => setViewingSend(send),
        });
      }
      if (send.actualSentAt) {
        items.push({
          id: `send-actual-${send.id}`,
          date: send.actualSentAt,
          label,
          detail: `Sent email${campaign ? ` · ${campaign.name}` : ""}`,
          kind: "send",
          calendarKind: "send-sent",
          tone: send.status === "FAILED" ? "rose" : "emerald",
          state: "default",
          onClick: () => setViewingSend(send),
        });
      }
    }

    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [audiencesById, campaigns, campaignsById, sends]);
  const upcomingItems = calendarItems
    .filter((item) => new Date(item.date).getTime() >= Date.now() || item.state === "overdue" || item.state === "inProgress")
    .slice(0, 5);
  return (
    <div className="space-y-4 px-6 py-4">
      <header className="space-y-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[28px] leading-8 font-semibold text-slate-950">Marketing</h1>
              {eventName ? (
                <span className="inline-flex max-w-[360px] items-center gap-2 truncate rounded-full border border-[#28439A]/20 bg-[#28439A]/5 px-3 py-1.5 text-[12px] font-semibold text-slate-700">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#28439A]" />
                  <span className="truncate">{eventName}</span>
                </span>
              ) : null}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
              <span>{countLabel(campaigns.length, "campaign")}</span>
              <span aria-hidden="true">·</span>
              <span>{countLabel(audiences.length, "audience")}</span>
              <span aria-hidden="true">·</span>
              <span>{countLabel(sends.length, "email send")}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingSend(null);
                setDefaultSendCampaignId(null);
                setShowSendForm(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Mail className="h-4 w-4" /> New email
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" /> Import audience
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCampaign(null);
                setDefaultCampaignAudienceLabel(null);
                setShowCampaignForm(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#28439A] px-3.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[#243d8e]"
            >
              <Plus className="h-4 w-4" /> New campaign
            </button>
          </div>
        </div>

        <nav className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 p-1">
          <div className="flex min-w-max items-center gap-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              const count =
                item.key === "overview"
                  ? campaigns.length + sends.length
                  : item.key === "campaigns"
                    ? campaigns.length + audiences.length
                    : item.key === "calendar"
                      ? calendarItems.length
                      : item.key === "performance"
                        ? sends.length
                        : suppressions.length;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (item.key === "performance") setPerformanceCampaignId(null);
                    setTab(item.key);
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition ${
                    tab === item.key
                      ? "bg-[#28439A]/10 text-[#28439A]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      tab === item.key ? "bg-[#28439A]/10 text-[#28439A]" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {banner ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px] ${
            banner.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-[12px] font-semibold underline">
            Dismiss
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          {loadError}
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-[13px] text-slate-500">
          Loading marketing data…
        </div>
      ) : (
        <>
          {tab === "overview" ? (
            <OverviewTab
              campaigns={campaigns}
              sends={sends}
              campaignsById={campaignsById}
              audiencesById={audiencesById}
              sendCountByCampaign={sendCountByCampaign}
              upcomingItems={upcomingItems}
              performanceTotals={performanceTotals}
              sendOutcomeCounts={sendOutcomeCounts}
              activeCampaigns={activeCampaigns}
              draftCampaigns={draftCampaigns}
              runningCampaigns={runningCampaigns}
              unsentSends={unsentSends}
              plannedSends={plannedSends}
              pendingApprovalSends={pendingApprovalSends}
              onViewCampaigns={() => setTab("campaigns")}
              onViewPerformance={() => {
                setPerformanceCampaignId(null);
                setTab("performance");
              }}
              onEdit={(campaign) => {
                setEditingCampaign(campaign);
                setShowCampaignForm(true);
              }}
              onViewSend={(send) => setViewingSend(send)}
            />
          ) : null}

          {tab === "campaigns" ? (
            <CampaignsTab
              campaigns={campaigns}
              sendCountByCampaign={sendCountByCampaign}
              onEditCampaign={(campaign) => {
                setEditingCampaign(campaign);
                setShowCampaignForm(true);
              }}
              onAddEmail={(campaign) => {
                setEditingSend(null);
                setDefaultSendCampaignId(campaign.id);
                setShowSendForm(true);
              }}
              onViewCampaignSends={(campaign) => {
                setPerformanceCampaignId(campaign.id);
                setTab("performance");
              }}
            />
          ) : null}

          {tab === "calendar" ? (
            <CalendarTab
              campaigns={campaigns}
              items={calendarItems}
              onEditCampaign={(campaign) => {
                setEditingCampaign(campaign);
                setShowCampaignForm(true);
              }}
            />
          ) : null}

          {tab === "performance" ? (
            <PerformanceTab
              sends={sends}
              campaignsById={campaignsById}
              audiencesById={audiencesById}
              sendOutcomeCounts={sendOutcomeCounts}
              performanceTotals={performanceTotals}
              trackingMetricsAvailable={trackingConfigured}
              campaignFilterId={performanceCampaignId}
              campaignFilterName={performanceCampaignId ? campaignsById.get(performanceCampaignId)?.name ?? null : null}
              onClearCampaignFilter={() => setPerformanceCampaignId(null)}
              sendingId={sendingId}
              onEdit={(send) => {
                setEditingSend(send);
                setDefaultSendCampaignId(null);
                setShowSendForm(true);
              }}
              onSendNow={(send) => setPendingSend(send)}
              onSchedule={scheduleSend}
              onReschedule={rescheduleSend}
              onCancel={cancelSend}
              onRetry={retrySend}
              onView={(send) => setViewingSend(send)}
            />
          ) : null}

          {tab === "compliance" ? (
            <ComplianceTab
              suppressions={suppressions}
              resubscribingId={resubscribingId}
              onResubscribe={resubscribeRecipient}
            />
          ) : null}
        </>
      )}

      {showCampaignForm ? (
        <CampaignForm
          eventId={eventId}
          campaign={editingCampaign}
          initialAudienceLabel={defaultCampaignAudienceLabel}
          onClose={() => {
            setShowCampaignForm(false);
            setDefaultCampaignAudienceLabel(null);
          }}
          onSaved={() => refreshAll()}
        />
      ) : null}

      {showImport ? (
        <AudienceImportModal
          eventId={eventId}
          audiences={audiences}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      ) : null}

      {showSendForm ? (
        <EmailSendForm
          eventId={eventId}
          campaigns={campaigns}
          audiences={audiences}
          send={editingSend}
          defaultCampaignId={!editingSend ? defaultSendCampaignId ?? undefined : undefined}
          onClose={() => {
            setShowSendForm(false);
            setEditingSend(null);
            setDefaultSendCampaignId(null);
          }}
          onSaved={() => refreshAll()}
        />
      ) : null}

      {scheduleDialog ? (
        <ScheduleSendDialog
          send={scheduleDialog.send}
          mode={scheduleDialog.mode}
          onClose={() => setScheduleDialog(null)}
          onSubmit={(scheduledAt) =>
            handleScheduleDialogSubmit(scheduleDialog.send, scheduleDialog.mode, scheduledAt)
          }
        />
      ) : null}

      {pendingSend ? (
        <SendNowConfirm
          send={pendingSend}
          campaign={campaignsById.get(pendingSend.campaignId) ?? null}
          audience={pendingSend.audienceId ? audiencesById.get(pendingSend.audienceId) ?? null : null}
          onCancel={() => setPendingSend(null)}
          onConfirm={confirmSendNow}
        />
      ) : null}

      {viewingSend ? (
        <EmailSendDetailsModal
          send={viewingSend}
          campaign={campaignsById.get(viewingSend.campaignId) ?? null}
          audience={viewingSend.audienceId ? audiencesById.get(viewingSend.audienceId) ?? null : null}
          onClose={() => setViewingSend(null)}
        />
      ) : null}
    </div>
  );
}

function OverviewTab({
  campaigns,
  sends,
  campaignsById,
  audiencesById,
  sendCountByCampaign,
  upcomingItems,
  performanceTotals,
  sendOutcomeCounts,
  activeCampaigns,
  draftCampaigns,
  runningCampaigns,
  unsentSends,
  plannedSends,
  pendingApprovalSends,
  onViewCampaigns,
  onViewPerformance,
  onEdit,
  onViewSend,
}: {
  campaigns: MarketingCampaign[];
  sends: MarketingEmailSend[];
  campaignsById: Map<string, MarketingCampaign>;
  audiencesById: Map<string, MarketingAudience>;
  sendCountByCampaign: Map<string, number>;
  upcomingItems: CalendarItem[];
  performanceTotals: PerformanceTotals;
  sendOutcomeCounts: { sent: number; failed: number; partial: number };
  activeCampaigns: number;
  draftCampaigns: number;
  runningCampaigns: number;
  unsentSends: number;
  plannedSends: number;
  pendingApprovalSends: number;
  onViewCampaigns: () => void;
  onViewPerformance: () => void;
  onEdit: (campaign: MarketingCampaign) => void;
  onViewSend: (send: MarketingEmailSend) => void;
}) {
  const visibleUpcomingItems = upcomingItems.slice(0, 3);
  const recentSends = sends.slice(0, 3);
  const campaignSnapshot = campaigns.slice(0, 3);
  const issueTone = sendOutcomeCounts.failed > 0 || sendOutcomeCounts.partial > 0 || performanceTotals.unsubscribed > 0;
  const audienceCount = Array.from(audiencesById.keys()).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <OperationalKpiCard
          title="Campaign activity"
          icon={Megaphone}
          tone={runningCampaigns > 0 ? "violet" : "blue"}
          footer={<KpiFooterButton onClick={onViewCampaigns} tone="violet">View campaigns</KpiFooterButton>}
        >
          <div className="flex items-center gap-4">
            <KpiStat label="Active campaigns" value={activeCampaigns} tone="violet" />
            <div className="h-12 w-px bg-slate-200" />
            <KpiStat label="Drafts" value={draftCampaigns} />
            <div className="h-12 w-px bg-slate-200" />
            <KpiStat label="Running now" value={runningCampaigns} tone={runningCampaigns > 0 ? "emerald" : "slate"} />
          </div>
        </OperationalKpiCard>

        <OperationalKpiCard
          title="Email pipeline"
          icon={Send}
          tone="emerald"
          footer={<KpiFooterButton onClick={onViewPerformance} tone="emerald">View all sends</KpiFooterButton>}
        >
          <KpiStat label="Total email sends" value={sends.length} tone="emerald" />
          <div className="mt-5 grid grid-cols-3 gap-4">
            <KpiStat label="Planned" value={plannedSends} tone={plannedSends > 0 ? "blue" : "slate"} />
            <KpiStat label="Pending approval" value={pendingApprovalSends} tone={pendingApprovalSends > 0 ? "amber" : "slate"} />
            <KpiStat label="Unsent" value={unsentSends} tone={unsentSends > 0 ? "amber" : "slate"} />
          </div>
        </OperationalKpiCard>

        <OperationalKpiCard
          title="Send outcomes"
          icon={BarChart3}
          tone={issueTone ? "amber" : "emerald"}
          footer={<KpiFooterButton onClick={onViewPerformance} tone="amber">View performance</KpiFooterButton>}
        >
          <SendOutcomeFunnel
            sent={sendOutcomeCounts.sent}
            delivered={performanceTotals.delivered}
            opened={performanceTotals.opened}
            clicked={performanceTotals.clicked}
          />
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
            <IssueMetric label="Failed" value={sendOutcomeCounts.failed} />
            <IssueMetric label="Partial" value={sendOutcomeCounts.partial} />
            <IssueMetric label="Unsubscribed" value={performanceTotals.unsubscribed} />
          </div>
        </OperationalKpiCard>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <MarketingOverviewCard
          title="Upcoming launches"
          description="Campaign and email dates pulled from saved planning fields."
          icon={CalendarDays}
          footer={
            upcomingItems.length > 0
              ? `Showing ${visibleUpcomingItems.length} of ${upcomingItems.length} date${upcomingItems.length === 1 ? "" : "s"}`
              : "No dates to show"
          }
        >
          {upcomingItems.length === 0 ? (
            <div className="flex flex-1 items-center px-4 py-8 text-[13px] text-slate-500">
              No upcoming or overdue marketing dates yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleUpcomingItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <DateTile date={item.date} tone={item.state === "overdue" ? "rose" : item.tone} />
                  <span className={`h-2 w-2 rounded-full ${toneStyles[item.state === "overdue" ? "rose" : item.tone].accent}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-950">{item.label}</span>
                    <span
                      className={`block text-[12px] ${
                        item.state === "overdue"
                          ? "text-rose-600"
                          : item.state === "inProgress"
                            ? "text-emerald-700"
                            : "text-slate-500"
                      }`}
                    >
                      {item.state === "overdue" ? "Overdue · " : item.state === "inProgress" ? "In progress · " : ""}
                      {item.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </MarketingOverviewCard>

        <MarketingOverviewCard
          title="Campaign snapshot"
          description="Current initiatives with channel, status, and send count."
          icon={Megaphone}
          footer={
            campaigns.length > 0
              ? `Showing ${campaignSnapshot.length} of ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`
              : "No campaigns to show"
          }
        >
          {campaignSnapshot.length === 0 ? (
            <div className="flex flex-1 items-center px-4 py-8 text-[13px] text-slate-500">No campaigns yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {campaignSnapshot.map((campaign) => {
                const sendCount = sendCountByCampaign.get(campaign.id) ?? 0;
                const meta = CAMPAIGN_STATUS_META[campaign.status];
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => onEdit(campaign)}
                    className="grid min-h-[76px] w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-950">{campaign.name}</span>
                      <span className="block truncate text-[12px] text-slate-500">{campaignSummary(campaign, sendCount)}</span>
                    </span>
                    <ChannelBadge sendCount={sendCount} />
                    <StatusBadge label={meta.label} className={meta.className} dot={meta.dot} />
                  </button>
                );
              })}
            </div>
          )}
        </MarketingOverviewCard>

        <MarketingOverviewCard
          title="Recent email activity"
          description="Latest saved sends and their server-backed delivery state."
          icon={Mail}
          footer={
            sends.length > 0
              ? `Showing ${recentSends.length} of ${sends.length} email send${sends.length === 1 ? "" : "s"}`
              : "No email sends to show"
          }
        >
          {recentSends.length === 0 ? (
            <div className="flex flex-1 items-center px-4 py-8 text-[13px] text-slate-500">No email sends yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentSends.map((send) => {
                const campaign = campaignsById.get(send.campaignId);
                const audience = send.audienceId ? audiencesById.get(send.audienceId) : undefined;
                const meta = emailSendStatusMeta(send);
                return (
                  <button
                    key={send.id}
                    type="button"
                    onClick={() => onViewSend(send)}
                    className="flex min-h-[76px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-950">
                        {emailSendDisplayLabel(send, campaign, audience)}
                      </span>
                      <span className="block truncate text-[12px] text-slate-500">
                        {campaign?.name ?? "No campaign"} · {send.recipientCount} recipients
                      </span>
                    </span>
                    <StatusBadge label={meta.label} className={meta.className} dot={meta.dot} />
                  </button>
                );
              })}
            </div>
          )}
        </MarketingOverviewCard>

        <MarketingOverviewCard
          title="Performance snapshot"
          description="Stored email send counters only; no inferred attribution."
          icon={BarChart3}
          footer={
            <>
              Event audiences available for campaigns:{" "}
              <span className="font-semibold text-slate-700">{audienceCount}</span>
            </>
          }
        >
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <MiniMetric label="Recipients" value={performanceTotals.recipients} />
              <MiniMetric label="Delivered" value={performanceTotals.delivered} />
              <MiniMetric label="Opened" value={performanceTotals.opened} />
              <MiniMetric label="Clicked" value={performanceTotals.clicked} />
            </div>
            {!sendOutcomeCounts.sent && !performanceTotals.delivered && !performanceTotals.opened && !performanceTotals.clicked ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
                Sent performance will populate here after marketing emails are delivered and webhook counters arrive.
              </div>
            ) : null}
          </div>
        </MarketingOverviewCard>
      </div>
    </div>
  );
}

function CampaignsTab({
  campaigns,
  sendCountByCampaign,
  onEditCampaign,
  onAddEmail,
  onViewCampaignSends,
}: {
  campaigns: MarketingCampaign[];
  sendCountByCampaign: Map<string, number>;
  onEditCampaign: (campaign: MarketingCampaign) => void;
  onAddEmail: (campaign: MarketingCampaign) => void;
  onViewCampaignSends: (campaign: MarketingCampaign) => void;
}) {
  return (
    <CampaignsTable
      campaigns={campaigns}
      sendCountByCampaign={sendCountByCampaign}
      onEdit={onEditCampaign}
      onAddEmail={onAddEmail}
      onViewSends={onViewCampaignSends}
    />
  );
}

function CalendarTab({
  campaigns,
  items,
  onEditCampaign,
}: {
  campaigns: MarketingCampaign[];
  items: CalendarItem[];
  onEditCampaign: (campaign: MarketingCampaign) => void;
}) {
  const defaultMonth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingItem = items.find((item) => {
      const itemDate = parseMarketingDate(item.date);
      return itemDate ? itemDate.getTime() >= today.getTime() : false;
    });
    const firstItem = upcomingItem ?? items[0];
    return startOfMonth(parseMarketingDate(firstItem?.date) ?? today);
  }, [items]);
  const [selectedMonthIso, setSelectedMonthIso] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const selectedMonth = selectedMonthIso ? parseMarketingDate(selectedMonthIso) ?? defaultMonth : defaultMonth;
  const monthDays = useMemo(() => buildMonthGrid(selectedMonth), [selectedMonth]);
  const monthLabel = selectedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const date = parseMarketingDate(item.date);
      if (!date) continue;
      const key = toCalendarIso(date);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);
  const rangeSegmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarRangeSegment[]>();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const campaignWindows = campaigns
      .filter((campaign) => campaign.startDate && campaign.endDate)
      .sort((a, b) => {
        const aStart = parseMarketingDate(a.startDate)?.getTime() ?? 0;
        const bStart = parseMarketingDate(b.startDate)?.getTime() ?? 0;
        if (aStart !== bStart) return aStart - bStart;
        return a.name.localeCompare(b.name);
      });
    for (const [lane, campaign] of campaignWindows.entries()) {
      const start = parseMarketingDate(campaign.startDate);
      const end = parseMarketingDate(campaign.endDate);
      if (!start || !end) continue;
      const rangeStart = start <= end ? start : end;
      const rangeEnd = start <= end ? end : start;
      const tone = campaignRangeTone(lane);
      for (const day of monthDays) {
        if (!isDateInRange(day.date, rangeStart, rangeEnd)) continue;
        const key = day.isoDate;
        const segment: CalendarRangeSegment = {
          id: `${campaign.id}-${key}`,
          kind: "campaign-window",
          label: campaign.name || "Untitled campaign",
          campaign,
          tone,
          lane,
          starts: isSameDate(day.date, rangeStart) || day.date.getDay() === 0,
          ends: isSameDate(day.date, rangeEnd) || day.date.getDay() === 6,
          overdue: rangeEnd < now && campaign.status !== "COMPLETED" && campaign.status !== "ARCHIVED",
          onClick: () => onEditCampaign(campaign),
        };
        map.set(key, [...(map.get(key) ?? []), segment].sort((a, b) => a.lane - b.lane));
      }
    }
    return map;
  }, [campaigns, monthDays, onEditCampaign]);
  const visibleMonthItems = useMemo(
    () =>
      items
        .filter((item) => {
          const itemDate = parseMarketingDate(item.date);
          return itemDate ? isSameMonth(itemDate, selectedMonth) : false;
        })
        .sort((a, b) => {
          const aDate = parseMarketingDate(a.date)?.getTime() ?? 0;
          const bDate = parseMarketingDate(b.date)?.getTime() ?? 0;
          if (aDate !== bDate) return aDate - bDate;
          return a.label.localeCompare(b.label);
        }),
    [items, selectedMonth],
  );
  const agendaGroups = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>();
    for (const item of visibleMonthItems) {
      const date = parseMarketingDate(item.date);
      if (!date) continue;
      const key = toCalendarIso(date);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries()).map(([isoDate, groupItems]) => ({
      isoDate,
      items: groupItems,
    }));
  }, [visibleMonthItems]);
  const monthHasRecords =
    visibleMonthItems.length > 0 ||
    monthDays.some((day) => (rangeSegmentsByDate.get(day.isoDate) ?? []).length > 0 && day.inSelectedMonth);

  function changeMonth(amount: number) {
    setSelectedMonthIso(toCalendarIso(addMonths(selectedMonth, amount)));
  }

  return (
    <SectionChrome
      title="Marketing calendar"
      description="Campaign windows, target send dates, and actual sent dates from saved records."
      icon={CalendarDays}
    >
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 className="min-w-[180px] text-center text-[16px] font-semibold text-slate-950">{monthLabel}</h3>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Calendar view">
              {(["month", "agenda"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCalendarView(view)}
                  aria-pressed={calendarView === view}
                  className={`inline-flex h-7 items-center rounded-lg px-3 text-[12px] font-semibold transition ${
                    calendarView === view
                      ? "bg-[#28439A] text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  {view === "month" ? "Month" : "Agenda"}
                </button>
              ))}
            </div>
          </div>
          {calendarView === "month" ? (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <CalendarLegendSwatch className="h-2 w-2 rounded-full bg-blue-500" label="Launch/target pin" />
              <CalendarLegendSwatch className="h-2 w-8 rounded-full bg-[#28439A]/30" label="Campaign range" />
              <CalendarLegendSwatch className="h-2 w-2 rounded-full bg-emerald-500" label="Sent email" />
              <CalendarLegendSwatch className="h-2 w-2 rounded-full bg-rose-500" label="Overdue" />
            </div>
          ) : null}
        </div>

        {calendarView === "month" ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const dayItems = (itemsByDate.get(day.isoDate) ?? []).filter((item) => item.kind === "send");
                  const rangeSegments = rangeSegmentsByDate.get(day.isoDate) ?? [];
                  const isToday = isSameDate(day.date, new Date());
                  return (
                    <div
                      key={day.isoDate}
                      className={`min-h-[128px] border-b border-r border-slate-100 p-2 ${
                        day.inSelectedMonth ? "bg-white" : "bg-slate-50/50"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                            isToday
                              ? "bg-[#28439A] text-white"
                              : day.inSelectedMonth
                                ? "text-slate-600"
                                : "text-slate-300"
                          }`}
                        >
                          {day.date.getDate()}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {rangeSegments.slice(0, 2).map((range) => (
                          <button
                            key={range.id}
                            type="button"
                            onClick={range.onClick}
                            title={`${range.label} campaign range`}
                            className={`block h-6 w-full truncate border px-2 text-left text-[10px] font-semibold ${getRangeSegmentStyles(range)}`}
                          >
                            {range.label}
                          </button>
                        ))}
                        {dayItems.slice(0, 3).map((item) => (
                          <CalendarItemPill key={item.id} item={item} />
                        ))}
                        {rangeSegments.length + dayItems.length > 5 ? (
                          <div className="text-[10px] font-semibold text-slate-400">
                            +{rangeSegments.length + dayItems.length - 5} more
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!monthHasRecords ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-center text-[13px] text-slate-500">
                No campaign or email dates this month.
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-[13px] font-semibold text-slate-950">Agenda</h3>
            {agendaGroups.length > 0 ? (
              <div className="mt-3 space-y-3">
                {agendaGroups.map((group) => (
                  <div key={group.isoDate} className="grid gap-2 md:grid-cols-[120px_1fr]">
                    <div className="text-[12px] font-semibold text-slate-500">{formatDate(group.isoDate)}</div>
                    <div className="grid gap-2">
                      {group.items.map((item) => (
                        <button
                          key={`agenda-${item.id}`}
                          type="button"
                          onClick={item.onClick}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${getCalendarItemStyles(item)}`}
                        >
                          <DateTile date={item.date} tone={item.state === "overdue" ? "rose" : item.tone} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold">{item.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] opacity-80">{item.detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-[13px] text-slate-500">
                No agenda items for this month.
              </div>
            )}
          </div>
        )}
      </div>
    </SectionChrome>
  );
}

function CalendarLegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={className} />
      {label}
    </span>
  );
}

function CalendarItemPill({ item }: { item: CalendarItem }) {
  const indicatorClass =
    item.state === "overdue" || item.calendarKind === "campaign-end"
      ? "bg-rose-500"
      : item.state === "inProgress"
        ? "bg-emerald-500"
      : item.calendarKind === "send-sent"
        ? "bg-emerald-500"
        : item.calendarKind === "campaign-start"
          ? "bg-violet-500"
          : "bg-blue-500";
  return (
    <button
      type="button"
      onClick={item.onClick}
      title={`${item.label} · ${item.detail}`}
      className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[10px] font-semibold ${getCalendarItemStyles(item)}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${indicatorClass}`} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function ComplianceTab({
  suppressions,
  resubscribingId,
  onResubscribe,
}: {
  suppressions: MarketingSuppression[];
  resubscribingId: string | null;
  onResubscribe: (suppression: MarketingSuppression) => void;
}) {
  return (
    <SectionChrome
      title="Compliance"
      description="Event-level recipients currently suppressed from future marketing emails."
      icon={ShieldCheck}
    >
      <div className="p-4">
        {suppressions.length === 0 ? (
          <EmptyState
            title="No suppressed recipients yet"
            message="Recipients who unsubscribe, bounce, or report spam will appear here for this event."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-[32%] px-4 py-3">Email</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map((suppression) => (
                    <tr key={suppression.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{suppression.email}</div>
                        <div className="text-[12px] text-slate-400">Event-only suppression</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{suppressionReasonLabel(suppression)}</td>
                      <td className="px-4 py-3 text-slate-600">{suppressionSourceLabel(suppression)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(suppression.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onResubscribe(suppression)}
                          disabled={resubscribingId === suppression.id}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {resubscribingId === suppression.id ? "Resubscribing..." : "Resubscribe"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </SectionChrome>
  );
}

function filterPerformanceSends(
  sends: MarketingEmailSend[],
  activeFilter: PerformanceFilterKey | null,
  outcomeFilter: SentOutcomeFilter,
) {
  if (!activeFilter) return sends;

  if (activeFilter === "sent-outcomes") {
    const statuses =
      outcomeFilter === "sent"
        ? ["SENT"]
        : outcomeFilter === "failed"
          ? ["FAILED"]
          : outcomeFilter === "partial"
            ? ["PARTIALLY_SENT"]
            : ["SENT", "FAILED", "PARTIALLY_SENT"];
    return sends.filter((send) => statuses.includes(send.status));
  }

  if (activeFilter === "recipients") {
    return sends
      .filter((send) => send.recipientCount > 0)
      .sort((a, b) => b.recipientCount - a.recipientCount);
  }

  if (activeFilter === "delivery") {
    return sends.filter((send) => send.deliveredCount > 0 || send.openCount > 0);
  }

  if (activeFilter === "activity") {
    return sends.filter((send) => send.clickCount > 0 || send.bounceCount > 0);
  }

  return sends.filter((send) => send.unsubscribeCount > 0);
}

function performanceEmptyMessage(activeFilter: PerformanceFilterKey | null, trackingMetricsAvailable: boolean): string {
  if (activeFilter === "delivery") {
    return trackingMetricsAvailable
      ? "No delivery or open activity recorded yet."
      : "No webhook delivery/open data is available yet.";
  }
  if (activeFilter === "activity") return "No click or bounce activity recorded yet.";
  if (activeFilter === "unsubscribed") return "No unsubscribe activity recorded yet.";
  if (activeFilter === "recipients") return "No sends with recipients targeted yet.";
  if (activeFilter === "sent-outcomes") return "No sent, failed, or partially sent outcomes match this filter.";
  return "Use the main Marketing header to create a send from a campaign and audience when you are ready to write.";
}

function PerformanceTab({
  sends,
  campaignsById,
  audiencesById,
  sendOutcomeCounts,
  performanceTotals,
  trackingMetricsAvailable,
  campaignFilterId,
  campaignFilterName,
  onClearCampaignFilter,
  sendingId,
  onEdit,
  onSendNow,
  onSchedule,
  onReschedule,
  onCancel,
  onRetry,
  onView,
}: {
  sends: MarketingEmailSend[];
  campaignsById: Map<string, MarketingCampaign>;
  audiencesById: Map<string, MarketingAudience>;
  sendOutcomeCounts: { sent: number; failed: number; partial: number };
  performanceTotals: PerformanceTotals;
  trackingMetricsAvailable: boolean;
  campaignFilterId: string | null;
  campaignFilterName: string | null;
  onClearCampaignFilter: () => void;
  sendingId: string | null;
  onEdit: (send: MarketingEmailSend) => void;
  onSendNow: (send: MarketingEmailSend) => void;
  onSchedule: (send: MarketingEmailSend) => void;
  onReschedule: (send: MarketingEmailSend) => void;
  onCancel: (send: MarketingEmailSend) => void;
  onRetry: (send: MarketingEmailSend) => void;
  onView: (send: MarketingEmailSend) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<PerformanceFilterKey | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<SentOutcomeFilter>("all");
  const campaignScopedSends = useMemo(
    () => (campaignFilterId ? sends.filter((send) => send.campaignId === campaignFilterId) : sends),
    [campaignFilterId, sends],
  );
  const displayedSendOutcomeCounts = useMemo(() => {
    if (!campaignFilterId) return sendOutcomeCounts;
    return campaignScopedSends.reduce(
      (counts, send) => ({
        sent: counts.sent + (send.status === "SENT" ? 1 : 0),
        failed: counts.failed + (send.status === "FAILED" ? 1 : 0),
        partial: counts.partial + (send.status === "PARTIALLY_SENT" ? 1 : 0),
      }),
      { sent: 0, failed: 0, partial: 0 },
    );
  }, [campaignFilterId, campaignScopedSends, sendOutcomeCounts]);
  const displayedPerformanceTotals = useMemo(
    () =>
      campaignFilterId
        ? campaignScopedSends.reduce(
            (totals, send) => ({
              recipients: totals.recipients + send.recipientCount,
              delivered: totals.delivered + send.deliveredCount,
              opened: totals.opened + send.openCount,
              clicked: totals.clicked + send.clickCount,
              bounced: totals.bounced + send.bounceCount,
              unsubscribed: totals.unsubscribed + send.unsubscribeCount,
            }),
            { recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
          )
        : performanceTotals,
    [campaignFilterId, campaignScopedSends, performanceTotals],
  );
  const filteredSends = useMemo(
    () => filterPerformanceSends(campaignScopedSends, activeFilter, outcomeFilter),
    [activeFilter, campaignScopedSends, outcomeFilter],
  );
  const activeFilterLabel = activeFilter
    ? activeFilter === "sent-outcomes"
      ? `${PERFORMANCE_FILTER_LABELS[activeFilter]} · ${SENT_OUTCOME_FILTER_LABELS[outcomeFilter]}`
      : PERFORMANCE_FILTER_LABELS[activeFilter]
    : null;

  function toggleFilter(filter: PerformanceFilterKey) {
    setActiveFilter((current) => {
      if (current === filter) return null;
      if (filter !== "sent-outcomes") setOutcomeFilter("all");
      return filter;
    });
  }

  return (
    <SectionChrome
      title="Email performance"
      description="Stored send outcomes and delivery counters from the current email MVP."
      icon={BarChart3}
    >
      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <PerformanceMetricCard
            label="Sent outcomes"
            value={`${displayedSendOutcomeCounts.sent} / ${displayedSendOutcomeCounts.failed} / ${displayedSendOutcomeCounts.partial}`}
            hint="sent / failed / partial"
            tone={displayedSendOutcomeCounts.failed > 0 ? "rose" : "emerald"}
            icon={BarChart3}
            active={activeFilter === "sent-outcomes"}
            onClick={() => toggleFilter("sent-outcomes")}
          />
          <PerformanceMetricCard
            label="Recipients targeted"
            value={displayedPerformanceTotals.recipients}
            hint="filters to sends with recipients"
            tone="blue"
            icon={UsersRound}
            active={activeFilter === "recipients"}
            onClick={() => toggleFilter("recipients")}
          />
          <PerformanceMetricCard
            label="Delivered / opened"
            value={`${displayedPerformanceTotals.delivered} / ${displayedPerformanceTotals.opened}`}
            hint={trackingMetricsAvailable ? "filters stored counters" : "uses stored values"}
            tone={trackingMetricsAvailable ? "emerald" : "amber"}
            icon={CheckCircle2}
            active={activeFilter === "delivery"}
            onClick={() => toggleFilter("delivery")}
          />
          <PerformanceMetricCard
            label="Clicked / bounced"
            value={`${displayedPerformanceTotals.clicked} / ${displayedPerformanceTotals.bounced}`}
            hint="filters click or bounce activity"
            tone={displayedPerformanceTotals.bounced > 0 ? "rose" : "violet"}
            icon={MousePointerClick}
            active={activeFilter === "activity"}
            onClick={() => toggleFilter("activity")}
          />
          <PerformanceMetricCard
            label="Unsubscribed"
            value={displayedPerformanceTotals.unsubscribed}
            hint="filters unsubscribe activity"
            tone={displayedPerformanceTotals.unsubscribed > 0 ? "rose" : "amber"}
            icon={AlertCircle}
            active={activeFilter === "unsubscribed"}
            onClick={() => toggleFilter("unsubscribed")}
          />
        </div>

        {activeFilter === "sent-outcomes" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[12px] font-semibold text-slate-600">Sent outcome</span>
            {(["all", "sent", "failed", "partial"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setOutcomeFilter(option)}
                aria-pressed={outcomeFilter === option}
                className={`inline-flex h-7 items-center rounded-lg px-2.5 text-[12px] font-semibold transition ${
                  outcomeFilter === option
                    ? "bg-[#28439A] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {SENT_OUTCOME_FILTER_LABELS[option]}
              </button>
            ))}
          </div>
        ) : null}

        {campaignFilterId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#28439A]/20 bg-[#28439A]/5 px-3 py-2 text-[12px] text-[#28439A]">
            <span>
              Showing sends for <span className="font-semibold">{campaignFilterName ?? "selected campaign"}</span>
            </span>
            <button
              type="button"
              onClick={onClearCampaignFilter}
              className="font-semibold underline decoration-[#28439A]/40 underline-offset-2"
            >
              Show all sends
            </button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-[14px] font-semibold text-slate-950">Email send history</h3>
              <p className="text-[12px] text-slate-500">Rows open the existing send detail surface.</p>
            </div>
            {activeFilterLabel ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#28439A]/20 bg-[#28439A]/5 px-3 py-1.5 text-[12px] text-[#28439A]">
                <span>
                  Active filter: <span className="font-semibold">{activeFilterLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveFilter(null)}
                  className="font-semibold underline decoration-[#28439A]/40 underline-offset-2"
                >
                  Clear filter
                </button>
              </div>
            ) : null}
          </div>
          <PerformanceSendHistoryTable
            sends={filteredSends}
            emptyMessage={
              campaignFilterId
                ? "No email sends for this campaign yet."
                : performanceEmptyMessage(activeFilter, trackingMetricsAvailable)
            }
            campaignsById={campaignsById}
            audiencesById={audiencesById}
            sendingId={sendingId}
            onEdit={onEdit}
            onSendNow={onSendNow}
            onSchedule={onSchedule}
            onReschedule={onReschedule}
            onCancel={onCancel}
            onRetry={onRetry}
            onView={onView}
          />
        </div>
      </div>
    </SectionChrome>
  );
}

function PerformanceMetricCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  tone: MarketingTone;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#28439A]/40 ${
        active ? "border-[#28439A] bg-[#28439A]/5 ring-2 ring-[#28439A]/20" : styles.card
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${styles.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-slate-500">{label}</p>
          <p className="mt-4 text-[26px] leading-[30px] font-semibold text-slate-950">{value}</p>
          <p className="mt-2 text-[12px] text-slate-500">{hint}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
    </button>
  );
}

function EmailSendPerformanceStrip({ send }: { send: MarketingEmailSend }) {
  const suppressedCount = suppressedRecipientCount(send);
  const funnelMetrics: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
  }> = [
    { label: "Delivered", value: send.deliveredCount, icon: CheckCircle2 },
    { label: "Opened", value: send.openCount, icon: Eye },
    { label: "Clicked", value: send.clickCount, icon: MousePointerClick },
  ];
  const issueMetrics = [
    { label: "Bounced", value: send.bounceCount },
    { label: "Unsubscribed", value: send.unsubscribeCount },
    { label: "Suppressed", value: suppressedCount },
  ];
  const issueCount = issueMetrics.reduce((total, metric) => total + metric.value, 0);
  const issueTitle = issueMetrics.map((metric) => `${metric.label}: ${metric.value}`).join(" · ");

  return (
    <div className="flex min-w-[360px] flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {funnelMetrics.map((metric, index) => {
          const Icon = metric.icon;
          const active = metric.value > 0;
          return (
            <span
              key={metric.label}
              className={`inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold ${
                index === 0 ? "" : "border-l border-slate-200"
              } ${active ? "text-slate-800" : "text-slate-400"}`}
              title={`${metric.label}: ${metric.value}`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-[#28439A]" : "text-slate-300"}`} />
              <span>{metric.label}</span>
              <span className="tabular-nums">{metric.value}</span>
            </span>
          );
        })}
      </div>
      <span
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold ${
          issueCount > 0
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-slate-200 bg-slate-50 text-slate-400"
        }`}
        title={issueTitle}
      >
        {issueCount > 0 ? <AlertCircle className="h-3.5 w-3.5 text-rose-600" /> : <ShieldCheck className="h-3.5 w-3.5 text-slate-300" />}
        <span>{issueCount > 0 ? "Issues" : "No issues"}</span>
        {issueCount > 0 ? <span className="tabular-nums">{issueCount}</span> : null}
      </span>
    </div>
  );
}

function emailSendActionMeta(action: EmailSendAction): {
  label: string;
  icon: LucideIcon;
  className: string;
} {
  if (action === "view") {
    return {
      label: "View send",
      icon: Eye,
      className: "border-slate-300 text-slate-700 hover:bg-slate-50",
    };
  }
  if (action === "edit") {
    return {
      label: "Edit send",
      icon: PencilLine,
      className: "border-slate-300 text-slate-700 hover:bg-slate-50",
    };
  }
  if (action === "sendNow") {
    return {
      label: "Send now",
      icon: Send,
      className: "border-[#28439A] bg-[#28439A] text-white hover:bg-[#243d8e]",
    };
  }
  if (action === "schedule") {
    return {
      label: "Schedule send",
      icon: CalendarDays,
      className: "border-violet-200 text-violet-700 hover:bg-violet-50",
    };
  }
  if (action === "reschedule") {
    return {
      label: "Reschedule send",
      icon: CalendarDays,
      className: "border-violet-200 text-violet-700 hover:bg-violet-50",
    };
  }
  if (action === "cancel") {
    return {
      label: "Cancel send",
      icon: X,
      className: "border-rose-200 text-rose-700 hover:bg-rose-50",
    };
  }
  return {
    label: "Retry send",
    icon: RefreshCw,
    className: "border-amber-200 text-amber-800 hover:bg-amber-50",
  };
}

function EmailSendIconAction({
  action,
  onClick,
  disabled,
}: {
  action: EmailSendAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const meta = emailSendActionMeta(action);
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={meta.label}
      title={meta.label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-60 ${meta.className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PerformanceSendHistoryTable({
  sends,
  emptyMessage,
  campaignsById,
  audiencesById,
  sendingId,
  onEdit,
  onSendNow,
  onSchedule,
  onReschedule,
  onCancel,
  onRetry,
  onView,
}: {
  sends: MarketingEmailSend[];
  emptyMessage: string;
  campaignsById: Map<string, MarketingCampaign>;
  audiencesById: Map<string, MarketingAudience>;
  sendingId: string | null;
  onEdit: (send: MarketingEmailSend) => void;
  onSendNow: (send: MarketingEmailSend) => void;
  onSchedule: (send: MarketingEmailSend) => void;
  onReschedule: (send: MarketingEmailSend) => void;
  onCancel: (send: MarketingEmailSend) => void;
  onRetry: (send: MarketingEmailSend) => void;
  onView: (send: MarketingEmailSend) => void;
}) {
  if (sends.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title="No email sends yet"
          message={emptyMessage}
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-[13px]">
        <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-[30%] px-4 py-3">Email send</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Dates</th>
            <th className="px-4 py-3">Performance</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sends.map((send) => {
            const meta = emailSendStatusMeta(send);
            const inSendableState = send.status === "DRAFT" || send.status === "READY";
            const audience = send.audienceId ? audiencesById.get(send.audienceId) : undefined;
            const readiness = evaluateSendReadiness({
              hasAudience: Boolean(send.audienceId),
              recipientCount: audience?.recipientCount ?? 0,
              hasSubject: Boolean(send.subject.trim()),
              hasContent: Boolean(send.bodyHtml || send.bodyText),
              fromEmailProvided: Boolean(send.fromEmail),
            });
            const approvalBlocked = emailSendApprovalBlocksSending(send);
            const canSend = inSendableState && readiness.ready;
            const canEdit = send.status === "DRAFT" || send.status === "READY";
            const actions = emailSendActions(send, canSend);
            const campaign = campaignsById.get(send.campaignId);
            const label = emailSendDisplayLabel(send, campaign, audience);
            const actionHandlers: Partial<Record<EmailSendAction, () => void>> = {
              view: () => onView(send),
              edit: () => onEdit(send),
              sendNow: () => onSendNow(send),
              schedule: () => onSchedule(send),
              reschedule: () => onReschedule(send),
              cancel: () => onCancel(send),
              retry: () => onRetry(send),
            };
            return (
              <tr
                key={send.id}
                onClick={() => onView(send)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#28439A]" />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-950">{label}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
                        <span className="max-w-[180px] truncate">{campaign?.name ?? "No campaign"}</span>
                        <span aria-hidden="true">·</span>
                        <span className="max-w-[180px] truncate">
                          {send.audienceId ? audience?.name ?? "Audience unavailable" : "No audience"}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={meta.label} className={meta.className} dot={meta.dot} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Target</span>
                    <div>{formatDateTime(send.scheduledSendAt)}</div>
                  </div>
                  <div className="mt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sent</span>
                    <div>{formatDateTime(send.actualSentAt)}</div>
                  </div>
                  {send.status === "SCHEDULED" ? <div className="text-[11px] text-violet-500">Scheduled</div> : null}
                </td>
                <td className="px-4 py-3">
                  <EmailSendPerformanceStrip send={send} />
                </td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1.5">
                    {actions.map((action) => {
                      if (action === "edit" && !canEdit) return null;
                      const handler = actionHandlers[action];
                      if (!handler) return null;
                      return (
                        <EmailSendIconAction
                          key={action}
                          action={action}
                          onClick={handler}
                          disabled={sendingId === send.id && (action === "sendNow" || action === "retry")}
                        />
                      );
                    })}
                    {!actions.includes("sendNow") && inSendableState ? (
                      <span
                        className="text-[12px] text-amber-700"
                        title={approvalBlocked ? "Approval is required before sending." : `Not ready to send: ${readiness.blockingReason}`}
                      >
                        {approvalBlocked ? "Needs approval" : `Needs: ${readiness.blockingReason}`}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-[20px] font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function DateTile({ date, tone }: { date: string; tone: MarketingTone }) {
  const parsed = new Date(date);
  const month = Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString(undefined, { month: "short" });
  const day = Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString(undefined, { day: "2-digit" });
  const styles = toneStyles[tone];
  return (
    <span className={`flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl border ${styles.icon}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide">{month}</span>
      <span className="text-[18px] font-semibold leading-5">{day}</span>
    </span>
  );
}

function ScheduleSendDialog({
  send,
  mode,
  onClose,
  onSubmit,
}: {
  send: MarketingEmailSend;
  mode: "schedule" | "reschedule";
  onClose: () => void;
  onSubmit: (scheduledAt: string) => Promise<void> | void;
}) {
  const initialSchedule = schedulePartsFromIso(send.scheduledSendAt);
  const [date, setDate] = useState(initialSchedule.date);
  const [time, setTime] = useState(initialSchedule.time);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timezoneLabel = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "browser timezone", []);
  const scheduledAt = schedulePartsToIso(date, time);
  const title = mode === "schedule" ? "Schedule email send" : "Reschedule email send";

  async function handleSubmit() {
    if (!date || !time) {
      setError("Choose a scheduled send date and time.");
      return;
    }
    if (!scheduledAt) {
      setError("Choose a valid scheduled send date and time.");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      setError("Choose a scheduled send time in the future.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(scheduledAt);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scheduled send</p>
            <h2 className="text-[18px] font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-[13px] text-slate-500">{emailSendDisplayLabel(send)}</p>
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
        <div className="space-y-3 px-6 py-5">
          <MarketingSchedulePicker
            date={date}
            time={time}
            onDateChange={setDate}
            onTimeChange={setTime}
            timezoneLabel={timezoneLabel}
          />
          <p className="text-[12px] text-slate-400">Scheduling uses the frozen recipient snapshot for this send.</p>
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
            onClick={handleSubmit}
            disabled={isSubmitting || !date || !time}
            className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : mode === "schedule" ? "Schedule send" : "Reschedule send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignsTable({
  campaigns,
  sendCountByCampaign,
  onEdit,
  onAddEmail,
  onViewSends,
}: {
  campaigns: MarketingCampaign[];
  sendCountByCampaign: Map<string, number>;
  onEdit: (campaign: MarketingCampaign) => void;
  onAddEmail: (campaign: MarketingCampaign) => void;
  onViewSends: (campaign: MarketingCampaign) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        title="No campaigns yet"
        message="Use the main Marketing header to create a campaign that groups email sends and future marketing activity."
      />
    );
  }
  return (
    <SectionChrome
      title="Campaign initiatives"
      description="Marketing pushes grouped by channel, audience focus, and send activity."
      icon={Megaphone}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-[13px]">
          <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[30%] px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Date range</th>
              <th className="px-4 py-3">Sends</th>
              <th className="px-4 py-3">Updated</th>
              <th className="w-[148px] px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const meta = CAMPAIGN_STATUS_META[campaign.status];
              const sendCount = sendCountByCampaign.get(campaign.id) ?? 0;
              return (
                <tr
                  key={campaign.id}
                  onClick={() => onEdit(campaign)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-[#28439A]/[0.035]"
                >
                  <td className="px-4 py-4">
                    <div className="max-w-[420px] truncate font-semibold text-slate-900">{campaign.name}</div>
                    <div className="max-w-[460px] truncate text-[12px] text-slate-500">
                      {campaignSummary(campaign, sendCount)}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <ChannelBadge sendCount={sendCount} />
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge label={meta.label} className={meta.className} dot={meta.dot} />
                  </td>
                  <td className="px-4 py-4">
                    <OwnerCell ownerUserId={campaign.ownerUserId} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {formatDateRange(campaign.startDate, campaign.endDate)}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onViewSends(campaign);
                      }}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                      aria-label={`View sends for ${campaign.name}`}
                      title={`View sends for ${campaign.name}`}
                    >
                      {sendCount}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(campaign.updatedAt)}</td>
                  <td className="w-[148px] px-4 py-4" onClick={(event) => event.stopPropagation()}>
                    <div className="flex min-w-[112px] items-center justify-end gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onAddEmail(campaign)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#28439A] bg-[#28439A] text-white hover:bg-[#243d8e]"
                        aria-label="Add email to campaign"
                        title="Add email to campaign"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewSends(campaign)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                        aria-label="View campaign"
                        title="View campaign"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(campaign)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                        aria-label="Edit campaign"
                        title="Edit campaign"
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionChrome>
  );
}

function SendsTable({
  sends,
  campaignsById,
  audiencesById,
  sendingId,
  onEdit,
  onSendNow,
  onCancel,
  onView,
}: {
  sends: MarketingEmailSend[];
  campaignsById: Map<string, MarketingCampaign>;
  audiencesById: Map<string, MarketingAudience>;
  sendingId: string | null;
  onEdit: (send: MarketingEmailSend) => void;
  onSendNow: (send: MarketingEmailSend) => void;
  onCancel: (send: MarketingEmailSend) => void;
  onView: (send: MarketingEmailSend) => void;
}) {
  return (
    <div>
      {sends.length === 0 ? (
        <EmptyState
          title="No email sends yet"
          message="Use the main Marketing header to create a send from a campaign and audience when you are ready to write."
        />
      ) : (
        <SectionChrome
          title="Email sends"
          description="Saved sends, planned send dates, and real delivery outcomes from the current MVP."
          icon={Mail}
        >
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Target send date</th>
                <th className="px-4 py-3">Sent date</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Performance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((send) => {
                const meta = emailSendStatusMeta(send);
                const inSendableState = send.status === "DRAFT" || send.status === "READY";
                const audience = send.audienceId ? audiencesById.get(send.audienceId) : undefined;
                // Mirror the server's send-now preconditions so we only offer
                // the action when it would actually dispatch.
                const readiness = evaluateSendReadiness({
                  hasAudience: Boolean(send.audienceId),
                  recipientCount: audience?.recipientCount ?? 0,
                  hasSubject: Boolean(send.subject.trim()),
                  hasContent: Boolean(send.bodyHtml || send.bodyText),
                  fromEmailProvided: Boolean(send.fromEmail),
                });
                const approvalBlocked = emailSendApprovalBlocksSending(send);
                const canSend = inSendableState && readiness.ready;
                const canEdit =
                  send.status === "DRAFT" || send.status === "READY" || send.status === "SCHEDULED";
                const actions = emailSendActions(send, canSend);
                const campaign = campaignsById.get(send.campaignId);
                const label = emailSendDisplayLabel(send, campaign, audience);
                const performance = emailPerformanceLines(send);
                return (
                  <tr key={send.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="max-w-[320px] px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#28439A]" />
                        <div className="font-semibold text-slate-950">{label}</div>
                      </div>
                      <div className="mt-1.5 break-words rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] leading-5 text-slate-500">
                        Subject template: {displayMarketingTemplateText(send.subject)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{campaign?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {send.audienceId ? audience?.name ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={meta.label} className={meta.className} dot={meta.dot} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <div>{formatDate(send.scheduledSendAt)}</div>
                      {send.scheduledSendAt ? <div className="text-[11px] text-slate-400">Planning only</div> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(send.actualSentAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{send.recipientCount}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <div className="space-y-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {performance[0]}
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                          <MousePointerClick className="h-3.5 w-3.5 text-slate-400" />
                          {performance[1]}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {actions.includes("view") ? (
                          <button
                            type="button"
                            onClick={() => onView(send)}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View
                          </button>
                        ) : null}
                        {actions.includes("edit") && canEdit ? (
                          <button
                            type="button"
                            onClick={() => onEdit(send)}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        ) : null}
                        {actions.includes("cancel") ? (
                          <button
                            type="button"
                            onClick={() => onCancel(send)}
                            className="inline-flex h-8 items-center rounded-lg border border-rose-200 px-3 text-[12px] font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            Cancel
                          </button>
                        ) : null}
                        {actions.includes("sendNow") ? (
                          <button
                            type="button"
                            onClick={() => onSendNow(send)}
                            disabled={sendingId === send.id}
                            className="inline-flex h-8 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                          >
                            {sendingId === send.id ? "Sending…" : "Send now"}
                          </button>
                        ) : inSendableState ? (
                          <span
                            className="text-[12px] text-amber-700"
                            title={approvalBlocked ? "Approval is required before sending." : `Not ready to send: ${readiness.blockingReason}`}
                          >
                            {approvalBlocked ? "Needs approval" : `Needs: ${readiness.blockingReason}`}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </SectionChrome>
      )}
    </div>
  );
}

function SendNowConfirm({
  send,
  campaign,
  audience,
  onCancel,
  onConfirm,
}: {
  send: MarketingEmailSend;
  campaign: Pick<MarketingCampaign, "name"> | null;
  audience: Pick<MarketingAudience, "name"> | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const noAudience = !send.audienceId;
  const displayLabel = emailSendDisplayLabel(send, campaign, audience);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-[18px] font-semibold text-slate-900">Send now?</h2>
        <p className="mt-2 text-[13px] text-slate-600">
          This sends <span className="font-semibold">{displayLabel}</span> immediately to{" "}
          {noAudience ? "the selected audience" : `“${audience?.name ?? "audience"}”`}. Suppressed recipients are
          excluded automatically. This cannot be undone.
        </p>
        <p className="mt-2 text-[12px] text-slate-500">
          Subject template: <span className="font-medium text-slate-700">{displayMarketingTemplateText(send.subject)}</span>
        </p>
        {noAudience ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            This send has no audience selected — the server will reject it. Create the send with an audience first.
          </p>
        ) : null}
        <p className="mt-2 text-[12px] text-slate-400">
          The result shown reflects the real server response (sent, partial, or failed).
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e]"
          >
            Send now
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailSendDetailsModal({
  send,
  campaign,
  audience,
  onClose,
}: {
  send: MarketingEmailSend;
  campaign: Pick<MarketingCampaign, "name"> | null;
  audience: Pick<MarketingAudience, "name"> | null;
  onClose: () => void;
}) {
  const performance = emailPerformanceLines(send);
  const meta = emailSendStatusMeta(send);
  const displayLabel = emailSendDisplayLabel(send, campaign, audience);
  const suppressedCount = suppressedRecipientCount(send);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email send</p>
            <h2 className="mt-1 break-words text-[20px] font-semibold text-slate-900">{displayLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <DetailItem label="Status">
            <StatusBadge label={meta.label} className={meta.className} dot={meta.dot} />
          </DetailItem>
          <DetailItem label="Campaign">{campaign?.name ?? "—"}</DetailItem>
          <DetailItem label="Audience">{audience?.name ?? "—"}</DetailItem>
          <DetailItem label="Subject template">{displayMarketingTemplateText(send.subject)}</DetailItem>
          <DetailItem label="Recipients">{send.recipientCount}</DetailItem>
          {suppressedCount > 0 ? (
            <DetailItem label="Skipped suppressed">{suppressedCount}</DetailItem>
          ) : null}
          <DetailItem label="Scheduled send">{formatDateTime(send.scheduledSendAt)}</DetailItem>
          <DetailItem label="Sent date">{formatDateTime(send.actualSentAt)}</DetailItem>
          <DetailItem label="Last attempt">{formatDateTime(send.lastAttemptedAt)}</DetailItem>
          <DetailItem label="Attempts">{send.sendAttemptCount}</DetailItem>
          <DetailItem label="Performance">{performance[0]}</DetailItem>
          <DetailItem label="Delivery issues">{performance[1]}</DetailItem>
          {send.canceledAt ? <DetailItem label="Cancelled at">{formatDateTime(send.canceledAt)}</DetailItem> : null}
          {send.failureReason ? <DetailItem label="Failure reason">{send.failureReason}</DetailItem> : null}
        </div>
        {send.previewText ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
            <span className="font-semibold text-slate-700">Short summary:</span>{" "}
            {displayMarketingTemplateText(send.previewText, "No summary")}
          </div>
        ) : null}
        {send.recipients && send.recipients.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[12px] font-semibold text-slate-700">Recipient delivery</p>
            </div>
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
              {send.recipients.map((recipient) => (
                <div key={recipient.id} className="grid gap-1 px-3 py-2 text-[12px] sm:grid-cols-[minmax(0,1fr)_120px_150px]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-700">{recipient.email}</div>
                    <div className="text-slate-400">
                      {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Frozen recipient"}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-600">{recipientStatusLabel(recipient.providerStatus)}</div>
                  <div className="text-slate-500">
                    {formatDateTime(
                      recipient.clickedAt ??
                        recipient.openedAt ??
                        recipient.deliveredAt ??
                        recipient.bouncedAt ??
                        recipient.unsubscribedAt ??
                        recipient.processedAt,
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 text-[13px] text-slate-700">{children}</div>
    </div>
  );
}

function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
      {title ? <p className="text-[14px] font-semibold text-slate-900">{title}</p> : null}
      <p className={`text-[13px] text-slate-500${title ? " mt-1" : ""}`}>{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
