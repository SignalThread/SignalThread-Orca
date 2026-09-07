# Leadership Summit migration — post-apply validation

Run every check below **after** `--apply` and before declaring the migration done.
Each check states the expected result. Any deviation is a rollback trigger.

- Source event `717ca942-5701-4bfb-82e7-afddf41f19a7` (old Orca `qgqqizrpdkpjohvpkdgu`)
- Destination event `ae9942ba-5759-486b-b591-f1b5ed223370` (new Orca `qgxvtgnzptepimuawnku`)
- Destination org `7437a82f-bdc9-425d-9f1c-5525930b43bd`
- Ali `aa8a4f3f-23c1-4beb-9d35-d8c30a71dad8` · Sarah `e79340c1-a647-4a11-a1ac-6fb758b6fadb`

## 1. Row counts by table

Re-running the script in dry-run mode after the apply is the cheapest full check: it
re-reads both databases and re-derives the plan. Expect **43 tables / 1,029 source rows**
and **1,029 PK collisions** — every row now present on the destination, which is proof
of a complete copy.

```bash
SOURCE_DATABASE_URL=... DATABASE_URL=... npx tsx apps/orca/scripts/migrate-leadership-summit.ts
```

Per-table equality, run against each database and diffed:

```sql
-- destination
select 'EventFnbCatalogItem' t, count(*) from "EventFnbCatalogItem" where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370'
union all select 'EventActivity', count(*) from "EventActivity" where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370'
union all select 'TimelineItem', count(*) from "TimelineItem" where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370'
union all select 'MatrixRow', count(*) from "MatrixRow" where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370'
union all select 'BudgetLineItem', count(*) from "BudgetLineItem" bli join "Budget" b on b.id=bli."budgetId" where b."eventId"='ae9942ba-5759-486b-b591-f1b5ed223370'
order by 1;
```

Expected headline counts: EventFnbCatalogItem 287, EventActivity 127, TimelineItem 120,
BudgetLineItem 114, MatrixRow 79, SessionRequirementItem 44, SessionRequirementSelection 35.

## 2. Foreign key integrity

Postgres enforces this at insert time, but re-validate explicitly in case any constraint
was deferred:

```sql
-- must return zero rows
select conrelid::regclass as table, conname
  from pg_constraint
 where contype = 'f' and connamespace = 'public'::regnamespace and not convalidated;
```

## 3. Orphan checks

Every child row must resolve to a parent inside the destination event.

```sql
-- must all be 0
select 'MatrixRow->Room' k, count(*) from "MatrixRow" m
  where m."eventId"='ae9942ba-5759-486b-b591-f1b5ed223370' and m."roomId" is not null
    and not exists (select 1 from "Room" r where r.id=m."roomId")
union all
select 'SessionFnbCatalogAssignment->MatrixRow', count(*) from "SessionFnbCatalogAssignment" a
  where not exists (select 1 from "MatrixRow" m where m.id=a."sessionId")
union all
select 'DocumentVersion->Document', count(*) from "DocumentVersion" dv
  where not exists (select 1 from "Document" d where d.id=dv."documentId")
union all
select 'BudgetLineItem->Budget', count(*) from "BudgetLineItem" bli
  where not exists (select 1 from "Budget" b where b.id=bli."budgetId")
union all
select 'DocumentTagOnDocument->DocumentTag', count(*) from "DocumentTagOnDocument" dt
  where not exists (select 1 from "DocumentTag" t where t.id=dt."tagId");
```

## 4. eventId correctness

No migrated row may still carry the source event id, and every direct child must carry
the destination id.

```sql
-- must return zero rows: any table still holding the SOURCE event id
select table_name from information_schema.columns c
 where c.table_schema='public' and c.column_name='eventId'
   and exists (select 1 from information_schema.tables t
                where t.table_name=c.table_name and t.table_type='BASE TABLE');
-- then, per table:
select count(*) from "<table>" where "eventId"='717ca942-5701-4bfb-82e7-afddf41f19a7';  -- expect 0
```

Expected total across all tables carrying `eventId`: **758 rows** now hold
`ae9942ba-5759-486b-b591-f1b5ed223370` and **0** hold the source id.

## 5. orgId correctness

