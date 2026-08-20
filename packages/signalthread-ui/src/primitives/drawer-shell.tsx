import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { IconButton } from "./icon-button";

export type DrawerSide = "left" | "right";

export type DrawerShellProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  side?: DrawerSide;
  onClose?: () => void;
  closeIcon?: ReactNode;
};

export function DrawerShell({
  className,
  title,
  description,
  footer,
  side = "right",
  onClose,
  closeIcon,
  children,
  ...props
}: DrawerShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950/40" role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex h-full w-full max-w-xl flex-col bg-white shadow-2xl",
          side === "right" ? "ml-auto" : "mr-auto",
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-[13px] text-slate-500">{description}</p> : null}
          </div>
          {onClose && closeIcon ? (
            <IconButton aria-label="Close" icon={closeIcon} variant="ghost" size="sm" onClick={onClose} />
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <footer className="border-t border-slate-200 px-6 py-4">{footer}</footer> : null}
      </aside>
    </div>
  );
}
