import { createHash, randomBytes } from "node:crypto";

export const PIPEDRIVE_OAUTH_STATE_TTL_MS = 10 * 60_000;
export const PIPEDRIVE_OAUTH_RETURN_TO = "/exhibitor/integrations/pipedrive";

export function digestPipedriveOAuthState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function createPipedriveOAuthState(input: {
  now?: Date;
  random?: (size: number) => Buffer;
} = {}) {
  const now = input.now ?? new Date();
  const state = (input.random ?? randomBytes)(32).toString("base64url");
  return {
    state,
    stateDigest: digestPipedriveOAuthState(state),
    expiresAt: new Date(now.getTime() + PIPEDRIVE_OAUTH_STATE_TTL_MS)
  };
}
