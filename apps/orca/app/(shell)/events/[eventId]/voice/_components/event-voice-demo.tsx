"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  AudioLines,
  ChevronRight,
  CircleHelp,
  MessageCircleMore,
  Mic,
  MoreHorizontal,
  Plus,
  QrCode,
  Settings2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { HelpBreadcrumbs } from "@/app/(shell)/help/_components/help-breadcrumbs";
import { EVENT_MODULE_PRIMARY_CLASS } from "../../_components/event-module-header";

type EventVoiceDemoProps = { eventId: string; eventName: string };

const experiences = [
  { name: "General Feedback", description: "Ongoing · All areas", responses: "812", state: "Live", icon: Mic, tile: "bg-violet-50 text-violet-700", spark: "M2 20 L10 15 L18 20 L26 12 L34 17 L42 8 L50 14 L58 4 L66 19", action: "View insights" },
  { name: "Session Feedback", description: "After each session", responses: "356", state: "Live", icon: MessageCircleMore, tile: "bg-cyan-50 text-cyan-700", spark: "M2 20 L10 13 L18 19 L26 9 L34 16 L42 10 L50 15 L58 5 L66 18", action: "View insights" },
  { name: "Daily Event Pulse", description: "Once per day · Kiosks + QR", responses: "80", state: "Scheduled", icon: QrCode, tile: "bg-amber-50 text-amber-700", spark: "M2 19 L10 14 L18 18 L26 11 L34 17 L42 8 L50 13 L58 4 L66 17", action: "Edit" },
] as const;

const feedback = [
  { quote: "The keynote was incredible. Super inspiring!", source: "General Feedback", time: "2m ago", tone: "text-emerald-600" },
  { quote: "Great content, but more time for Q&A would be awesome.", source: "Session Feedback", time: "5m ago", tone: "text-emerald-600" },
  { quote: "The app is a bit hard to navigate.", source: "General Feedback", time: "15m ago", tone: "text-amber-600" },
  { quote: "Loving the networking opportunities!", source: "General Feedback", time: "18m ago", tone: "text-emerald-600" },
  { quote: "Room was too cold during the afternoon session.", source: "Session Feedback", time: "22m ago", tone: "text-rose-600" },
] as const;

const quickActions = [
  ["Create voice experience", Plus],
  ["Manage kiosks & QR codes", QrCode],
  ["View all insights", TrendingUp],
  ["Export responses", AudioLines],
  ["Voice settings", Settings2],
] as const;

const themes = [["Content", 32], ["Speakers", 24], ["Networking", 18], ["Logistics", 12], ["Venue", 14]] as const;

