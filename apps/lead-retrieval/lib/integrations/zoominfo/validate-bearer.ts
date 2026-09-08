import { searchCompanies } from "@/lib/integrations/zoominfo/operations";

/** Lightweight ZoomInfo GTM API check — same Authorization pattern as enrichment. */
export async function probeZoomInfoBearerToken(
  token: string
): Promise<{ ok: true } | { ok: false; message: string; httpStatus: number }> {
  const t = token.trim();
  if (!t) {
    return { ok: false, message: "Token is empty.", httpStatus: 0 };
  }

  const res = await searchCompanies(t, { companyName: "ZoomInfo" });

  if (res.ok) {
    return { ok: true };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      message: "Invalid or unauthorized token for ZoomInfo GTM API.",
      httpStatus: res.status
    };
  }

  return { ok: false, message: res.message, httpStatus: res.status };
}
