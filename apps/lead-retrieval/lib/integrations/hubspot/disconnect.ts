export const HUBSPOT_REVOKE_ENDPOINT = "https://api.hubapi.com/oauth/2026-03/token/revoke";

type HubSpotDisconnectCode =
  | "INVALID_ACCOUNT"
  | "MISSING_ENV"
  | "REVOKE_FAILED"
  | "STORE_FAILED";

export class HubSpotDisconnectError extends Error {
  readonly code: HubSpotDisconnectCode;
  readonly status?: number;

  constructor(code: HubSpotDisconnectCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "HubSpotDisconnectError";
    this.code = code;
    this.status = options?.status;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export type HubSpotDisconnectIntegrationRow = {
  id: string;
  account_id: string;
  provider: "hubspot";
  refresh_token: string | null;
};

export type HubSpotDisconnectStore = {
  load(accountId: string): Promise<HubSpotDisconnectIntegrationRow | null>;
  delete(row: HubSpotDisconnectIntegrationRow): Promise<void>;
};

export type HubSpotDisconnectResult = {
  disconnected: true;
  alreadyDisconnected: boolean;
  remoteRevoked: boolean;
  remoteAlreadyInvalid: boolean;
};

type HubSpotRevokeOptions = {
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
};

type HubSpotDisconnectOptions = HubSpotRevokeOptions & {
  store?: HubSpotDisconnectStore;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function buildHubSpotRevokeBody(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    token: params.refreshToken,
    token_type_hint: "refresh_token",
  });
}

export function isHubSpotTokenAlreadyInvalidResponse(status: number, bodyText: string) {
  if (![400, 401, 404].includes(status)) {
    return false;
  }

  const text = bodyText.toLowerCase();
  if (text.includes("invalid_client") || text.includes("client_secret") || text.includes("client id")) {
    return false;
  }

  return (
    text.includes("invalid_token") ||
    text.includes("unknown token") ||
    text.includes("token not found") ||
    text.includes("already revoked") ||
    text.includes("revoked token") ||
    text.includes("token has been revoked") ||
    text.includes("expired token")
  );
}

export async function createHubSpotDisconnectStore(): Promise<HubSpotDisconnectStore> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  return {
    async load(accountId: string) {
      const { data, error } = await (supabase as any)
        .from("integrations")
        .select("id, account_id, provider, refresh_token")
        .eq("account_id", accountId)
        .eq("provider", "hubspot")
        .maybeSingle();

      if (error) {
        throw new HubSpotDisconnectError("STORE_FAILED", "Failed to load HubSpot integration.", { cause: error });
      }

      return (data as HubSpotDisconnectIntegrationRow | null) ?? null;
    },
    async delete(row: HubSpotDisconnectIntegrationRow) {
      const { error } = await (supabase as any)
        .from("integrations")
        .delete()
        .eq("id", row.id)
        .eq("account_id", row.account_id)
        .eq("provider", "hubspot");

      if (error) {
        throw new HubSpotDisconnectError("STORE_FAILED", "Failed to clear HubSpot integration.", { cause: error });
      }
    },
  };
}

export async function revokeHubSpotRefreshToken(refreshToken: string, options: HubSpotRevokeOptions = {}) {
  const token = normalizeText(refreshToken);
  if (!token) {
    return { revoked: false, alreadyInvalid: false };
  }

  const clientId = normalizeText(options.clientId ?? process.env.HUBSPOT_CLIENT_ID);
  const clientSecret = normalizeText(options.clientSecret ?? process.env.HUBSPOT_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new HubSpotDisconnectError("MISSING_ENV", "Missing HubSpot OAuth environment variables.");
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(HUBSPOT_REVOKE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildHubSpotRevokeBody({ clientId, clientSecret, refreshToken: token }).toString(),
      cache: "no-store",
    });
  } catch (error) {
    throw new HubSpotDisconnectError("REVOKE_FAILED", "HubSpot token revoke request failed.", { cause: error });
  }

  if (response.ok) {
    return { revoked: true, alreadyInvalid: false };
  }

  const bodyText = await response.text().catch(() => "");
  if (isHubSpotTokenAlreadyInvalidResponse(response.status, bodyText)) {
    return { revoked: false, alreadyInvalid: true };
  }

  throw new HubSpotDisconnectError("REVOKE_FAILED", "HubSpot token revoke failed.", {
    status: response.status,
    cause: bodyText,
  });
}

export async function disconnectHubSpotIntegrationForAccount(
  accountId: string,
  options: HubSpotDisconnectOptions = {}
): Promise<HubSpotDisconnectResult> {
  const normalizedAccountId = normalizeText(accountId);
  if (!normalizedAccountId) {
    throw new HubSpotDisconnectError("INVALID_ACCOUNT", "Missing exhibitor account.");
  }

  const store = options.store ?? (await createHubSpotDisconnectStore());
  const integration = await store.load(normalizedAccountId);
  if (!integration) {
    return {
      disconnected: true,
      alreadyDisconnected: true,
      remoteRevoked: false,
      remoteAlreadyInvalid: false,
    };
  }

  const revokeResult = await revokeHubSpotRefreshToken(integration.refresh_token ?? "", options);
  await store.delete(integration);

  return {
    disconnected: true,
    alreadyDisconnected: false,
    remoteRevoked: revokeResult.revoked,
    remoteAlreadyInvalid: revokeResult.alreadyInvalid,
  };
}
