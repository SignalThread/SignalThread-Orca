"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Shared event-shell navigation primitives.
 *
 * Extracted from event-workspace-shell.tsx so the event sidebar and (later) the
 * session workspace navigation render the same visual language. This is a pure
 * extraction: for the props the event shell passes today (href + icon + label +
 * optional badge + active/collapsed), SidebarNavItem produces markup identical
 * to the previous inline renderNavItem. The extra props (onClick/button mode,
 * disabled, description) exist for the upcoming session-nav alignment and do not
 * affect the event nav because the event shell never passes them.
 */

export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type SidebarNavItemProps = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  collapsed?: boolean;
  /** Link mode. Takes precedence over onClick when both are provided. */
  href?: string;
  /** Button mode for nav items that drive local state instead of routing. */
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  /**
   * Optional override for the badge styling. The session nav uses it to keep
   * readiness colors on module badges; the event nav omits it and falls back to
   * the default muted treatment.
   */
  badgeClassName?: string;
  /** Optional second line, used by the session nav; event nav never sets it. */
  description?: string;
  title?: string;
  ariaLabel?: string;
};

function navItemClassName(
  active: boolean,
  collapsed: boolean,
  disabled: boolean,
  hasDescription: boolean,
): string {
  return [
    "flex items-center rounded-xl border transition-colors",
    hasDescription ? "min-h-10 py-1.5" : "h-10",
    collapsed ? "justify-center px-0" : "gap-2.5 px-3.5",
    disabled
      ? "cursor-not-allowed border-transparent text-slate-400"
      : active
        ? "border-[#0B1638] bg-[#0B1638] text-white shadow-sm"
        : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

export function SidebarNavItem({
  label,
  icon,
  active = false,
  collapsed = false,
  href,
  onClick,
  disabled = false,
  badge,
  badgeClassName,
  description,
  title,
  ariaLabel,
}: SidebarNavItemProps) {
  const Icon = icon;
  const showText = !collapsed;
  const hasDescription = Boolean(description) && showText;
  const resolvedAriaLabel = ariaLabel ?? label;
  const resolvedTitle = title ?? (collapsed ? resolvedAriaLabel : undefined);
  const className = navItemClassName(active, collapsed, disabled, hasDescription);

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      {showText ? (
        <>
          {hasDescription ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-[18px] font-semibold">{label}</span>
              <span className="mt-0.5 block truncate text-[11px] leading-4 font-medium opacity-70">{description}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[14px] leading-[18px] font-semibold">{label}</span>
          )}
          {badge ? (
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                badgeClassName ?? (active ? "bg-white/15 text-white/80" : "bg-slate-100 text-slate-400"),
              ].join(" ")}
            >
              {badge}
            </span>
          ) : null}
        </>
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled="true" title={resolvedTitle} aria-label={resolvedAriaLabel} className={className}>
        {content}
      </div>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        title={resolvedTitle}
        aria-label={resolvedAriaLabel}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={resolvedTitle}
        aria-label={resolvedAriaLabel}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <div title={resolvedTitle} aria-label={resolvedAriaLabel} className={className}>
      {content}
    </div>
  );
}
