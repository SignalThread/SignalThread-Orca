import type { ReactNode } from "react";
import Link from "next/link";

/** Back navigation: exactly one of link or client handler — never both, never neither. */
type BackNav = { backHref: string; onBack?: never } | { onBack: () => void; backHref?: never };

type ContinueDisabled = BackNav & {
  continueDisabled: true;
  continueLabel?: string;
};

type ContinueLink = BackNav & {
  continueHref: string;
  onContinue?: never;
  continueLabel?: string;
};

type ContinueButton = BackNav & {
  onContinue: () => void;
  continueHref?: never;
  continueLabel?: string;
};

export type ImportWizardFooterProps = {
  backLabel?: string;
  /** Default strong CTA; use `quiet` after import success so the page hero stays primary. */
  continueTone?: "solid" | "quiet";
  /** Smaller, lower-contrast actions for tertiary navigation after the main success CTAs. */
  presentation?: "default" | "minimal";
} & (ContinueDisabled | ContinueLink | ContinueButton);

const backClassDefault =
  "import-wizard-footer-back inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

const backClassMinimal =
  "import-wizard-footer-back inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200/50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

const continueClassSolid =
  "import-wizard-footer-continue inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition enabled:hover:from-indigo-600 enabled:hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";

const continueClassQuiet =
  "import-wizard-footer-continue inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition enabled:hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";

const continueClassQuietMinimal =
  "import-wizard-footer-continue inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3.5 text-xs font-medium text-slate-600 shadow-sm transition enabled:hover:border-slate-300 enabled:hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-50";

function renderBack(props: ImportWizardFooterProps, backLabel: string) {
  const backClass = props.presentation === "minimal" ? backClassMinimal : backClassDefault;
  if ("backHref" in props && typeof props.backHref === "string") {
    return (
      <Link href={props.backHref} className={backClass} data-testid="import-wizard-back">
        <span aria-hidden="true">←</span> {backLabel}
      </Link>
    );
  }
  return (
    <button type="button" className={backClass} onClick={props.onBack} data-testid="import-wizard-back">
      <span aria-hidden="true">←</span> {backLabel}
    </button>
  );
}

function renderContinue(props: ImportWizardFooterProps, continueLabel: string): ReactNode {
  const tone = props.continueTone ?? "solid";
  const minimal = props.presentation === "minimal";
  const continueClass =
    tone === "quiet"
      ? minimal
        ? continueClassQuietMinimal
        : continueClassQuiet
      : continueClassSolid;
  if ("continueDisabled" in props && props.continueDisabled) {
    return (
      <button type="button" className={continueClass} disabled data-testid="import-wizard-continue">
        {continueLabel} <span aria-hidden="true">→</span>
      </button>
    );
  }
  if ("continueHref" in props && typeof props.continueHref === "string") {
    return (
      <Link href={props.continueHref} className={continueClass} data-testid="import-wizard-continue">
        {continueLabel} <span aria-hidden="true">→</span>
      </Link>
    );
  }
  if ("onContinue" in props) {
    return (
      <button type="button" className={continueClass} onClick={props.onContinue} data-testid="import-wizard-continue">
        {continueLabel} <span aria-hidden="true">→</span>
      </button>
    );
  }
  return null;
}

/**
 * Presentational footer for Import Wizard shells. No business logic.
 * Back: pass `backHref` (navigation) or `onBack` (client action), never both.
 * Continue: pass `continueDisabled` (blocked primary), or `continueHref`, or `onContinue` — mutually exclusive patterns.
 */
export function ImportWizardFooter(props: ImportWizardFooterProps) {
  const backLabel = props.backLabel ?? "Back";
  const continueLabel = props.continueLabel ?? "Continue";

  const rowClass =
    props.presentation === "minimal"
      ? "import-wizard-footer flex flex-wrap items-center justify-between gap-2"
      : "import-wizard-footer flex flex-wrap items-center justify-between gap-3";

  return (
    <div className={rowClass} data-testid="import-wizard-footer">
      <div className="min-w-0">{renderBack(props, backLabel)}</div>
      <div className="min-w-0">{renderContinue(props, continueLabel)}</div>
    </div>
  );
}
