import type { EmailActivity } from "@/lib/integrations/email/types";

const PROVIDER_LABEL = { google_workspace: "Google Workspace", microsoft_365: "Microsoft 365" } as const;

function activityLabel(status: EmailActivity["status"]) {
  if (status === "sent") return { label: "Sent", className: "bg-emerald-100 text-emerald-800" };
  if (status === "failed") return { label: "Failed", className: "bg-rose-100 text-rose-800" };
  if (status === "unknown") return { label: "Unknown", className: "bg-amber-100 text-amber-900" };
  return { label: "Sending", className: "bg-blue-100 text-blue-800" };
}

export function EmailActivityList({ activities }: { activities: EmailActivity[] }) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="email-activity">
      <h2 className="text-base font-bold text-slate-950">Email activity</h2>
      <p className="mt-1 text-sm text-slate-600">One-to-one emails sent to this lead.</p>
      {activities.length === 0 ? <p className="mt-4 text-sm text-slate-500">No emails sent for this lead.</p> : (
        <ul className="mt-4 divide-y divide-slate-100">
          {activities.map((activity) => {
            const status = activityLabel(activity.status);
            return <li key={activity.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div><p className="text-sm font-semibold text-slate-900">{activity.documentId ? "Document sent" : "Follow-up"} to {activity.recipientEmail}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()} · {activity.status === "sent" ? "Sent via" : "Via"} {PROVIDER_LABEL[activity.provider]}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
