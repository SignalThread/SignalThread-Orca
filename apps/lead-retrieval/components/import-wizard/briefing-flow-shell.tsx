"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  batchBriefingsPath,
  batchBriefingsKnowledgePath,
  batchBriefingsReviewPath,
} from "@/lib/import-wizard/paths";

/** Two-step flow: Prep → Review. `knowledge` is an off-step hub (batch-wide inputs). */
export type BriefingFlowStep = "readiness" | "review" | "knowledge";

const STEPS: { id: Exclude<BriefingFlowStep, "knowledge">; label: string; number: number }[] = [
  { id: "readiness", label: "Prepare", number: 1 },
  { id: "review", label: "Review", number: 2 },
];

function stepHref(step: Exclude<BriefingFlowStep, "knowledge">, batchId: string): string {
  switch (step) {
    case "readiness":
      return batchBriefingsPath(batchId);
    case "review":
      return batchBriefingsReviewPath(batchId);
  }
}

export function BriefingFlowShell({
  batchId,
  currentStep,
  children,
}: {
  batchId: string;
  currentStep: BriefingFlowStep;
  children: ReactNode;
}) {
  const currentIdx =
    currentStep === "knowledge" ? -1 : STEPS.findIndex((s) => s.id === currentStep);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6" data-testid="briefing-flow-shell">
      <nav
        className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:px-5 sm:py-3"
        aria-label="Briefing flow"
        data-testid="briefing-flow-stepper"
      >
        <ol className="m-0 flex list-none items-center gap-0 p-0">
          {STEPS.map((step, i) => {
            const isCurrent = step.id === currentStep;
            const isComplete = i < currentIdx;
            return (
              <li key={step.id} className="flex items-center">
                {i > 0 ? (
                  <div
                    className={`mx-1.5 h-0.5 w-8 rounded-full sm:mx-2.5 sm:w-12 ${isComplete ? "bg-indigo-400" : "bg-slate-200"}`}
                    aria-hidden="true"
                  />
                ) : null}
                <Link
                  href={stepHref(step.id, batchId)}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition sm:px-3 sm:py-2 ${
                    isCurrent
                      ? "bg-indigo-100 text-indigo-800"
                      : isComplete
                        ? "text-indigo-600 hover:bg-indigo-50"
                        : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                  data-testid={`briefing-flow-step-${step.id}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold sm:h-7 sm:w-7 sm:text-xs ${
                      isCurrent
                        ? "bg-indigo-600 text-white shadow-sm"
                        : isComplete
                          ? "bg-indigo-500 text-white"
                          : "border border-slate-300 bg-white text-slate-400"
                    }`}
                  >
                    {isComplete ? "✓" : step.number}
                  </span>
                  <span className="text-xs sm:text-sm">{step.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-sm sm:px-4">
        <span className="text-slate-600">
          <span className="font-semibold text-slate-800">Briefing Knowledge</span>
          <span className="hidden sm:inline"> — batch strategy, URLs, documents, and notes</span>
        </span>
        <Link
          href={batchBriefingsKnowledgePath(batchId)}
          className="shrink-0 font-semibold text-indigo-700 underline-offset-2 hover:underline"
          data-testid="briefing-knowledge-link"
        >
          Manage →
        </Link>
      </div>

      {children}
    </section>
  );
}
