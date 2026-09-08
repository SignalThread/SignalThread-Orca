import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/event-overview/view-model";
import { ArrowUpRightIcon } from "./icons";

/** 10px uppercase eyebrow, the dashboard's label voice. */
export function Eyebrow({
  children,
  color = "var(--text-subtle)",
  tracking = "0.05em",
  className = "",
}: {
  children: ReactNode;
  color?: string;
  tracking?: string;
  className?: string;
}) {
  return (
    <span className={`st-eyebrow ${className}`} style={{ color, letterSpacing: tracking }}>
      {children}
    </span>
  );
}

/** Section eyebrow + one-line description, with optional right-hand meta. */
export function SectionHeading({
  eyebrow,
  description,
  meta,
  id,
}: {
  eyebrow: string;
  description: string;
  meta?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mt-10 mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="st-eyebrow" style={{ color: "var(--text-subtle)" }}>
          {eyebrow}
        </h2>
        <span className="text-xs leading-4" style={{ color: "var(--text-muted)" }}>
          {description}
        </span>
      </div>
      {meta ? (
        <span className="text-xs leading-4" style={{ color: "var(--text-subtle)" }}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/** Border-led white card with the restrained dashboard shadow. */
export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${className}`}
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border-subtle)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {children}
    </div>
  );
}

const TONE_DOT: Record<Tone, string> = {
  success: "var(--status-success)",
  warning: "var(--status-warning)",
  danger: "var(--status-danger)",
  neutral: "transparent",
  info: "#2563eb",
};

const TONE_TEXT: Record<Tone, string> = {
  success: "var(--status-success-text)",
  warning: "var(--status-warning-text)",
  danger: "var(--status-danger)",
  neutral: "var(--text-muted)",
  info: "#1d4ed8",
};

/** Inline status: 6px dot (hollow for neutral) + 12px semibold label. */
export function StatusInline({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs leading-4 font-semibold whitespace-nowrap"
      style={{ color: TONE_TEXT[tone] }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={
          tone === "neutral"
            ? { border: "1.5px solid #94a3b8", background: "transparent" }
            : { background: TONE_DOT[tone] }
        }
      />
      {label}
    </span>
  );
}

/** "Open ↗" style text link, product-launch coloured. */
export function ActionLink({
  href,
  children,
  size = "sm",
  className = "",
  external = false,
}: {
  href: string;
  children: ReactNode;
  size?: "xs" | "sm";
  className?: string;
  /** Launch URLs go through /api/launch and must be a full navigation, not a client transition. */
  external?: boolean;
}) {
  const classes = `inline-flex min-h-11 items-center gap-1 font-medium whitespace-nowrap hover:underline md:min-h-0 ${
    size === "xs" ? "text-xs leading-4" : "text-[13px] leading-4"
  } ${className}`;
  const style = { color: "var(--text-link)" };
  const icon = <ArrowUpRightIcon size={size === "xs" ? 12 : 13} />;
  if (external) {
    return (
      <a href={href} className={classes} style={style}>
        {children}
        {icon}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} style={style}>
      {children}
      {icon}
    </Link>
  );
}

/**
 * Anchor styled as the design system's secondary small button. Product launches
 * are plain navigations to Platform's authorizing endpoint, so they need an
 * <a>, which the shared Button (a <button>) cannot render.
 */
export function LaunchButton({
  href,
  children,
  disabledReason,
  testId,
}: {
  href: string | null;
  children: ReactNode;
  disabledReason?: string;
  testId?: string;
}) {
  const base =
    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold whitespace-nowrap outline-none transition focus-visible:ring-4 focus-visible:ring-[#28439A]/15 md:h-9";
  if (!href) {
    return (
      <span
        className={`${base} cursor-not-allowed border-slate-200 bg-white text-slate-400`}
        aria-disabled="true"
        title={disabledReason}
        data-testid={testId}
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      className={`${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950`}
      style={{ boxShadow: "var(--shadow-card)" }}
      data-testid={testId}
    >
      {children}
    </a>
  );
}