```sql
-- must be 0: no migrated row retains the source org
select count(*) from "Document"            where "orgId"='dd0023ec-5204-4471-815f-750a110a95fa'
union all select count(*) from "DocumentTag"          where "orgId"='dd0023ec-5204-4471-815f-750a110a95fa'
union all select count(*) from "EventDirectoryPerson" where "orgId"='dd0023ec-5204-4471-815f-750a110a95fa'
union all select count(*) from "Notification"         where "orgId"='dd0023ec-5204-4471-815f-750a110a95fa';
```

Expected: 22 rows now carry `7437a82f-bdc9-425d-9f1c-5525930b43bd`.

## 6. Ali mapping

```sql
select 'EventActivity' t, count(*) from "EventActivity"
  where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370' and "actorUserId"='aa8a4f3f-23c1-4beb-9d35-d8c30a71dad8'
union all select 'TimelineItem owned', count(*) from "TimelineItem"
  where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370' and "ownerUserId"='aa8a4f3f-23c1-4beb-9d35-d8c30a71dad8';
```

Expected: EventActivity 20, TimelineItem 14 (5 originally Ali's + 9 recovered from the
seeded john.smith). Confirm the 9 recovered ids specifically:

```sql
select id, title, status, "ownerUserId" from "TimelineItem" where id in (
 '2b367b01-3bd1-4fc6-bfb4-b0a708b8986e','33c68caf-3c61-4d23-86eb-3a3cf5b33cc4',
 '38fac522-b9a0-47a0-b333-46f3c61d18bc','621a6ddd-18f4-4af0-8918-7443f0692ef8',
 '7ae91b24-f5cb-4db9-bb9d-e4ec7cf84f6c','9b50f73a-14cf-4b74-afb9-b0097a781c95',
 'bbefa77c-2282-4c0d-9e64-0ecbc4550034','dccfa59c-10a7-4c10-aef0-cc56bb51a506',
 'fa93b629-ff93-4a75-b906-5b301fc14c65');
-- all 9 must show ownerUserId = aa8a4f3f-23c1-4beb-9d35-d8c30a71dad8
```

## 7. Sarah mapping (both old identities collapsed onto one)

```sql
select 'EventActivity' t, count(*) from "EventActivity"
  where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370' and "actorUserId"='e79340c1-a647-4a11-a1ac-6fb758b6fadb'
union all select 'TimelineItem', count(*) from "TimelineItem"
  where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370' and "ownerUserId"='e79340c1-a647-4a11-a1ac-6fb758b6fadb'
union all select 'DocumentVersion', count(*) from "DocumentVersion" where "uploadedByUserId"='e79340c1-a647-4a11-a1ac-6fb758b6fadb'
union all select 'SessionSupplyAllocation', count(*) from "SessionSupplyAllocation" where "responsibleUserId"='e79340c1-a647-4a11-a1ac-6fb758b6fadb'
union all select 'SignageSign designOwner', count(*) from "SignageSign" where "designOwnerUserId"='e79340c1-a647-4a11-a1ac-6fb758b6fadb';
```

Expected: EventActivity 86 (60 siteandstay + 26 signalthread merged), TimelineItem 14,
DocumentVersion 2, SessionSupplyAllocation 8, SignageSign 3.

## 8. No seeded users created

```sql
-- must return zero rows
select id, email from "User"
 where email in ('demo@planneros.com','john.smith@planneros.com','sarah@siteandstay.com');

-- no orphaned seeded uuid may survive in any user column
select count(*) from "SignageSign"           where "createdByUserId"   in ('737febe3-eec2-4fed-ae0b-66110d1cb735','1bcf5714-015f-463c-b5a1-ce8750de488e');
select count(*) from "SupplyAllocationAudit" where "actorUserId"       in ('737febe3-eec2-4fed-ae0b-66110d1cb735','1bcf5714-015f-463c-b5a1-ce8750de488e');
select count(*) from "SessionShowFlowState"  where "createdByUserId"   in ('737febe3-eec2-4fed-ae0b-66110d1cb735','1bcf5714-015f-463c-b5a1-ce8750de488e');
select count(*) from "SignageChecklistItem"  where "completedByUserId" in ('737febe3-eec2-4fed-ae0b-66110d1cb735','1bcf5714-015f-463c-b5a1-ce8750de488e');
-- all must be 0; the 14 corresponding columns are NULL, while labels such as
-- EventActivity.actorLabel = 'Demo Admin' are preserved as historical text
```

## 9. Destination Event shell preserved

