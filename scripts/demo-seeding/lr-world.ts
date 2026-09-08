import { logicalId, seededRandom } from './random.ts';
import type { SeedConfig } from './config.ts';
import type { EventWorld } from './world.ts';

export const LR_PROFILES = [
  { name: 'Vector Cloud', archetype: 'high-volume-high-quality', volume: 1.5, hot: .55, follow: .8, staff: 5, interest: 'Workflow automation' },
  { name: 'BeaconWorks', archetype: 'high-volume-low-quality', volume: 1.7, hot: .12, follow: .35, staff: 4, interest: 'Attendee engagement' },
  { name: 'Helix Security', archetype: 'low-volume-high-quality', volume: .65, hot: .7, follow: .85, staff: 3, interest: 'AI governance' },
  { name: 'Northline Analytics', archetype: 'balanced', volume: 1, hot: .3, follow: .55, staff: 4, interest: 'Event measurement' },
  { name: 'Fieldwork Collective', archetype: 'understaffed', volume: 1.2, hot: .35, follow: .2, staff: 2, interest: 'Operational readiness' },
  { name: 'Aperture Systems', archetype: 'excellent-follow-up', volume: .95, hot: .4, follow: .95, staff: 4, interest: 'Workflow automation' },
  { name: 'Monument Labs', archetype: 'poor-follow-up', volume: 1.1, hot: .5, follow: .1, staff: 4, interest: 'Attendee engagement' },
  { name: 'Atlas Advisory', archetype: 'executive-engagement', volume: .8, hot: .5, follow: .7, staff: 3, interest: 'AI governance' },
  { name: 'Open Door Studio', archetype: 'early-stage', volume: 1.25, hot: .08, follow: .4, staff: 3, interest: 'Accessible experiences' },
  { name: 'LatticeNorth', archetype: 'session-traffic-spike', volume: 1.4, hot: .5, follow: .6, staff: 4, interest: 'AI governance' },
] as const;
export type LrStaff = { key: string; name: string; email: string; companyKey: string };
export type LrLead = { id: string; companyKey: string; eventKey: string; ownerKey: string | null; full_name: string; email: string; job_title: string; company_text: string; priority_score: number; temperature: string; is_hot: boolean; status: string; created_at: string; follow_up_at: string | null; follow_up_completed_at: string | null; follow_up_note: string; intent_signals: string[]; metadata: Record<string, unknown> };
export function generateLrWorld(world: EventWorld, config: SeedConfig) {
  if (!config.lr) throw new Error('LR configuration required');
  const companies = new Map<string, { key: string; name: string; archetype: string; interest: string; staff: LrStaff[] }>();
  const events = world.events.map((event, eventIndex) => {
    const companyKeys: string[] = [];
    const leads: LrLead[] = [];
    for (let i = 0; i < config.lr!.companiesPerEvent; i++) {
      const profile = LR_PROFILES[(i + (config.lr!.mode === 'direct' ? eventIndex : 0)) % LR_PROFILES.length]!;
      const companyKey = logicalId(world.worldKey, config.lr!.mode === 'direct' ? 'lr:direct' : `lr:company:${eventIndex}:${i}`);
      const random = seededRandom(`${world.worldKey}:${event.key}:${companyKey}`);
      if (!companies.has(companyKey)) {
        const display = config.lr!.mode === 'direct' ? LR_PROFILES[0]!.name : `${profile.name}${i >= LR_PROFILES.length ? ` ${['Europe', 'Americas', 'Pacific', 'Partners', 'Research', 'Ventures', 'Advisory', 'Digital', 'Solutions'][Math.floor(i / LR_PROFILES.length) - 1]}` : ''}`;
        companies.set(companyKey, { key: companyKey, name: display, archetype: profile.archetype, interest: profile.interest, staff: Array.from({ length: config.richness === 'SMOKE' ? 2 : profile.staff }, (_, s) => ({ key: logicalId(companyKey, `staff:${s}`), name: ['Priya Shah', 'Marcus Ellis', 'Sofia Torres', 'Amara Clarke', 'Evan Park'][s]!, email: `staff.${s}.${companyKey}@example.test`, companyKey })) });
      }
      companyKeys.push(companyKey);
      const company = companies.get(companyKey)!;
      const count = config.lifecycle === 'PRE' ? 0 : Math.max(3, Math.round(config.scale.leadsPerCompany * profile.volume * (1 + eventIndex * .09)));
      const lower = Date.parse(event.startsAt);
      const upper = Math.min(Date.parse(event.endsAt), config.lifecycle === 'DURING' ? Date.parse(config.anchor) : Infinity);
      for (let n = 0; n < count; n++) {
        const hot = random.next() < profile.hot;
        const temperature = hot ? 'hot' : random.next() < .55 ? 'warm' : 'cold';
        const person = event.attendees[n % event.attendees.length]!;
        const session = event.sessions.find(s => s.title.includes('AI Governance')) ?? event.sessions[0]!;
        const spikeStart = Date.parse(session.endsAt);
        const captured = profile.archetype === 'session-traffic-spike' && n < count * .6 && spikeStart < upper ? Math.min(upper, spikeStart + random.int(1, 45) * 60000) : lower + Math.floor((upper - lower) * random.next());
        const followAt = config.lifecycle === 'POST' && random.next() > .12 ? Date.parse(event.endsAt) + (1 + n % 4) * 86400000 : null;
        const completed = followAt !== null && followAt + 3600000 <= Date.parse(config.anchor) && random.next() < profile.follow;
        leads.push({ id: logicalId(event.key, `${companyKey}:lead:${n}`), companyKey, eventKey: event.key, ownerKey: n % 11 === 0 ? null : company.staff[n % company.staff.length]!.key,
          full_name: person.name, email: `buyer.${n}.${event.key}@example.test`, job_title: profile.archetype === 'executive-engagement' || n % 4 === 0 ? 'VP, Event Strategy' : 'Director of Experience Operations', company_text: person.organization,
          priority_score: hot ? random.int(80, 98) : temperature === 'warm' ? random.int(45, 74) : random.int(12, 39), temperature, is_hot: hot, status: completed ? 'closed' : followAt ? 'follow_up' : 'new',
          created_at: new Date(captured).toISOString(), follow_up_at: followAt === null ? null : new Date(followAt).toISOString(), follow_up_completed_at: completed ? new Date(followAt! + 3600000).toISOString() : null,
          follow_up_note: `${person.name} is evaluating ${profile.interest.toLowerCase()} for ${person.organization}. ${hot ? 'Requested a technical review with the buying team' : 'Asked for an implementation example'}; discuss ${['deployment ownership', 'reporting requirements', 'procurement timing', 'staff training'][n % 4]} in the next conversation.`,
          intent_signals: hot ? [profile.interest, 'Evaluation planned this quarter'] : [profile.interest], metadata: { demo_seed: { runId: config.runId, companyKey, eventKey: event.key }, source: n % 4 === 0 ? 'manual' : 'badge_scan', product_interest: profile.interest, buying_timeframe: hot ? 'This quarter' : 'Next year', archetype: profile.archetype, narrative_session_key: profile.archetype === 'session-traffic-spike' ? session.key : null }
        });
      }
    }
    return { key: event.key, companyKeys, leads };
  });
  return { mode: config.lr.mode, companies: [...companies.values()], events };
}
