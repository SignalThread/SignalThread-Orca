"use client";

import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Mail, Upload } from "lucide-react";
import { completenessClasses, computeCompletenessDetails } from "./speaker-completeness";
import {
  copyTextToClipboard,
  formFromSpeaker,
  payloadFromForm,
  type SpeakerFormState,
  type SpeakerRecord,
  type SpeakerStatus,
  STATUS_OPTIONS,
  statusClasses,
  statusLabel,
} from "./speaker-profile-shared";
import {
  FORM_INPUT_CLASS,
  FORM_TEXTAREA_CLASS,
  OverviewCard,
  SectionHeader,
  toErrorMessage,
} from "./speaker-detail-shared";

type SpeakerProfileUpdateRequest = {
  intakeUrl: string;
  mailtoHref: string | null;
  expiresAt: string;
};

export function SpeakerProfileSection({
  speaker,
  onSpeakerUpdated,
}: {
  speaker: SpeakerRecord;
  onSpeakerUpdated: (speaker: SpeakerRecord) => void;
}) {
  const [form, setForm] = useState<SpeakerFormState>(() => formFromSpeaker(speaker));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isUploadingHeadshot, setIsUploadingHeadshot] = useState(false);
  const [isGeneratingProfileUpdateLink, setIsGeneratingProfileUpdateLink] = useState(false);
  const [profileUpdateRequest, setProfileUpdateRequest] = useState<SpeakerProfileUpdateRequest | null>(null);
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const headshotInputRef = useRef<HTMLInputElement | null>(null);
  const completeness = useMemo(() => computeCompletenessDetails(form), [form]);

  useEffect(() => {
    setForm(formFromSpeaker(speaker));
    setErrorMessage(null);
    setNotice(null);
    setIsGeneratingProfileUpdateLink(false);
    setProfileUpdateRequest(null);
    setProfileUpdateError(null);
    setCopyNotice(null);
  }, [speaker]);

  async function handleRequestProfileUpdate() {
    setIsGeneratingProfileUpdateLink(true);
    setProfileUpdateError(null);
    setCopyNotice(null);

    try {
      const response = await fetch(`/api/events/${speaker.eventId}/speakers/${speaker.id}/request-profile-update`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to generate profile update link"));
      }

      setProfileUpdateRequest({
        intakeUrl: String(payload.intakeUrl ?? ""),
        mailtoHref: typeof payload.mailtoHref === "string" ? payload.mailtoHref : null,
        expiresAt: String(payload.expiresAt ?? ""),
      });
    } catch (error) {
      setProfileUpdateError(error instanceof Error ? error.message : "Failed to generate profile update link");
    } finally {
      setIsGeneratingProfileUpdateLink(false);
    }
  }

  async function handleCopyProfileUpdateLink() {
    if (!profileUpdateRequest?.intakeUrl) return;

    try {
      await copyTextToClipboard(profileUpdateRequest.intakeUrl);
      setCopyNotice("Link copied.");
      setProfileUpdateError(null);
    } catch {
      setCopyNotice(null);
      setProfileUpdateError("Copy failed. You can still open or select the link manually.");
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/events/${speaker.eventId}/speakers/${speaker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(form)),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to save speaker"));
      }
      onSpeakerUpdated(payload as SpeakerRecord);
      setNotice("Profile saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save speaker");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleHeadshotSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploadingHeadshot(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const presignResponse = await fetch(`/api/events/${speaker.eventId}/speakers/${speaker.id}/headshot/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
        }),
      });
      const presignPayload = await presignResponse.json();
      if (!presignResponse.ok) {
        throw new Error(toErrorMessage(presignPayload, "Failed to prepare headshot upload"));
      }

      const uploadResponse = await fetch(String(presignPayload.uploadUrl), {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          ...(presignPayload.headers && typeof presignPayload.headers === "object"
            ? (presignPayload.headers as Record<string, string>)
            : {}),
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Headshot upload to storage failed");
      }

      const headshotUrl = String(presignPayload.headshotUrl ?? "");
      const patchResponse = await fetch(`/api/events/${speaker.eventId}/speakers/${speaker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headshotUrl }),
      });
      const patchPayload = await patchResponse.json();
      if (!patchResponse.ok) {
        throw new Error(toErrorMessage(patchPayload, "Upload succeeded but saving the headshot failed"));
      }

      setForm((current) => ({ ...current, headshotUrl }));
      onSpeakerUpdated(patchPayload as SpeakerRecord);
      setNotice("Headshot uploaded.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Headshot upload failed");
    } finally {
      setIsUploadingHeadshot(false);
    }
  }

  return (
    <section className="space-y-4">
      <OverviewCard id="profile-form" title="Profile">
        <SectionHeader
          eyebrow="Speaker Profile"
          title="Core profile"
          body="Edit the canonical planner-managed speaker fields. Portal-only fields are shown below when available."
        />
        <form onSubmit={(event) => void handleSave(event)} className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${completenessClasses(completeness.completeness)}`}>
                  {completeness.completeness}
                </span>
                <p className="mt-2 text-[12px] text-slate-600">
                  {completeness.missingItems.length > 0
                    ? `Missing: ${completeness.missingItems.join(", ")}`
                    : "Profile is complete."}
                </p>
              </div>
              <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${statusClasses(form.status)}`}>
                {statusLabel(form.status)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={FORM_INPUT_CLASS} required />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SpeakerStatus }))} className={FORM_INPUT_CLASS}>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={FORM_INPUT_CLASS} />
            </Field>
            <Field label="Company">
              <input value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} className={FORM_INPUT_CLASS} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={FORM_INPUT_CLASS} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className={FORM_INPUT_CLASS} />
            </Field>
          </div>

          <Field label="Bio">
            <textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={5} className={FORM_TEXTAREA_CLASS} />
          </Field>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
            <Field label="Headshot URL">
              <input value={form.headshotUrl} onChange={(event) => setForm((current) => ({ ...current, headshotUrl: event.target.value }))} className={FORM_INPUT_CLASS} />
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              {form.headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.headshotUrl} alt="" className="h-28 w-full rounded-lg object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12px] text-slate-500">
                  No headshot
                </div>
              )}
              <input ref={headshotInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleHeadshotSelected(event)} />
              <button type="button" onClick={() => headshotInputRef.current?.click()} disabled={isUploadingHeadshot} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60">
                <Upload className="h-3.5 w-3.5" />
                {isUploadingHeadshot ? "Uploading..." : "Upload Headshot"}
              </button>
            </div>
          </div>

          <Field label="Internal profile notes">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Internal only</p>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={4} className={FORM_TEXTAREA_CLASS} />
            </div>
          </Field>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:grid-cols-2">
            <ReadOnlyProfileItem label="AV needs" value={speaker.avNeeds} />
            <ReadOnlyProfileItem label="Travel needs" value={speaker.travelNeeds} />
            <ReadOnlyProfileItem label="Dietary restrictions" value={speaker.dietaryRestrictions} />
            <ReadOnlyProfileItem label="Topics" value={(speaker.topics ?? []).join(", ")} />
            <ReadOnlyProfileItem label="LinkedIn" value={speaker.linkedinUrl} />
            <ReadOnlyProfileItem label="Website" value={speaker.websiteUrl} />
          </div>

          {errorMessage ? <p className="text-[13px] text-rose-600">{errorMessage}</p> : null}
          {notice ? <p className="text-[13px] text-emerald-700">{notice}</p> : null}

          <div className="flex justify-end">
            <button type="submit" disabled={isSaving} className="inline-flex h-9 items-center rounded-lg bg-[#28439A] px-4 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(40,67,154,0.18)] hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60">
              {isSaving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </OverviewCard>

      <OverviewCard id="request-profile-update" title="Request Profile Update">
        <SectionHeader
          eyebrow="Speaker Intake"
          title="Request profile update"
          body="Generate a secure public intake link so the speaker can update their profile and upload a headshot."
        />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">Speaker-facing intake link</p>
            <p className="mt-1 text-[12px] text-slate-600">
              The submitted changes remain pending until a planner reviews them in Submissions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleRequestProfileUpdate();
            }}
            disabled={isGeneratingProfileUpdateLink}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
          >
            {isGeneratingProfileUpdateLink ? "Generating..." : "Request Profile Update"}
          </button>
        </div>

        {profileUpdateError ? <p className="mt-3 text-[13px] text-rose-600">{profileUpdateError}</p> : null}

        {profileUpdateRequest ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-slate-700">Secure intake link</p>
                <a
                  href={profileUpdateRequest.intakeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-[13px] text-[#28439A] hover:underline"
                >
                  {profileUpdateRequest.intakeUrl}
                </a>
                <p className="mt-2 text-[12px] text-slate-500">
                  Expires {new Date(profileUpdateRequest.expiresAt).toLocaleString()}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyProfileUpdateLink();
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Link
                </button>
                {profileUpdateRequest.mailtoHref ? (
                  <a
                    href={profileUpdateRequest.mailtoHref}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Open Email Draft
                  </a>
                ) : (
                  <span className="text-[12px] text-slate-500">Add an email address to open a draft email.</span>
                )}
              </div>
            </div>

            {copyNotice ? <p className="mt-3 text-[12px] text-emerald-700">{copyNotice}</p> : null}
          </div>
        ) : null}
      </OverviewCard>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyProfileItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] text-slate-700">{value?.trim() || "Not provided"}</p>
    </div>
  );
}
