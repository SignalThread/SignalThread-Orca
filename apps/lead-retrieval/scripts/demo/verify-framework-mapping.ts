import assert from 'node:assert/strict';
import { createSupabaseMappingDeps } from '../../lib/platform/identity-mapping-supabase';
import { resolveUserMapping, resolveEventMapping, resolveOrganizationContext } from '../../lib/platform/identity-mapping';
import { resolveAccessibleEventIdsForUser } from '../../lib/server/company-event-access';
import { decideLeadRetrievalEventAccess } from '../../lib/platform/lr-authorization';

async function main() {
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin, 'https://wsbdyemyzixkyvuiyesm.supabase.co');
  const [platformUserId, platformOrganizationId, platformEventId] = process.argv.slice(2);
  const deps = createSupabaseMappingDeps();
  const user = await resolveUserMapping(platformUserId, deps);
  const event = await resolveEventMapping(platformEventId, deps);
  assert(user.ok, JSON.stringify(user));
  assert(event.ok, JSON.stringify(event));
  const organization = await resolveOrganizationContext({ platformOrganizationId, user: user.value, event: event.value }, deps);
  assert(organization.ok, JSON.stringify(organization));
  const access = await resolveAccessibleEventIdsForUser({ userId: user.value.id });
  const decision = decideLeadRetrievalEventAccess({ role: user.value.role, access, eventId: event.value.id });
  assert(decision.ok, JSON.stringify(decision));
  console.log('MAPPING_AND_ACCESS_PASS', JSON.stringify({ userId: user.value.id, eventId: event.value.id, organization, decision }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
