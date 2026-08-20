import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-[#28439A] text-white shadow-sm hover:bg-[#243d8e]",
  secondary: "border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950",
  ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  danger: "border-transparent bg-rose-600 text-white shadow-sm hover:bg-rose-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-[12px]",
  md: "h-11 gap-2 rounded-xl px-5 text-sm",
  lg: "h-11 gap-2 rounded-xl px-4 text-[14px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    leadingIcon,
    trailingIcon,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-[#28439A]/15",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {leadingIcon ? <span className="shrink-0" aria-hidden>{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="shrink-0" aria-hidden>{trailingIcon}</span> : null}
    </button>
  );
});
