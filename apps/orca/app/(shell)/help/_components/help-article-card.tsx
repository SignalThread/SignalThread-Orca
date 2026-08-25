import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { HelpArticle } from "@/lib/help/types";
import { HelpStatusBadge } from "./help-status";

export function HelpArticleCard({ article, compact = false }: { article: HelpArticle; compact?: boolean }) {
  return (
    <Link
      href={`/help/article/${article.slug}`}
      className="group flex h-full min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/30 transition hover:border-[#28439A]/35 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#28439A]/25"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase text-slate-500">{article.category}</p>
        <HelpStatusBadge status={article.status} />
      </div>
      <h3 className="mt-2 break-words text-[14px] font-semibold leading-5 text-slate-950 group-hover:text-[#28439A]">{article.title}</h3>
      {!compact ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{article.description}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{article.estimatedReadTime} min</span>
        <ArrowRight className="h-4 w-4 text-[#28439A] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
      </div>
    </Link>
  );
}
