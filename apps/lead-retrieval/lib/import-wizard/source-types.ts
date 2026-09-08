/**
 * Import source options for Step 1 (UI + local state only until integrations exist).
 */
export type ImportSourceId = "csv" | "crm" | "cloud" | "api";

export type ImportSourceOption = {
  id: ImportSourceId;
  title: string;
  description: string;
  recommended?: boolean;
  /** When false, card is non-selectable (roadmap / coming soon). */
  available: boolean;
};

export const IMPORT_SOURCE_OPTIONS: readonly ImportSourceOption[] = [
  {
    id: "csv",
    title: "Upload lead data",
    description: "Upload a CSV or Excel file, or paste a Google Sheets link.",
    recommended: true,
    available: true,
  },
  {
    id: "crm",
    title: "CRM Integration",
    description: "Import directly from your CRM using a supported connection.",
    available: false,
  },
  {
    id: "cloud",
    title: "Cloud Storage",
    description: "Connect to Google Drive, Dropbox, or OneDrive.",
    available: false,
  },
  {
    id: "api",
    title: "API Endpoint",
    description: "Pull data from a custom API endpoint.",
    available: false,
  },
] as const;
