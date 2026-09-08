import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { AdapterResult, PlatformContext, ProductAdapter } from './adapters.ts';
import type { SeedConfig } from './config.ts';
import { logicalId } from './random.ts';
import { recordRow, type OwnershipManifest } from './ownership.ts';
import type { EventWorld } from './world.ts';

export const ORCA_PROJECT_REF = 'qgxvtgnzptepimuawnku';
type OrcaCounts = { organizations: number; users: number; events: number; rooms: number; sessions: number; speakers: number; team: number; deadlines: number; timelineItems: number; timelineDependencies: number; budgetItems: number; documents: number; seatingAttendees: number; activities: number };

function requireOrcaUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('Orca DATABASE_URL is required');
  const parsed = new URL(value);
  const match = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9]+)$/);
  if (match?.[1] !== ORCA_PROJECT_REF) throw new Error(`Orca target refused; expected ${ORCA_PROJECT_REF}`);
  return value;
}

function database(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: requireOrcaUrl(), max: 2, allowExitOnIdle: true }) });
}

function stableSnapshot(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function addReceipt(manifest: OwnershipManifest, table: string, row: Record<string, unknown>, organizationId: string, eventId: string | null, existed: boolean, fields: readonly string[]): OwnershipManifest {
  return recordRow(manifest, { database: 'orca', target: ORCA_PROJECT_REF, table, id: String(row.id), organizationId, eventId, disposition: existed ? 'borrowed' : 'created' }, stableSnapshot(row, fields));
}

const toDate = (value: string) => new Date(value);
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const timeOnly = (value: string) => new Date(`1970-01-01T${value.slice(11, 19)}.000Z`);

export function createOrcaAdapter(): ProductAdapter {
  return {
    product: 'orca',
    async preflight() {
      requireOrcaUrl();
      const db = database();
      try {
        const rows = await db.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'MatrixRow' AND column_name = 'includeInOfficialAgenda'`;
        if (rows.length !== 1) throw new Error('Orca canonical official-agenda column is unavailable');
        await db.matrixRow.findMany({ take: 0, select: { id: true, includeInOfficialAgenda: true } });
      } finally {
        await db.$disconnect();
      }
      return { identity: `postgres:${ORCA_PROJECT_REF}`, verified: true };
    },
    async seed(world: EventWorld, config: SeedConfig, context: PlatformContext, initial: OwnershipManifest): Promise<AdapterResult> {
      requireOrcaUrl(); // positive target verification immediately before the transaction
      const db = database();
      let manifest = initial;
      const counts: OrcaCounts = { organizations: 0, users: 0, events: 0, rooms: 0, sessions: 0, speakers: 0, team: 0, deadlines: 0, timelineItems: 0, timelineDependencies: 0, budgetItems: 0, documents: 0, seatingAttendees: 0, activities: 0 };
      try {
        await db.$transaction(async (tx) => {
          const existingOrg = await tx.organization.findUnique({ where: { id: context.organizationId } });
          if (existingOrg && !existingOrg.slug.startsWith('st-demo-')) throw new Error('Canonical Orca organization id collides with an unowned row');
          const organization = await tx.organization.upsert({ where: { id: context.organizationId }, update: { name: world.organization.name }, create: { id: context.organizationId, name: world.organization.name, slug: `st-demo-${config.runId.slice(-12)}` } });
          manifest = addReceipt(manifest, 'Organization', organization as unknown as Record<string, unknown>, organization.id, null, Boolean(existingOrg), ['id', 'name', 'slug']);
          counts.organizations = 1;

          const existingByPlatform = await tx.user.findUnique({ where: { platformUserId: context.organizerUserId } });
          const existingByEmail = await tx.user.findUnique({ where: { email: world.organizer.email } });
          if (existingByPlatform && existingByEmail && existingByPlatform.id !== existingByEmail.id) throw new Error('Orca identity collision; refusing to merge users');
          if (existingByEmail?.platformUserId && existingByEmail.platformUserId !== context.organizerUserId) throw new Error('Orca email is linked to another Platform identity');
          const user = existingByPlatform
            ? await tx.user.update({ where: { id: existingByPlatform.id }, data: { name: world.organizer.name, orgId: organization.id } })
            : existingByEmail
              ? await tx.user.update({ where: { id: existingByEmail.id }, data: { name: world.organizer.name, orgId: organization.id, platformUserId: context.organizerUserId } })
              : await tx.user.create({ data: { id: logicalId(config.runId, 'orca-user'), orgId: organization.id, email: world.organizer.email, name: world.organizer.name, role: 'OWNER', platformUserId: context.organizerUserId } });
          manifest = addReceipt(manifest, 'User', user as unknown as Record<string, unknown>, organization.id, null, Boolean(existingByPlatform ?? existingByEmail), ['id', 'orgId', 'email', 'name', 'role', 'platformUserId']);
          counts.users = 1;
          await tx.membership.upsert({ where: { orgId_userId: { orgId: organization.id, userId: user.id } }, update: {}, create: { id: logicalId(config.runId, 'orca-membership'), orgId: organization.id, userId: user.id } });

          for (const [eventIndex, source] of world.events.entries()) {
            const canonicalEventId = context.events.find((entry) => entry.worldEventKey === source.key)?.canonicalEventId;
            if (!canonicalEventId) throw new Error(`Missing canonical Platform mapping for ${source.key}`);
            const existingEvent = await tx.event.findUnique({ where: { id: canonicalEventId } });
            if (existingEvent && existingEvent.orgId !== organization.id) throw new Error('Canonical event is already attached to another Orca organization');
            const event = await tx.event.upsert({ where: { id: canonicalEventId }, update: { name: source.name, startDate: dateOnly(source.startsAt), endDate: dateOnly(source.endsAt), timezone: source.timezone, venueName: source.venue }, create: { id: canonicalEventId, orgId: organization.id, name: source.name, startDate: dateOnly(source.startsAt), endDate: dateOnly(source.endsAt), timezone: source.timezone, venueName: source.venue, city: 'Baltimore', state: 'MD', status: source.lifecycle === 'POST' ? 'COMPLETED' : 'ACTIVE', createdByUserId: user.id } });
            manifest = addReceipt(manifest, 'Event', event as unknown as Record<string, unknown>, organization.id, event.id, Boolean(existingEvent), ['id', 'orgId', 'name', 'startDate', 'endDate', 'timezone', 'venueName', 'status', 'createdByUserId']);
            counts.events += 1;
            await tx.eventMember.upsert({ where: { eventId_userId: { eventId: event.id, userId: user.id } }, update: { eventRole: 'EVENT_ADMIN' }, create: { id: logicalId(config.runId, `event:${eventIndex}:member`), eventId: event.id, userId: user.id, eventRole: 'EVENT_ADMIN' } });

            for (const room of source.rooms) {
              await tx.room.upsert({ where: { eventId_name: { eventId: event.id, name: room.name } }, update: { capacity: room.capacity, roomSetNotes: room.name.includes('Ballroom') ? 'Theater set with two center aisles; hold rear rows until keynote demand is confirmed.' : 'Classroom set with accessible aisle clearance.', roomSetInternalNotes: 'Verify power, sightlines, and final fire-code count during show-week walk.' }, create: { id: room.key, eventId: event.id, name: room.name, capacity: room.capacity, roomSetNotes: room.name.includes('Ballroom') ? 'Theater set with two center aisles; hold rear rows until keynote demand is confirmed.' : 'Classroom set with accessible aisle clearance.', roomSetInternalNotes: 'Verify power, sightlines, and final fire-code count during show-week walk.' } });
            }
            counts.rooms += source.rooms.length;

            for (const speaker of source.speakers) {
              await tx.speaker.upsert({ where: { id: speaker.key }, update: { name: speaker.name, bio: speaker.biography }, create: { id: speaker.key, eventId: event.id, name: speaker.name, email: `${speaker.key.slice(0, 12)}@speaker.example.test`, title: speaker.biography.split(' at ')[0], company: speaker.biography.split(' at ')[1]?.split(',')[0] ?? null, bio: speaker.biography, status: source.speakers.indexOf(speaker) % 5 === 2 ? 'NEEDS_INFO' : 'CONFIRMED', notes: source.speakers.indexOf(speaker) % 5 === 2 ? 'Final presentation file is due for expedited content and AV review.' : 'Briefing complete; onsite arrival and green-room timing confirmed.' } });
            }
            counts.speakers += source.speakers.length;

            for (const [sessionIndex, session] of source.sessions.entries()) {
              const room = source.rooms.find((entry) => entry.key === session.roomKey)!;
              await tx.matrixRow.upsert({ where: { id: session.key }, update: { roomId: room.key, roomName: room.name, sessionName: session.title, dayDate: dateOnly(session.startsAt), startTime: timeOnly(session.startsAt), endTime: timeOnly(session.endsAt), includeInOfficialAgenda: !session.title.includes('Crew Rehearsal'), publicDescription: session.description }, create: { id: session.key, eventId: event.id, roomId: room.key, roomName: room.name, sessionName: session.title, dayDate: dateOnly(session.startsAt), startTime: timeOnly(session.startsAt), endTime: timeOnly(session.endsAt), sortOrder: sessionIndex, attendance: Math.min(room.capacity, Math.round(source.population / Math.max(2, source.rooms.length))), attendanceSource: 'PLANNER_ESTIMATE', includeInOfficialAgenda: !session.title.includes('Crew Rehearsal'), publicDescription: session.description, avNeeds: sessionIndex % 4 === 1 ? 'Dual confidence monitors and redundant presentation playback.' : 'Standard presentation package with lavalier microphone.', notes: sessionIndex % 5 === 0 ? '[Status] At risk\n[Session Type] Featured' : '[Status] Confirmed\n[Session Type] Breakout' } });
              for (const speakerKey of session.speakerKeys) await tx.sessionSpeakerAssignment.upsert({ where: { sessionId_speakerId: { sessionId: session.key, speakerId: speakerKey } }, update: {}, create: { sessionId: session.key, speakerId: speakerKey } });
            }
            counts.sessions += source.sessions.length;

            for (const [teamIndex, person] of source.team.entries()) {
              await tx.eventPerson.upsert({ where: { id: person.key }, update: { name: person.name, company: person.organization }, create: { id: person.key, eventId: event.id, name: person.name, role: teamIndex % 4 === 3 ? 'VENDOR' : 'STAFF', company: person.organization, email: person.email, notes: teamIndex === 0 ? 'Executive producer and onsite escalation lead.' : 'Assigned to show-week delivery and cross-functional readiness.' } });
              const session = source.sessions[teamIndex % source.sessions.length]!;
              await tx.sessionStaffAssignment.upsert({ where: { sessionId_personId: { sessionId: session.key, personId: person.key } }, update: { role: teamIndex === 0 ? 'Executive producer' : 'Session operations' }, create: { sessionId: session.key, personId: person.key, role: teamIndex === 0 ? 'Executive producer' : 'Session operations' } });
            }
            counts.team += source.team.length;

            for (const deadline of source.deadlines) await tx.deadline.upsert({ where: { id: deadline.key }, update: { title: deadline.title, dueAt: toDate(deadline.dueAt), status: deadline.status }, create: { id: deadline.key, eventId: event.id, title: deadline.title, description: deadline.description, dueAt: toDate(deadline.dueAt), category: deadline.category, status: deadline.status, ownerUserId: user.id } });
            counts.deadlines += source.deadlines.length;

            for (const item of source.timeline) await tx.timelineItem.upsert({ where: { id: item.key }, update: { title: item.title, status: item.status, priority: item.priority }, create: { id: item.key, eventId: event.id, title: item.title, notes: item.notes, department: item.workstream, workstream: item.workstream, status: item.status, priority: item.priority, isCriticalPath: item.priority === 'CRITICAL', ownerUserId: user.id, parentId: item.parentKey, startDate: toDate(item.startsAt), endDate: toDate(item.endsAt), progress: item.status === 'COMPLETE' ? 100 : item.status === 'IN_PROGRESS' ? 55 : item.status === 'AT_RISK' ? 35 : 0, sortOrder: source.timeline.indexOf(item) } });
            for (let i = 2; i < source.timeline.length; i += 5) {
              const predecessor = source.timeline[i - 1]!, successor = source.timeline[i]!;
              await tx.timelineDependency.upsert({ where: { predecessorItemId_successorItemId_type: { predecessorItemId: predecessor.key, successorItemId: successor.key, type: 'FINISH_TO_START' } }, update: {}, create: { id: logicalId(config.runId, `event:${eventIndex}:dependency:${i}`), eventId: event.id, predecessorItemId: predecessor.key, successorItemId: successor.key } });
              counts.timelineDependencies += 1;
            }
            counts.timelineItems += source.timeline.length;

            const budgetId = logicalId(config.runId, `event:${eventIndex}:budget`);
            await tx.budget.upsert({ where: { eventId: event.id }, update: { status: source.lifecycle === 'POST' ? 'APPROVED' : 'DRAFT' }, create: { id: budgetId, eventId: event.id, status: source.lifecycle === 'POST' ? 'APPROVED' : 'DRAFT', approvedAt: source.lifecycle === 'POST' ? toDate(source.startsAt) : null, approvedByUserId: source.lifecycle === 'POST' ? user.id : null } });
            for (const [itemIndex, item] of source.budgetItems.entries()) await tx.budgetLineItem.upsert({ where: { id: item.key }, update: { forecastCents: item.forecastCents, actualCents: item.actualCents, status: item.status }, create: { id: item.key, budgetId, category: item.category, subcategory: item.subcategory, lineItem: item.title, vendor: item.vendor, matrixRowId: item.sessionKey, forecastCents: item.forecastCents, actualCents: item.actualCents, status: item.status, approval: item.status === 'PAID' ? 'APPROVED' : 'PENDING', sortOrder: itemIndex } });
            counts.budgetItems += source.budgetItems.length;

            for (const document of source.documents) {
              const categoryId = logicalId(config.runId, `event:${eventIndex}:doc-category:${document.category}`);
              const slug = document.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              await tx.documentCategory.upsert({ where: { eventId_slug: { eventId: event.id, slug } }, update: { name: document.category }, create: { id: categoryId, eventId: event.id, name: document.category, slug } });
              await tx.document.upsert({ where: { id: document.key }, update: { title: document.title, status: document.status, visibility: document.visibility }, create: { id: document.key, orgId: organization.id, eventId: event.id, title: document.title, categoryId, status: document.status, visibility: document.visibility } });
            }
            counts.documents += source.documents.length;

            const seatingPlanId = logicalId(config.runId, `event:${eventIndex}:seating-plan`);
            const seatedSession = source.sessions.find((entry) => entry.title.includes('Lunch')) ?? source.sessions[0]!;
            await tx.seatingPlan.upsert({ where: { id: seatingPlanId }, update: { matrixRowId: seatedSession.key, name: 'Leadership lunch seating' }, create: { id: seatingPlanId, eventId: event.id, matrixRowId: seatedSession.key, name: 'Leadership lunch seating' } });
            const seated = source.attendees.slice(0, config.richness === 'SMOKE' ? 8 : config.richness === 'DEMO' ? 32 : 64);
            const tableCount = Math.ceil(seated.length / 8);
            for (let tableIndex = 0; tableIndex < tableCount; tableIndex++) await tx.seatingTable.upsert({ where: { id: logicalId(config.runId, `event:${eventIndex}:table:${tableIndex}`) }, update: { name: `Harbor ${tableIndex + 1}` }, create: { id: logicalId(config.runId, `event:${eventIndex}:table:${tableIndex}`), eventId: event.id, seatingPlanId, name: `Harbor ${tableIndex + 1}`, capacity: 8, sortOrder: tableIndex } });
            for (const [attendeeIndex, attendee] of seated.entries()) {
              const [firstName, ...last] = attendee.name.split(' ');
              await tx.seatingAttendee.upsert({ where: { id: attendee.key }, update: { firstName: firstName!, lastName: last.join(' '), company: attendee.organization }, create: { id: attendee.key, eventId: event.id, firstName: firstName!, lastName: last.join(' '), company: attendee.organization, email: attendee.email } });
              const tableIndex = Math.floor(attendeeIndex / 8), tableId = logicalId(config.runId, `event:${eventIndex}:table:${tableIndex}`);
              await tx.seatingAssignment.upsert({ where: { id: logicalId(config.runId, `event:${eventIndex}:seat:${attendeeIndex}`) }, update: { tableId, seatIndex: attendeeIndex % 8 }, create: { id: logicalId(config.runId, `event:${eventIndex}:seat:${attendeeIndex}`), eventId: event.id, tableId, attendeeId: attendee.key, seatingPlanId, seatIndex: attendeeIndex % 8 } });
            }
            counts.seatingAttendees += seated.length;

            for (const narrative of source.narratives) await tx.eventActivity.upsert({ where: { eventId_sourceRecordType_sourceRecordId: { eventId: event.id, sourceRecordType: 'SIGNALTHREAD_DEMO_NARRATIVE', sourceRecordId: narrative.key } }, update: { message: narrative.title, changes: narrative.facts }, create: { id: narrative.key, eventId: event.id, actorUserId: user.id, actorKind: 'USER', actorLabel: user.name, module: 'RUN_OF_SHOW', actionType: narrative.facts.resolved ? 'UPDATED' : 'STATUS_CHANGED', entityType: 'DemoNarrative', entityId: narrative.sessionKey, entityLabel: narrative.title, message: narrative.title, changes: narrative.facts, sourceRecordType: 'SIGNALTHREAD_DEMO_NARRATIVE', sourceRecordId: narrative.key, createdAt: toDate(narrative.occurredAt) } });
            counts.activities += source.narratives.length;
          }
        }, { timeout: 120_000 });

        const eventIds = context.events.map((entry) => entry.canonicalEventId);
        const [events, sessions, orphans, official] = await Promise.all([
          db.event.count({ where: { id: { in: eventIds }, orgId: context.organizationId } }),
          db.matrixRow.count({ where: { eventId: { in: eventIds } } }),
          db.matrixRow.count({ where: { eventId: { in: eventIds }, OR: [{ roomId: null }, { event: { is: { orgId: { not: context.organizationId } } } }] } }),
          db.matrixRow.count({ where: { eventId: { in: eventIds }, includeInOfficialAgenda: true } }),
        ]);
        const validations = [
          { label: 'Platform and Orca canonical event ids match', passed: events === world.events.length, detail: eventIds.join(',') },
          { label: 'expected sessions persisted', passed: sessions === counts.sessions, detail: String(sessions) },
          { label: 'no orphaned session room or organization references', passed: orphans === 0, detail: String(orphans) },
          { label: 'official agenda designation is live', passed: official > 0, detail: `${official} official sessions` },
        ];
        if (validations.some((entry) => !entry.passed)) throw new Error(`Orca post-seed validation failed: ${validations.filter((entry) => !entry.passed).map((entry) => entry.label).join(', ')}`);
        return { product: 'orca', counts, manifest, validations };
      } finally {
        await db.$disconnect();
      }
    },
    async reset(_config: SeedConfig, manifest: OwnershipManifest): Promise<AdapterResult> {
      requireOrcaUrl();
      // Event deletion has many non-cascading product relationships. Until every owned
      // dependent is transactionally re-read, fail closed instead of risking unrelated data.
      return { product: 'orca', counts: {}, manifest, validations: [{ label: 'reset refused pending complete owned-dependent proof', passed: false }] };
    },
  };
}
