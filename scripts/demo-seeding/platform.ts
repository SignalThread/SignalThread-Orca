import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PlatformAdapter, PlatformContext, AdapterResult } from './adapters.ts';
import type { Product, SeedConfig } from './config.ts';
import { recordRow, type OwnershipManifest } from './ownership.ts';
import type { CanonicalEventSnapshot, EventWorld } from './world.ts';

export const PLATFORM_CORE_REF = 'wtbnpeluwhjjqccdofxd';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PlatformEnv = { url: string; serviceRoleKey: string };
type Row = Record<string, unknown>;
let eventDescriptionColumns = false;

function requirePlatformEnv(): PlatformEnv {
  const url = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.PLATFORM_CORE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error('Platform Core URL and service-role key are required');
  const parsed = new URL(url);
  const claims = JSON.parse(Buffer.from(serviceRoleKey.split('.')[1] ?? '', 'base64url').toString('utf8')) as { ref?: string };
  if (parsed.origin !== `https://${PLATFORM_CORE_REF}.supabase.co` || claims.ref !== PLATFORM_CORE_REF) {
    throw new Error(`Platform target refused; expected ${PLATFORM_CORE_REF}`);
  }
  return { url: parsed.origin, serviceRoleKey };
}

function client(): SupabaseClient {
  const env = requirePlatformEnv();
  return createClient(env.url, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function mutation<T>(label: string, action: (db: SupabaseClient) => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  // This assertion intentionally runs immediately before every Platform mutation.
  requirePlatformEnv();
  const result = await action(client());
  if (result.error || result.data === null) throw new Error(`Platform ${label} failed: ${result.error?.message ?? 'no row returned'}`);
  return result.data;
}

async function readOne(db: SupabaseClient, table: string, id: string): Promise<Row | null> {
  const result = await db.from(table).select('*').eq('id', id).maybeSingle();
  if (result.error) throw new Error(`Platform ${table} read failed: ${result.error.message}`);
  return result.data as Row | null;
}

function receipt(manifest: OwnershipManifest, table: string, row: Row, organizationId: string, eventId: string | null, existed: boolean): OwnershipManifest {
  return recordRow(manifest, { database: 'platform', target: PLATFORM_CORE_REF, table, id: String(row.id ?? row.user_id), organizationId, eventId, disposition: existed ? 'borrowed' : 'created' }, row);
}

function slugFor(runId: string, suffix = ''): string {
  return `st-demo-${runId.slice(-12)}${suffix}`.slice(0, 63);
}

async function listUserByEmail(db: SupabaseClient, email: string) {
  const response = await db.auth.admin.listUsers({ perPage: 200 });
  if (response.error) throw new Error(`Platform user lookup failed: ${response.error.message}`);
  return response.data.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function syncClaims(db: SupabaseClient, userId: string, anchor: string): Promise<void> {
  const memberships = await db.from('organization_memberships').select('organization_id, role, status, organizations!inner(status)').eq('user_id', userId).eq('status', 'ACTIVE');
  if (memberships.error) throw new Error(memberships.error.message);
  const orgIds = (memberships.data ?? []).filter((row: any) => row.organizations?.status === 'ACTIVE').map((row) => String(row.organization_id));
  const entitlements = orgIds.length ? await db.from('organization_product_entitlements').select('organization_id, product_key').in('organization_id', orgIds).eq('status', 'ACTIVE') : { data: [], error: null };
  if (entitlements.error) throw new Error(entitlements.error.message);
  const products = new Map<string, string[]>();
  for (const row of entitlements.data ?? []) products.set(String(row.organization_id), [...(products.get(String(row.organization_id)) ?? []), String(row.product_key)]);
  const access = (memberships.data ?? []).filter((row: any) => row.organizations?.status === 'ACTIVE').map((row: any) => ({ organization_id: row.organization_id, organization_role: row.role, products: [...new Set(products.get(String(row.organization_id)) ?? [])].sort() })).sort((a, b) => String(a.organization_id).localeCompare(String(b.organization_id)));
  const admin = await db.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (admin.error) throw new Error(admin.error.message);
  const existing = await db.auth.admin.getUserById(userId);
  if (existing.error || !existing.data.user) throw new Error(existing.error?.message ?? 'Platform user disappeared');
  const appMetadata = { ...(existing.data.user.app_metadata ?? {}), signalthread: { v: 1, access, platform_admin: Boolean(admin.data), synced_at: anchor } };
  requirePlatformEnv();
  const updated = await db.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  if (updated.error) throw new Error(`Platform claims sync failed: ${updated.error.message}`);
}

export function createPlatformAdapter(): PlatformAdapter {
  return {
    async preflight() {
      const env = requirePlatformEnv();
      const db = client();
      const [product, schema] = await Promise.all([db.from('products').select('key').eq('key', 'orca').maybeSingle(), fetch(`${env.url}/rest/v1/`, { headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` } })]);
      if (product.error || !product.data || !schema.ok) throw new Error('Platform Core canonical registry preflight failed');
      const specification = await schema.json() as { definitions?: { events?: { properties?: Record<string, unknown> } } };
      const eventColumns = specification.definitions?.events?.properties ?? {};
      eventDescriptionColumns = Boolean(eventColumns.venue && eventColumns.timezone);
      return { identity: `supabase:${PLATFORM_CORE_REF}`, verified: true };
    },
    async readExistingEvent(config: SeedConfig): Promise<CanonicalEventSnapshot> {
      if (!config.existingEventId || !config.organizationId) throw new Error('Attach identifiers are required');
      const db = client();
      const event = await db.from('events').select('id, organization_id, name, starts_at, ends_at, venue, timezone, organizations!inner(name)').eq('id', config.existingEventId).eq('organization_id', config.organizationId).maybeSingle();
      if (event.error || !event.data) throw new Error('Existing Platform event scope could not be verified');
      const row: any = event.data;
      return { id: row.id, organizationId: row.organization_id, organizationName: row.organizations.name, name: row.name, startsAt: row.starts_at, endsAt: row.ends_at, timezone: row.timezone ?? 'America/New_York', venue: row.venue ?? 'Venue not set', authorized: true };
    },
    async provision(world: EventWorld, config: SeedConfig, initial: OwnershipManifest) {
      const db = client();
      let manifest = initial;
      const organizationId = world.organization.key;
      const existingOrg = await readOne(db, 'organizations', organizationId);
      if (existingOrg && !String(existingOrg.slug).startsWith('st-demo-')) throw new Error('Deterministic Platform organization id collides with an unowned row');
      const orgRows = await mutation<Row[]>('organization upsert', (target) => target.from('organizations').upsert({ id: organizationId, slug: slugFor(config.runId), name: world.organization.name, status: 'ACTIVE' }, { onConflict: 'id' }).select());
      manifest = receipt(manifest, 'organizations', orgRows[0]!, organizationId, null, Boolean(existingOrg));

      let authUser = await listUserByEmail(db, world.organizer.email);
      const userExisted = Boolean(authUser);
      if (!authUser) {
        requirePlatformEnv();
        const created = await db.auth.admin.createUser({ email: world.organizer.email, email_confirm: true, user_metadata: { name: world.organizer.name } });
        if (created.error || !created.data.user) throw new Error(`Platform identity create failed: ${created.error?.message}`);
        authUser = created.data.user;
      }
      if (!UUID_RE.test(authUser.id)) throw new Error('Platform returned a malformed canonical user id');
      manifest = receipt(manifest, 'auth.users', { id: authUser.id, email: authUser.email }, organizationId, null, userExisted);

      const membershipExisting = await db.from('organization_memberships').select('*').eq('organization_id', organizationId).eq('user_id', authUser.id).maybeSingle();
      if (membershipExisting.error) throw new Error(membershipExisting.error.message);
      const membershipRows = await mutation<Row[]>('organization membership upsert', (target) => target.from('organization_memberships').upsert({ organization_id: organizationId, user_id: authUser!.id, role: 'OWNER', status: 'ACTIVE' }, { onConflict: 'organization_id,user_id' }).select());
      manifest = receipt(manifest, 'organization_memberships', membershipRows[0]!, organizationId, null, Boolean(membershipExisting.data));

      const eventMappings: PlatformContext['events'] = [];
      for (const [index, event] of world.events.entries()) {
        const eventId = event.key;
        const existing = await readOne(db, 'events', eventId);
        if (existing && existing.organization_id !== organizationId) throw new Error('Canonical event id is already owned by another organization');
        const eventRows = await mutation<Row[]>('event upsert', (target) => target.from('events').upsert({ id: eventId, organization_id: organizationId, slug: slugFor(config.runId, `-${index + 1}`), name: event.name, status: 'ACTIVE', starts_at: event.startsAt, ends_at: event.endsAt, ...(eventDescriptionColumns ? { venue: event.venue, timezone: event.timezone } : {}) }, { onConflict: 'id' }).select());
        manifest = receipt(manifest, 'events', eventRows[0]!, organizationId, eventId, Boolean(existing));
        const memberExisting = await db.from('event_memberships').select('*').eq('event_id', eventId).eq('user_id', authUser.id).maybeSingle();
        if (memberExisting.error) throw new Error(memberExisting.error.message);
        const memberRows = await mutation<Row[]>('event membership upsert', (target) => target.from('event_memberships').upsert({ event_id: eventId, user_id: authUser!.id, role: 'ORGANIZER' }, { onConflict: 'event_id,user_id' }).select());
        manifest = receipt(manifest, 'event_memberships', memberRows[0]!, organizationId, eventId, Boolean(memberExisting.data));
        eventMappings.push({ worldEventKey: event.key, canonicalEventId: eventId });
      }

      for (const product of config.products) {
        const productKey = product === 'lr' ? 'lead-retrieval' : product;
        const existing = await db.from('organization_product_entitlements').select('*').eq('organization_id', organizationId).eq('product_key', productKey).maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        const rows = await mutation<Row[]>('product entitlement upsert', (target) => target.from('organization_product_entitlements').upsert({ organization_id: organizationId, product_key: productKey, status: 'ACTIVE' }, { onConflict: 'organization_id,product_key' }).select());
        manifest = receipt(manifest, 'organization_product_entitlements', rows[0]!, organizationId, null, Boolean(existing.data));
      }
      await syncClaims(db, authUser.id, config.anchor);
      const context: PlatformContext = { organizationId, organizerUserId: authUser.id, events: eventMappings, entitledProducts: [...config.products] };
      const validations = [
        { label: 'canonical organization', passed: true, detail: organizationId },
        { label: 'canonical organizer identity and membership', passed: true, detail: authUser.id },
        { label: 'canonical events and organizer ownership', passed: eventMappings.length === world.events.length },
        { label: 'active product entitlements and derived claims', passed: true, detail: config.products.join(',') },
      ];
      const result: AdapterResult = { product: 'platform', counts: { organizations: 1, organizers: 1, memberships: 1, events: eventMappings.length, entitlements: config.products.length }, manifest, validations };
      return { context, result };
    },
  };
}
