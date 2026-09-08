"use client";

import { useEffect, useMemo, useState } from "react";

type AvailableLead = {
  id: string;
  full_name: string;
  company: string;
  role: string;
  priority_score: number;
  follow_up_date: string | null;
};

type Recipient = {
  lead_id: string;
  name: string;
  company: string;
  role: string;
  rating: number;
  priority_score: number;
  follow_up_date: string | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }
  return new Date(value).toLocaleDateString();
}

export function CampaignRecipientsManager({
  campaignId,
  availableLeads
}: {
  campaignId: string;
  availableLeads: AvailableLead[];
}) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedLeadIds), [selectedLeadIds]);

  async function loadRecipients() {
    setLoadingRecipients(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/recipients`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { recipients?: Recipient[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load recipients");
      }

      const nextRecipients = payload.recipients ?? [];
      setRecipients(nextRecipients);
      setSelectedLeadIds(nextRecipients.map((recipient) => recipient.lead_id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load recipients");
    } finally {
      setLoadingRecipients(false);
    }
  }

  useEffect(() => {
    void loadRecipients();
  }, [campaignId]);

  function toggleLead(leadId: string) {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]
    );
  }

  async function addSelected() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/recipients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ leadIds: selectedLeadIds })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to add leads");
      }

      await loadRecipients();
      setShowModal(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add leads");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Recipients</h2>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Add Leads
        </button>
      </div>

      {error ? <p className="mb-3 text-xs text-rose-600">{error}</p> : null}

      <p className="mb-3 text-sm text-slate-600">
        Recipient Count: <span className="font-semibold text-slate-900">{recipients.length}</span>
      </p>

      {loadingRecipients ? (
        <p className="text-sm text-slate-600">Loading recipients...</p>
      ) : recipients.length === 0 ? (
        <p className="text-sm text-slate-600">No recipients selected yet.</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((recipient) => (
            <div key={recipient.lead_id} className="rounded-lg border bg-white px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">{recipient.name}</p>
              <p className="text-slate-600">
                {recipient.company} • {recipient.role || "No role"}
              </p>
              <p className="text-slate-500">
                Priority {recipient.priority_score} • Rating {recipient.rating}/5 • Follow-up {formatDate(recipient.follow_up_date)}
              </p>
            </div>
          ))}
        </div>
      )}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Select Leads</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {availableLeads.length === 0 ? (
              <p className="text-sm text-slate-600">No leads available.</p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {availableLeads.map((lead) => (
                  <label key={lead.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                    />
                    <span className="text-sm">
                      <span className="block font-medium text-slate-900">{lead.full_name}</span>
                      <span className="block text-slate-600">
                        {lead.company} • {lead.role || "No role"}
                      </span>
                      <span className="block text-slate-500">
                        Priority {lead.priority_score} • Follow-up {formatDate(lead.follow_up_date)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void addSelected()}
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {saving ? "Adding..." : "Add Selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
