import type { SpeakerPortalView } from "@/src/server/services/speaker-portal";

export type SpeakerPortalTheme = {
  displayName: string;
  eventName: string;
  speakerName: string;
  speakerInitials: string;
  logoUrl: string | null;
  accentColor: string;
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "SP";
}

/**
 * Current portal branding is intentionally derived only from existing
 * event/speaker data. Persistent custom logos, client colors, and portal
 * theme settings would require a schema proposal and migration review.
 */
export function buildSpeakerPortalTheme(view: SpeakerPortalView): SpeakerPortalTheme {
  return {
    displayName: view.eventName,
    eventName: view.eventName,
    speakerName: view.speaker.name,
    speakerInitials: initialsFor(view.speaker.name),
    logoUrl: null,
    accentColor: "#4F46E5",
  };
}

