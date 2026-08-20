import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { IconButton } from "./icon-button";

export type ModalShellProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeIcon?: ReactNode;
};

export function ModalShell({
  className,
  title,
  description,
  footer,
  onClose,
  closeIcon,
  children,
  ...props
}: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        className={cn("w-full max-w-2xl rounded-2xl bg-white shadow-2xl", className)}
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
        <div className="px-6 py-5">{children}</div>
        {footer ? <footer className="border-t border-slate-200 px-6 py-4">{footer}</footer> : null}
      </section>
    </div>
  );
}