function Button({ children, primary = false, onClick, compact = false }: { children: ReactNode; primary?: boolean; compact?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#28439A]/25 ${compact ? "h-8 px-2.5" : "h-10 px-3.5"} ${primary ? `${EVENT_MODULE_PRIMARY_CLASS} border-[#28439A] hover:bg-[#20377f]` : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{children}</button>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</section>;
}

function Sparkline({ path }: { path: string }) {
  return <svg viewBox="0 0 68 24" className="h-6 w-[68px] shrink-0" aria-label="Response trend sparkline" role="img"><path d={path} fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function EventVoiceDemo({ eventId, eventName }: EventVoiceDemoProps) {
  const [notice, setNotice] = useState("");
  const showDemoNotice = () => { setNotice("Demo only"); window.setTimeout(() => setNotice(""), 2400); };

  return <div className="min-w-0 space-y-4 pb-6">
    <HelpBreadcrumbs items={[{ label: "All Events", href: "/events" }, { label: eventName, href: `/events/${eventId}` }, { label: "Voice" }]} />

    <header className="flex flex-wrap items-center justify-between gap-4 px-1 py-1">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#28439A]/8 text-[#28439A]"><AudioLines className="h-5 w-5" aria-hidden /></div>
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-[-0.01em] text-slate-950">Voice</h1><span className="rounded-full bg-[#28439A]/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#28439A]">Demo</span></div><p className="mt-0.5 text-sm text-slate-500">Capture attendee feedback and uncover what matters most.</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-2"><Button onClick={showDemoNotice}><CircleHelp className="h-3.5 w-3.5" aria-hidden />How it works</Button><Button primary onClick={showDemoNotice}><Plus className="h-3.5 w-3.5" aria-hidden />Create voice experience</Button></div>
    </header>

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,3.25fr)_minmax(270px,1fr)]">
      <main className="min-w-0 space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={AudioLines} label="Active experiences" value="3" detail="2 live · 1 scheduled" />
          <Metric icon={MessageCircleMore} label="Total responses" value="1,248" detail="18% vs last 7 days" positive />
          <Metric icon={Sparkles} label="Positive sentiment" value="74%" detail="7% vs last 7 days" positive />
          <Metric icon={TrendingUp} label="Top theme" value="Content" detail="32% of responses" />
        </div>

        <Panel>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-slate-950">Active voice experiences</h2><Button compact onClick={showDemoNotice}>View all</Button></div>
          <div className="px-3 py-2">
            {experiences.map((experience, index) => {
              const Icon = experience.icon;
              const isLive = experience.state === "Live";
              return <div key={experience.name} className={`flex min-w-0 items-center gap-3 py-2.5 ${index ? "border-t border-slate-100" : ""}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${experience.tile}`}><Icon className="h-5 w-5" aria-hidden /></div>
                <div className="min-w-[150px] flex-1"><div className={`mb-0.5 text-[10px] font-medium ${isLive ? "text-emerald-700" : "text-amber-700"}`}><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />{experience.state}</div><p className="text-xs font-semibold text-slate-900">{experience.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{experience.description}</p></div>
                <div className="hidden shrink-0 sm:block"><p className="text-xs font-semibold text-slate-900">{experience.responses}</p><p className="text-[10px] text-slate-500">responses</p></div>
                <div className="hidden lg:block"><Sparkline path={experience.spark} /></div>
                <Button compact onClick={showDemoNotice}>{experience.action}</Button>
                <button type="button" aria-label={`More actions for ${experience.name}`} onClick={showDemoNotice} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><MoreHorizontal className="h-4 w-4" aria-hidden /></button>
              </div>;
            })}
            <button type="button" onClick={showDemoNotice} className="mt-1 flex w-full flex-col items-center rounded-lg border border-dashed border-slate-200 py-3 text-center hover:border-[#28439A]/40 hover:bg-slate-50"><span className="text-xs font-semibold text-[#28439A]"><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />Create voice experience</span><span className="mt-0.5 text-[10px] text-slate-500">Choose a template or start from scratch</span></button>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-950">What attendees are talking about</h2><Button compact onClick={showDemoNotice}>View full insights</Button></div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-[0.76fr_1.45fr]">
            <div><h3 className="mb-3 text-[11px] font-semibold text-slate-700">Top themes</h3><div className="space-y-2">{themes.map(([theme, value]) => <div key={theme} className="grid grid-cols-[60px_1fr_30px] items-center gap-2 text-[10px]"><span className="text-slate-500">{theme}</span><div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#5a4df2]" style={{ width: `${value}%` }} /></div><span className="font-medium text-slate-700">{value}%</span></div>)}</div></div>
            <SentimentChart />
          </div>
        </Panel>
      </main>

      <aside className="min-w-0 space-y-3">
        <Panel>
          <div className="flex items-center justify-between px-4 py-3"><h2 className="text-sm font-semibold text-slate-950">Recent feedback</h2><button type="button" onClick={showDemoNotice} className="text-xs font-semibold text-[#28439A] hover:underline">View all</button></div>
          <div className="divide-y divide-slate-100 px-4">{feedback.map((item) => <div key={item.quote} className="flex gap-2.5 py-2.5"><MessageCircleMore className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone}`} aria-hidden /><div className="min-w-0"><p className="text-[11px] leading-4 text-slate-700">“{item.quote}”</p><p className="mt-0.5 text-[10px] text-slate-400">{item.time} · {item.source}</p></div></div>)}</div>
        </Panel>
        <Panel>
          <h2 className="px-4 py-3 text-sm font-semibold text-slate-950">Quick actions</h2>
          <div className="divide-y divide-slate-100 px-4">{quickActions.map(([label, Icon]) => <button key={label} type="button" onClick={showDemoNotice} className="flex w-full items-center gap-2.5 py-2.5 text-left text-[11px] font-medium text-slate-700 hover:text-[#28439A]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-50 text-[#5146e7]"><Icon className="h-3.5 w-3.5" aria-hidden /></span><span className="min-w-0 flex-1">{label}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden /></button>)}</div>
        </Panel>
      </aside>
    </div>

    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50">{notice ? <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg">{notice}</div> : null}</div>
  </div>;
}

function Metric({ icon: Icon, label, value, detail, positive = false }: { icon: typeof AudioLines; label: string; value: string; detail: string; positive?: boolean }) {
  return <Panel className="min-w-0 p-3"><div className="flex gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#28439A]/8 text-[#28439A]"><Icon className="h-4 w-4" aria-hidden /></span><div className="min-w-0"><p className="truncate text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-lg font-semibold leading-5 text-slate-950">{value}</p><p className={`mt-1 text-[10px] ${positive ? "text-emerald-700" : "text-slate-500"}`}>{positive ? "↑ " : ""}{detail}</p></div></div></Panel>;
}

function SentimentChart() {
  const labels = ["May 6", "May 7", "May 8", "May 9", "May 10", "May 11", "May 12"];
  return <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[11px] font-semibold text-slate-700">Sentiment over time</h3><div className="flex gap-2 text-[9px]"><span className="text-emerald-700">— Positive</span><span className="text-slate-400">— Neutral</span><span className="text-rose-500">— Negative</span></div></div><svg viewBox="0 0 520 130" className="block h-auto w-full" role="img" aria-label="Static sentiment chart showing positive, neutral, and negative attendee feedback from May 6 through May 12"><path d="M35 10V100H512" fill="none" stroke="#e2e8f0" /><path d="M35 27 L114 38 L194 26 L273 28 L353 20 L432 29 L512 29" fill="none" stroke="#10b981" strokeWidth="2" /><path d="M35 63 L114 73 L194 67 L273 67 L353 64 L432 75 L512 69" fill="none" stroke="#94a3b8" strokeWidth="2" /><path d="M35 88 L114 90 L194 80 L273 80 L353 83 L432 94 L512 94" fill="none" stroke="#fb4b67" strokeWidth="2" />{[27,38,26,28,20,29,29].map((y, index) => <circle key={labels[index]} cx={35 + index * 79.5} cy={y} r="2.5" fill="#10b981" />)}<text x="2" y="15" className="fill-slate-400 text-[8px]">100%</text><text x="12" y="66" className="fill-slate-400 text-[8px]">50%</text><text x="18" y="102" className="fill-slate-400 text-[8px]">0%</text>{labels.map((label, index) => <text key={label} x={35 + index * 79.5} y="121" textAnchor={index === 6 ? "end" : index === 0 ? "start" : "middle"} className="fill-slate-400 text-[8px]">{label}</text>)}</svg></div>;
}
