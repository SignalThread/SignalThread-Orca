"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { Upload } from "lucide-react";

type SpeakerStatus = "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";

type PublicSpeakerRecord = {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  headshotUrl: string | null;
  status: SpeakerStatus;
  notes: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  event: {
    name: string;
  };
};

type SpeakerIntakeFormProps = {
  token: string;
  eventName: string;
  initialSpeaker: PublicSpeakerRecord;
};

type IntakeFormState = {
  name: string;
  title: string;
  company: string;
  phone: string;
  bio: string;
  headshotUrl: string;
};

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export function SpeakerIntakeForm({ token, eventName, initialSpeaker }: SpeakerIntakeFormProps) {
  const [form, setForm] = useState<IntakeFormState>({
    name: initialSpeaker.name,
    title: initialSpeaker.title ?? "",
    company: initialSpeaker.company ?? "",
    phone: initialSpeaker.phone ?? "",
    bio: initialSpeaker.bio ?? "",
    headshotUrl: initialSpeaker.headshotUrl ?? "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const previewUrl = useMemo(() => form.headshotUrl.trim(), [form.headshotUrl]);

  async function handleHeadshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const presignResponse = await fetch(`/api/public/speaker-intake/${token}/headshot/presign`, {
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
        method: String(presignPayload.method ?? "PUT"),
        headers: {
          ...(typeof presignPayload.headers === "object" && presignPayload.headers !== null
            ? presignPayload.headers as Record<string, string>
            : {}),
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Headshot upload failed.");
      }

      setForm((current) => ({
        ...current,
        headshotUrl: String(presignPayload.headshotUrl ?? ""),
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload headshot");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/public/speaker-intake/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          title: form.title,
          company: form.company,
          phone: form.phone,
          bio: form.bio,
          headshotUrl: form.headshotUrl,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to submit profile update"));
      }

      setSuccessMessage("Your speaker profile has been updated. Thank you.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit profile update");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-200 px-8 py-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-500">Speaker Intake</p>
          <h1 className="mt-3 text-[32px] leading-[36px] font-semibold text-slate-900">Update your speaker profile</h1>
          <p className="mt-3 text-[15px] text-slate-600">
            Please review and complete your profile for <span className="font-semibold text-slate-900">{eventName}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-8 py-8">
          {errorMessage ? <p className="text-[14px] text-rose-600">{errorMessage}</p> : null}
          {successMessage ? <p className="text-[14px] text-emerald-700">{successMessage}</p> : null}

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-700">Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                required
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-700">Phone</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-700">Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[12px] font-semibold text-slate-700">Company</span>
              <input
                value={form.company}
                onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[12px] font-semibold text-slate-700">Bio</span>
            <textarea
              value={form.bio}
              onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
              rows={6}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-slate-300"
            />
          </label>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900">Headshot</h2>
                <p className="mt-1 text-[13px] text-slate-500">Upload a JPG, PNG, or WEBP image up to 5MB.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" />
                {isUploading ? "Uploading..." : "Upload headshot"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    void handleHeadshotChange(event);
                  }}
                  disabled={isUploading || isSaving}
                  className="hidden"
                />
              </label>
            </div>

            {previewUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={`${form.name || initialSpeaker.name} headshot preview`}
                  className="h-32 w-32 rounded-2xl object-cover"
                />
              </div>
            ) : (
              <p className="text-[13px] text-slate-500">No headshot uploaded yet.</p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <p className="text-[13px] text-slate-500">
              We’ll update your planner’s speaker directory with the latest information.
            </p>
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="inline-flex h-11 items-center rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
            >
              {isSaving ? "Submitting..." : "Submit Profile Update"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
