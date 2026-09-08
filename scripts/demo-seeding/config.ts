import { fingerprint } from './random.ts';

export const PRODUCTS = ['orca', 'lr', 'pulse'] as const;
export type Product = typeof PRODUCTS[number];
export type Richness = 'SMOKE' | 'DEMO' | 'SHOWCASE';
export type Lifecycle = 'PRE' | 'DURING' | 'POST';
export type Operation = 'create' | 'rerun' | 'reset' | 'attach';
export type Scale = { attendees: number; sessions: number; speakers: number; rooms: number; leadsPerCompany: number; pulseResponses: number; pulseTranscripts: number };
export type Scenario = {
  key: string; version: number; name: string; theme: string; venue: string; timezone: string;
  defaults?: Partial<{ product: 'all' | Product; richness: Richness; lifecycle: Lifecycle; events: number; seed: number; lrMode: 'direct' | 'organizer'; companiesPerEvent: number; anchor: string }>;
  scale?: Partial<Record<Richness, Partial<Scale>>>;
};
export type SeedConfig = {
  scenario: string; scenarioVersion: number; products: Product[]; events: number; lifecycle: Lifecycle; richness: Richness;
  seed: number; anchor: string; lr: { mode: 'direct' | 'organizer'; companiesPerEvent: number } | null;
  scale: Scale; operation: Operation; existingEventId: string | null; organizationId: string | null;
  dryRun: boolean; json: boolean; manifestPath: string | null; runId: string; worldKey: string; configHash: string;
};
export const ENTERPRISE: Scenario = {
  key: 'enterprise-conference', version: 1, name: 'SignalThread Future of Events Summit',
  theme: 'Practical intelligence for connected event teams', venue: 'Harbor Conference Center', timezone: 'America/New_York',
};
export const RICHNESS: Record<Richness, Scale> = {
  SMOKE: { attendees: 18, sessions: 3, speakers: 4, rooms: 2, leadsPerCompany: 8, pulseResponses: 18, pulseTranscripts: 6 },
  DEMO: { attendees: 320, sessions: 12, speakers: 16, rooms: 5, leadsPerCompany: 48, pulseResponses: 240, pulseTranscripts: 80 },
  SHOWCASE: { attendees: 850, sessions: 24, speakers: 31, rooms: 8, leadsPerCompany: 90, pulseResponses: 650, pulseTranscripts: 220 },
};
const VALUE_FLAGS = new Set(['product', 'scenario', 'events', 'lifecycle', 'richness', 'seed', 'lr-mode', 'lr-companies', 'existing-event', 'organization-id', 'operation', 'manifest', 'anchor']);
const BOOL_FLAGS = new Set(['dry-run', 'json']);
export function requireUuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${label} must be a canonical UUID`);
  return value.toLowerCase();
}
function integer(value: string, label: string, min: number, max: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be an integer`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label} must be ${min}..${max}`);
  return n;
}
function choice<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${label} must be ${allowed.join(', ')}`);
  return value as T;
}
export function parseConfig(argv: readonly string[], scenarios: readonly Scenario[] = [ENTERPRISE]): SeedConfig {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [name, ...tail] = arg.slice(2).split('=');
    if (!VALUE_FLAGS.has(name!) && !BOOL_FLAGS.has(name!)) throw new Error(`Unknown option: --${name}`);
    if (values.has(name!)) throw new Error(`Duplicate option: --${name}`);
    if (BOOL_FLAGS.has(name!)) {
      if (tail.length) throw new Error(`--${name} takes no value`);
      values.set(name!, 'true'); continue;
    }
    const value = tail.length ? tail.join('=') : argv[++i];
    if (!value?.trim() || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    values.set(name!, value.trim());
  }
  const scenario = scenarios.find((s) => s.key === (values.get('scenario') ?? ENTERPRISE.key));
  if (!scenario) throw new Error('Unknown scenario');
  const d = scenario.defaults ?? {};
  const selection = choice(values.get('product') ?? d.product ?? 'all', ['all', ...PRODUCTS], '--product');
  const products = selection === 'all' ? [...PRODUCTS] : [selection];
  const richness = choice((values.get('richness') ?? d.richness ?? 'DEMO').toUpperCase(), ['SMOKE', 'DEMO', 'SHOWCASE'], '--richness');
  const lifecycle = choice((values.get('lifecycle') ?? d.lifecycle ?? 'POST').toUpperCase(), ['PRE', 'DURING', 'POST'], '--lifecycle');
  const events = integer(values.get('events') ?? String(d.events ?? 1), '--events', 1, 24);
  const seed = integer(values.get('seed') ?? String(d.seed ?? 20260907), '--seed', 0, 4294967295);
  const anchor = values.get('anchor') ?? d.anchor ?? '2026-09-07T12:00:00.000Z';
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(anchor) || !Number.isFinite(Date.parse(anchor)) || new Date(anchor).toISOString().slice(0, 19) !== anchor.slice(0, 19)) throw new Error('--anchor must be a valid UTC ISO timestamp');
  const lrMode = choice(values.get('lr-mode') ?? d.lrMode ?? (selection === 'lr' ? 'direct' : 'organizer'), ['direct', 'organizer'], '--lr-mode');
  if (!products.includes('lr') && (values.has('lr-mode') || values.has('lr-companies'))) throw new Error('LR options require LR product selection');
  if (lrMode === 'direct' && values.has('lr-companies')) throw new Error('--lr-companies is per event in organizer mode; direct mode has one account');
  const companyDefault = richness === 'SMOKE' ? 2 : richness === 'DEMO' ? 6 : 20;
  const companiesPerEvent = lrMode === 'direct' ? 1 : integer(values.get('lr-companies') ?? String(d.companiesPerEvent ?? companyDefault), '--lr-companies', 1, 100);
  const existingEventId = values.has('existing-event') ? requireUuid(values.get('existing-event')!, '--existing-event') : null;
  const organizationId = values.has('organization-id') ? requireUuid(values.get('organization-id')!, '--organization-id') : null;
  const operation = choice(values.get('operation') ?? (existingEventId ? 'attach' : 'create'), ['create', 'rerun', 'reset', 'attach'], '--operation');
  if (operation === 'attach' && (!existingEventId || !organizationId)) throw new Error('Attach requires --existing-event and --organization-id');
  if (existingEventId && (events !== 1 || selection === 'all' || ['events', 'anchor', 'lifecycle'].some((f) => values.has(f)))) throw new Error('Attach requires one selected product and cannot override canonical event dates/count');
  if (existingEventId && operation === 'create') throw new Error('Use attach for an existing event');
  if (organizationId && !existingEventId) throw new Error('--organization-id is only valid with --existing-event');
  if (existingEventId && !organizationId) throw new Error('Existing event requires explicit organization scope');
  const manifestPath = values.get('manifest') ?? null;
  if (['reset', 'rerun'].includes(operation) && !manifestPath) throw new Error('Reset/rerun requires an ownership manifest; seed IDs alone do not prove ownership');
  const scale = { ...RICHNESS[richness], ...scenario.scale?.[richness] };
  for (const [key, value] of Object.entries(scale)) if (!Number.isSafeInteger(value) || value < 1 || value > 100000) throw new Error(`Invalid scenario scale: ${key}`);
  if (scale.pulseTranscripts > scale.pulseResponses) throw new Error('Transcripts cannot exceed responses');
  // Product selection is not event identity: attaching Pulse cannot create a second world.
  const identity = { scenario: scenario.key, version: scenario.version, seed, existingEventId, organizationId };
  const worldKey = `st-demo-${fingerprint(identity).slice(0, 24)}`;
  const content = { ...identity, events, lifecycle, richness, anchor: new Date(anchor).toISOString(), lr: products.includes('lr') ? { mode: lrMode, companiesPerEvent } : null, scale };
  return { ...content, scenarioVersion: scenario.version, products, operation, dryRun: values.has('dry-run'), json: values.has('json'), manifestPath, worldKey, runId: worldKey, configHash: fingerprint(content) };
}
