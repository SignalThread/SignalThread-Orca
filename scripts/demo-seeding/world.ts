import { fingerprint, logicalId } from './random.ts';
import { ENTERPRISE, type Lifecycle, type Product, type Scenario, type SeedConfig } from './config.ts';

export type WorldRoom = { key: string; name: string; capacity: number };
export type WorldSpeaker = { key: string; name: string; biography: string; companyKey: string | null };
export type WorldSession = { key: string; title: string; description: string; roomKey: string; speakerKeys: string[]; startsAt: string; endsAt: string };
export type WorldPerson = { key: string; name: string; email: string; organization: string };
export type WorldCompany = { key: string; name: string; archetype: string; interests: string[] };
export type Narrative = { key: string; title: string; occurredAt: string; sessionKey: string | null; companyKeys: string[]; products: Product[]; facts: Record<string, string | number | boolean> };
export type WorldDeadline = { key: string; title: string; description: string; dueAt: string; category: 'FNB' | 'AV' | 'HOUSING' | 'REGISTRATION' | 'LOGISTICS' | 'OTHER'; status: 'OPEN' | 'DONE' | 'BLOCKED' | 'CANCELED' };
export type WorldTimelineItem = { key: string; title: string; notes: string; workstream: 'VENUE' | 'HOUSING' | 'REGISTRATION' | 'SPEAKERS' | 'SPONSORS' | 'FNB' | 'PRODUCTION' | 'MARKETING'; status: 'NOT_STARTED' | 'IN_PROGRESS' | 'AT_RISK' | 'COMPLETE'; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; startsAt: string; endsAt: string; parentKey: string | null };
export type WorldBudgetItem = { key: string; category: string; subcategory: string; title: string; vendor: string; forecastCents: number; actualCents: number; status: 'PLANNED' | 'COMMITTED' | 'PAID'; sessionKey: string | null };
export type WorldDocument = { key: string; title: string; category: string; status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'; visibility: 'INTERNAL_ONLY' | 'CLIENT_VISIBLE' };
export type WorldEvent = {
  key: string; canonicalId: string | null; name: string; theme: string; startsAt: string; endsAt: string; timezone: string; venue: string;
  lifecycle: Lifecycle; rooms: WorldRoom[]; sessions: WorldSession[]; speakers: WorldSpeaker[];
  attendees: WorldPerson[]; population: number; companies: WorldCompany[]; narratives: Narrative[];
  team: WorldPerson[]; deadlines: WorldDeadline[]; timeline: WorldTimelineItem[]; budgetItems: WorldBudgetItem[]; documents: WorldDocument[];
};
export type EventWorld = {
  version: 1; worldKey: string; configHash: string; scenario: string; seed: number; anchor: string;
  organization: { key: string; canonicalId: string | null; name: string };
  organizer: WorldPerson & { canonicalId: string | null };
  events: WorldEvent[]; contentState: 'foundation' | 'generated';
};
const ROOM_NAMES = ['Harbor Ballroom', 'Beacon Hall', 'Pier Studio', 'Chart Room', 'Atlantic Salon', 'Mariner Lab', 'Tidewater Room', 'Compass Lounge'];
const SESSION_TITLES = [
  'Opening Keynote: Designing the Connected Event', 'AI Governance for Experience Leaders', 'From Registration Signal to Onsite Action',
  'The Modern Event Operations Command Center', 'Executive Roundtable: Trustworthy Automation', 'Building a Measurable Attendee Journey',
  'Production Readiness Without the Fire Drill', 'Lunch and Innovation Exchange', 'Sponsor Activation That Earns Attention',
  'Voice of the Attendee: Live Insights Lab', 'Scaling Personalization Without Losing Humanity', 'The Data Contract Between Event Teams',
  'Accessibility as an Operating System', 'Revenue Teams After the Badge Scan', 'Breakout: Better Session Intelligence',
  'Closing Keynote: What Connected Teams Do Next', 'Workshop: Operational Scenario Planning', 'Customer Council: The Next Twelve Months',
  'Speaker Green Room Briefing', 'Morning Production Stand-up', 'Hosted Buyer Networking Exchange', 'Event Technology Leaders Forum',
  'Post-Show Measurement Clinic', 'Crew Rehearsal and Safety Walkthrough',
];
const SPEAKERS = [
  ['Maya Reynolds', 'Chief Experience Officer', 'Northstar Experiences'], ['Dr. Lena Ortiz', 'Responsible AI Researcher', 'Helix Institute'],
  ['Marcus Chen', 'VP, Global Events', 'Aperture Systems'], ['Priya Nair', 'Chief Operating Officer', 'Fieldwork Collective'],
  ['Jon Bell', 'Director of Event Technology', 'BeaconWorks'], ['Amara Okafor', 'Accessibility Strategist', 'Open Door Studio'],
  ['Evan Brooks', 'Head of Revenue Operations', 'Vector Cloud'], ['Sofia Alvarez', 'Executive Producer', 'Common Thread Live'],
  ['Noah Williams', 'Customer Insights Lead', 'LatticeNorth'], ['Keiko Tanaka', 'VP, Brand Experience', 'Monument Labs'],
] as const;
const DEADLINES = ['Lock final room set', 'Receive keynote presentation', 'Approve sponsor wall artwork', 'Confirm accessibility walkthrough', 'Reconcile registration staffing', 'Issue final production schedule', 'Release attendee mobile guide', 'Approve closing video', 'Confirm VIP arrival protocol', 'Complete fire-marshal review'];
const TIMELINE = ['Venue contract and load-in plan', 'Registration experience design', 'Speaker readiness program', 'Sponsor fulfillment', 'Production design and cueing', 'Food and beverage guarantees', 'Attendee communications', 'Show-week command plan', 'Post-event closeout'];
const BUDGET = [
  ['Production', 'Audio/Visual', 'Main-stage production package', 'Common Thread Live', 18500000],
  ['Venue', 'Meeting Space', 'Ballroom and breakout rental', 'Harbor Conference Center', 9200000],
  ['Food & Beverage', 'Catering', 'Attendee meal program', 'Harbor Culinary', 14600000],
  ['Speakers', 'Travel', 'Speaker travel and hospitality', 'Atlas Travel Partners', 4800000],
  ['Registration', 'Staffing', 'Registration and guest-services team', 'WelcomeWorks', 3600000],
  ['Marketing', 'Creative', 'Event creative and digital signage', 'Northline Creative', 2750000],
] as const;

function personName(index: number): string {
  const first = ['Avery', 'Jordan', 'Taylor', 'Morgan', 'Cameron', 'Riley', 'Quinn', 'Parker', 'Emerson', 'Rowan'];
  const last = ['Bennett', 'Santos', 'Patel', 'Kim', 'Thompson', 'Rivera', 'Nguyen', 'Foster', 'Campbell', 'Morgan'];
  return `${first[index % first.length]} ${last[Math.floor(index / first.length) % last.length]}`;
}

/** Build the first product-grade event world; later adapters consume the same facts. */
export function createWorld(config: SeedConfig, scenario: Scenario = ENTERPRISE): EventWorld {
  if (scenario.key !== config.scenario || scenario.version !== config.scenarioVersion) throw new Error('Scenario/config version mismatch');
  const day = 86400000;
  const anchor = Date.parse(config.anchor);
  const offset = config.lifecycle === 'PRE' ? 30 : config.lifecycle === 'DURING' ? 0 : -7;
  const events = Array.from({ length: config.events }, (_, index): WorldEvent => {
    // Past portfolio entries remain in the same requested phase at the anchor.
    const spacing = config.lifecycle === 'PRE' ? index * 90 : config.lifecycle === 'POST' ? -index * 90 : 0;
    const starts = anchor + (offset + spacing) * day;
    const roomCount = config.scale.rooms;
    const speakerCount = config.scale.speakers;
    const sessionCount = config.scale.sessions;
    const rooms = Array.from({ length: roomCount }, (__, i) => ({ key: logicalId(config.worldKey, `event:${index}:room:${i}`), name: ROOM_NAMES[i % ROOM_NAMES.length]!, capacity: [780, 420, 240, 160, 120, 90, 72, 60][i % 8]! }));
    const speakers = Array.from({ length: speakerCount }, (__, i): WorldSpeaker => {
      const profile = SPEAKERS[i % SPEAKERS.length]!;
      const suffix = i < SPEAKERS.length ? '' : ` ${Math.floor(i / SPEAKERS.length) + 1}`;
      return { key: logicalId(config.worldKey, `event:${index}:speaker:${i}`), name: `${profile[0]}${suffix}`, biography: `${profile[1]} at ${profile[2]}, focused on practical, measurable ways connected teams improve live experiences.`, companyKey: null };
    });
    const sessions = Array.from({ length: sessionCount }, (__, i): WorldSession => {
      const start = starts + (i < Math.ceil(sessionCount / 2) ? 9 : 24 + 9) * 3600000 + (i % Math.ceil(sessionCount / 2)) * 75 * 60000;
      return { key: logicalId(config.worldKey, `event:${index}:session:${i}`), title: SESSION_TITLES[i % SESSION_TITLES.length]!, description: `A practical conversation connecting ${scenario.theme.toLowerCase()} to decisions event teams can make now.`, roomKey: rooms[i % rooms.length]!.key, speakerKeys: [speakers[i % speakers.length]!.key], startsAt: new Date(start).toISOString(), endsAt: new Date(start + 60 * 60000).toISOString() };
    });
    const attendeeRows = Math.min(config.scale.attendees, config.richness === 'SMOKE' ? 12 : config.richness === 'DEMO' ? 64 : 140);
    const attendees = Array.from({ length: attendeeRows }, (__, i): WorldPerson => ({ key: logicalId(config.worldKey, `event:${index}:attendee:${i}`), name: personName(i), email: `attendee.${index}.${i}.${config.worldKey}@example.test`, organization: ['Vector Cloud', 'Monument Labs', 'Aperture Systems', 'Northstar Experiences'][i % 4]! }));
    const teamCount = config.richness === 'SMOKE' ? 3 : config.richness === 'DEMO' ? 6 : 10;
    const team = Array.from({ length: teamCount }, (__, i): WorldPerson => ({ key: logicalId(config.worldKey, `event:${index}:team:${i}`), name: ['Sofia Alvarez', 'Marcus Chen', 'Priya Nair', 'Jon Bell', 'Amara Okafor', 'Evan Brooks', 'Keiko Tanaka', 'Noah Williams', 'Lena Ortiz', 'Maya Reynolds'][i]!, email: `team.${index}.${i}.${config.worldKey}@example.test`, organization: 'SignalThread Event Collective' }));
    const deadlineCount = config.richness === 'SMOKE' ? 5 : config.richness === 'DEMO' ? 18 : 36;
    const deadlines = Array.from({ length: deadlineCount }, (__, i): WorldDeadline => ({ key: logicalId(config.worldKey, `event:${index}:deadline:${i}`), title: DEADLINES[i % DEADLINES.length]!, description: i % 5 === 2 ? 'Dependent on final client review; escalation owner is assigned.' : 'Tracked against the integrated show-week operating plan.', dueAt: new Date(starts - (30 - i) * day).toISOString(), category: (['LOGISTICS', 'AV', 'OTHER', 'REGISTRATION', 'HOUSING', 'FNB'] as const)[i % 6]!, status: (['DONE', 'DONE', 'OPEN', 'BLOCKED', 'OPEN'] as const)[i % 5]! }));
    const timelineCount = config.richness === 'SMOKE' ? 6 : config.richness === 'DEMO' ? 24 : 48;
    const rootTimelineKey = logicalId(config.worldKey, `event:${index}:timeline:0`);
    const timeline = Array.from({ length: timelineCount }, (__, i): WorldTimelineItem => ({ key: logicalId(config.worldKey, `event:${index}:timeline:${i}`), title: i === 0 ? 'Integrated Event Delivery Plan' : `${TIMELINE[i % TIMELINE.length]} · ${Math.floor(i / TIMELINE.length) + 1}`, notes: i % 7 === 0 ? 'Leadership review required before the next dependent workstream advances.' : 'Owner, timing, and operational acceptance criteria confirmed.', workstream: (['VENUE', 'REGISTRATION', 'SPEAKERS', 'SPONSORS', 'PRODUCTION', 'FNB', 'MARKETING', 'HOUSING'] as const)[i % 8]!, status: (['COMPLETE', 'IN_PROGRESS', 'AT_RISK', 'NOT_STARTED'] as const)[i % 4]!, priority: (['MEDIUM', 'HIGH', 'CRITICAL', 'LOW'] as const)[i % 4]!, startsAt: new Date(starts - (70 - i) * day).toISOString(), endsAt: new Date(starts - (55 - i) * day).toISOString(), parentKey: i === 0 ? null : rootTimelineKey }));
    const budgetCount = config.richness === 'SMOKE' ? 5 : config.richness === 'DEMO' ? 16 : 30;
    const budgetItems = Array.from({ length: budgetCount }, (__, i): WorldBudgetItem => { const row = BUDGET[i % BUDGET.length]!; const variance = (i % 5 - 2) * 175000; return { key: logicalId(config.worldKey, `event:${index}:budget:${i}`), category: row[0], subcategory: row[1], title: `${row[2]}${i >= BUDGET.length ? ` · phase ${Math.floor(i / BUDGET.length) + 1}` : ''}`, vendor: row[3], forecastCents: Math.round(row[4] / Math.ceil(budgetCount / BUDGET.length)), actualCents: Math.max(0, Math.round(row[4] / Math.ceil(budgetCount / BUDGET.length)) + variance), status: (['PAID', 'COMMITTED', 'PLANNED'] as const)[i % 3]!, sessionKey: i % 4 === 0 ? sessions[i % sessions.length]!.key : null }; });
    const documentCount = config.richness === 'SMOKE' ? 3 : config.richness === 'DEMO' ? 8 : 14;
    const documents = Array.from({ length: documentCount }, (__, i): WorldDocument => ({ key: logicalId(config.worldKey, `event:${index}:document:${i}`), title: ['Master production schedule', 'Speaker briefing packet', 'Sponsor fulfillment tracker', 'Venue operating plan', 'Registration escalation guide', 'Accessibility plan'][i % 6]!, category: ['Production', 'Speakers', 'Sponsors', 'Venue', 'Registration', 'Accessibility'][i % 6]!, status: (['APPROVED', 'IN_REVIEW', 'DRAFT', 'APPROVED'] as const)[i % 4]!, visibility: i % 3 === 0 ? 'CLIENT_VISIBLE' : 'INTERNAL_ONLY' }));
    const narrativeCount = config.richness === 'SMOKE' ? 3 : config.richness === 'DEMO' ? 7 : 10;
    const narratives = Array.from({ length: narrativeCount }, (__, i): Narrative => ({ key: logicalId(config.worldKey, `event:${index}:narrative:${i}`), title: ['High-demand AI session moved to Harbor Ballroom', 'Late keynote deck enters expedited review', 'Registration staffing gap is recovered', 'Sponsor activation exceeds engagement forecast', 'AV redundancy issue needs owner confirmation', 'VIP arrival protocol changes', 'Lunch service line is rebalanced'][i % 7]!, occurredAt: new Date(starts - (12 - i) * 3600000).toISOString(), sessionKey: sessions[i % sessions.length]!.key, companyKeys: [], products: ['orca'], facts: { sequence: i + 1, resolved: i % 3 === 0, attendeePopulation: config.scale.attendees } }));
    return {
      key: logicalId(config.worldKey, `event:${index}`), canonicalId: null,
      name: `${scenario.name} · ${new Date(starts).getUTCFullYear()} ${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(starts)}${config.lifecycle === 'DURING' && config.events > 1 ? ` · ${['East', 'West', 'Central', 'North'][index % 4]} ${index + 1}` : ''}`,
      theme: scenario.theme, startsAt: new Date(starts).toISOString(), endsAt: new Date(starts + day + 6 * 3600000).toISOString(),
      timezone: scenario.timezone, venue: scenario.venue, lifecycle: config.lifecycle,
      rooms, sessions, speakers, attendees, population: config.scale.attendees, companies: [], narratives,
      team, deadlines, timeline, budgetItems, documents,
    };
  });
  return {
    version: 1, worldKey: config.worldKey, configHash: config.configHash, scenario: config.scenario, seed: config.seed, anchor: config.anchor,
    organization: { key: logicalId(config.worldKey, 'organization'), canonicalId: null, name: 'SignalThread Event Collective' },
    organizer: { key: logicalId(config.worldKey, 'organizer'), canonicalId: null, name: 'Maya Reynolds', email: `maya.${config.worldKey}@example.test`, organization: 'SignalThread Event Collective' },
    events, contentState: 'generated',
  };
}
export type CanonicalEventSnapshot = { id: string; organizationId: string; organizationName: string; name: string; startsAt: string; endsAt: string; timezone: string; venue: string; authorized: boolean };
/** Only the Platform adapter supplies this snapshot after live membership and event ownership checks. */
export function bindExistingEvent(world: EventWorld, config: SeedConfig, snapshot: CanonicalEventSnapshot): EventWorld {
  if (!snapshot.authorized || snapshot.id !== config.existingEventId || snapshot.organizationId !== config.organizationId || world.events.length !== 1) throw new Error('Existing event scope could not be verified');
  const start = Date.parse(snapshot.startsAt), end = Date.parse(snapshot.endsAt), anchor = Date.parse(config.anchor);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error('Existing event has invalid canonical dates');
  return { ...world,
    configHash: fingerprint({ config: config.configHash, snapshot: { ...snapshot, authorized: undefined } }),
    organization: { ...world.organization, canonicalId: snapshot.organizationId, name: snapshot.organizationName },
    events: [{ ...world.events[0]!, canonicalId: snapshot.id, name: snapshot.name, startsAt: snapshot.startsAt, endsAt: snapshot.endsAt, timezone: snapshot.timezone, venue: snapshot.venue, lifecycle: anchor < start ? 'PRE' : anchor <= end ? 'DURING' : 'POST' }],
  };
}
