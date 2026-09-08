/**
 * ZoomInfo company connection types + public status (no secrets exposed to clients).
 * BYO bearer token only; OAuth authorization-code flow is not used in-app.
 */

import {
  DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS,
  parseZoomInfoEnrichmentDomainsFromMetadata,
  type ZoomInfoEnrichmentDomains,
} from "@/lib/integrations/zoominfo/enrichment-domain-settings";

export const ZOOMINFO_PROVIDER = "zoominfo" as const;

export type { ZoomInfoEnrichmentDomains };

/** DB row shape for zoominfo_company_connections (bearer token + metadata for enrichment toggles). */
export type ZoomInfoConnectionRow = {
  id: string;
  company_id: string;
  provider: string;
  zoominfo_bearer_token: string | null;
  zoominfo_connection_label: string | null;
  connected_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type ZoomInfoConnectionStatus = "connected" | "error";

export type ZoomInfoPublicStatus = {
  connected: boolean;
  invalidToken: boolean;
  tokenSaved: boolean;
  /** Masked preview only; never the raw token. */
  tokenMasked: string | null;
  connectionLabel: string | null;
  status: ZoomInfoConnectionStatus | null;
  connectedAt: string | null;
  metadata: Record<string, unknown> | null;
  /** Resolved enrichment domain toggles (defaults applied when unset). */
  enrichmentDomains: ZoomInfoEnrichmentDomains;
};

export function maskZoomInfoBearerForPublic(bearer: string): string {
  const t = bearer.trim();
  if (!t) return "—";
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function normalizeZoomInfoStatus(value: string | null | undefined): ZoomInfoConnectionStatus | null {
  const st = String(value ?? "").trim().toLowerCase();
  if (st === "connected" || st === "error") {
    return st;
  }
  return null;
}

export function toZoomInfoPublicStatus(row: ZoomInfoConnectionRow | null): ZoomInfoPublicStatus {
  if (!row) {
    return {
      connected: false,
      invalidToken: false,
      tokenSaved: false,
      tokenMasked: null,
      connectionLabel: null,
      status: null,
      connectedAt: null,
      metadata: null,
      enrichmentDomains: { ...DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS }
    };
  }

  const bearer = String(row.zoominfo_bearer_token ?? "").trim();
  const tokenSaved = Boolean(bearer);
  const st = normalizeZoomInfoStatus(row.status);
  const status: ZoomInfoConnectionStatus | null = tokenSaved ? st ?? "error" : null;

  const connected = Boolean(tokenSaved && status === "connected");
  const invalidToken = Boolean(tokenSaved && status === "error");

  return {
    connected,
    invalidToken,
    tokenSaved,
    tokenMasked: tokenSaved ? maskZoomInfoBearerForPublic(bearer) : null,
    connectionLabel: row.zoominfo_connection_label ?? null,
    status,
    connectedAt: row.created_at ?? null,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : null,
    enrichmentDomains: parseZoomInfoEnrichmentDomainsFromMetadata(
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : null
    )
  };
}
