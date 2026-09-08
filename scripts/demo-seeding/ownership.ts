import { readFile, writeFile } from 'node:fs/promises';
import { fingerprint } from './random.ts';
import type { SeedConfig } from './config.ts';

export type DatabaseKey = 'platform' | 'orca' | 'lr' | 'pulse';
export type OwnedRow = {
  database: DatabaseKey; target: string; table: string; id: string;
  organizationId: string; eventId: string | null; fingerprint: string; disposition: 'created' | 'borrowed';
};
export type OwnershipManifest = {
  system: 'signalthread-demo'; version: 1; runId: string; configHash: string;
  records: OwnedRow[];
};
const key = (row: Pick<OwnedRow, 'database' | 'target' | 'table' | 'id'>) => JSON.stringify([row.database, row.target, row.table, row.id]);
export function newManifest(config: SeedConfig): OwnershipManifest {
  return { system: 'signalthread-demo', version: 1, runId: config.runId, configHash: config.configHash, records: [] };
}
export function validateManifest(value: unknown): asserts value is OwnershipManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid ownership manifest');
  const m = value as Partial<OwnershipManifest>;
  if (m.system !== 'signalthread-demo' || m.version !== 1 || !/^st-demo-[0-9a-f]{24}$/.test(m.runId ?? '') || !/^[a-f0-9]{64}$/.test(m.configHash ?? '') || !Array.isArray(m.records)) throw new Error('Invalid ownership manifest');
  const seen = new Set<string>();
  for (const row of m.records) {
    if (!row || !['platform', 'orca', 'lr', 'pulse'].includes(row.database) || !['created', 'borrowed'].includes(row.disposition) || !['target', 'table', 'id', 'organizationId'].every((field) => typeof row[field as keyof OwnedRow] === 'string' && String(row[field as keyof OwnedRow]).length > 0) || !(row.eventId === null || typeof row.eventId === 'string') || !/^[a-f0-9]{64}$/.test(row.fingerprint)) throw new Error('Invalid ownership receipt');
    if (seen.has(key(row))) throw new Error('Duplicate ownership receipt');
    seen.add(key(row));
  }
}
/** The caller records the returned database row, never just the proposed payload. */
export function recordRow(manifest: OwnershipManifest, row: Omit<OwnedRow, 'fingerprint'>, persistedSnapshot: unknown): OwnershipManifest {
  validateManifest(manifest);
  if (manifest.records.some((r) => key(r) === key(row))) throw new Error('Ownership already recorded; do not silently take over or overwrite a receipt');
  const result = { ...manifest, records: [...manifest.records, { ...row, fingerprint: fingerprint(persistedSnapshot) }] };
  validateManifest(result);
  return result;
}
export function assertManifestScope(manifest: OwnershipManifest, config: SeedConfig): void {
  validateManifest(manifest);
  if (manifest.runId !== config.runId || manifest.configHash !== config.configHash) throw new Error('Ownership manifest does not match scenario/seed/config; refusing scope change');
}
export type ObservedRow = Omit<OwnedRow, 'fingerprint' | 'disposition'> & { snapshot: unknown; unownedDependents: number };
/** Live readback is mandatory. This returns an exact deletion allowlist, never a broad WHERE scope. */
export function planOwnedReset(manifest: OwnershipManifest, config: SeedConfig, observed: readonly ObservedRow[]): OwnedRow[] {
  assertManifestScope(manifest, config);
  const observations = new Map(observed.map((row) => [key(row), row]));
  if (observations.size !== observed.length) throw new Error('Duplicate live observations');
  const owned = manifest.records.filter((row) => row.disposition === 'created');
  for (const row of owned) {
    const current = observations.get(key(row));
    if (!current) throw new Error(`Missing live readback for ${row.database}/${row.table}/${row.id}`);
    if (current.organizationId !== row.organizationId || current.eventId !== row.eventId || fingerprint(current.snapshot) !== row.fingerprint) throw new Error(`Owned row changed or moved: ${row.table}/${row.id}`);
    if (current.unownedDependents !== 0) throw new Error(`Reset would affect unowned dependents: ${row.table}/${row.id}`);
  }
  // Adapters supply dependency-safe deletion order and re-check within their transaction.
  return owned;
}
export async function readManifest(file: string): Promise<OwnershipManifest> {
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
  validateManifest(parsed);
  return parsed;
}
/** Immutable receipts: never overwrite a journal. Later checkpoints use new files. */
export async function saveManifest(file: string, manifest: OwnershipManifest): Promise<void> {
  validateManifest(manifest);
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
/** Mutation adapters must verify their actual connection before any write; production is never allowed. */
export function assertLocalTarget(url: string, environment: string): string {
  const parsed = new URL(url);
  if (environment !== 'development' && environment !== 'test') throw new Error('Seeding requires an explicit non-production environment');
  if (!['http:', 'https:', 'postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())) throw new Error('Only positively verified local demo targets are supported; remote/legacy targets are refused');
  // No password, username or query strings in reports or ownership journals.
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}
