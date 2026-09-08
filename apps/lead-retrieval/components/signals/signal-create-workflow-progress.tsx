"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { id: 0, label: "Category" },
  { id: 1, label: "Preview" },
  { id: 2, label: "Starter" },
  { id: 3, label: "Definition" },
  { id: 4, label: "Scope" },
  { id: 5, label: "Advanced" }
] as const;

/** Single accent for the active step only — product blue, not signal category hues. */
const ACCENT = {
  pill: "bg-blue-600 text-white shadow-sm",
  badge: "bg-white text-blue-600"
} as const;

function stepTone(activeStep: number, index: number) {
  const isActive = activeStep === index;
  const isDone = activeStep > index;
  if (isActive) return "active" as const;
  if (isDone) return "done" as const;
  return "upcoming" as const;
}

/** Tracks which `[data-workflow-step]` section is nearest the viewport focus (presentation only). */
export function useCreateWorkflowActiveStep() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    let raf = 0;

    const update = () => {
      const nodes = [...document.querySelectorAll("[data-workflow-step]")] as HTMLElement[];
      if (nodes.length === 0) return;
      const focusY = window.innerHeight * 0.33;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      nodes.forEach((el) => {
        const idx = Number(el.dataset.workflowStep);
        if (Number.isNaN(idx)) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        const anchor = rect.top + Math.min(rect.height * 0.2, 80);
        const dist = Math.abs(anchor - focusY);
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      });
      setActiveStep(best);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    const t0 = window.setTimeout(update, 50);
    const t1 = window.setTimeout(update, 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return activeStep;
}

export function SignalCreateWorkflowProgress({ activeStep }: { activeStep: number }) {
  return (
    <div
      className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm ring-1 ring-slate-900/[0.03] sm:px-4 sm:py-2.5"
      aria-label="Builder steps"
    >
      <div className="mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Build workflow</p>
      </div>

      <div
        className="flex w-full flex-nowrap items-center justify-between gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5 sm:overflow-visible sm:pb-0"
        role="list"
      >
        {STEPS.map((step, i) => {
          const tone = stepTone(activeStep, i);
          const isActive = tone === "active";

          return (
            <div
              key={step.id}
              role="listitem"
              className={`flex min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-full px-1.5 py-1 sm:gap-2 sm:px-2.5 sm:py-1.5 ${
                isActive ? ACCENT.pill : ""
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums leading-none ${
                  isActive
                    ? ACCENT.badge
                    : tone === "done"
                      ? "border border-slate-300/90 bg-white text-slate-600"
                      : "border border-slate-200 bg-white text-slate-400"
                }`}
                aria-hidden
              >
                {i + 1}
              </span>
              <span
                className={`min-w-0 truncate text-center text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px] sm:tracking-wide ${
                  isActive ? "text-white" : tone === "done" ? "text-slate-600" : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
