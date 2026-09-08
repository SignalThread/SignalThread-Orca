import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { ProductAdapter } from './adapters.ts';
import { generateLrWorld } from './lr-world.ts';
import { deriveLrFacts, companyBrief, organizerBrief, intelligenceRows, type FactLead } from './lr-intelligence.ts';
import { logicalId, fingerprint, stableJson } from './random.ts';
import { recordRow, saveManifest, type OwnershipManifest } from './ownership.ts';

export const LR_PROJECT_REF = 'wsbdyemyzixkyvuiyesm';
export function lrClient(): SupabaseClient {
  const url = process.env.LR_SUPABASE_URL?.trim();
  const key = process.env.LR_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('LR_SUPABASE_URL and LR_SERVICE_ROLE_KEY are required');
  const claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()) as { ref?: string; role?: string };
  if (new URL(url).origin !== `https://${LR_PROJECT_REF}.supabase.co` || claims.ref !== LR_PROJECT_REF || claims.role !== 'service_role') throw new Error(`LR target refused; expected ${LR_PROJECT_REF}`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type Row = Record<string, any>;
const checked = <T>(result: { data: T; error: { message: string } | null }, label: string): T => {
  if (result.error) throw new Error(`LR ${label}: ${result.error.message}`);
  return result.data;
};

export async function readLrPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, offset + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function assertLrExistingRow(prior: OwnershipManifest | null | undefined, organizationId: string, table: string, row: Row): void {
  const receipt = prior?.records.find(r => r.database === 'lr' && r.target === LR_PROJECT_REF && r.table === table && r.id === row.id && r.organizationId === organizationId);
  if (!receipt || receipt.fingerprint !== fingerprint(row)) throw new Error(`LR unowned or changed collision: ${table}/${row.id}`);
}

export function createLeadRetrievalAdapter(prior?: OwnershipManifest | null): ProductAdapter {
  return {
    product: 'lr',
    async preflight() {
      const db = lrClient();
      for (const [table, fields] of [['users', 'id,platform_user_id'], ['companies', 'id,platform_organization_id'], ['events', 'id,platform_event_id,timezone'], ['leads', 'id,follow_up_at,follow_up_completed_at']]) {
        checked(await db.from(table!).select(fields!).limit(0), `${table} schema preflight`);
      }
      return { identity: `supabase:${LR_PROJECT_REF}`, verified: true };
    },
    async seed(world, config, context, initial) {
      const db = lrClient();
      const generated = generateLrWorld(world, config);
      let manifest = initial;
      const checkpointBase = config.manifestPath ?? `/private/tmp/${config.runId}.manifest.json`;
      let checkpoint = 0;
      let batching = false;
      const checkpointNonce = process.pid;
      async function remember(table: string, row: Row, eventId: string | null, existed: boolean) {
        manifest = recordRow(manifest, { database: 'lr', target: LR_PROJECT_REF, table, id: String(row.id), organizationId: context.organizationId, eventId, disposition: existed ? 'borrowed' : 'created' }, row);
        // Durable immutable receipts survive failures in later API calls. A row with
        // no receipt is refused, even if its deterministic ID or name matches.
        if (!batching) await saveManifest(`${checkpointBase}.lr-${checkpointNonce}-${++checkpoint}.json`, manifest);
      }
      function assertPayload(existing: Row, payload: Row, table: string) {
        for (const [field, value] of Object.entries(payload)) {
            const normalize = (v: any) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toISOString() : v;
            if (stableJson(normalize(existing[field])) !== stableJson(normalize(value))) throw new Error(`LR rerun payload changed: ${table}.${field}`);
        }
      }
      async function put(table: string, payload: Row, eventId: string | null = null) {
        const existing = checked(await db.from(table).select('*').eq('id', payload.id).maybeSingle(), `${table} collision read`) as Row | null;
        if (existing) {
          assertLrExistingRow(prior, context.organizationId, table, existing);
          // No updates on rerun: preserve live data and reject changed configuration.
          assertPayload(existing, payload, table);
          await remember(table, existing, eventId, true);
          return existing;
        }
        lrClient();
        const row = checked(await db.from(table).insert(payload).select('*').single(), `${table} insert`) as Row;
        await remember(table, row, eventId, false);
        return row;
      }
      async function putMany(table: string, payloads: Row[], eventId: string) {
        for (let offset = 0; offset < payloads.length; offset += 100) {
          const batch = payloads.slice(offset, offset + 100);
          const existing = checked(await db.from(table).select('*').in('id', batch.map(r => r.id)), `${table} batch collision read`) as Row[];
          const old = new Map(existing.map(r => [r.id, r]));
          for (const payload of batch) if (old.has(payload.id)) {
            assertLrExistingRow(prior, context.organizationId, table, old.get(payload.id)!);
            assertPayload(old.get(payload.id)!, payload, table);
          }
          const missing = batch.filter(r => !old.has(r.id));
          lrClient();
          const created = missing.length ? checked(await db.from(table).insert(missing).select('*'), `${table} batch insert`) as Row[] : [];
          if (created.length !== missing.length) throw new Error(`LR ${table} incomplete insert readback`);
          const fresh = new Map(created.map(r => [r.id, r]));
          batching = true;
          try { for (const payload of batch) await remember(table, old.get(payload.id) ?? fresh.get(payload.id)!, eventId, old.has(payload.id)); }
          finally { batching = false; }
          await saveManifest(`${checkpointBase}.lr-${checkpointNonce}-${++checkpoint}.json`, manifest);
        }
      }
      async function authUser(key: string, name: string, email: string) {
        const receipt = prior?.records.find(r => r.database === 'lr' && r.table === 'auth.users' && r.eventId === null && r.id === key);
        const read = await db.auth.admin.getUserById(key);
        if (read.data.user) {
          const snapshot = { id: read.data.user.id, email: read.data.user.email };
          if (!receipt || receipt.fingerprint !== fingerprint(snapshot)) throw new Error('LR Auth identity exists without an unchanged ownership receipt');
          await remember('auth.users', snapshot, null, true);
          return key;
        }
        if (read.error && ![404, 422].includes(read.error.status ?? 0)) throw new Error(`LR Auth lookup failed: ${read.error.message}`);
        lrClient();
        const created = await db.auth.admin.createUser({ id: key, email, email_confirm: true, user_metadata: { name } } as any);
        if (created.error || created.data.user?.id !== key) throw new Error(`LR Auth create failed: ${created.error?.message ?? 'identity mismatch'}`);
        await remember('auth.users', { id: key, email: created.data.user.email }, null, false);
        return key;
      }
      const organizerId = logicalId(world.worldKey, 'lr:organizer');
      await authUser(organizerId, world.organizer.name, `lr.${world.organizer.email}`);
      const ownerCompanyId = generated.mode === 'direct' ? generated.companies[0]!.key : logicalId(world.worldKey, 'lr:organizer-company');
      const allCompanies = generated.mode === 'direct' ? generated.companies : [{ key: ownerCompanyId, name: world.organization.name, staff: [] }, ...generated.companies];
      for (const company of allCompanies) {
        await put('companies', { id: company.key, name: company.name, organizer_id: organizerId, platform_organization_id: context.organizationId });
        // Company's canonical insert trigger creates default email templates. Keep
        // them in the journal; no external email provider is configured or called.
        const templates = checked(await db.from('email_templates').select('*').eq('account_id', company.key), 'company template readback') as Row[];
        for (const template of templates) await remember('email_templates', template, null, Boolean(prior));
      }
      await put('users', { id: organizerId, full_name: world.organizer.name, email: `lr.${world.organizer.email}`, company_id: ownerCompanyId, role: generated.mode === 'direct' ? 'exhibitor_admin' : 'event_organizer', platform_user_id: context.organizerUserId, event_access_mode: 'all_company_events' });
      for (const company of generated.companies) for (const staff of company.staff) {
        await authUser(staff.key, staff.name, staff.email);
        await put('users', { id: staff.key, full_name: staff.name, email: staff.email, company_id: company.key, role: 'exhibitor_viewer', platform_user_id: null, event_access_mode: 'assigned_events_only' });
      }
      const licenseEnd = new Date(Date.parse(config.anchor) + 365 * 86400000).toISOString().slice(0, 10);
      if (generated.mode === 'direct') await put('licenses', { id: logicalId(ownerCompanyId, 'portfolio-license'), company_id: ownerCompanyId, exhibitor_company_id: ownerCompanyId, seats_total: 10, seats_used: generated.companies[0]!.staff.length + 1, status: 'active', expires_at: licenseEnd, scope: 'company', billing: 'one_time', billing_source: 'internal', license_key: `ST-${ownerCompanyId}`, can_create_events: true, max_events: config.events });
      let totalLeads = 0;
      const intelligenceCounts: Record<string, number> = {};
      const summaries: { name: string; eventId: string; facts: ReturnType<typeof deriveLrFacts>; brief: string }[] = [];
      const eventIds: string[] = [];
      for (const event of world.events) {
        const canonicalId = context.events.find(e => e.worldEventKey === event.key)?.canonicalEventId;
        if (!canonicalId) throw new Error('LR canonical event context missing');
        const eventId = logicalId(event.key, 'lr:event');
        eventIds.push(eventId);
        const mapped = checked(await db.from('events').select('id').eq('platform_event_id', canonicalId).maybeSingle(), 'canonical mapping collision') as Row | null;
        if (mapped && mapped.id !== eventId) throw new Error('Existing LR mapping must be reused by its owner; refusing a duplicate or re-parent');
        await put('events', { id: eventId, company_id: ownerCompanyId, platform_event_id: canonicalId, name: event.name, start_date: event.startsAt.slice(0, 10), end_date: event.endsAt.slice(0, 10), timezone: event.timezone, location: event.venue, status: event.lifecycle === 'POST' ? 'COMPLETED' : event.lifecycle === 'DURING' ? 'ACTIVE' : 'UPCOMING', container_kind: 'event', is_active: event.lifecycle === 'DURING' }, eventId);
        const part = generated.events.find(e => e.key === event.key)!;
        await put('event_users', { id: logicalId(eventId, organizerId), event_id: eventId, user_id: organizerId, exhibitor_company_id: ownerCompanyId, status: 'active', permissions: { app: true, admin: true } }, eventId);
        for (const companyKey of part.companyKeys) {
          const company = generated.companies.find(c => c.key === companyKey)!;
          await put('exhibitors', { id: logicalId(eventId, companyKey), event_id: eventId, company_id: companyKey, status: 'active' }, eventId);
          if (generated.mode === 'organizer') await put('licenses', { id: logicalId(eventId, `${companyKey}:license`), event_id: eventId, company_id: ownerCompanyId, exhibitor_company_id: companyKey, seats_total: company.staff.length, seats_used: company.staff.length, status: 'active', expires_at: licenseEnd, scope: 'event', billing: 'one_time', billing_source: 'internal', license_key: `ST-${eventId}-${companyKey}` }, eventId);
          for (const staff of company.staff) await put('event_users', { id: logicalId(eventId, staff.key), event_id: eventId, user_id: staff.key, exhibitor_company_id: companyKey, status: 'active', permissions: { app: true, admin: false } }, eventId);
        }
        await putMany('leads', part.leads.map(lead => {
          const { companyKey, eventKey: _eventKey, ownerKey, ...values } = lead;
          return { ...values, company_id: companyKey, event_id: eventId, owner_user_id: ownerKey, rating: lead.is_hot ? 5 : lead.temperature === 'warm' ? 3 : 1, follow_up_date: lead.follow_up_at?.slice(0, 10) ?? null };
        }), eventId);
        const rows = await readLrPages<Row>(async (from, to) => checked(await db.from('leads').select('*').eq('event_id', eventId).order('id').range(from, to), 'lead validation') as Row[]);
        if (rows.length !== part.leads.length || rows.some(row => !part.leads.some(l => l.id === row.id && l.companyKey === row.company_id && l.ownerKey === row.owner_user_id))) throw new Error(`LR persisted lead scope/count mismatch: ${eventId}`);
        totalLeads += rows.length;
        const participants = checked(await db.from('exhibitors').select('company_id').eq('event_id', eventId), 'company count validation') as Row[];
        if (participants.length !== config.lr!.companiesPerEvent) throw new Error('LR requested company count mismatch');
        const expectedIntelligence = [];
        for (const companyKey of part.companyKeys) {
          const company = generated.companies.find(c => c.key === companyKey)!;
          const companyLeads = rows.filter(row => row.company_id === companyKey) as FactLead[];
          const facts = deriveLrFacts(companyLeads, config.anchor);
          const intelligence = intelligenceRows(companyLeads, companyKey, eventId, config.anchor);
          for (const table of [...new Set(intelligence.map(i => i.table))]) {
            const payloads = intelligence.filter(i => i.table === table).map(i => i.row);
            await putMany(table, payloads, eventId);
            intelligenceCounts[table] = (intelligenceCounts[table] ?? 0) + payloads.length;
          }
          summaries.push({ name: company.name, eventId, facts, brief: companyBrief(company.name, facts) });
          if (companyLeads.length) expectedIntelligence.push({ companyId: companyKey, eventId, anchor: config.anchor, total: facts.total, hot: facts.hot, briefs: intelligence.filter(r => r.table === 'lead_briefings').length });
        }
        if (expectedIntelligence.length) {
          const check = await promisify(execFile)(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/demo/verify-framework-intelligence.ts', JSON.stringify(expectedIntelligence)], { cwd: fileURLToPath(new URL('../../apps/lead-retrieval/', import.meta.url)), env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.LR_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.LR_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.LR_SERVICE_ROLE_KEY, NEXT_PUBLIC_WORKFLOWS_ENABLED: 'true' }, maxBuffer: 1024 * 1024 });
          if (!check.stdout.includes('INTELLIGENCE_PASS')) throw new Error('Production intelligence readback failed');
        }
        const verify = await promisify(execFile)(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/demo/verify-framework-mapping.ts', context.organizerUserId, context.organizationId, canonicalId], { cwd: fileURLToPath(new URL('../../apps/lead-retrieval/', import.meta.url)), env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.LR_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.LR_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.LR_SERVICE_ROLE_KEY }, maxBuffer: 1024 * 1024 });
        if (!verify.stdout.includes('MAPPING_AND_ACCESS_PASS')) throw new Error('Canonical LR mapping/access verification did not pass');
      }
      return { product: 'lr', counts: { accounts: generated.companies.length, organizerCompanies: generated.mode === 'organizer' ? 1 : 0, events: eventIds.length, staff: generated.companies.reduce((n, c) => n + c.staff.length, 0), leads: totalLeads, companiesPerEvent: config.lr!.companiesPerEvent, ...intelligenceCounts }, details: { companies: summaries, organizer: generated.mode === 'organizer' ? eventIds.map(eventId => ({ eventId, ...organizerBrief(summaries.filter(s => s.eventId === eventId)) })) : [] }, manifest, validations: [{ label: 'production canonical mapping and access resolver', passed: true }, { label: 'persisted lead and company counts and ownership', passed: true }] };
    },
    async reset() { throw new Error('LR reset requires transactional owned-dependent proof; no broad cascade deletion is permitted'); },
  };
}
