/**
 * ZoomInfo Data API base (GTM). Override with ZOOMINFO_BASE_URL if your tenant uses another host.
 * @see https://docs.zoominfo.com/reference/overview
 */
export const DEFAULT_ZOOMINFO_BASE_URL = "https://api.zoominfo.com/gtm";

export function getZoomInfoBaseUrl(): string {
  const raw = process.env["ZOOMINFO_BASE_URL"] ?? DEFAULT_ZOOMINFO_BASE_URL;
  return String(raw).trim().replace(/\/+$/, "");
}
