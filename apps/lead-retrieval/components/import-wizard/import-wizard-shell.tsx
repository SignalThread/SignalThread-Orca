import type { ReactNode } from "react";
import { IMPORT_WIZARD_STEPS, type ImportWizardStepDefinition } from "@/lib/import-wizard/steps";
import { PageContainer, PageHeader } from "@/components/layout/page-header";

export type ImportWizardShellProps = {
  /** 0-based index into IMPORT_WIZARD_STEPS */
  currentStepIndex: number;
  /** After a successful import, use a lighter stepper so the success state stays the hero. */
  stepperTone?: "default" | "finished";
  /**
   * Heading for the active step. Omit to use IMPORT_WIZARD_STEPS[safeIndex].title (canonical).
   * Pass only when intentionally overriding the catalog title for a special case.
   */
  title?: string;
  subtitle?: string;
  /** Small row above the title (e.g. wizard label + batch id) */
  eyebrowSlot?: ReactNode;
  /** Right side of the header row (e.g. export) */
  headerActionsSlot?: ReactNode;
  children: ReactNode;
  /** Typically `<ImportWizardFooter />` or a custom footer slot. Omit when the active step owns compact actions. */
  footer?: ReactNode | null;
  className?: string;
  /**
   * When true (e.g. import complete), stepper card, body, and footer share one centered column (~760px)
   * so the hero, CTAs, and tertiary actions align to a single axis.
   */
  narrowCenteredLayout?: boolean;
};

function StepIndicator({
  step,
  index,
  currentStepIndex,
  finished,
}: {
  step: ImportWizardStepDefinition;
  index: number;
  currentStepIndex: number;
  finished: boolean;
}) {
  const isComplete = finished || index < currentStepIndex;
  const isCurrent = !finished && index === currentStepIndex;

  return (
    <div className="import-wizard-step flex min-w-0 flex-1 flex-col items-center gap-1 text-center sm:gap-1.5">
      <div
        className={`flex shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
          finished
            ? "h-7 w-7 sm:h-8 sm:w-8"
            : "h-9 w-9 sm:h-10 sm:w-10 sm:text-sm"
        } ${
          finished && isComplete
            ? "border border-emerald-200/90 bg-emerald-50 text-emerald-700"
            : isComplete
              ? "bg-accent text-white shadow-sm"
              : isCurrent
                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md ring-2 ring-indigo-200 ring-offset-2 ring-offset-card"
                : "border border-slate-200 bg-white text-slate-400"
        }`}
        aria-hidden="true"
      >
        {isComplete ? "✓" : index + 1}
      </div>
      <span
        className={`w-full px-0.5 text-[10px] font-semibold leading-tight sm:text-xs ${
          finished
            ? "text-slate-500"
            : isCurrent
              ? "text-indigo-700"
              : isComplete
                ? "text-slate-600"
                : "text-slate-400"
        }`}
      >
        <span className="line-clamp-2">{step.label}</span>
      </span>
    </div>
  );
}

function StepConnector({ complete, finished }: { complete: boolean; finished: boolean }) {
  return (
    <div
      className="import-wizard-connector mx-0.5 h-0.5 min-w-[8px] flex-1 sm:mx-1 sm:min-w-[12px]"
      aria-hidden="true"
    >
      <div
        className={`h-full rounded-full ${
          complete ? (finished ? "bg-emerald-200/90" : "bg-accent/80") : "bg-slate-200"
        }`}
      />
    </div>
  );
}

/**
 * Reusable layout for the pre-event import workflow. Presentational only — no data fetching.
 * Groups the horizontal stepper and step header in one card so the flow reads as one task.
 *
 * Layout contract: content height follows children (no flex-grow middle by default), so short steps keep
 * the sticky footer close to the work area. Dense steps should manage their own overflow (e.g. min-h-0 + overflow-auto inside children).
 */
