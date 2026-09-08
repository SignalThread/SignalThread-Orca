import Link from "next/link";
import { Microsoft365ConnectionPanel } from "@/components/exhibitor/microsoft-365-connection-panel";
import { requireRole } from "@/lib/auth/session";
import { getMicrosoft365ConnectionStatus } from "@/lib/integrations/microsoft/connection-status";
import { getValidMicrosoftAccessTokenForUser } from "@/lib/integrations/microsoft/token-manager";

const RESULT_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Microsoft 365 connected successfully." },
  permission_required: { tone: "error", text: "Microsoft 365 connected, but not every requested permission was granted. Reconnect and approve the requested permissions." },
  access_denied: { tone: "error", text: "Microsoft authorization was cancelled." },
  invalid_state: { tone: "error", text: "The authorization request expired or was already used. Start again." },
  session_mismatch: { tone: "error", text: "The signed-in user changed during authorization. Start again." },
  missing_code: { tone: "error", text: "Microsoft did not return an authorization code." },
  connection_failed: { tone: "error", text: "Microsoft 365 could not be connected. Try again." }
};

export default async function Microsoft365IntegrationPage({
  searchParams
}: {
  searchParams?: Promise<{ microsoft?: string }>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const companyId = String(sessionUser.company_id ?? "");
  await getValidMicrosoftAccessTokenForUser({ userId: sessionUser.id, companyId }).catch(() => undefined);
  const status = await getMicrosoft365ConnectionStatus(sessionUser.id, companyId);
  const result = RESULT_MESSAGES[(await searchParams)?.microsoft ?? ""];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Microsoft 365</h1>
          <p className="mt-1 text-slate-600">Manage your personal Microsoft connection and granted capabilities.</p>
        </div>
        <Link href="/exhibitor/integrations" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to Integrations</Link>
      </div>

      {result ? (
        <p className={`rounded-xl border px-4 py-3 text-sm font-medium ${result.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {result.text}
        </p>
      ) : null}

      <Microsoft365ConnectionPanel status={status} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-950">Requested access</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">SignalThread requests only basic account identity, one-to-one Outlook sending, and calendar event management. It does not request mailbox reading, contacts, or tenant-wide access.</p>
      </div>
    </section>
  );
}
