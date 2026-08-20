import { type HTMLAttributes } from "react";
import { cn } from "../utils/cn";
import { tones, type SignalThreadTone } from "../tokens/tones";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: SignalThreadTone;
  withDot?: boolean;
};

export function Badge({ className, tone = "neutral", withDot = false, children, ...props }: BadgeProps) {
  const toneClasses = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        toneClasses.background,
        toneClasses.border,
        toneClasses.text,
        className,
      )}
      {...props}
    >
      {withDot ? <span className={cn("h-1.5 w-1.5 rounded-full", toneClasses.dot)} aria-hidden /> : null}
      {children}
    </span>
  );
}
