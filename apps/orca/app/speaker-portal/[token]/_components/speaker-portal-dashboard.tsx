import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  FolderOpen,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { SpeakerFileRecord } from "@/src/server/services/speaker-files";
import type { SpeakerDocumentRequestPortalRecord } from "@/src/server/services/speaker-documents";
import type { SpeakerMessagePortalRecord } from "@/src/server/services/speaker-comms";
import type { SpeakerPortalOnsite, SpeakerPortalView } from "@/src/server/services/speaker-portal";
import { buildSpeakerPortalTheme } from "./speaker-portal-theme";

type SpeakerPortalDashboardProps = {
  view: SpeakerPortalView;
  files: SpeakerFileRecord[];
  documents: SpeakerDocumentRequestPortalRecord[];
  messages: SpeakerMessagePortalRecord[];
};

type RequirementStatus = "complete" | "attention" | "review";

type PortalRequirement = {
  title: string;
  detail: string;
  href: string;
  status: RequirementStatus;
};

const NAV_ITEMS = [
  { href: "#overview", label: "Overview", icon: Sparkles },
  { href: "#profile", label: "Profile", icon: UserRound },
  { href: "#sessions", label: "Sessions", icon: CalendarDays },
  { href: "#presentations", label: "Presentations", icon: FolderOpen },
  { href: "#documents", label: "Documents", icon: FileCheck },
  { href: "#messages", label: "Messages", icon: MessageSquare },
  { href: "#onsite", label: "Onsite Packet", icon: MapPin },
] as const;

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function hasOnsiteInfo(onsite: SpeakerPortalOnsite | null): boolean {
  if (!onsite) return false;
  return Object.values(onsite).some((value) => hasText(value));
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Date coming soon";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date coming soon";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function statusLabel(status: RequirementStatus): string {
  if (status === "complete") return "Complete";
  if (status === "review") return "Pending review";
  return "Needs attention";
}

function requirementStatusClasses(status: RequirementStatus): string {
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "review") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function buildRequirements(view: SpeakerPortalView, files: SpeakerFileRecord[], documents: SpeakerDocumentRequestPortalRecord[]): PortalRequirement[] {
  const { speaker } = view;
  const profileComplete = hasText(speaker.name) && hasText(speaker.title) && hasText(speaker.company) && hasText(speaker.bio);
  const headshotComplete = hasText(speaker.headshotUrl);
  const logisticsComplete = hasText(speaker.avNeeds) && hasText(speaker.travelNeeds) && hasText(speaker.dietaryRestrictions);
  const slideFiles = files.filter((file) => file.kind === "SLIDES");
  const latestDeck = slideFiles[0] ?? null;
  const outstandingDocuments = documents.filter((request) => !["APPROVED", "IN_REVIEW", "SUBMITTED"].includes(request.status));

  return [
    {
      title: "Complete your profile",
      detail: view.pendingSubmission
        ? "Your latest profile update is with the event team."
        : profileComplete
          ? "Bio, title, and company are ready."
          : "Add your title, company, and speaker bio.",
      href: "#profile",
      status: view.pendingSubmission ? "review" : profileComplete ? "complete" : "attention",
    },
    {
      title: "Upload a headshot",
      detail: headshotComplete ? "Headshot is on file." : "Add a speaker photo for event materials.",
      href: "#profile",
      status: headshotComplete ? "complete" : "attention",
    },
    {
      title: "Upload presentation deck",
      detail: latestDeck
        ? `${latestDeck.filename} is ${latestDeck.reviewStatus.replaceAll("_", " ").toLowerCase()}.`
        : "Upload slides or presentation materials.",
      href: "#presentations",
      status: latestDeck
        ? ["APPROVED", "FINAL"].includes(latestDeck.reviewStatus)
          ? "complete"
          : "review"
        : "attention",
    },
    {
      title: "Respond to document requests",
      detail: documents.length === 0
        ? "No requested documents yet."
        : outstandingDocuments.length === 0
          ? "Document requests are handled."
          : `${outstandingDocuments.length} document request${outstandingDocuments.length === 1 ? "" : "s"} need a response.`,
      href: "#documents",
      status: documents.length === 0 || outstandingDocuments.length === 0 ? "complete" : "attention",
    },
    {
      title: "Review assigned sessions",
      detail: view.sessions.length > 0
        ? `${view.sessions.length} session${view.sessions.length === 1 ? "" : "s"} assigned.`
        : "Your sessions will appear here when ready.",
      href: "#sessions",
      status: view.sessions.length > 0 ? "complete" : "attention",
    },
    {
      title: "Add AV, travel, and dietary info",
      detail: logisticsComplete ? "Logistics details are on file." : "Tell the team what you need onsite.",
      href: "#profile",
      status: logisticsComplete ? "complete" : "attention",
    },
    {
      title: "Check onsite instructions",
      detail: hasOnsiteInfo(view.onsite) ? "Onsite packet is available." : "The event team has not posted onsite details yet.",
      href: "#onsite",
      status: hasOnsiteInfo(view.onsite) ? "complete" : "attention",
    },
  ];
}

export function SpeakerPortalDashboard({ view, files, documents, messages }: SpeakerPortalDashboardProps) {
  const theme = buildSpeakerPortalTheme(view);
  const requirements = buildRequirements(view, files, documents);
  const openRequirements = requirements.filter((requirement) => requirement.status !== "complete");
  const completedRequirements = requirements.length - openRequirements.length;
  const slideFiles = files.filter((file) => file.kind === "SLIDES");
  const latestMessage = messages[messages.length - 1] ?? null;
  const nextSession = view.sessions[0] ?? null;

  return (
    <section id="overview" className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.28),transparent_28%),linear-gradient(135deg,#0F172A_0%,#1E3A8A_48%,#0F766E_100%)] px-5 py-6 text-white sm:px-8 sm:py-8">
        <div className="absolute right-[-5rem] top-[-6rem] h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/85">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure speaker workspace
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/80">
                {theme.eventName}
              </span>
            </div>
            <h1 className="mt-5 max-w-2xl text-[32px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[46px]">
              Welcome, {theme.speakerName}.
            </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-6 text-white/78">
              Your speaker workspace brings profile updates, sessions, presentations, documents, messages, and onsite details into one place.
            </p>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/12 p-4 backdrop-blur-md lg:min-w-[280px]">
            <div className="flex items-center gap-3">
              {view.speaker.headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.speaker.headshotUrl} alt="" className="h-14 w-14 rounded-2xl object-cover ring-2 ring-white/25" />
              ) : (
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-[17px] font-bold">
                  {theme.speakerInitials}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{view.speaker.name}</p>
                <p className="mt-1 truncate text-[12px] text-white/70">
                  {[view.speaker.title, view.speaker.company].filter(Boolean).join(" · ") || "Speaker profile"}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-white/65">Readiness</p>
              <p className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">{completedRequirements}/{requirements.length}</p>
              <p className="text-[12px] text-white/70">requirements complete</p>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-6" aria-label="Speaker portal sections">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Icon className="h-3.5 w-3.5 text-slate-500" />
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <DashboardStat label="Profile" value={view.pendingSubmission ? "In review" : requirements[0]?.status === "complete" ? "Ready" : "Needs info"} />
            <DashboardStat label="Presentation" value={slideFiles.length > 0 ? `${slideFiles.length} file${slideFiles.length === 1 ? "" : "s"}` : "Upload needed"} />
            <DashboardStat label="Documents" value={documents.length > 0 ? `${documents.length} request${documents.length === 1 ? "" : "s"}` : "Clear"} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Requirements</p>
                <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-slate-950">Your readiness checklist</h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-600">
                {openRequirements.length === 0 ? "All clear" : `${openRequirements.length} next action${openRequirements.length === 1 ? "" : "s"}`}
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {requirements.map((requirement) => (
                <a
                  key={requirement.title}
                  href={requirement.href}
                  className="group grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${requirementStatusClasses(requirement.status)}`}>
                    {requirement.status === "complete" ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-950">{requirement.title}</span>
                    <span className="mt-0.5 block text-[12px] text-slate-500">{requirement.detail}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${requirementStatusClasses(requirement.status)}`}>
                      {statusLabel(requirement.status)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <NextActionCard requirements={openRequirements} />
          <SummaryCard
            title="Assigned sessions"
            href="#sessions"
            action="Review sessions"
            body={nextSession ? `${nextSession.sessionName ?? "Untitled session"} · ${formatDate(nextSession.dayDate)}` : "No sessions assigned yet."}
          />
          <SummaryCard
            title="Messages"
            href="#messages"
            action="Message the event team"
            body={latestMessage ? `${latestMessage.senderType === "PLANNER" ? "Event team" : "You"}: ${latestMessage.body}` : "No messages yet."}
          />
          <SummaryCard
            title="Onsite packet"
            href="#onsite"
            action="Review onsite info"
            body={hasOnsiteInfo(view.onsite) ? "Arrival, badge, green room, and AV details are available." : "Onsite instructions will appear when the event team publishes them."}
          />
        </aside>
      </div>
    </section>
  );
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{value}</p>
    </div>
  );
}

function NextActionCard({ requirements }: { requirements: PortalRequirement[] }) {
  const nextRequirements = requirements.slice(0, 3);
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Next actions</p>
      {nextRequirements.length > 0 ? (
        <div className="mt-3 space-y-2">
          {nextRequirements.map((requirement) => (
            <a key={requirement.title} href={requirement.href} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-slate-800 hover:bg-slate-100">
              {requirement.title}
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-3 text-[13px] font-semibold text-emerald-700">
          You are all caught up.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[14px] font-semibold text-slate-950">{title}</p>
      <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-slate-600">{body}</p>
      <a href={href} className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold text-[#28439A] hover:text-[#172554]">
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
