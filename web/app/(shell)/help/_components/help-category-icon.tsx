import {
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarRange,
  CircleHelp,
  ClipboardCheck,
  Megaphone,
  MessagesSquare,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const categoryIcons: Readonly<Record<string, LucideIcon>> = {
  "getting-started": BookOpenCheck,
  portfolio: BriefcaseBusiness,
  "event-planning": CalendarRange,
  "people-and-program": UsersRound,
  communications: Megaphone,
  collaboration: MessagesSquare,
  workflows: ClipboardCheck,
  troubleshooting: Wrench,
};

export function HelpCategoryIcon({ categorySlug, className = "h-5 w-5" }: { categorySlug: string; className?: string }) {
  const Icon = categoryIcons[categorySlug] ?? CircleHelp;
  return <Icon className={className} aria-hidden="true" />;
}

