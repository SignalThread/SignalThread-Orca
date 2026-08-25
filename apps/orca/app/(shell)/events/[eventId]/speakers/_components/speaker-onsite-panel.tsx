"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

type OnsiteInfo = {
  greenRoomLocation: string;
  arrivalInstructions: string;
  badgePickupInfo: string;
  onsiteContact: string;
  avRehearsalInfo: string;
};

const EMPTY_INFO: OnsiteInfo = {
  greenRoomLocation: "",
  arrivalInstructions: "",
  badgePickupInfo: "",
  onsiteContact: "",
  avRehearsalInfo: "",
};

const FIELDS: Array<{ key: keyof OnsiteInfo; label: string; placeholder: string }> = [
  { key: "greenRoomLocation", label: "Green room location", placeholder: "e.g. Room 204, behind Main Stage" },
  { key: "arrivalInstructions", label: "Arrival instructions", placeholder: "When and where speakers should arrive" },
  { key: "badgePickupInfo", label: "Badge / pass pickup", placeholder: "Where to collect credentials" },
  { key: "onsiteContact", label: "Onsite contact", placeholder: "Name and phone for day-of questions" },
  { key: "avRehearsalInfo", label: "AV / rehearsal instructions", placeholder: "Tech checks, rehearsal times, deck handoff" },
];

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

type SpeakerOnsitePanelProps = {
  eventId: string;
  variant?: "card" | "compact" | "inline";
};

export function SpeakerOnsitePanel({ eventId, variant = "card" }: SpeakerOnsitePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<OnsiteInfo>(EMPTY_INFO);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadInfo() {
      try {
        const response = await fetch(`/api/events/${eventId}/speaker-onsite`);
        const payload = await response.json();
        if (!isActive || !response.ok) return;
        const record = payload as Partial<Record<keyof OnsiteInfo, string | null>>;
        setForm({
          greenRoomLocation: record.greenRoomLocation ?? "",
          arrivalInstructions: record.arrivalInstructions ?? "",
          badgePickupInfo: record.badgePickupInfo ?? "",
          onsiteContact: record.onsiteContact ?? "",
          avRehearsalInfo: record.avRehearsalInfo ?? "",
        });
      } catch {
        // Panel stays editable with empty defaults.
      }
    }

    void loadInfo();

    return () => {
      isActive = false;
    };
  }, [eventId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speaker-onsite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to save onsite info"));
      }
      setNotice("Onsite instructions saved. Speakers see these in their portal packet.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save onsite info");
    } finally {
      setIsSaving(false);
    }
  }

  const isCompact = variant === "compact" || variant === "inline";
  const isInline = variant === "inline";

  return (
    <div
      className={
        isInline
          ? "min-w-0 border-t border-slate-200 pt-3"
          : isCompact
            ? "rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            : "rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
      }
      aria-label="Speaker onsite instructions"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={isCompact ? "flex min-w-[180px] items-center gap-2" : "flex items-center gap-2"}>
          <MapPin className="h-4 w-4 text-slate-500" />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Onsite Instructions (shown to all speakers)
            </p>
            <p className={isCompact ? "mt-0.5 text-[12px] text-slate-500" : "mt-1 text-[13px] text-slate-500"}>
              Shared in the speaker portal packet. Keep this handy, but secondary to readiness and conflicts.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className={`inline-flex ${isCompact ? "h-8" : "h-9"} items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-100`}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          {isOpen ? "Close" : "Edit"}
        </button>
      </div>

      {notice ? <p className="mt-3 text-[13px] text-emerald-700">{notice}</p> : null}
      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}

      {isOpen ? (
        <form onSubmit={(event) => void handleSave(event)} className="mt-3 space-y-3">
          {FIELDS.map(({ key, label, placeholder }) => (
            <label key={key} className="block space-y-1">
              <span className="text-[12px] font-semibold text-slate-700">{label}</span>
              <textarea
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                rows={2}
                placeholder={placeholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-slate-300"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Onsite Instructions"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
