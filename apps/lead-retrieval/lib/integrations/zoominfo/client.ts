import { getZoomInfoBaseUrl } from "@/lib/integrations/zoominfo/config";
import { extractZoomInfoErrorDetail, mapZoomInfoHttpError } from "@/lib/integrations/zoominfo/errors";

export type ZoomInfoFetchResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; body: unknown };

export async function zoomInfoPostJson<T = unknown>(
  path: string,
  token: string,
  body: unknown
): Promise<ZoomInfoFetchResult<T>> {
  const base = getZoomInfoBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json, application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let parsed: unknown = null;
  try {
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { parse_error: true };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: mapZoomInfoHttpError(response.status, parsed),
      body: parsed,
    };
  }

  return { ok: true, status: response.status, data: parsed as T };
}

export { extractZoomInfoErrorDetail };
