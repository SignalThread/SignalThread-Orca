import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border bg-white px-3 text-[14px] text-slate-800 outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
        invalid
          ? "border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          : "border-slate-200 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70",
        className,
      )}
      aria-invalid={invalid || props["aria-invalid"]}
      {...props}
    />
  );
});
