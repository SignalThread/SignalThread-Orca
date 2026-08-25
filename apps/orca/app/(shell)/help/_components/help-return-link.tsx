import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContextualHelpMapping, getSafeHelpReturnTarget } from "@/lib/help/contextual-help";

export function HelpReturnLink({ from }: { from?: string | string[] }) {
  const rawFrom = Array.isArray(from) ? from[0] : from;
  const returnPath = getSafeHelpReturnTarget(rawFrom);
  if (!returnPath) return null;
  const mapping = getContextualHelpMapping(returnPath);
  const label = mapping ? `Back to ${mapping.returnLabel}` : "Back to Orca";

  return (
    <Link href={returnPath} className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-md text-xs font-semibold text-[#28439A] hover:underline focus:outline-none focus:ring-2 focus:ring-[#28439A]/20">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{label}
    </Link>
  );
}
