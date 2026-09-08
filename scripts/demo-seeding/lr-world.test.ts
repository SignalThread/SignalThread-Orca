import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from './config.ts';
import { createWorld } from './world.ts';
import { generateLrWorld } from './lr-world.ts';

test('LR direct portfolio shares one account and varies event facts deterministically', () => {
  const config = parseConfig(['--product', 'lr', '--events', '3']);
  const world = createWorld(config);
  const lr = generateLrWorld(world, config);
  assert.deepEqual(lr, generateLrWorld(world, config));
  assert.equal(lr.companies.length, 1);
  assert.equal(new Set(lr.events.flatMap(e => e.companyKeys)).size, 1);
  assert.equal(new Set(lr.events.map(e => e.leads.length)).size, 3);
});
test('LR organizer counts, owner references, lifecycle and company distributions hold', () => {
  const config = parseConfig(['--product', 'lr', '--lr-mode', 'organizer', '--lr-companies', '20', '--events', '2']);
  const world = createWorld(config);
  const lr = generateLrWorld(world, config);
  assert.equal(lr.companies.length, 40);
  assert.equal(new Set(lr.companies.map(c => c.archetype)).size, 10);
  for (const event of lr.events) {
    assert.equal(event.companyKeys.length, 20);
    const source = world.events.find(e => e.key === event.key)!;
    for (const lead of event.leads) {
      const company = lr.companies.find(c => c.key === lead.companyKey)!;
      assert(event.companyKeys.includes(lead.companyKey));
      assert(lead.ownerKey === null || company.staff.some(s => s.key === lead.ownerKey));
      assert(Date.parse(lead.created_at) >= Date.parse(source.startsAt));
      assert(Date.parse(lead.created_at) <= Date.parse(source.endsAt));
      if (lead.follow_up_at) assert(Date.parse(lead.follow_up_at) > Date.parse(source.endsAt));
      if (lead.follow_up_completed_at) assert(Date.parse(lead.follow_up_completed_at) <= Date.parse(config.anchor));
    }
    assert(new Set(event.companyKeys.map(k => event.leads.filter(l => l.companyKey === k).length)).size > 5);
  }
});
test('PRE creates no future scans and DURING never creates post-event follow-up', () => {
  for (const lifecycle of ['pre', 'during']) {
    const config = parseConfig(['--product', 'lr', '--lifecycle', lifecycle]);
    const lr = generateLrWorld(createWorld(config), config);
    if (lifecycle === 'pre') assert.equal(lr.events[0]!.leads.length, 0);
    for (const lead of lr.events[0]!.leads) {
      assert(Date.parse(lead.created_at) <= Date.parse(config.anchor));
      assert.equal(lead.follow_up_at, null);
    }
  }
});


test('LR collisions require exact receipt, target, organization and unchanged readback', async () => {
  const { assertLrExistingRow, LR_PROJECT_REF } = await import('./lead-retrieval.ts');
  const { newManifest, recordRow } = await import('./ownership.ts');
  const config = parseConfig(['--product', 'lr']);
  const row = { id: 'owned-row', company_id: 'company', priority_score: 88 };
  const manifest = recordRow(newManifest(config), { database: 'lr', target: LR_PROJECT_REF, table: 'leads', id: row.id, organizationId: 'organization', eventId: 'event', disposition: 'created' }, row);
  assert.doesNotThrow(() => assertLrExistingRow(manifest, 'organization', 'leads', row));
  assert.throws(() => assertLrExistingRow(null, 'organization', 'leads', row), /collision/);
  assert.throws(() => assertLrExistingRow(manifest, 'other', 'leads', row), /collision/);
  assert.throws(() => assertLrExistingRow(manifest, 'organization', 'leads', { ...row, priority_score: 89 }), /collision/);
  assert.throws(() => assertLrExistingRow({ ...manifest, records: manifest.records.map(r => ({ ...r, target: 'other' })) }, 'organization', 'leads', row), /collision/);
});


test('LR readback validates beyond the service 1000-row cap', async () => {
  const { readLrPages } = await import('./lead-retrieval.ts');
  const all = Array.from({ length: 1064 }, (_, id) => ({ id }));
  const calls: [number, number][] = [];
  const rows = await readLrPages(async (from, to) => { calls.push([from, to]); return all.slice(from, to + 1); });
  assert.deepEqual(rows, all);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
});
