import { logicalId } from './random.ts';

export type FactLead = { id: string; company_id: string; event_id: string; full_name: string; company_text: string; job_title: string; email: string; temperature: string; priority_score: number; owner_user_id: string | null; status: string; created_at: string; follow_up_at: string | null; follow_up_completed_at: string | null; follow_up_note: string; intent_signals: string[]; metadata: Record<string, any> };
export function deriveLrFacts(leads: readonly FactLead[], anchor: string) {
  const count = (fn: (l: FactLead) => boolean) => leads.filter(fn).length;
  const hot = count(l => l.temperature === 'hot');
  const interest = new Map<string, number>();
  const hours = new Map<string, number>();
  const staff = new Map<string, number>();
  for (const lead of leads) {
    for (const value of new Set(lead.intent_signals)) interest.set(value, (interest.get(value) ?? 0) + 1);
    const hour = new Date(lead.created_at).toISOString().slice(0, 13);
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
    if (lead.owner_user_id) staff.set(lead.owner_user_id, (staff.get(lead.owner_user_id) ?? 0) + 1);
  }
  const ranked = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { total: leads.length, unique: new Set(leads.map(l => l.email.toLowerCase())).size, hot, warm: count(l => l.temperature === 'warm'), cold: count(l => l.temperature === 'cold'), hotPercent: leads.length ? Math.round(hot / leads.length * 1000) / 10 : 0,
    executive: count(l => /\b(VP|Chief|CEO)\b/i.test(l.job_title)), completed: count(l => l.follow_up_completed_at !== null), open: count(l => l.follow_up_at !== null && l.follow_up_completed_at === null), overdue: count(l => l.follow_up_at !== null && l.follow_up_completed_at === null && Date.parse(l.follow_up_at) < Date.parse(anchor)), unassignedHot: count(l => l.temperature === 'hot' && l.owner_user_id === null), untouchedHot: count(l => l.temperature === 'hot' && l.status !== 'closed' && l.follow_up_at === null), interest: ranked(interest), scanHours: ranked(hours), staff: ranked(staff) };
}
export function companyBrief(name: string, facts: ReturnType<typeof deriveLrFacts>) {
  if (!facts.total) return `${name} is ready for the event; no leads have been captured yet.`;
  return `${name} captured ${facts.total} leads (${facts.unique} unique contacts), including ${facts.hot} hot prospects (${facts.hotPercent}%). ${facts.interest[0]?.[0] ?? 'No recorded theme'} appeared in ${facts.interest[0]?.[1] ?? 0} lead records. ${facts.completed} follow-ups are complete; ${facts.overdue} are overdue and ${facts.unassignedHot} hot leads have no owner. The busiest capture hour was ${facts.scanHours[0]![0]}:00 UTC with ${facts.scanHours[0]![1]} leads.`;
}
export function organizerBrief(companies: { name: string; facts: ReturnType<typeof deriveLrFacts> }[]) {
  const ranked = [...companies].sort((a, b) => b.facts.total - a.facts.total || a.name.localeCompare(b.name));
  const rates = companies.map(c => c.facts.hotPercent).sort((a, b) => a - b);
  const median = rates.length ? (rates[Math.floor((rates.length - 1) / 2)]! + rates[Math.floor(rates.length / 2)]!) / 2 : 0;
  return { medianHotPercent: median, ranking: ranked.map(c => c.name), summary: `${companies.filter(c => c.facts.hotPercent > median).length} of ${companies.length} companies exceeded the median hot-lead rate of ${median}%. ${ranked[0]?.name ?? 'No company'} led capture volume with ${ranked[0]?.facts.total ?? 0} leads. ${companies.reduce((n, c) => n + c.facts.overdue, 0)} follow-ups are overdue across the event.` };
}
export function intelligenceRows(leads: FactLead[], companyId: string, eventId: string, anchor: string) {
  const rows: { table: string; row: Record<string, any> }[] = [];
  if (!leads.length) return rows;
  const reviewed = leads.filter(l => l.temperature === 'hot').slice(0, 8);
  for (const [index, lead] of leads.entries()) {
    if (index % 3 !== 0 && lead.temperature !== 'hot') continue;
    const theme = String(lead.metadata.product_interest ?? lead.intent_signals[0] ?? 'Event operations');
    const captured = lead.created_at;
    rows.push({ table: 'lead_conversations', row: { id: logicalId(lead.id, 'conversation'), lead_id: lead.id, storage_path: `demo/inline-transcripts/${lead.id}.txt`, content_type: 'text/plain', transcript: lead.follow_up_note, summary: lead.follow_up_note, transcription_status: 'completed', transcribed_at: captured, synthesis_status: 'completed', synthesized_at: captured, conversation_version: 1, sentiment: lead.temperature === 'hot' ? 'positive' : 'mixed', objections: lead.temperature === 'cold' ? ['Evaluation timing is next year'] : [], next_steps: [lead.owner_user_id ? 'Confirm the assigned owner and technical review agenda' : 'Assign an owner before follow-up'], priority_themes: [theme], buying_signals: lead.intent_signals, competitors_mentioned: [], pain_points: ['Needs an implementation example'], rep_behavior_patterns: [lead.owner_user_id ? 'Follow-up owner recorded' : 'Follow-up ownership missing'], created_at: captured } });
    if (lead.temperature === 'hot') rows.push({ table: 'lead_briefings', row: { id: logicalId(lead.id, 'brief'), lead_id: lead.id, company_id: companyId, approval_status: 'pending', content: { linkage: { published_lead_id: lead.id }, headline: `${lead.full_name}: ${theme} evaluation`, companySnapshot: { name: lead.company_text }, whyHere: [lead.follow_up_note], questionsToAsk: [`Who will own the ${theme.toLowerCase()} rollout?`, 'Which acceptance criteria must the technical review demonstrate?'], talkingPoints: [{ title: 'Recorded buying interest', detail: lead.intent_signals.join('; ') }], signalsToWatch: lead.intent_signals, manualContext: { internalNotes: `${lead.temperature} prospect; recorded priority score ${lead.priority_score}. ${lead.owner_user_id ? 'Follow-up owner assigned.' : 'Needs an owner.'}` } }, created_at: captured } });
  }
  if (!reviewed.length) return rows;
  const templateId = logicalId(`${companyId}:${eventId}`, 'follow-up-template');
  const stepId = logicalId(templateId, 'draft-step');
  rows.push({ table: 'workflow_templates', row: { id: templateId, company_id: companyId, event_id: eventId, name: 'Post-show technical review follow-up', description: 'Review grounded outreach drafts before taking action.', trigger_event: 'lead_captured', scope: 'event', is_enabled: false, version: 1, created_at: reviewed[0]!.created_at } });
  rows.push({ table: 'workflow_steps', row: { id: stepId, template_id: templateId, step_index: 0, step_key: 'technical-review-draft', step_type: 'compose_campaign_draft', params_jsonb: { selectedSignalIds: [], subjectTemplate: 'Your technical review next steps', templateName: 'Post-show technical review' }, requires_approval: true, created_at: reviewed[0]!.created_at } });
  for (const [i, lead] of reviewed.entries()) {
    const runId = logicalId(lead.id, 'follow-up-run'), stepRunId = logicalId(runId, 'step');
    const status = i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'awaiting_approval' : 'failed';
    const at = new Date(Math.min(Date.parse(anchor), Date.parse(lead.follow_up_at ?? lead.created_at))).toISOString();
    rows.push({ table: 'workflow_runs', row: { id: runId, company_id: companyId, event_id: eventId, template_id: templateId, template_version: 1, lead_id: lead.id, trigger_event: 'lead_captured', trigger_payload_jsonb: { leadId: lead.id, companyId, eventId }, trigger_fingerprint: `demo:${runId}`, status, current_step_index: status === 'completed' ? 1 : 0, started_at: at, completed_at: status === 'completed' ? at : null, created_at: at } });
    rows.push({ table: 'workflow_step_runs', row: { id: stepRunId, run_id: runId, step_id: stepId, step_index: 0, step_key: 'technical-review-draft', status, attempt_count: 1, scheduled_at: at, started_at: at, completed_at: status === 'completed' ? at : null, output_jsonb: status === 'failed' ? null : { draftCount: 1 }, error_text: status === 'failed' ? 'Technical review agenda needs confirmation before drafting can continue.' : null, error_code: status === 'failed' ? 'demo_review_required' : null, created_at: at } });
    if (status !== 'failed') rows.push({ table: 'generated_drafts', row: { id: logicalId(runId, 'draft'), company_id: companyId, event_id: eventId, lead_id: lead.id, run_id: runId, step_run_id: stepRunId, kind: 'email', approval_status: status === 'completed' ? 'approved' : 'pending', content_jsonb: { subject: `${lead.full_name.split(' ')[0]}, next steps on ${lead.metadata.product_interest}`, body: `Thank you for discussing ${lead.metadata.product_interest} for ${lead.company_text}. ${lead.follow_up_note} Please confirm who should attend the technical review.`, sourceLeadId: lead.id }, created_at: at } });
  }
  return rows;
}
