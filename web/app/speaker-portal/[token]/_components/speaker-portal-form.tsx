"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import type { SpeakerPortalView } from "@/src/server/services/speaker-portal";

type SpeakerPortalFormProps = {
  token: string;
  initialView: SpeakerPortalView;
};

type PortalFormState = {
  name: string;
  title: string;
  company: string;
  phone: string;
  bio: string;
  headshotUrl: string;
  avNeeds: string;
  travelNeeds: string;
  dietaryRestrictions: string;
  topics: string;
  linkedinUrl: string;
  websiteUrl: string;
  noteToPlanner: string;
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

  return fallback;
}

export function SpeakerPortalForm({ token, initialView }: SpeakerPortalFormProps) {
  const { speaker } = initialView;
  const [form, setForm] = useState<PortalFormState>({
    name: speaker.name,
    title: speaker.title ?? "",
    company: speaker.company ?? "",
    phone: speaker.phone ?? "",
    bio: speaker.bio ?? "",
    headshotUrl: speaker.headshotUrl ?? "",
    avNeeds: speaker.avNeeds ?? "",
    travelNeeds: speaker.travelNeeds ?? "",
    dietaryRestrictions: speaker.dietaryRestrictions ?? "",
    topics: speaker.topics.join(", "),
    linkedinUrl: speaker.linkedinUrl ?? "",
    websiteUrl: speaker.websiteUrl ?? "",
    noteToPlanner: "",
  });
  const [pendingSubmission, setPendingSubmission] = useState(initialView.pendingSubmission);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const previewUrl = useMemo(() => form.headshotUrl.trim(), [form.headshotUrl]);

  function setField(field: keyof PortalFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };
  }

  async function handleHeadshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const presignResponse = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/headshot/presign`, {
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
        throw new Error("Headshot upload failed");
      }

      setForm((current) => ({ ...current, headshotUrl: String(presignPayload.headshotUrl ?? "") }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Headshot upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setErrorMessage("Name is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          title: form.title,
          company: form.company,
          phone: form.phone,
          bio: form.bio,
          headshotUrl: form.headshotUrl,
          avNeeds: form.avNeeds,
          travelNeeds: form.travelNeeds,
          dietaryRestrictions: form.dietaryRestrictions,
          topics: form.topics
            .split(",")
            .map((topic) => topic.trim())
            .filter(Boolean),
          linkedinUrl: form.linkedinUrl,
          websiteUrl: form.websiteUrl,
          noteToPlanner: form.noteToPlanner,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to submit your updates"));
      }

      setPendingSubmission({
        id: String(payload.id ?? ""),
        submittedAt: String(payload.submittedAt ?? new Date().toISOString()),
        status: String(payload.status ?? "PENDING"),
      });
      setSuccessMessage("Thanks! Your updates were sent to the event team for review.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit your updates");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClasses =
    "h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300";
  const textareaClasses =
    "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-slate-300";
  const labelClasses = "text-[12px] font-semibold text-slate-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-slate-900">Complete your profile</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Send profile, headshot, and logistics updates to the event team.
          </p>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[12px] font-semibold text-blue-700">
          Shared with event team
        </span>
      </div>

      {pendingSubmission ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          You sent updates on {new Date(pendingSubmission.submittedAt).toLocaleString()}. The event team is reviewing them.
          Submitting again will send a new version.
        </p>
      ) : null}

      {errorMessage ? <p className="text-[13px] text-rose-600">{errorMessage}</p> : null}
      {successMessage ? <p className="text-[13px] text-emerald-700">{successMessage}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={labelClasses}>Name</span>
          <input value={form.name} onChange={setField("name")} className={inputClasses} required />
        </label>
        <label className="space-y-1.5">
          <span className={labelClasses}>Phone</span>
          <input value={form.phone} onChange={setField("phone")} className={inputClasses} />
        </label>
        <label className="space-y-1.5">
          <span className={labelClasses}>Title</span>
          <input value={form.title} onChange={setField("title")} className={inputClasses} />
        </label>
        <label className="space-y-1.5">
          <span className={labelClasses}>Company</span>
          <input value={form.company} onChange={setField("company")} className={inputClasses} />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className={labelClasses}>Bio</span>
        <textarea value={form.bio} onChange={setField("bio")} rows={5} className={textareaClasses} />
      </label>

      <div className="space-y-2">
        <span className={labelClasses}>Headshot</span>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Headshot preview" className="h-28 w-28 rounded-2xl object-cover" />
        ) : null}
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5" />
          {isUploading ? "Uploading..." : "Upload headshot"}
          <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleHeadshotChange(event)} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={labelClasses}>LinkedIn URL</span>
          <input value={form.linkedinUrl} onChange={setField("linkedinUrl")} className={inputClasses} />
        </label>
        <label className="space-y-1.5">
          <span className={labelClasses}>Website</span>
          <input value={form.websiteUrl} onChange={setField("websiteUrl")} className={inputClasses} />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className={labelClasses}>Topics / expertise (comma-separated)</span>
        <input value={form.topics} onChange={setField("topics")} className={inputClasses} />
      </label>

      <label className="block space-y-1.5">
        <span className={labelClasses}>AV needs</span>
        <textarea value={form.avNeeds} onChange={setField("avNeeds")} rows={3} className={textareaClasses} />
      </label>

      <label className="block space-y-1.5">
        <span className={labelClasses}>Travel needs</span>
        <textarea value={form.travelNeeds} onChange={setField("travelNeeds")} rows={3} className={textareaClasses} />
      </label>

      <label className="block space-y-1.5">
        <span className={labelClasses}>Dietary restrictions</span>
        <textarea
          value={form.dietaryRestrictions}
          onChange={setField("dietaryRestrictions")}
          rows={2}
          className={textareaClasses}
        />
      </label>

      <label className="block space-y-1.5">
        <span className={labelClasses}>Note to event team (optional)</span>
        <textarea value={form.noteToPlanner} onChange={setField("noteToPlanner")} rows={3} className={textareaClasses} />
      </label>

      <button
        type="submit"
        disabled={isSubmitting || isUploading}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white shadow-[0_12px_28px_rgba(40,67,154,0.18)] hover:bg-[#243d8e] disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? "Submitting..." : "Submit profile updates"}
      </button>
    </form>
  );
}
