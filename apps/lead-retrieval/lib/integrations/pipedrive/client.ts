import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidPipedriveAccessToken } from "@/lib/integrations/pipedrive/token-manager";

export type PipedriveApiErrorCode = "not_connected" | "reconnect_required" | "http_error";

export class PipedriveApiError extends Error {
  code: PipedriveApiErrorCode;
  status?: number;

  constructor(code: PipedriveApiErrorCode, message: string, options?: { status?: number }) {
    super(message);
    this.name = "PipedriveApiError";
    this.code = code;
    this.status = options?.status;
  }
}

type PipedriveEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  error_info?: string;
};

async function recordPipedriveSyncError(companyId: string, message: string) {
  try {
    await (createAdminClient() as any)
      .from("integrations")
      .update({ last_sync_error: message })
      .eq("account_id", companyId)
      .eq("provider", "pipedrive");
  } catch {
    // Best-effort only: never let error-recording itself replace the real error.
  }
}

/**
 * Server-side authenticated fetch against the Pipedrive REST API for a given
 * company. Retries once on a 401 with a forced token refresh, mirroring
 * `salesforceFetch`. Returns the raw `Response`; callers parse JSON.
 */
export async function pipedriveFetch(companyId: string, path: string, init?: RequestInit): Promise<Response> {
  const trimmedPath = String(path ?? "").trim();
  if (!trimmedPath) {
    throw new PipedriveApiError("http_error", "Pipedrive request path is required.");
  }

  const runRequest = async (accessToken: string, apiDomain: string) => {
    const url = `${apiDomain.replace(/\/+$/, "")}${trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`}`;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return fetch(url, { ...init, headers, cache: "no-store" });
  };

  const token = await getValidPipedriveAccessToken(companyId);
  if (!token.ok) {
    throw new PipedriveApiError(
      token.code === "not_connected" ? "not_connected" : "reconnect_required",
      "Pipedrive is not connected for this account."
    );
  }

  let response = await runRequest(token.accessToken, token.apiDomain);

  if (response.status === 401) {
    const refreshed = await getValidPipedriveAccessToken(companyId, { forceRefresh: true });
    if (refreshed.ok) {
      response = await runRequest(refreshed.accessToken, refreshed.apiDomain);
    } else {
      throw new PipedriveApiError("reconnect_required", "Pipedrive token refresh failed. Reconnect Pipedrive and try again.", {
        status: 401
      });
    }
  }

  if (!response.ok) {
    let details = "";
    try {
      const payload = (await response.json()) as PipedriveEnvelope<unknown>;
      details = payload.error_info ?? payload.error ?? JSON.stringify(payload);
    } catch {
      details = await response.text().catch(() => "");
    }
    const message = `Pipedrive API request failed (${response.status}${details ? `): ${details}` : ")"}`;
    await recordPipedriveSyncError(companyId, message);
    throw new PipedriveApiError("http_error", message, { status: response.status });
  }

  return response;
}

/**
 * JSON-in/JSON-out convenience wrapper around `pipedriveFetch`. Throws when
 * the HTTP call fails OR when Pipedrive's own `{ success: false }` envelope
 * signals a logical failure despite a 2xx status.
 */
export async function pipedriveRequest<T>(companyId: string, path: string, init?: RequestInit): Promise<T | undefined> {
  const response = await pipedriveFetch(companyId, path, init);
  const payload = (await response.json().catch(() => ({}))) as PipedriveEnvelope<T>;
  if (payload.success === false) {
    const message = `Pipedrive request was not successful${payload.error ? `: ${payload.error}` : ""}`;
    await recordPipedriveSyncError(companyId, message);
    throw new PipedriveApiError("http_error", message);
  }
  return payload.data;
}
