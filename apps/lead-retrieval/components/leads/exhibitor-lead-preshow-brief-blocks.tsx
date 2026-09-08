import type { ReactNode } from "react";
import {
  Brain,
  Compass,
  HelpCircle,
  LineChart,
  Mountain,
  Radio,
  Repeat2,
  UserSearch
} from "lucide-react";
import type {
  BriefSection,
  BriefSectionCardItem,
  BriefSectionListItem,
  BriefSectionQuestionItem,
  BriefSectionSignalItem
} from "@/lib/leads/exhibitor-lead-preshow-brief-sections";

const LIST_ICONS = [UserSearch, LineChart, Brain, Compass, Radio, Mountain] as const;
const CARD_ICONS = [Repeat2, Compass, Mountain, LineChart, Brain, UserSearch] as const;

const QUESTION_PROMPT_STYLES: ReadonlyArray<{
  label: string;
  borderClass: string;
  typeClass: string;
}> = [
  { label: "Direct insight", borderClass: "border-l-violet-600", typeClass: "text-violet-800" },
  { label: "Growth lever", borderClass: "border-l-sky-500", typeClass: "text-sky-900" },
  { label: "Risk discovery", borderClass: "border-l-indigo-700", typeClass: "text-indigo-950" }
];

const SIGNAL_DOT: ReadonlyArray<{ dotClass: string }> = [
  { dotClass: "bg-red-500" },
  { dotClass: "bg-violet-500" },
  { dotClass: "bg-pink-400" },
  { dotClass: "bg-amber-500" },
  { dotClass: "bg-sky-500" }
];

/** Single reusable section chrome: title row + content. Spacing between sections comes from the parent stack. */
export function SectionBlock({
  sectionId,
  title,
  headerRight,
  headerIcon,
  children
}: {
  sectionId: string;
  title: string;
  headerRight?: ReactNode;
  headerIcon?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `preshow-section-${sectionId}`;
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {headerIcon}
          <h2 id={headingId} className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </h2>
        </div>
        {headerRight}
      </div>
      {children}
    </section>
  );
}

/** One card per bullet; stacks vertically with gap. */
export function BulletList({ items }: { items: BriefSectionListItem[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((row, index) => {
        const Icon = LIST_ICONS[index % LIST_ICONS.length]!;
        return (
          <li
            key={"list-" + index + "-" + row.body.slice(0, 24)}
            className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200/80">
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              {row.label ? <p className="text-sm font-bold text-slate-900">{row.label}</p> : null}
              <p className={"text-sm leading-relaxed text-slate-600 " + (row.label ? "mt-1" : "")}>
                {row.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Talking-point cards: full-width stack, natural height per card. */
export function CardStack({ items }: { items: BriefSectionCardItem[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((card, index) => {
        const Icon = CARD_ICONS[index % CARD_ICONS.length]!;
        return (
          <li
            key={"card-" + index + "-" + card.title}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <Icon className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            <p className="mt-3 text-sm font-bold text-slate-900">{card.title}</p>
            <p className="mt-2 text-[13px] font-normal leading-[1.45] text-slate-600">{card.body}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionStack({ items }: { items: BriefSectionQuestionItem[] }) {
  const allOpen = items.length > 0 && items.every((i) => i.variant === "open");

  if (allOpen) {
    const opens = items.filter((i): i is Extract<BriefSectionQuestionItem, { variant: "open" }> => i.variant === "open");
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {opens.map((item, index) => (
            <li key={"open-" + index + "-" + item.title.slice(0, 12)} className="px-4 py-4 sm:px-5">
              <p className="text-sm font-bold text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm italic leading-relaxed text-slate-600">
                {item.quote ? `“${item.quote}”` : "—"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => {
        if (item.variant === "open") {
          return (
            <li
              key={"open-" + index + "-" + item.title.slice(0, 12)}
              className="rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-3 shadow-sm"
            >
              <p className="text-sm font-bold text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm italic leading-relaxed text-slate-600">
                {item.quote ? `“${item.quote}”` : "—"}
              </p>
            </li>
          );
        }
        const meta = QUESTION_PROMPT_STYLES[index % QUESTION_PROMPT_STYLES.length]!;
        return (
          <li
            key={"prompt-" + index + "-" + item.text.slice(0, 20)}
            className={
              "rounded-xl border border-slate-200 border-l-4 bg-white py-3 pl-4 pr-3 shadow-sm " +
              meta.borderClass
            }
          >
            <p className={"text-[10px] font-bold uppercase tracking-[0.12em] " + meta.typeClass}>
              {meta.label}
            </p>
            <p className="mt-2 text-sm font-medium leading-snug text-slate-800">&ldquo;{item.text}&rdquo;</p>
          </li>
        );
      })}
    </ul>
  );
}

/** One row per signal; each row is a light card for scanability. */
export function SignalList({ items }: { items: BriefSectionSignalItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((s, i) => {
        const dot = SIGNAL_DOT[i % SIGNAL_DOT.length]!;
        return (
          <li
            key={"sig-" + i + "-" + s.text.slice(0, 20)}
            className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-snug shadow-sm"
          >
            <span className={"mt-0.5 h-2 w-2 shrink-0 rounded-full " + dot.dotClass} aria-hidden />
            <span className="min-w-0 flex-1 text-slate-700">{s.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function sectionHeaderIcon(section: BriefSection): ReactNode {
  if (section.type === "signals") {
    return <Radio className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />;
  }
  if (section.type === "questions" && section.items.some((i) => i.variant === "open")) {
    return <HelpCircle className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />;
  }
  return null;
}

export function BriefSectionBody({ section }: { section: BriefSection }) {
  switch (section.type) {
    case "list":
      return <BulletList items={section.items} />;
    case "cards":
      return <CardStack items={section.items} />;
    case "questions":
      return <QuestionStack items={section.items} />;
    case "signals":
      return <SignalList items={section.items} />;
    default:
      return null;
  }
}

export function BriefSectionView({
  section,
  headerRight
}: {
  section: BriefSection;
  headerRight?: ReactNode;
}) {
  return (
    <SectionBlock
      sectionId={section.id}
      title={section.title}
      headerRight={headerRight}
      headerIcon={sectionHeaderIcon(section)}
    >
      <BriefSectionBody section={section} />
    </SectionBlock>
  );
}
