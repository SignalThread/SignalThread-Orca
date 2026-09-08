"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildDefaultFollowUpEmail } from "@/lib/integrations/email/follow-up-email-default";
import type { EmailProvider } from "@/lib/integrations/email/types";

type SendState = "idle" | "sending" | "sent" | "failed" | "unknown" | "pending";
type Availability = "ready" | "missing_connection" | "reconnect_required" | "provider_selection_required";

const PROVIDER_LABEL: Record<EmailProvider, string> = {
  google_workspace: "Google Workspace",
  microsoft_365: "Microsoft 365"
};

export function FollowUpEmailButton({
  leadId,
  leadName,
  recipientEmail,
  availability,
  provider,
  senderEmail,
  senderName,
  companyName,
  eventName
}: {
  leadId: string;
  leadName: string;
  recipientEmail: string | null;
  availability: Availability;
  provider: EmailProvider | null;
  senderEmail: string | null;
  senderName?: string | null;
  companyName?: string | null;
  eventName?: string | null;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(leadName.trim() ? `Following up with ${leadName.trim()}` : "Following up");
  const [body, setBody] = useState(() => buildDefaultFollowUpEmail({ leadName, eventName, senderName, companyName }));
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const email = String(recipientEmail ?? "").trim();
  const ready = availability === "ready" && Boolean(provider && senderEmail);

  if (!email) {
    return <span className="inline-flex h-9 cursor-not-allowed items-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-xs font-semibold text-slate-400">Email lead</span>;
  }
  if (availability === "provider_selection_required") {
    return <Link href="/exhibitor/integrations" className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900" title="Choose a default email sender in Integrations">Choose email sender</Link>;
  }
  if (!ready) {
    return <Link href={`mailto:${email}`} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50">Email lead</Link>;
  }

  function closeDialog() {
    if (sendState === "sending") return;
    setOpen(false);
    setSendState("idle");
    setIdempotencyKey("");
  }

  async function send(key: string) {
    if (submittingRef.current || sendState === "sending" || !key) return;
    submittingRef.current = true;
    setSendState("sending");
    try {
      const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}/send-email`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key, subject, body })
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        outcome?: string;
        activity?: { status?: string };
      };
      if (result.ok && (result.outcome === "sent" || result.activity?.status === "sent")) setSendState("sent");
      else if (result.outcome === "unknown" || result.activity?.status === "unknown") setSendState("unknown");
      else if (result.activity?.status === "pending") setSendState("pending");
      else setSendState("failed");
      router.refresh();
    } catch {
      setSendState("unknown");
      router.refresh();
    } finally {
      submittingRef.current = false;
    }
  }

  const providerLabel = provider ? PROVIDER_LABEL[provider] : "your connected account";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIdempotencyKey(crypto.randomUUID());
          setSendState("idle");
          setOpen(true);
        }}
        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        data-testid="follow-up-email-action"
      >Email lead</button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="follow-up-email-dialog">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeDialog} />
          <div role="dialog" aria-modal="true" aria-labelledby="follow-up-email-title" className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 id="follow-up-email-title" className="text-xl font-bold text-slate-950">Review follow-up email</h2>
            <p className="mt-1 text-sm text-slate-600">Confirm the message before {providerLabel} sends it.</p>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-semibold text-slate-700">From<input readOnly value={senderEmail ?? ""} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" /></label>
              <label className="text-sm font-semibold text-slate-700">Recipient<input readOnly value={email} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" /></label>
              <label className="text-sm font-semibold text-slate-700">Subject<input value={subject} maxLength={200} disabled={sendState === "sending" || sendState === "sent"} onChange={(event) => setSubject(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-sm font-semibold text-slate-700">Message<textarea value={body} maxLength={20_000} rows={8} disabled={sendState === "sending" || sendState === "sent"} onChange={(event) => setBody(event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6" /></label>
            </div>
            {sendState === "sent" ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Sent successfully through {providerLabel}.</p> : null}
            {sendState === "unknown" ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Delivery could not be confirmed. Do not resend yet; review the activity status first.</p> : null}
            {sendState === "pending" ? <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">This send is already in progress.</p> : null}
            {sendState === "failed" ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">The provider did not accept this message. Review the connection before trying again.</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={sendState === "sending"} onClick={closeDialog} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">{sendState === "sent" ? "Close" : "Cancel"}</button>
              {sendState !== "sent" ? <button type="button" disabled={sendState === "sending" || sendState === "pending" || sendState === "unknown" || !subject.trim() || !body.trim()} onClick={() => {
                if (sendState === "failed") {
                  const next = crypto.randomUUID();
                  setIdempotencyKey(next);
                  void send(next);
                } else void send(idempotencyKey);
              }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{sendState === "sending" ? "Sending…" : sendState === "failed" ? "Try with a new send" : "Confirm and send"}</button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
