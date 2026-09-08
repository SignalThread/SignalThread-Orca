import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  eyebrowStyle?: "pill" | "plain";
  topSlot?: ReactNode;
  actions?: ReactNode;
  variant?: "page" | "panel";
  align?: "left" | "center";
};

export const PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-[1400px]";
export const PAGE_SHELL_CLASS = `${PAGE_CONTAINER_CLASS} space-y-6 pb-12`;
/** Shared structural language for account and selected-event command surfaces. */
export const COMMAND_SURFACE_GRID_CLASS = "grid grid-cols-1 items-start gap-4 xl:grid-cols-12";
export const COMMAND_SURFACE_MAIN_CLASS = "space-y-4 xl:col-span-8";
export const COMMAND_SURFACE_RAIL_CLASS = "space-y-4 xl:col-span-4";
export const COMMAND_SURFACE_CARD_CLASS = "rounded-2xl border border-slate-200 bg-white shadow-sm";
export const PAGE_HEADER_TITLE_CLASS =
  "text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl";
export const PAGE_HEADER_SUBTITLE_CLASS =
  "max-w-3xl text-base font-normal leading-7 text-slate-600 sm:text-lg";

const VARIANT_STYLES = {
  page: {
    title: PAGE_HEADER_TITLE_CLASS,
    subtitle: PAGE_HEADER_SUBTITLE_CLASS
  },
  panel: {
    title: "text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl",
    subtitle: "text-sm leading-7 text-slate-600 sm:text-base"
  }
} as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PageContainer({ children, className }: PageShellProps) {
  return <div className={cx(PAGE_CONTAINER_CLASS, className)}>{children}</div>;
}

export function PageShell({ children, className }: PageShellProps) {
  return <section className={cx(PAGE_SHELL_CLASS, className)}>{children}</section>;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  eyebrowStyle = "pill",
  topSlot,
  actions,
  variant = "page",
  align = "left"
}: PageHeaderProps) {
  const styles = VARIANT_STYLES[variant];
  const centered = align === "center";

  return (
    <header className="space-y-3">
      {topSlot ? (
        <div className={`text-sm font-medium text-slate-500 ${centered ? "flex justify-center" : ""}`}>{topSlot}</div>
      ) : null}

      <div className={`flex flex-wrap items-start justify-between gap-3 sm:gap-4 ${centered ? "text-center" : ""}`}>
        <div className={`min-w-0 flex-1 space-y-2 ${centered ? "mx-auto" : ""}`}>
          {eyebrow ? (
            <div className={centered ? "flex justify-center" : ""}>
              {eyebrowStyle === "pill" ? (
                <div className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">
                  {eyebrow}
                </div>
              ) : (
                <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 ${centered ? "justify-center" : ""}`}>
                  {eyebrow}
                </div>
              )}
            </div>
          ) : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? (
            <p className={`${styles.subtitle} ${centered ? "mx-auto" : ""}`}>{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
