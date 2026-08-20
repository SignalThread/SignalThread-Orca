import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";
import { cn } from "../utils/cn";

export type ProductTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary" | "purple";

export const productToneClasses: Record<ProductTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  primary: "border-[#28439A]/20 bg-[#28439A]/10 text-[#28439A]",
  purple: "border-violet-200 bg-violet-50 text-violet-700",
};

export const statusToneMap: Record<string, ProductTone> = {
  ACTIVE: "success",
  APPROVED: "success",
  CLEAR: "success",
  COMPLETE: "success",
  COMPLETED: "success",
  DONE: "success",
  PAID: "success",
  SENT: "success",
  STABLE: "success",
  SYNCED: "success",
  VERIFIED: "success",
  WARNING: "warning",
  AT_RISK: "warning",
  DRAFT: "warning",
  IN_REVIEW: "warning",
  NEEDS_ACTION: "warning",
  NEEDS_REVIEW: "warning",
  NEEDS_SETUP: "warning",
  PENDING: "warning",
  PLANNING: "warning",
  SCHEDULED: "warning",
  SUBMITTED: "warning",
  BLOCKED: "danger",
  CANCELED: "danger",
  CANCELLED: "danger",
  CRITICAL: "danger",
  DANGER: "danger",
  ERROR: "danger",
  FAILED: "danger",
  OVERDUE: "danger",
  REJECTED: "danger",
  INFO: "info",
  IN_PROGRESS: "info",
  INVITED: "info",
  READY: "info",
  REVIEW: "info",
  SETUP: "info",
  INACTIVE: "neutral",
  NEUTRAL: "neutral",
  PULLED_BACK: "neutral",
  UNKNOWN: "neutral",
};

export const roleToneMap: Record<string, ProductTone> = {
  SUPER_ADMIN: "purple",
  OWNER: "primary",
  ADMIN: "info",
  MEMBER: "success",
  VIEWER: "neutral",
  EVENT_ADMIN: "primary",
  EVENT_EDITOR: "info",
  EVENT_VIEWER: "neutral",
};

