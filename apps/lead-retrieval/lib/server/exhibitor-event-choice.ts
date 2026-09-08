import "server-only";

import { readExhibitorAppActiveEventCookie } from "@/lib/server/exhibitor-app-active-event";

/**
 * Multiple app-accessible events and no URL/cookie preference → show chooser instead of guessing.
 */
export async function exhibitorShouldPromptEventChoice(input: {
  accessibleEventIds: readonly string[];
  urlEventId: string | null | undefined;
}): Promise<boolean> {
  const ids = input.accessibleEventIds;
  if (ids.length < 2) return false;
  const url = String(input.urlEventId ?? "").trim();
  if (url && ids.includes(url)) return false;
  if (url) return false;
  const cookie = await readExhibitorAppActiveEventCookie();
  const cookieNorm = String(cookie ?? "").trim();
  if (cookieNorm && ids.includes(cookieNorm)) return false;
  return true;
}
