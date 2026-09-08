import { parseCsvHeadersAndAllDataRows, type CsvSampleParse } from "@/lib/import-wizard/parse-csv-sample";

export const GOOGLE_SHEETS_INACCESSIBLE_MESSAGE =
  "This Google Sheet is not accessible. Make sure sharing is set to anyone with the link can view, then try again.";

export type GoogleSheetsExportInfo = {
  spreadsheetId: string;
  gid: string | null;
  exportUrl: string;
  published: boolean;
};

export type GoogleSheetsImportResult =
  | {
      ok: true;
      sourceName: string;
      exportUrl: string;
      parsed: CsvSampleParse;
    }
  | {
      ok: false;
      code: "invalid_url" | "inaccessible" | "empty_sheet" | "missing_headers" | "fetch_failed";
      error: string;
    };

function isGoogleSheetsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "docs.google.com" || host === "drive.google.com";
}

function extractGid(url: URL): string | null {
  const fromSearch = url.searchParams.get("gid");
  if (fromSearch && /^\d+$/.test(fromSearch)) return fromSearch;

  const hash = url.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const fromHash = params.get("gid");
  return fromHash && /^\d+$/.test(fromHash) ? fromHash : null;
}

export function normalizeGoogleSheetsUrl(rawUrl: string): GoogleSheetsExportInfo | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !isGoogleSheetsHost(url.hostname)) return null;

  let parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "spreadsheets") return null;
  if (parts[1] === "u" && parts[2] && /^\d+$/.test(parts[2])) {
    parts = [parts[0], ...parts.slice(3)];
  }
  if (parts[1] !== "d") return null;

  const gid = extractGid(url);

  if (parts[2] === "e" && parts[3]) {
    const spreadsheetId = parts[3];
    const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(spreadsheetId)}/pub`);
    exportUrl.searchParams.set("output", "csv");
    return { spreadsheetId, gid, exportUrl: exportUrl.toString(), published: true };
  }

  const spreadsheetId = parts[2];
  if (!spreadsheetId || spreadsheetId.length < 10) return null;

  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export`);
  exportUrl.searchParams.set("format", "csv");

  return { spreadsheetId, gid, exportUrl: exportUrl.toString(), published: false };
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
}

function validateParsedGoogleSheet(parsed: CsvSampleParse): GoogleSheetsImportResult | null {
  if (parsed.headers.length === 0 && parsed.dataRows.length === 0) {
    return { ok: false, code: "empty_sheet", error: "This Google Sheet has no rows." };
  }

  const hasHeader = parsed.headers.some((header) => header.trim().length > 0);
  if (!hasHeader) {
    return {
      ok: false,
      code: "missing_headers",
      error: "Could not detect a header row in this Google Sheet.",
    };
  }

  if (parsed.dataRows.length === 0) {
    return { ok: false, code: "empty_sheet", error: "This Google Sheet has no data rows." };
  }

  return null;
}

export async function fetchGoogleSheetCsvForImport(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<GoogleSheetsImportResult> {
  const normalized = normalizeGoogleSheetsUrl(rawUrl);
  if (!normalized) {
    return { ok: false, code: "invalid_url", error: "Paste a valid Google Sheets link." };
  }

  let response: Response;
  try {
    response = await fetchImpl(normalized.exportUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/csv,text/plain,*/*",
      },
    });
  } catch {
    return { ok: false, code: "fetch_failed", error: "Could not import this Google Sheet. Try again." };
  }

  const text = await response.text().catch(() => "");
  if (!response.ok || looksLikeHtml(text)) {
    return { ok: false, code: "inaccessible", error: GOOGLE_SHEETS_INACCESSIBLE_MESSAGE };
  }

  const parsed = parseCsvHeadersAndAllDataRows(text);
  const validationError = validateParsedGoogleSheet(parsed);
  if (validationError) return validationError;

  return {
    ok: true,
    sourceName: `Google Sheet ${normalized.spreadsheetId.slice(0, 8)}.csv`,
    exportUrl: normalized.exportUrl,
    parsed,
  };
}
