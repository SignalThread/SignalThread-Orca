import assert from 'node:assert/strict';
import { loadEventWorkspaceCompletedData } from '../../lib/server/event-workspace-completed-data';
import { createAdminClient } from '../../lib/supabase/admin';
import { parseComposeCampaignDraftParams } from '../../lib/workflows/step-handlers/compose-campaign-draft-pure';
import { buildGeneratedDraftInsertRows } from '../../lib/workflows/runner/build-draft-rows';
import { deriveCompletedWorkspace } from '../../lib/events/event-workspace-completed-core';

async function main() {
  const entries = JSON.parse(process.argv[2]!) as { companyId: string; eventId: string; anchor: string; total: number; hot: number; briefs: number }[];
  for (const entry of entries) {
    const data = await loadEventWorkspaceCompletedData({ companyId: entry.companyId, eventId: entry.eventId, todayYmd: entry.anchor.slice(0, 10), now: new Date(entry.anchor) });
    assert.equal(data.totalLeadCount, entry.total, 'production total lead count');
    assert.equal(data.hotLeadCount, entry.hot, 'production hot lead count');
    assert.equal(data.briefingCounts?.generated, entry.briefs, 'production generated brief count');
    const workspace = deriveCompletedWorkspace({ ...data, hrefs: { hotLeads: '/exhibitor/leads', hotNoFollowUp: '/exhibitor/leads', followUpsDue: '/exhibitor/leads', leads: '/exhibitor/leads', campaigns: null, draftsReview: '/exhibitor/workflows' } });
    assert(workspace.intelligenceCoverage?.analyzedCount, 'production conversation intelligence must be populated');
    const db = createAdminClient();
    const runs = await db.from('workflow_runs').select('*').eq('company_id', entry.companyId).eq('event_id', entry.eventId);
    const drafts = await db.from('generated_drafts').select('*').eq('company_id', entry.companyId).eq('event_id', entry.eventId);
    assert.equal(runs.error, null);
    assert.equal(drafts.error, null);
    for (const run of runs.data ?? []) assert(['completed', 'awaiting_approval', 'failed'].includes(run.status));
    for (const draft of drafts.data ?? []) {
      const run: { id: string; company_id: string; lead_id: string; event_id: string | null; template_id: string } | undefined = runs.data?.find(r => r.id === draft.run_id);
      assert(run, 'draft parent run');
      const expected: ReturnType<typeof buildGeneratedDraftInsertRows>[number] = buildGeneratedDraftInsertRows({ run, stepRun: { id: draft.step_run_id }, drafts: [{ kind: 'email', content: draft.content_jsonb as Record<string, unknown> }] })[0]!;
      assert.equal(expected.company_id, draft.company_id);
      assert.equal(expected.lead_id, draft.lead_id);
      assert.equal(expected.event_id, draft.event_id);
      const steps: { data: { params_jsonb: unknown }[] | null; error: unknown } = await db.from('workflow_steps').select('params_jsonb').eq('template_id', run.template_id);
      assert.equal(steps.error, null);
      for (const step of steps.data ?? []) assert(parseComposeCampaignDraftParams(step.params_jsonb as Record<string, unknown>).ok);
    }

  }
  console.log('INTELLIGENCE_PASS');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
