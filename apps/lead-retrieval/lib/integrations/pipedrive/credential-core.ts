export function pipedriveSecretContext(
  connectionId: string,
  kind: "access_token" | "refresh_token"
) {
  return `integration:pipedrive:${connectionId}:${kind}`;
}

export function buildEncryptedPipedriveCredentialRecord(input: {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  keyVersion: string;
  encrypt: (plaintext: string, context: string) => string;
}) {
  return {
    access_token_encrypted: input.encrypt(
      input.accessToken,
      pipedriveSecretContext(input.connectionId, "access_token")
    ),
    refresh_token_encrypted: input.encrypt(
      input.refreshToken,
      pipedriveSecretContext(input.connectionId, "refresh_token")
    ),
    encryption_key_version: input.keyVersion
  };
}
