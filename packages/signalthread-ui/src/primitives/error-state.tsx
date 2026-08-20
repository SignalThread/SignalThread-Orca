import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type ErrorStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  message: ReactNode;
  action?: ReactNode;
};

export function ErrorState({ className, title = "Something went wrong", message, action, ...props }: ErrorStateProps) {
  return (
    <div className={cn("rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800", className)} role="alert" {...props}>
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="mt-1 text-[13px]">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
