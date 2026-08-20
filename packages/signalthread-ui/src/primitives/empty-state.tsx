import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ className, icon, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center", className)} {...props}>
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
