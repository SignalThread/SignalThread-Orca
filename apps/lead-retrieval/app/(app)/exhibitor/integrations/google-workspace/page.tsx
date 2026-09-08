import Link from "next/link";
import { GoogleWorkspaceConnectionPanel } from "@/components/exhibitor/google-workspace-connection-panel";
import { requireRole } from "@/lib/auth/session";
import { getGoogleWorkspaceConnectionStatus } from "@/lib/integrations/google/connection-status";
import { getValidGoogleAccessTokenForUser } from "@/lib/integrations/google/token-manager";

const RESULT_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Google Workspace connected successfully." },
  permission_required: { tone: "error", text: "Google Workspace connected, but Calendar free/busy permission was not granted. Reconnect and approve the requested permissions." },
  access_denied: { tone: "error", text: "Google authorization was cancelled." },
  invalid_state: { tone: "error", text: "The authorization request expired or was already used. Start again." },
  session_mismatch: { tone: "error", text: "The signed-in user changed during authorization. Start again." },
  missing_code: { tone: "error", text: "Google did not return an authorization code." },
  connection_failed: { tone: "error", text: "Google Workspace could not be connected. Try again." }
};

export default async function GoogleWorkspaceIntegrationPage({
  searchParams
}: {
  searchParams?: Promise<{ google?: string }>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const companyId = String(sessionUser.company_id ?? "");
  await getValidGoogleAccessTokenForUser({ userId: sessionUser.id, companyId }).catch(() => undefined);
  const status = await getGoogleWorkspaceConnectionStatus(sessionUser.id, companyId);
  const result = RESULT_MESSAGES[(await searchParams)?.google ?? ""];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Google Workspace</h1>
          <p className="mt-1 text-slate-600">Manage your personal Google connection and granted capabilities.</p>
        </div>
        <Link href="/exhibitor/integrations" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to Integrations</Link>
      </div>

      {result ? (
        <p className={`rounded-xl border px-4 py-3 text-sm font-medium ${result.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {result.text}
        </p>
      ) : null}

      <GoogleWorkspaceConnectionPanel status={status} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-950">Requested access</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">SignalThread requests only basic account identity, one-to-one Gmail sending, owned-calendar event management, and free/busy access. It does not request inbox reading, contacts, or domain-wide access.</p>
      </div>
    </section>
  );
}
