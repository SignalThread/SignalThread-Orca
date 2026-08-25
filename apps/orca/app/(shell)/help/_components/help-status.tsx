import { Clock3, Construction, Eye } from "lucide-react";
import type { HelpArticleStatus } from "@/lib/help/types";

export function HelpStatusBadge({ status }: { status: HelpArticleStatus }) {
  if (status === "published" || status === "internal") return null;
  const preview = status === "preview";
  return (
    <span className={[
      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase",
      preview ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-800",
    ].join(" ")}>
      {preview ? <Eye className="h-3 w-3" aria-hidden="true" /> : <Clock3 className="h-3 w-3" aria-hidden="true" />}
      {status.replace("-", " ")}
    </span>
  );
}

export function HelpStatusCallout({ status }: { status: HelpArticleStatus }) {
  if (status === "published" || status === "internal") return null;
  const preview = status === "preview";
  return (
    <aside className={[
      "mt-6 flex gap-3 border-l-4 px-4 py-3",
      preview ? "border-blue-400 bg-blue-50/70" : "border-amber-400 bg-amber-50/70",
    ].join(" ")} aria-label={`${status.replace("-", " ")} article status`}>
      <span className={preview ? "text-blue-700" : "text-amber-800"} aria-hidden="true">
        {preview ? <Eye className="h-5 w-5" /> : <Construction className="h-5 w-5" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-950">{preview ? "This feature is in Preview" : "This feature is Coming Soon"}</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {preview
            ? "The documented surface is available for evaluation and may change as Orca continues to refine it."
            : "This guide describes a visible or planned workflow that is not generally available in production yet."}
        </p>
      </div>
    </aside>
  );
}
