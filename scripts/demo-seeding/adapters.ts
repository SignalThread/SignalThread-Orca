import type { Product, SeedConfig } from './config.ts';
import type { CanonicalEventSnapshot, EventWorld } from './world.ts';
import type { OwnershipManifest } from './ownership.ts';

export const PLATFORM_PRODUCT_KEYS: Record<Product, string> = { orca: 'orca', lr: 'lead-retrieval', pulse: 'pulse' };
export type PlatformContext = {
  organizationId: string; organizerUserId: string;
  events: { worldEventKey: string; canonicalEventId: string }[];
  /** Returned only after canonical membership, entitlement and claim synchronization. */
  entitledProducts: Product[];
};
export type AdapterResult = {
  product: 'platform' | Product; details?: unknown; counts: Record<string, number>; manifest: OwnershipManifest;
  validations: { label: string; passed: boolean; detail?: string }[];
};
export type VerifiedTarget = { identity: string; verified: true };
export interface PlatformAdapter {
  preflight(config: SeedConfig): Promise<VerifiedTarget>;
  readExistingEvent(config: SeedConfig): Promise<CanonicalEventSnapshot>;
  provision(world: EventWorld, config: SeedConfig, manifest: OwnershipManifest): Promise<{ context: PlatformContext; result: AdapterResult }>;
}
export interface ProductAdapter {
  product: Product;
  preflight(config: SeedConfig): Promise<VerifiedTarget>;
  seed(world: EventWorld, config: SeedConfig, context: PlatformContext, manifest: OwnershipManifest): Promise<AdapterResult>;
  /** Must re-read receipt fingerprints and all destructive FK effects inside its transaction. */
  reset(config: SeedConfig, manifest: OwnershipManifest): Promise<AdapterResult>;
}
export type AdapterRegistry = { platform?: PlatformAdapter; products: Partial<Record<Product, ProductAdapter>> };
/** Fail before the first write if any enabled product cannot participate. No success-shaped placeholders. */
export async function preflightAdapters(config: SeedConfig, registry: AdapterRegistry): Promise<void> {
  const missing = [...(!registry.platform ? ['platform'] : []), ...config.products.filter((p) => !registry.products[p])];
  if (missing.length) throw new Error(`Persistence adapters are not installed: ${missing.join(', ')}. Use --dry-run to inspect the Loop 1 plan.`);
  for (const product of config.products) if (registry.products[product]!.product !== product) throw new Error('Product adapter registration mismatch');
  const targets = await Promise.all([registry.platform!.preflight(config), ...config.products.map((p) => registry.products[p]!.preflight(config))]);
  const identities = targets.map((target) => {
    if (target.verified !== true || !target.identity) throw new Error('Adapter target was not positively verified');
    return target.identity;
  });
  if (new Set(identities).size !== identities.length) throw new Error('Product databases must not share a connection target');
}
