"use client";

import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { CalendarDays, FileCheck, FolderOpen, LayoutDashboard, MapPin, MessageSquare, UserRound } from "lucide-react";

export type SpeakerPortalSection = "overview" | "profile" | "sessions" | "presentations" | "documents" | "messages" | "onsite";

type SpeakerPortalWorkspaceProps = {
  overview: ReactNode;
  profile: ReactNode;
  sessions: ReactNode;
  presentations: ReactNode;
  documents: ReactNode;
  messages: ReactNode;
  onsite: ReactNode;
};

const SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Overview",
    title: "Your speaker workspace",
    body: "Start here for your readiness checklist, next actions, and the fastest path to anything the event team needs from you.",
    icon: LayoutDashboard,
  },
  {
    id: "profile",
    label: "Profile",
    shortLabel: "Profile",
    title: "Complete your profile",
    body: "Share your bio, headshot, contact details, and logistics notes with the event team.",
    icon: UserRound,
  },
  {
    id: "sessions",
    label: "Sessions",
    shortLabel: "Sessions",
    title: "Review your sessions",
    body: "Check your schedule, room details, and speaking role.",
    icon: CalendarDays,
  },
  {
    id: "presentations",
    label: "Presentations",
    shortLabel: "Decks",
    title: "Upload your presentation",
    body: "Send your deck or supporting files. Each upload keeps a version for the event team.",
    icon: FolderOpen,
  },
  {
    id: "documents",
    label: "Documents",
    shortLabel: "Docs",
    title: "Complete documents",
    body: "Review any agreements, forms, or signature requests from the event team.",
    icon: FileCheck,
  },
  {
    id: "messages",
    label: "Messages",
    shortLabel: "Messages",
    title: "Message the event team",
    body: "Ask questions and keep speaker-facing replies in one simple thread.",
    icon: MessageSquare,
  },
  {
    id: "onsite",
    label: "Onsite Packet",
    shortLabel: "Onsite",
    title: "Onsite Packet",
    body: "Day-of arrival, badge, green room, AV rehearsal, and help details from the event team.",
    icon: MapPin,
  },
] as const satisfies Array<{
  id: SpeakerPortalSection;
  label: string;
  shortLabel: string;
  title: string;
  body: string;
  icon: typeof LayoutDashboard;
}>;

const HASH_ALIASES: Record<string, SpeakerPortalSection> = {
  dashboard: "overview",
  overview: "overview",
  profile: "profile",
  sessions: "sessions",
  files: "presentations",
  presentations: "presentations",
  documents: "documents",
  messages: "messages",
  onsite: "onsite",
};

function sectionFromHash(): SpeakerPortalSection {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace(/^#/, "");
  return HASH_ALIASES[hash] ?? "overview";
}

export function SpeakerPortalWorkspace({
  overview,
  profile,
  sessions,
  presentations,
  documents,
  messages,
  onsite,
}: SpeakerPortalWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<SpeakerPortalSection>("overview");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setActiveSection(sectionFromHash()));
    function handleHashChange() {
      setActiveSection(sectionFromHash());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  function selectSection(section: SpeakerPortalSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", section === "overview" ? window.location.pathname : `${window.location.pathname}#${section}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleWorkspaceClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest("a[href^='#']");
    if (!link) return;
    const href = link.getAttribute("href") ?? "";
    const section = HASH_ALIASES[href.replace(/^#/, "")];
    if (!section) return;
    event.preventDefault();
    selectSection(section);
  }

  const activeMeta = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];
  const ActiveIcon = activeMeta.icon;
  const activeContent = {
    overview,
    profile,
    sessions,
    presentations,
    documents,
    messages,
    onsite,
  }[activeSection];

  return (
    <div className="space-y-5" onClickCapture={handleWorkspaceClick}>
      <nav
        className="sticky top-0 z-10 -mx-4 border-y border-slate-200 bg-white/94 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-md sm:mx-0 sm:rounded-3xl sm:border sm:px-3"
        aria-label="Speaker portal navigation"
      >
        <div className="flex gap-2 overflow-x-auto">
          {SECTIONS.map(({ id, label, shortLabel, icon: Icon }) => {
            const isActive = id === activeSection;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-3 text-[12px] font-semibold transition ${
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] ring-2 ring-slate-950/10"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {activeSection === "overview" ? (
        activeContent
      ) : (
        <section className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <ActiveIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Now viewing</p>
                <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.035em] text-slate-950 sm:text-[30px]">
                  {activeMeta.title}
                </h1>
                <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-600">{activeMeta.body}</p>
              </div>
            </div>
          </div>
          {activeContent}
        </section>
      )}
    </div>
  );
}