function normalizeToneKey(value: string): string {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function resolveStatusTone(status: string | null | undefined, fallback: ProductTone = "neutral"): ProductTone {
  if (!status) return fallback;
  return statusToneMap[normalizeToneKey(status)] ?? fallback;
}

export function resolveRoleTone(role: string | null | undefined, fallback: ProductTone = "neutral"): ProductTone {
  if (!role) return fallback;
  return roleToneMap[normalizeToneKey(role)] ?? fallback;
}

export type ProductShellProps = HTMLAttributes<HTMLDivElement> & {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  contentClassName?: string;
};

export function ProductShell({ className, sidebar, topbar, contentClassName, children, ...props }: ProductShellProps) {
  return (
    <div className={cn("min-h-screen bg-[#f8f8fb] text-[14px] text-slate-700", className)} {...props}>
      {sidebar ? <aside className="fixed inset-y-0 left-0 z-30 w-[280px]">{sidebar}</aside> : null}
      <div className={cn("flex min-h-screen flex-col", sidebar ? "ml-[280px]" : "")}>
        {topbar}
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className={cn("w-full max-w-[1100px]", contentClassName)}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export type AppShellProps = ProductShellProps;
export const AppShell = ProductShell;

export type SidebarRailProps = HTMLAttributes<HTMLDivElement> & {
  brand?: ReactNode;
  footer?: ReactNode;
};

export function SidebarRail({ className, brand, footer, children, ...props }: SidebarRailProps) {
  return (
    <div
      className={cn("flex h-full flex-col border-r border-slate-200 bg-[#f8f8fb]", className)}
      {...props}
    >
      {brand ? <div className="border-b border-slate-200 bg-white/70 px-4 py-4">{brand}</div> : null}
      <div className="min-h-0 flex-1 px-3 py-6">{children}</div>
      {footer ? <div className="mt-auto border-t border-slate-200 p-3">{footer}</div> : null}
    </div>
  );
}

export type SidebarRailItemProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
};

export function SidebarRailItem({ className, active = false, icon, badge, children, ...props }: SidebarRailItemProps) {
  return (
    <div
      className={cn(
        "flex h-11 w-full min-w-0 items-center gap-3 rounded-xl border px-3.5 transition-colors",
        active
          ? "border-[#0B1638] bg-[#0B1638] text-white shadow-sm"
          : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        className,
      )}
      {...props}
    >
      {icon ? <span className="shrink-0" aria-hidden>{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14px] leading-[18px] font-semibold">{children}</span>
      {badge ? (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            active ? "bg-white/15 text-white/80" : "bg-slate-100 text-slate-400",
          )}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export type TopBarProps = HTMLAttributes<HTMLElement> & {
  leading?: ReactNode;
  actions?: ReactNode;
};

export function TopBar({ className, leading, actions, children, ...props }: TopBarProps) {
  return (
    <header className={cn("flex h-16 items-center justify-between border-b border-slate-200 bg-[#f8f8fb] px-7", className)} {...props}>
      <div className="min-w-0">{leading ?? children}</div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export type PageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ className, eyebrow, title, description, actions, ...props }: PageHeaderProps) {
  return (
    <section className={cn("flex flex-wrap items-end justify-between gap-4", className)} {...props}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[26px] leading-[32px] font-semibold text-slate-950">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}

export type SectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader({
  className,
  eyebrow,
  title,
  description,
  meta,
  count,
  actions,
  ...props
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)} {...props}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{eyebrow}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-[18px] leading-[22px] font-semibold text-slate-950">{title}</h2>
          {count ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {count}
            </span>
          ) : null}
          {meta ? <span className="text-[12px] font-medium text-slate-500">{meta}</span> : null}
        </div>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type PanelHeaderProps = SectionHeaderProps;
export const PanelHeader = SectionHeader;

export type StatCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  tone?: ProductTone;
};

export function StatCard({ className, label, value, icon, detail, tone = "neutral", ...props }: StatCardProps) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)} {...props}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
        {icon ? (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", productToneClasses[tone])} aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[28px] leading-[32px] font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </section>
  );
}

export type FormFieldProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  label: ReactNode;
  children: ReactElement | ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  controlId?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
};

type FieldControlProps = {
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

export function FormField({
  className,
  label,
  children,
  helperText,
  errorText,
  required = false,
  disabled = false,
  controlId,
  labelProps,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const id = controlId ?? `st-field-${generatedId}`;
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = errorText ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement<FieldControlProps>(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        disabled: children.props.disabled ?? disabled,
        invalid: children.props.invalid ?? Boolean(errorText),
        "aria-invalid": children.props["aria-invalid"] ?? Boolean(errorText),
        "aria-describedby": children.props["aria-describedby"] ?? describedBy,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", disabled ? "opacity-75" : "", className)} {...props}>
      <label
        htmlFor={id}
        {...labelProps}
        className={cn("block text-sm font-medium text-slate-700", labelProps?.className)}
      >
        {label}
        {required ? <span className="ml-1 text-rose-600" aria-hidden>*</span> : null}
      </label>
      {control}
      {helperText ? <p id={helperId} className="text-[12px] leading-5 text-slate-500">{helperText}</p> : null}
      {errorText ? <p id={errorId} className="text-[12px] leading-5 font-medium text-rose-600">{errorText}</p> : null}
    </div>
  );
}

export type FilterPanelProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  actions?: ReactNode;
};

export function FilterPanel({ className, title, actions, children, ...props }: FilterPanelProps) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)} {...props}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold text-slate-950">{title}</h2> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">{children}</div>
    </section>
  );
}

export type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: ReactNode;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { className, leadingIcon, type = "search", ...props },
  ref,
) {
  return (
    <label className="relative block min-w-0 flex-1">
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-slate-400" aria-hidden>
          {leadingIcon}
        </span>
      ) : null}
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#28439A]/40 focus:ring-4 focus:ring-[#28439A]/10",
          leadingIcon ? "pl-9" : "",
          className,
        )}
        {...props}
      />
    </label>
  );
});

export type TabItem = {
  value: string;
  label: ReactNode;
  count?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  items: TabItem[];
  value: string;
  onValueChange?: (value: string) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
};

