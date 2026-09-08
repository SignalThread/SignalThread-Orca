"use client";

import { useRouter } from "next/navigation";

type Variant = "success" | "warning" | "error";

export function ZoomInfoConfigFlashBanner({
  variant,
  title,
  body,
  dismissable = true,
}: {
  variant: Variant;
  title: string;
  body: string;
  /** Query-driven flashes can be dismissed; persistent server state banners stay until resolved. */
  dismissable?: boolean;
}) {
  const router = useRouter();
  const styles =
    variant === "success"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-950"
      : variant === "warning"
        ? "border-amber-200/80 bg-amber-50/90 text-amber-950"
        : "border-rose-200/80 bg-rose-50/90 text-rose-950";

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${styles}`} role="status">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-semibold leading-tight">{title}</p>
          <p className="text-xs leading-snug text-slate-700">{body}</p>
        </div>
        {dismissable ? (
          <button
            type="button"
            onClick={() => router.replace("/exhibitor/integrations/zoominfo")}
            className="shrink-0 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
