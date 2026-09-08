import { pathToFileURL } from 'node:url';
import { parseConfig, type SeedConfig } from './config.ts';
import { bindExistingEvent, createWorld } from './world.ts';
import { assertManifestScope, newManifest, readManifest, saveManifest } from './ownership.ts';
import { preflightAdapters } from './adapters.ts';
import { createPlatformAdapter } from './platform.ts';
import { createOrcaAdapter } from './orca.ts';
import { createLeadRetrievalAdapter } from './lead-retrieval.ts';
import type { AdapterRegistry } from './adapters.ts';
import { access } from 'node:fs/promises';

export const HELP = `SignalThread demo framework
Usage: npm run seed:demo -- [options]
  --product all|orca|pulse|lr            Default: all
  --scenario enterprise-conference
  --richness smoke|demo|showcase         Default: demo
  --lifecycle pre|during|post            Default: post
  --events 1..24                        Number of canonical events
  --lr-mode direct|organizer            LR-only defaults to direct; all to organizer
  --lr-companies 1..100                 Companies PER EVENT, organizer only
  --seed 0..4294967295                  Default: 20260907
  --anchor <UTC ISO timestamp>          Fixed lifecycle reference, never wall-clock randomness
  --existing-event <canonical UUID> --organization-id <canonical UUID>
  --operation create|attach|rerun|reset
  --manifest <file>                     Required for reset/rerun
  --dry-run                            No database/client/environment loading
  --json                               Machine-readable plan
  --help
Examples:
  npm run seed:demo -- --product orca --dry-run
  npm run seed:demo -- --product pulse --richness demo --dry-run
  npm run seed:demo -- --product lr --lr-mode direct --events 3 --dry-run
  npm run seed:demo -- --product all --lr-mode organizer --lr-companies 20 --richness showcase --dry-run
Remote writes require the explicitly approved Platform/Orca/LR environment variables.
`;
export function buildPlan(config: SeedConfig) {
  const world = createWorld(config);
  return {
    status: 'planned' as const, persisted: false, operation: config.operation, runId: config.runId,
    scenario: config.scenario, seed: config.seed, richness: config.richness, products: ['platform', ...config.products],
    canonicalVerification: config.existingEventId ? 'required-before-attach' : 'required-before-provisioning',
    existingEventId: config.existingEventId, organizationId: config.organizationId,
    eventCount: config.events, lr: config.lr,
    intendedPerEvent: { ...config.scale, companies: config.lr?.companiesPerEvent ?? 0 },
    intendedTotalLrAccounts: config.lr ? config.lr.mode === 'direct' ? 1 : config.events * config.lr.companiesPerEvent : 0,
    generatedOperationalRows: world.events.reduce((sum, event) => sum + event.rooms.length + event.sessions.length + event.speakers.length + event.team.length + event.deadlines.length + event.timeline.length + event.budgetItems.length + event.documents.length + event.narratives.length, 0),
    world,
  };
}
export async function runCli(argv: readonly string[], output: (value: string) => void = console.log): Promise<void> {
  if (argv.length === 1 && argv[0] === '--help') { output(HELP); return; }
  const config = parseConfig(argv);
  const priorManifest = config.manifestPath && ['rerun', 'reset'].includes(config.operation) ? await readManifest(config.manifestPath) : null;
  if (priorManifest) assertManifestScope(priorManifest, config);
  let world = createWorld(config);
  const plan = buildPlan(config);
  if (config.dryRun) {
    const report = { ...plan, ownershipReceipts: priorManifest?.records.length ?? 0, resetLiveReadback: config.operation === 'reset' ? 'required' : null };
    output(config.json ? JSON.stringify(report, null, 2) : [
      `SignalThread demo plan · ${config.scenario} · ${config.richness}`,
      `Operation: ${config.operation} · Seed: ${config.seed} · Run: ${config.runId}`,
      `Products: ${plan.products.join(', ')} · Events: ${plan.eventCount}`,
      config.lr ? `LR: ${config.lr.mode} · ${config.lr.companiesPerEvent} ${config.lr.mode === 'direct' ? 'shared account' : 'companies per event'} · ${plan.intendedTotalLrAccounts} total accounts` : 'LR: not selected',
      `Intended per-event scale: ${JSON.stringify(plan.intendedPerEvent)}`,
      `Canonical identity: ${plan.canonicalVerification}`,
      `Generated Orca world: ${world.events.reduce((sum, event) => sum + event.sessions.length + event.deadlines.length + event.timeline.length + event.budgetItems.length + event.documents.length, 0)} operational rows before relationship records.`,
      'DRY RUN: no data written.',
    ].join('\n'));
    return;
  }
  if (config.products.includes('pulse')) throw new Error('Persistence supports Orca and LR; Pulse adapter follows in Loop 5');
  const registry: AdapterRegistry = { platform: createPlatformAdapter(), products: { orca: createOrcaAdapter(), lr: createLeadRetrievalAdapter(priorManifest) } };
  let manifestPath = config.manifestPath ?? `/private/tmp/${config.runId}.manifest.json`;
  if (!priorManifest) {
    const exists = await access(manifestPath).then(() => true, () => false);
    if (exists) throw new Error('Manifest already exists; use rerun with its original configuration');
  }
  await preflightAdapters(config, registry);
  if (config.operation === 'reset') throw new Error('Reset remains fail-closed until complete owned-dependent readback is implemented');
  if (config.operation === 'attach') world = bindExistingEvent(world, config, await registry.platform!.readExistingEvent(config));
  // The original immutable manifest remains the deletion authority. A rerun uses a
  // fresh in-memory receipt set and treats matching rows as borrowed, so it cannot
  // silently rewrite or duplicate the ownership journal.
  let manifest = newManifest(config);
  const platform = await registry.platform!.provision(world, config, manifest);
  manifest = platform.result.manifest;
  const results = [];
  for (const product of config.products) {
    const result = await registry.products[product]!.seed(world, config, platform.context, manifest);
    manifest = result.manifest;
    results.push(result);
  }
  if (results.some(r => r.validations.some(v => !v.passed))) throw new Error('Post-seed validation failed');
  if (priorManifest) {
    // A recovered partial run may have added rows. Preserve original deletion
    // authority and append only genuinely new receipts into a new immutable file.
    const keys = new Set(priorManifest.records.map(r => `${r.database}/${r.target}/${r.table}/${r.id}`));
    manifest = { ...priorManifest, records: [...priorManifest.records, ...manifest.records.filter(r => !keys.has(`${r.database}/${r.target}/${r.table}/${r.id}`))] };
    manifestPath += `.verified-${process.pid}.json`;
  }
  await saveManifest(manifestPath, manifest);
  const report = { status: 'persisted' as const, persisted: true, operation: config.operation, runId: config.runId, scenario: config.scenario, seed: config.seed, richness: config.richness, manifestPath, platform: platform.result, products: results };
  output(config.json ? JSON.stringify(report, null, 2) : [
    `SignalThread demo persisted · ${config.scenario} · ${config.richness}`,
    `Operation: ${config.operation} · Seed: ${config.seed} · Run: ${config.runId}`,
    `Platform: ${JSON.stringify(platform.result.counts)}`,
    ...results.map(result => `${result.product}: ${JSON.stringify(result.counts)}`),
    `Validation: ${[...platform.result.validations, ...results.flatMap(r => r.validations)].every((entry) => entry.passed) ? 'PASS' : 'FAIL'}`,
    `Ownership manifest: ${manifestPath}`,
  ].join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`Seed refused: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  });
}