export function ImportWizardShell({
  currentStepIndex,
  stepperTone = "default",
  title,
  subtitle,
  eyebrowSlot,
  headerActionsSlot,
  children,
  footer,
  className = "",
  narrowCenteredLayout = false,
}: ImportWizardShellProps) {
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), IMPORT_WIZARD_STEPS.length - 1);
  const active = IMPORT_WIZARD_STEPS[safeIndex];
  const resolvedTitle = title ?? active?.title ?? "";
  const finished = stepperTone === "finished";

  const column = (
    <>
        {/* Head: stepper + title — single contained card for continuity */}
        <div className="rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div
            className={`import-wizard-stepper border-b px-3 sm:px-5 ${
              finished
                ? "border-slate-200/70 bg-slate-50/40 py-2 sm:py-2.5"
                : "border-slate-200/90 py-2.5 sm:py-3"
            }`}
            data-testid="import-wizard-stepper"
            data-stepper-tone={stepperTone}
          >
            <p className="mb-2 text-center text-xs font-medium text-slate-500 sm:mb-3 sm:hidden">
              {finished ? (
                <>
                  <span aria-hidden="true">All steps complete</span>
                  <span className="sr-only">Import wizard finished</span>
                </>
              ) : (
                <>
                  Step {safeIndex + 1} of {IMPORT_WIZARD_STEPS.length}
                  <span className="sr-only"> — {active?.title}</span>
                </>
              )}
            </p>
            <nav aria-label="Import wizard steps" className="relative">
              <ol className="m-0 flex list-none flex-row flex-nowrap items-stretch justify-between gap-0 overflow-x-auto p-0 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
                {IMPORT_WIZARD_STEPS.map((step, index) => (
                  <li
                    key={step.id}
                    className="flex min-w-[4.25rem] flex-1 items-center sm:min-w-0"
                    aria-current={finished ? undefined : index === safeIndex ? "step" : undefined}
                    data-testid={`import-wizard-step-${index}`}
                    data-state={
                      finished ? "complete" : index === safeIndex ? "current" : index < safeIndex ? "complete" : "upcoming"
                    }
                  >
                    {index > 0 ? (
                      <StepConnector complete={finished || safeIndex >= index} finished={finished} />
                    ) : null}
                    <StepIndicator
                      step={step}
                      index={index}
                      currentStepIndex={safeIndex}
                      finished={finished}
                    />
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <div className={`px-4 sm:px-6 ${finished ? "py-3 sm:py-4" : "py-4 sm:py-5"}`}>
            <PageHeader
              variant="panel"
              align={narrowCenteredLayout ? "center" : "left"}
              eyebrow={eyebrowSlot}
              eyebrowStyle="plain"
              title={resolvedTitle}
              subtitle={subtitle}
              actions={headerActionsSlot}
            />
          </div>
        </div>

        {/* Main work area — natural height; no flex-grow gap above footer on short steps */}
        <div
          className={`import-wizard-shell-content min-h-0 ${
            narrowCenteredLayout ? "mt-6 md:mt-8" : "mt-3 md:mt-4"
          }`}
          data-testid="import-wizard-content"
        >
          {children}
        </div>

        {footer ? (
          <div
            className={`import-wizard-shell-footer sticky bottom-0 z-20 md:px-5 ${
              narrowCenteredLayout
                ? "mt-8 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] supports-[backdrop-filter]:bg-slate-50/80"
                : "mt-4 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-card/90"
            }`}
          >
            {footer}
          </div>
        ) : null}
    </>
  );

  return (
    <section
      className={`import-wizard-shell ${className}`.trim()}
      data-testid="import-wizard-shell"
      data-current-step-index={safeIndex}
      data-current-step-id={active?.id}
      data-title-source={title != null ? "override" : "canonical"}
      data-layout={narrowCenteredLayout ? "narrow-centered" : "default"}
    >
      {/* Import Wizard is a nested task panel, so it uses the shared container with an intentional narrow max width. */}
      <PageContainer className="max-w-5xl">
        {narrowCenteredLayout ? (
          <div className="mx-auto w-full max-w-[760px]">{column}</div>
        ) : (
          column
        )}
      </PageContainer>
    </section>
  );
}
