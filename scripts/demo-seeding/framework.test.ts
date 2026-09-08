import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENTERPRISE, parseConfig } from './config.ts';
import { seededRandom, logicalId, fingerprint } from './random.ts';
import { createWorld, bindExistingEvent } from './world.ts';
import { newManifest, recordRow, planOwnedReset, saveManifest, readManifest, assertLocalTarget, validateManifest } from './ownership.ts';
import { buildPlan, runCli } from './cli.ts';
import { preflightAdapters, type AdapterRegistry } from './adapters.ts';

const EVENT = '00000000-0000-4000-8000-000000000001';
const ORG = '00000000-0000-4000-8000-000000000002';

test('defaults and all/single product selections produce independent plans', () => {
  assert.deepEqual(parseConfig([]).products, ['orca', 'lr', 'pulse']);
  for (const product of ['orca', 'lr', 'pulse']) assert.deepEqual(parseConfig(['--product', product]).products, [product]);
  assert.equal(parseConfig(['--product=lr']).lr?.mode, 'direct');
  assert.equal(parseConfig([]).lr?.mode, 'organizer');
});
test('scenario defaults override richness defaults, CLI overrides scenario defaults', () => {
  const scenario = { ...ENTERPRISE, defaults: { product: 'pulse' as const, events: 2, richness: 'SMOKE' as const }, scale: { SMOKE: { attendees: 23 } } };
  const c = parseConfig(['--events=3'], [scenario]);
  assert.deepEqual(c.products, ['pulse']); assert.deepEqual(parseConfig(['--product=orca'], [scenario]).products, ['orca']);
  assert.equal(c.events, 3); assert.equal(c.scale.attendees, 23); assert.equal(c.richness, 'SMOKE');
  assert.equal(parseConfig(['--richness=showcase'], [scenario]).scale.attendees, 850);
});
test('direct mode is exactly one shared account over multiple events', () => {
  const plan = buildPlan(parseConfig(['--product=lr', '--lr-mode=direct', '--events=4']));
  assert.equal(plan.eventCount, 4); assert.equal(plan.intendedTotalLrAccounts, 1);
  assert.equal(new Set(plan.world.events.map((e) => e.key)).size, 4);
});
test('organizer companies are per event, including explicit counts and scale overrides', () => {
  for (const count of [1, 20, 30, 100]) {
    const plan = buildPlan(parseConfig(['--product=lr', '--lr-mode=organizer', '--events=3', `--lr-companies=${count}`]));
    assert.equal(plan.lr?.companiesPerEvent, count); assert.equal(plan.intendedTotalLrAccounts, 3 * count);
  }
});
test('invalid and incompatible options fail without silent coercion', () => {
  for (const args of [
    ['--richness=huge'], ['--lifecycle=LIVE'], ['--lr-mode=retail'], ['--events=0'], ['--events=25'], ['--events=1.5'],
    ['--lr-companies=101'], ['--seed=-1'], ['--product=retail'], ['--events'], ['--unknown'], ['--events=1', '--events=2'],
    ['--dry-run=false'], ['--product=orca', '--lr-companies=2'], ['--product=pulse', '--lr-mode=direct'],
    ['--product=lr', '--lr-mode=direct', '--lr-companies=2'], ['--operation=reset'], ['--operation=rerun'],
    ['--anchor=2026-02-30T12:00:00Z'], ['--anchor=now'], ['--scenario=unknown'],
  ]) assert.throws(() => parseConfig(args), args.join(' '));
});
test('attach needs canonical organization scope, exactly one product and no conflicting dates', () => {
  const good = ['--product=pulse', `--existing-event=${EVENT}`, `--organization-id=${ORG}`];
  assert.equal(parseConfig(good).operation, 'attach');
  for (const extra of [['--events=1'], ['--lifecycle=pre'], ['--anchor=2026-09-07T12:00:00Z'], ['--operation=create']]) assert.throws(() => parseConfig([...good, ...extra]));
  assert.throws(() => parseConfig(good.slice(0, 2)));
  assert.throws(() => parseConfig([`--existing-event=${EVENT}`, `--organization-id=${ORG}`]));
  assert.throws(() => parseConfig(['--product=pulse', '--existing-event=invalid', `--organization-id=${ORG}`]));
});
test('deterministic random streams and stable logical IDs do not depend on invocation order', () => {
  const a = seededRandom(12), b = seededRandom(12);
  assert.deepEqual(Array.from({ length: 50 }, () => a.int(1, 100)), Array.from({ length: 50 }, () => b.int(1, 100)));
  const root = seededRandom(99); const first = root.fork('sessions').next();
  root.fork('leads').next(); root.next();
  assert.equal(root.fork('sessions').next(), first);
  assert.notEqual(seededRandom(13).next(), seededRandom(12).next());
  assert.throws(() => a.pick([])); assert.throws(() => a.int(4, 3));
  assert.equal(logicalId('namespace', 'speaker'), logicalId('namespace', 'speaker'));
  assert.notEqual(logicalId('namespace', 'speaker'), logicalId('other', 'speaker'));
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
});
test('event world IDs/dates are stable and logical identities are never claimed as persisted canonical IDs', () => {
  const all = parseConfig([]), orca = parseConfig(['--product=orca']);
  assert.equal(all.worldKey, orca.worldKey);
  assert.deepEqual(createWorld(all), createWorld(parseConfig([])));
  assert.equal(createWorld(all).events[0]?.key, createWorld(orca).events[0]?.key);
  assert.equal(createWorld(all).events[0]?.canonicalId, null);
  assert.ok(buildPlan(all).generatedOperationalRows > 0);
  assert.equal(buildPlan(all).persisted, false);
  assert.notEqual(createWorld(parseConfig(['--seed=1'])).events[0]?.key, createWorld(all).events[0]?.key);
});
test('every event respects its lifecycle relative to the explicit deterministic anchor', () => {
  for (const lifecycle of ['pre', 'during', 'post']) {
    const config = parseConfig([`--lifecycle=${lifecycle}`, '--events=4']);
    for (const event of createWorld(config).events) {
      const now = Date.parse(config.anchor), start = Date.parse(event.startsAt), end = Date.parse(event.endsAt);
      assert.ok(end > start);
      assert.ok(lifecycle === 'pre' ? now < start : lifecycle === 'during' ? now >= start && now <= end : now > end);
    }
  }
});
test('Orca richness produces coherent deterministic sessions, speakers, rooms and operational modules', () => {
  const expected = { SMOKE: [3, 4, 2, 5, 6, 5, 3], DEMO: [12, 16, 5, 18, 24, 16, 8], SHOWCASE: [24, 31, 8, 36, 48, 30, 14] } as const;
  for (const richness of ['SMOKE', 'DEMO', 'SHOWCASE'] as const) {
    const world = createWorld(parseConfig(['--product=orca', `--richness=${richness}`]));
    const event = world.events[0]!;
    assert.deepEqual([event.sessions.length, event.speakers.length, event.rooms.length, event.deadlines.length, event.timeline.length, event.budgetItems.length, event.documents.length], expected[richness]);
    assert.ok(event.sessions.every((session) => event.rooms.some((room) => room.key === session.roomKey) && session.speakerKeys.every((key) => event.speakers.some((speaker) => speaker.key === key))));
    assert.ok(event.timeline.every((item) => item.parentKey === null || event.timeline.some((parent) => parent.key === item.parentKey)));
    assert.ok(event.narratives.some((item) => item.title.includes('High-demand AI session')));
  }
});
test('verified attach adopts authoritative event metadata and rejects re-parenting', () => {
  const config = parseConfig(['--product=orca', `--existing-event=${EVENT}`, `--organization-id=${ORG}`]);
  const snapshot = { id: EVENT, organizationId: ORG, organizationName: 'Existing Organization', name: 'Existing Summit', startsAt: '2026-08-01T12:00:00Z', endsAt: '2026-08-02T12:00:00Z', timezone: 'UTC', venue: 'Existing Venue', authorized: true };
  const world = bindExistingEvent(createWorld(config), config, snapshot);
  assert.equal(world.events.length, 1); assert.equal(world.events[0]?.canonicalId, EVENT); assert.equal(world.events[0]?.name, snapshot.name);
  for (const bad of [{ ...snapshot, authorized: false }, { ...snapshot, organizationId: EVENT }, { ...snapshot, id: ORG }, { ...snapshot, endsAt: 'bad' }]) assert.throws(() => bindExistingEvent(world, config, bad));
});
function ownershipCase() {
  const config = parseConfig(['--product=orca']);
  const snapshot = { id: EVENT, name: 'Owned event' };
  const row = { database: 'orca' as const, target: 'postgres://localhost:5433/orca-demo', table: 'Event', id: EVENT, organizationId: ORG, eventId: EVENT };
  const manifest = recordRow(newManifest(config), { ...row, disposition: 'created' }, snapshot);
  return { config, snapshot, row, manifest, observed: [{ ...row, snapshot, unownedDependents: 0 }] };
}
test('reset needs exact ownership receipts, unchanged scope/data and zero external FK effects', () => {
  const { config, snapshot, row, manifest, observed } = ownershipCase();
  assert.equal(planOwnedReset(manifest, config, observed).length, 1);
  assert.throws(() => planOwnedReset(manifest, parseConfig(['--product=orca', '--seed=123']), observed));
  assert.throws(() => planOwnedReset(manifest, config, []));
  for (const changed of [{ ...observed[0]!, snapshot: { ...snapshot, name: 'Edited by customer' } }, { ...observed[0]!, unownedDependents: 1 }, { ...observed[0]!, organizationId: EVENT }, { ...observed[0]!, target: 'postgres://localhost:5434/other' }]) assert.throws(() => planOwnedReset(manifest, config, [changed]));
  const borrowed = recordRow(newManifest(config), { ...row, disposition: 'borrowed' }, snapshot);
  assert.deepEqual(planOwnedReset(borrowed, config, []), []);
  assert.throws(() => recordRow(manifest, { ...row, disposition: 'created' }, snapshot));
  assert.throws(() => validateManifest({ ...manifest, records: [...manifest.records, ...manifest.records] }));
});
test('ownership files persist exact receipts and refuse to overwrite existing journals', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'st-demo-ownership-'));
  try {
    const file = join(dir, 'manifest.json'), { manifest } = ownershipCase();
    await saveManifest(file, manifest);
    assert.deepEqual(await readManifest(file), manifest);
    await assert.rejects(saveManifest(file, manifest), /EEXIST/);
    assert.match(await readFile(file, 'utf8'), /signalthread-demo/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('remote, production and legacy connections are refused without credentials appearing in target identity', () => {
  assert.equal(assertLocalTarget('postgres://someone:secret@localhost:5433/demo?sslmode=disable', 'test'), 'postgres://localhost:5433/demo');
  for (const [url, environment] of [['https://wtbnpeluwhjjqccdofxd.supabase.co', 'test'], ['https://legacy.example', 'development'], ['http://localhost:54321', 'production'], ['file:///tmp/db', 'test'], ['http://localhost.attacker.test', 'test']]) assert.throws(() => assertLocalTarget(url!, environment!));
});
test('missing or misregistered adapters fail before any provisioning', async () => {
  const config = parseConfig([]);
  await assert.rejects(preflightAdapters(config, { products: {} }), /Persistence adapters are not installed/);
  let called = false;
  const registry = { platform: { preflight: async () => { called = true; throw new Error('must not execute'); } }, products: {} } as unknown as AdapterRegistry;
  await assert.rejects(preflightAdapters(config, registry), /not installed/); assert.equal(called, false);
});
test('CLI plans are JSON, help is available and real writes cannot fake success', async () => {
  const lines: string[] = [];
  await runCli(['--dry-run', '--json', '--product=lr', '--lr-mode=organizer', '--lr-companies=20'], (s) => lines.push(s));
  const result = JSON.parse(lines[0]!);
  assert.equal(result.intendedTotalLrAccounts, 20); assert.equal(result.persisted, false);
  await runCli(['--help'], (s) => assert.match(s, /PER EVENT/));
  await assert.rejects(runCli(['--product=orca'], () => assert.fail('Must not print success')), /Platform Core URL and service-role key are required/);
});