```sql
select id, name, "orgId", "createdByUserId", status
  from "Event" where id='ae9942ba-5759-486b-b591-f1b5ed223370';
```

Expected exactly: name `Acme Annual 2026`, orgId `7437a82f-…`, createdByUserId
`aa8a4f3f-…` (Ali), status `ACTIVE`. The source Event row is never copied, so the
source name `Orca Leadership Summit` must appear nowhere.

```sql
select count(*) from "Event" where id='717ca942-5701-4bfb-82e7-afddf41f19a7';  -- expect 0
select count(*) from "Organization" where id='dd0023ec-5204-4471-815f-750a110a95fa';  -- expect 0
```

## 10. Access state unchanged

```sql
select u.email, em."eventRole" from "EventMember" em join "User" u on u.id=em."userId"
 where em."eventId"='ae9942ba-5759-486b-b591-f1b5ed223370' order by u.email;
```

Expected exactly two rows, both `EVENT_ADMIN`: kamyab.ali@gmail.com and
sarah@signalthread.ai. No `Membership` or `EventMember` row was copied from the source.

## 11. SecurityComplianceRecord intentionally absent

```sql
select count(*) from information_schema.tables
 where table_schema='public' and table_name='SecurityComplianceRecord';  -- expect 0
```

Documented loss: exactly **1 source row**, id `9653a2da-6191-4856-ab88-711bf24162b2`
— area `EMERGENCY_PLAN`, title "Medical Response Team", status `NEEDS_REVIEW`,
owner text "Sarah", due 2026-09-01, details "Testing test test test", no evidence URL,
no child rows. It has no destination table and is deliberately not migrated.

## 12. SignageSign transformation correct

```sql
select count(*) from "SignageSign" where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370';  -- expect 7
select count(*) from information_schema.columns
 where table_name='SignageSign' and column_name='productionCopyNotRequired';  -- expect 0
```

All 7 source values were `false`, so dropping the column loses no information. Confirm
the 3 design-owner assignments landed on Sarah and the 7 seeded creator references are
NULL (checks 7 and 8 above).

## 13. R2 references correct

```sql
select "objectKey" from "DocumentVersion" dv join "Document" d on d.id=dv."documentId"
 where d."eventId"='ae9942ba-5759-486b-b591-f1b5ed223370'
union
select "objectKey" from "EventFnbSourceMenu" where "eventId"='ae9942ba-5759-486b-b591-f1b5ed223370';
```

Every key must begin `events/ae9942ba-5759-486b-b591-f1b5ed223370/` and none may contain
`717ca942`. Then confirm each object actually exists at its new key before the event is
opened to users:

```bash
aws s3api head-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" \
  --key "events/ae9942ba-5759-486b-b591-f1b5ed223370/documents/9a85974a-12c2-448e-af4a-874eabdd2269/First-Amendment---The-HFA-Show-2027-7.1.26.pdf-Document.pdf"
aws s3api head-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" \
  --key "events/ae9942ba-5759-486b-b591-f1b5ed223370/fnb-menus/5e55ac4d-c958-4242-9b5d-a895e123f2e7/FMH-2025-Catering-Menu.pdf"
```

Expected sizes 263,150 and 939,039 bytes, both `application/pdf`. Note the catering menu
is referenced twice, by one DocumentVersion and one EventFnbSourceMenu, so a single copied
object satisfies both rows.

**Storage copy is a separate step and is not performed by this migration script.**

## 14. Platform to Orca handoff opens the migrated event

End-to-end, as each real user:

1. Sign in to Platform, launch Orca for Acme Events.
2. The handoff mints a magic-link token and lands on `/auth/callback`, then the event.
3. `resolveEventAccessForUser` must allow the event: the user's org must match the
   event's org, and an `EventMember` row must exist.

```sql
-- the authorization inputs the handoff depends on
select u.email, u."orgId" as user_org, e."orgId" as event_org, em."eventRole"
  from "User" u
  join "EventMember" em on em."userId"=u.id
  join "Event" e on e.id=em."eventId"
 where e.id='ae9942ba-5759-486b-b591-f1b5ed223370';
-- both rows must show user_org = event_org = 7437a82f-bdc9-425d-9f1c-5525930b43bd
```

Then confirm in the UI that the migrated content renders: 79 sessions, 120 timeline
items, 287 F&B catalog items, 7 signs, 2 documents.
