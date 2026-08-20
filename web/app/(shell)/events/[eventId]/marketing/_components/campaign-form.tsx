"use client";

import { useState } from "react";
import { CalendarDays, Mail, Megaphone, X } from "lucide-react";
import {
  CAMPAIGN_STATUS_META,
  CAMPAIGN_STATUS_OPTIONS,
  type CampaignStatus,
  dateInputToIso,
  formatDateRange,
  isoToDateInput,
  marketingApi,
  type MarketingCampaign,
} from "./marketing-shared";
import { MarketingDatePicker } from "./marketing-date-picker";

type CampaignChannelOption = {
  id: "email" | "sms" | "push" | "social" | "whatsapp";
  label: string;
  enabled: boolean;
  executable: boolean;
  status: "active" | "comingLater";
};

const CAMPAIGN_CHANNEL_OPTIONS: CampaignChannelOption[] = [
  { id: "email", label: "Email", enabled: true, executable: true, status: "active" },
  { id: "sms", label: "SMS", enabled: false, executable: false, status: "comingLater" },
  { id: "push", label: "Push", enabled: false, executable: false, status: "comingLater" },
  { id: "social", label: "Social", enabled: false, executable: false, status: "comingLater" },
  { id: "whatsapp", label: "WhatsApp", enabled: false, executable: false, status: "comingLater" },
];

const ACTIVE_CAMPAIGN_CHANNEL = CAMPAIGN_CHANNEL_OPTIONS.find((channel) => channel.id === "email")!;
const PLANNED_CAMPAIGN_CHANNELS = CAMPAIGN_CHANNEL_OPTIONS.filter((channel) => channel.status === "comingLater");

type CampaignFormProps = {
  eventId: string;
  campaign?: MarketingCampaign | null;
  initialAudienceLabel?: string | null;
  onClose: () => void;
  onSaved: (campaign: MarketingCampaign) => Promise<void> | void;
};

export function CampaignForm({ eventId, campaign, initialAudienceLabel, onClose, onSaved }: CampaignFormProps) {
  const isEdit = Boolean(campaign);
  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [audienceLabel, setAudienceLabel] = useState(campaign?.audienceLabel ?? initialAudienceLabel ?? "");
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? "DRAFT");
  const [startDate, setStartDate] = useState(isoToDateInput(campaign?.startDate));
  const [endDate, setEndDate] = useState(isoToDateInput(campaign?.endDate));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (isSaving) return;
    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      let saved: MarketingCampaign;
      if (isEdit && campaign) {
        saved = await marketingApi.updateCampaign(eventId, campaign.id, {
          name: name.trim(),
          description: description.trim() || null,
          audienceLabel: audienceLabel.trim() || null,
          status,
          startDate: dateInputToIso(startDate),
          endDate: dateInputToIso(endDate),
        });
      } else {
        saved = await marketingApi.createCampaign(eventId, {
          name: name.trim(),
          description: description.trim() || null,
          audienceLabel: audienceLabel.trim() || null,
          startDate: dateInputToIso(startDate),
          endDate: dateInputToIso(endDate),
        });
      }
      await onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save campaign.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#28439A]/20 bg-[#28439A]/10 text-[#28439A]">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Campaign</p>
              <h2 className="text-[18px] font-semibold text-slate-900">{isEdit ? "Edit campaign" : "New campaign"}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h3 className="text-[13px] font-semibold text-slate-900">Campaign identity</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Campaigns group related sends and future marketing activity. Email sending happens from Email Sends.
              </p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Early-bird registration drive"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Audience label</span>
                <input
                  value={audienceLabel}
                  onChange={(event) => setAudienceLabel(event.target.value)}
                  placeholder="e.g. All prospects"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#28439A]/20 bg-[#28439A]/10 text-[#28439A]">
                <Mail className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900">Channel</h3>
                <p className="mt-0.5 text-[12px] text-slate-500">Email is the supported campaign channel in this MVP.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[12px] font-semibold text-slate-700">Active channel</span>
                <div className="mt-1 flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-700">
                  <span>{ACTIVE_CAMPAIGN_CHANNEL.label}</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Active
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[12px] font-semibold text-slate-700">Coming later</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PLANNED_CAMPAIGN_CHANNELS.map((channel) => (
                    <span
                      key={channel.id}
                      aria-disabled="true"
                      className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-400"
                    >
                      {channel.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900">Campaign window</h3>
                <p className="mt-0.5 text-[12px] text-slate-500">Optional planning dates for this initiative.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MarketingDatePicker label="Start date" value={startDate} onChange={setStartDate} />
              <MarketingDatePicker label="End date" value={endDate} onChange={setEndDate} />
            </div>
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              Range:{" "}
              <span className="font-medium text-slate-700">
                {formatDateRange(dateInputToIso(startDate), dateInputToIso(endDate))}
              </span>
            </p>
          </section>

          {isEdit ? (
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as CampaignStatus)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
              >
                {CAMPAIGN_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {CAMPAIGN_STATUS_META[option].label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-[12px] text-slate-500">New campaigns start as Draft. Advance status after saving.</p>
          )}

          {error ? <div className="text-[13px] text-rose-600">{error}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
          >
            {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}
