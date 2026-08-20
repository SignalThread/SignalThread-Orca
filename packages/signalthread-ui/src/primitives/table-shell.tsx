import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type TableShellProps = HTMLAttributes<HTMLDivElement> & {
  toolbar?: ReactNode;
};

export function TableShell({ className, toolbar, children, ...props }: TableShellProps) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm", className)} {...props}>
      {toolbar ? <div className="border-b border-slate-200 px-4 py-3">{toolbar}</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[13px] text-slate-700">{children}</table>
      </div>
    </div>
  );
}
