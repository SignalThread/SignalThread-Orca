"use client";

export type SpeakerStatus = "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";

export type SpeakerRecord = {
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
  avNeeds?: string | null;
  travelNeeds?: string | null;
  dietaryRestrictions?: string | null;
  topics?: string[];
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  intakeTokenSentAt?: string | null;
  intakeSubmittedAt?: string | null;
  reminderSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SpeakerFormState = {
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  bio: string;
  headshotUrl: string;
  notes: string;
  status: SpeakerStatus;
};

export const STATUS_OPTIONS: SpeakerStatus[] = ["NEEDS_INFO", "INVITED", "CONFIRMED", "CANCELLED"];

export const EMPTY_SPEAKER_FORM: SpeakerFormState = {
  name: "",
  email: "",
  phone: "",
  title: "",
  company: "",
  bio: "",
  headshotUrl: "",
  notes: "",
  status: "NEEDS_INFO",
};

export function statusLabel(status: SpeakerStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function statusClasses(status: SpeakerStatus): string {
  if (status === "CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "INVITED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "CANCELLED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand("copy")) {
        throw new Error("Copy command failed");
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function formFromSpeaker(speaker: SpeakerRecord): SpeakerFormState {
  return {
    name: speaker.name,
    email: speaker.email ?? "",
    phone: speaker.phone ?? "",
    title: speaker.title ?? "",
    company: speaker.company ?? "",
    bio: speaker.bio ?? "",
    headshotUrl: speaker.headshotUrl ?? "",
    notes: speaker.notes ?? "",
    status: speaker.status,
  };
}

export function payloadFromForm(form: SpeakerFormState): Record<string, unknown> {
  return {
    name: form.name,
    email: form.email,
    phone: form.phone,
    title: form.title,
    company: form.company,
    bio: form.bio,
    headshotUrl: form.headshotUrl,
    notes: form.notes,
    status: form.status,
  };
}

export function optimisticSpeakerFromForm(eventId: string, speakerId: string, form: SpeakerFormState): SpeakerRecord {
  const now = new Date().toISOString();
  return {
    id: speakerId,
    eventId,
    name: form.name.trim(),
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    title: form.title.trim() || null,
    company: form.company.trim() || null,
    bio: form.bio.trim() || null,
    headshotUrl: form.headshotUrl.trim() || null,
    notes: form.notes.trim() || null,
    status: form.status,
    createdAt: now,
    updatedAt: now,
  };
}
