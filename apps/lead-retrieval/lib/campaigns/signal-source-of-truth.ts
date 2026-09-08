export type CampaignSignalOption = {
  id: string;
  name: string;
  /** Used to break ties when multiple saved signals share the same display name */
  updated_at?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string) {
  return UUID_REGEX.test(value.trim());
}

export function normalizeSignalTokens(tokens?: string[] | null) {
  return [...new Set((tokens ?? []).map((token) => token.trim()).filter(Boolean))];
}

/**
 * When `selected_signals` mixes UUID tokens with legacy name tokens (e.g. saved id + "Company Context"),
 * and the library contains more than one row with the same name, naive resolution yields two different
 * ids for one logical pick. Collapse to one id per normalized signal name: prefer an id that appears
 * as an explicit UUID in the campaign tokens; otherwise keep the newest `updated_at`.
 */
function dedupeResolvedIdsBySignalName(
  resolvedIdsOrdered: string[],
  librarySignals: CampaignSignalOption[],
  originalTokens: string[]
): string[] {
  const signalById = new Map(librarySignals.map((signal) => [signal.id, signal]));
  const explicitUuidInCampaign = new Set(originalTokens.filter(isUuidLike));

  const idsByNameKey = new Map<string, string[]>();
  for (const id of resolvedIdsOrdered) {
    const sig = signalById.get(id);
    if (!sig) continue;
    const key = sig.name.trim().toLowerCase();
    const list = idsByNameKey.get(key) ?? [];
    list.push(id);
    idsByNameKey.set(key, list);
  }

  function pickNewest(ids: string[]): string {
    if (ids.length === 1) return ids[0];
    return ids.reduce((best, id) => {
      const a = signalById.get(id)?.updated_at ?? "";
      const b = signalById.get(best)?.updated_at ?? "";
      return a >= b ? id : best;
    });
  }

  function pickWinnerForName(ids: string[]): string {
    if (ids.length === 1) return ids[0];
    const explicit = ids.filter((id) => explicitUuidInCampaign.has(id));
    if (explicit.length === 1) return explicit[0];
    if (explicit.length > 1) return pickNewest(explicit);
    return pickNewest(ids);
  }

  const seenName = new Set<string>();
  const out: string[] = [];
  for (const id of resolvedIdsOrdered) {
    const sig = signalById.get(id);
    if (!sig) continue;
    const key = sig.name.trim().toLowerCase();
    if (seenName.has(key)) continue;
    seenName.add(key);
    const group = idsByNameKey.get(key) ?? [id];
    out.push(pickWinnerForName(group));
  }
  return out;
}

export function resolveSelectedSignalIdsFromTokens({
  selectedTokens,
  librarySignals
}: {
  selectedTokens?: string[] | null;
  librarySignals: CampaignSignalOption[];
}) {
  const normalizedTokens = normalizeSignalTokens(selectedTokens);
  if (normalizedTokens.length === 0 || librarySignals.length === 0) {
    return [] as string[];
  }

  const signalById = new Map(librarySignals.map((signal) => [signal.id, signal]));
  const signalIdByName = new Map(
    librarySignals
      .map((signal) => [signal.name.trim().toLowerCase(), signal.id] as const)
      .filter(([name]) => Boolean(name))
  );

  const resolvedOrdered = normalizedTokens
    .map((token) => {
      if (isUuidLike(token)) {
        return token;
      }
      return signalIdByName.get(token.trim().toLowerCase()) ?? "";
    })
    .filter((signalId) => signalById.has(signalId));

  const collapsed = dedupeResolvedIdsBySignalName(resolvedOrdered, librarySignals, normalizedTokens);
  return normalizeSignalTokens(collapsed);
}

export function getRenderableSignalIds(librarySignals: CampaignSignalOption[]) {
  return normalizeSignalTokens(librarySignals.map((signal) => signal.id));
}
