/**
 * AAD context for Microsoft credential envelopes. Binding the provider, the
 * connection id and the credential kind into the additional authenticated data
 * means a ciphertext cannot be replayed across providers, connections, or from
 * an access-token column into a refresh-token column.
 */
export function microsoftSecretContext(connectionId: string, kind: "access_token" | "refresh_token") {
  return `microsoft_365:${connectionId}:${kind}`;
}