export function Tabs({ className, items, value, onValueChange, size = "md", ariaLabel, ...props }: TabsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="tablist" aria-label={ariaLabel} {...props}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={onValueChange ? () => onValueChange(item.value) : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "h-9 px-3 text-[12px]" : "h-10 px-3.5 text-[13px]",
              active ? "bg-[#28439A] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <span>{item.label}</span>
            {item.count != null ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type SegmentedControlProps = Omit<TabsProps, "size"> & {
  compact?: boolean;
};

export function SegmentedControl({
  className,
  items,
  value,
  onValueChange,
  compact = false,
  ariaLabel,
  ...props
}: SegmentedControlProps) {
  return (
    <div
      className={cn("inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1", className)}
      role="tablist"
      aria-label={ariaLabel}
      {...props}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={onValueChange ? () => onValueChange(item.value) : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
              compact ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950",
            )}
          >
            <span>{item.label}</span>
            {item.count != null ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-slate-100 text-slate-600" : "bg-white text-slate-500")}>
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type DataTableProps = HTMLAttributes<HTMLDivElement> & {
  toolbar?: ReactNode;
  tableClassName?: string;
};

export function DataTable({ className, toolbar, tableClassName, children, ...props }: DataTableProps) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm", className)} {...props}>
      {toolbar ? <div className="border-b border-slate-200 px-4 py-3">{toolbar}</div> : null}
      <div className="overflow-x-auto">
        <table className={cn("w-full table-fixed border-collapse text-left", tableClassName)}>{children}</table>
      </div>
    </div>
  );
}

export type TableStateProps = HTMLAttributes<HTMLTableSectionElement> & {
  colSpan: number;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function TableEmptyState({ className, colSpan, title, description, action, ...props }: TableStateProps) {
  return (
    <tbody className={className} {...props}>
      <tr>
        <td colSpan={colSpan} className="px-4 py-12 text-center">
          <div className="mx-auto max-w-md">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
            {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export type TableLoadingStateProps = HTMLAttributes<HTMLTableSectionElement> & {
  colSpan: number;
  rows?: number;
  columns?: number;
  label?: ReactNode;
};

export function TableLoadingState({
  className,
  colSpan,
  rows = 4,
  columns = 4,
  label = "Loading rows",
  ...props
}: TableLoadingStateProps) {
  return (
    <tbody className={className} {...props}>
      <tr>
        <td colSpan={colSpan} className="px-4 py-4">
          <span className="sr-only">{label}</span>
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {Array.from({ length: columns }).map((__, columnIndex) => (
                  <div
                    key={columnIndex}
                    className={cn(
                      "h-4 animate-pulse rounded-full bg-slate-100",
                      columnIndex === 0 ? "w-full" : "w-3/4",
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export type TableErrorStateProps = TableStateProps;

export function TableErrorState({ className, colSpan, title, description, action, ...props }: TableErrorStateProps) {
  return (
    <tbody className={className} {...props}>
      <tr>
        <td colSpan={colSpan} className="px-4 py-10 text-center">
          <div className="mx-auto max-w-md rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-800">
            <p className="text-sm font-semibold">{title}</p>
            {description ? <p className="mt-1 text-sm text-rose-700">{description}</p> : null}
            {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Exclude<ProductTone, "primary" | "purple">;
  title?: ReactNode;
  action?: ReactNode;
};

const alertToneClasses: Record<NonNullable<AlertProps["tone"]>, string> = {
  neutral: "border-slate-200 bg-white text-slate-700",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

export function Alert({ className, tone = "neutral", title, action, children, ...props }: AlertProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm", alertToneClasses[tone], className)} {...props}>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-1" : "", "leading-5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type NoticeProps = AlertProps;
export const Notice = Alert;

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ProductTone;
  status?: string;
  withDot?: boolean;
};

export function StatusBadge({ className, tone, status, withDot = false, children, ...props }: StatusBadgeProps) {
  const resolvedTone = tone ?? resolveStatusTone(status ?? (typeof children === "string" ? children : undefined));

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", productToneClasses[resolvedTone], className)}
      {...props}
    >
      {withDot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export type RoleBadgeProps = Omit<StatusBadgeProps, "tone"> & {
  role: string;
};

export function RoleBadge({ role, children, ...props }: RoleBadgeProps) {
  return (
    <StatusBadge tone={resolveRoleTone(role)} {...props}>
      {children ?? role.replace(/_/g, " ")}
    </StatusBadge>
  );
}

export type IconActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  tone?: "neutral" | "danger" | "primary";
};

const iconActionToneClasses: Record<NonNullable<IconActionButtonProps["tone"]>, string> = {
  neutral: "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
  danger: "border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
  primary: "border-[#28439A]/20 bg-white text-[#28439A] hover:bg-[#28439A]/5",
};

export const IconActionButton = forwardRef<HTMLButtonElement, IconActionButtonProps>(function IconActionButton(
  { className, icon, label, tone = "neutral", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-4 focus-visible:ring-[#28439A]/15",
        iconActionToneClasses[tone],
        className,
      )}
      {...props}
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
});
