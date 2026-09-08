import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from './config.ts';
import { createWorld } from './world.ts';
import { generateLrWorld } from './lr-world.ts';
import { deriveLrFacts, companyBrief, organizerBrief, intelligenceRows, type FactLead } from './lr-intelligence.ts';

function fixture() {
  const config = parseConfig(['--product', 'lr', '--seed', '20260911']);
  const generated = generateLrWorld(createWorld(config), config);
  const leads = generated.events[0]!.leads.map(l => ({ ...l, company_id: l.companyKey, event_id: l.eventKey, owner_user_id: l.ownerKey })) as FactLead[];
  return { config, generated, leads };
}
test('brief percentages, follow-up and owner gaps derive from facts', () => {
  const { config, leads } = fixture();
  const facts = deriveLrFacts(leads, config.anchor);
  assert.equal(facts.hot, leads.filter(l => l.temperature === 'hot').length);
  assert.equal(facts.completed, leads.filter(l => l.follow_up_completed_at).length);
  assert.equal(facts.unassignedHot, leads.filter(l => l.temperature === 'hot' && !l.owner_user_id).length);
  assert.equal(facts.hotPercent, Math.round(facts.hot / facts.total * 1000) / 10);
  const text = companyBrief('Vector Cloud', facts);
  assert(text.includes(`${facts.hot} hot prospects (${facts.hotPercent}%)`));
  assert.equal(text, companyBrief('Vector Cloud', deriveLrFacts(leads, config.anchor)));
  assert.equal(deriveLrFacts([], config.anchor).hotPercent, 0);
});
test('organizer ranking and median cannot refer outside the event company set', () => {
  const { config, leads } = fixture();
  const companies = [leads, leads.slice(0, 4), leads.slice(4, 12)].map((rows, i) => ({ name: `Profile ${i}`, facts: deriveLrFacts(rows, config.anchor) }));
  const summary = organizerBrief(companies);
  assert.equal(summary.ranking[0], companies[0]!.name);
  const rates = companies.map(c => c.facts.hotPercent).sort((a,b) => a-b);
  assert.equal(summary.medianHotPercent, rates[1]);
  assert(summary.ranking.every(name => companies.some(c => c.name === name)));
});
test('intelligence references real leads and workflow history cannot auto-dispatch', () => {
  const { config, leads } = fixture();
  const rows = intelligenceRows(leads, leads[0]!.company_id, leads[0]!.event_id, config.anchor);
  assert.deepEqual(rows, intelligenceRows(leads, leads[0]!.company_id, leads[0]!.event_id, config.anchor));
  for (const { table, row } of rows) {
    if (row.lead_id) assert(leads.some(l => l.id === row.lead_id));
    if (table === 'lead_briefings') assert.equal(row.content.linkage.published_lead_id, row.lead_id);
    if (table === 'workflow_templates') assert.equal(row.is_enabled, false);
    if (table === 'workflow_runs') assert(['completed','awaiting_approval','failed'].includes(row.status));
    if (table === 'generated_drafts') {
      const run = rows.find(r => r.table === 'workflow_runs' && r.row.id === row.run_id)!.row;
      assert.equal(run.company_id, row.company_id);
      assert.equal(run.lead_id, row.lead_id);
      assert.equal(row.approval_status === 'pending', run.status === 'awaiting_approval');
    }
  }
});
