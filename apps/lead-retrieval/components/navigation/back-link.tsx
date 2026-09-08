import Link from "next/link";
import type { ComponentProps } from "react";

/** Canonical back control: matches exhibitor signal workspace and Leads Intelligence surfaces. */
const BACK_LINK_CLASS =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900";

export function BackLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={className ? `${BACK_LINK_CLASS} ${className}` : BACK_LINK_CLASS} />;
}
