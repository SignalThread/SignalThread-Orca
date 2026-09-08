/**
 * Provider-neutral integration disconnect.
 *
 * Local access is the security boundary: the connection row (and its cascading
 * encrypted secret row) is removed first, so a provider or network failure can
 * never leave SignalThread able to act on the user's behalf. Remote revocation
 * is best effort and reported, never required.
 */
export type ProviderDisconnectDeps = {
  loadConnection: () => Promise<{ connectionId: string; refreshToken: string | null } | null>;
  /**
   * Best-effort remote revocation. `null` means the provider exposes no
   * delegated-token revocation endpoint, so local removal is the whole
   * disconnect and nothing stays pending.
   */
  revokeToken: ((refreshToken: string) => Promise<{ ok: boolean }>) | null;
  deleteConnection: (connectionId: string) => Promise<void>;
};

export type ProviderDisconnectResult = {
  disconnected: boolean;
  revocationConfirmed: boolean;
  revocationPending: boolean;
};

export async function disconnectProviderConnectionWithDeps(
  deps: ProviderDisconnectDeps
): Promise<ProviderDisconnectResult> {
  const connection = await deps.loadConnection();
  if (!connection) {
    return { disconnected: true, revocationConfirmed: true, revocationPending: false };
  }

  await deps.deleteConnection(connection.connectionId);

  if (!deps.revokeToken) {
    return { disconnected: true, revocationConfirmed: true, revocationPending: false };
  }
  if (!connection.refreshToken) {
    return { disconnected: true, revocationConfirmed: false, revocationPending: true };
  }
  try {
    const revoked = await deps.revokeToken(connection.refreshToken);
    if (!revoked.ok) {
      return { disconnected: true, revocationConfirmed: false, revocationPending: true };
    }
  } catch {
    return { disconnected: true, revocationConfirmed: false, revocationPending: true };
  }
  return { disconnected: true, revocationConfirmed: true, revocationPending: false };
}
