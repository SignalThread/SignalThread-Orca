import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type IconButtonVariant = "secondary" | "ghost" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  "aria-label": string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

const variantClasses: Record<IconButtonVariant, string> = {
  secondary: "border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-950",
  ghost: "border-transparent bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-950",
  danger: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-lg",
  lg: "h-11 w-11 rounded-xl",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, icon, variant = "secondary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-[#28439A]/15",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      <span className="shrink-0" aria-hidden>{icon}</span>
    </button>
  );
});
