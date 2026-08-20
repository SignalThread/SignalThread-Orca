"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { resolveContextualHelp } from "@/lib/help/contextual-help";
import { useEventTerminology } from "@/components/event-terminology-context";
import { applyOrcaTerminologyToText } from "@/lib/orca-terminology-contract";

export function ContextualHelpAction({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const terms = useEventTerminology();
  const resolution = resolveContextualHelp(pathname, searchParams);
  if (!resolution) return null;
  const label = applyOrcaTerminologyToText(resolution.label, terms);
  const ariaLabel = applyOrcaTerminologyToText(resolution.ariaLabel, terms);

  return (
    <Link
      href={resolution.href}
      aria-label={ariaLabel}
      title={label}
      className={[
        "inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-[#28439A]/30 hover:text-[#28439A] focus:outline-none focus:ring-2 focus:ring-[#28439A]/20",
        className,
      ].join(" ")}
    >
      <CircleHelp className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}
