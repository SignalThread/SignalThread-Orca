/**
 * Shared horizontal shell for AI Briefings routes under `app/(app)/exhibitor/briefings/`.
 * Single source of truth for max width + gutters — keep in sync with layout usage only.
 */
export const exhibitorBriefingsShell = {
  /** Top header strip — hub subtitle only (no tabs). */
  navInner: "mx-auto w-full max-w-[88rem] px-5 pb-4 pt-4 sm:px-8 sm:pb-5 sm:pt-5 lg:px-10",
  /** Page content below the nav */
  mainInner: "mx-auto w-full max-w-[88rem] px-5 py-5 sm:px-8 sm:py-6 lg:px-10",
} as const;

/** Typical intro / description line length inside the main column (optional on paragraphs). */
export const exhibitorBriefingsIntroProseClass = "max-w-5xl";
