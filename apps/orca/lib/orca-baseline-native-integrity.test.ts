/**
 * Orca clean database baseline — native PostgreSQL integrity behaviour.
 *
 * The baseline is derived from a PostgreSQL-native dump precisely because a Prisma-only
 * baseline silently loses partial-index predicates, check constraints, functions and
 * triggers. Asserting those objects *exist* is not enough: these tests prove the database
 * actually enforces them.
 *
 * Runs only against a disposable validation database. It refuses to touch anything that
 * is not a local database whose name is explicitly approved, so it can never be pointed at
 * the legacy Orca database or at a real operational one.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Client } from "pg";

const APPROVED_DISPOSABLE_DBS = new Set(["orca_baseline_validation", "orca_baseline_introspect"]);

type Target = { url: string; database: string };

function resolveDisposableTarget(): Target | { skip: string } {
  const url = process.env.BASELINE_VALIDATION_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) return { skip: "No DATABASE_URL / BASELINE_VALIDATION_DATABASE_URL configured." };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { skip: "Database URL is not parseable." };
  }

  const host = parsed.hostname;
  const database = parsed.pathname.replace(/^\//, "").split("?")[0] ?? "";

  if (host !== "localhost" && host !== "127.0.0.1") {
    return { skip: `Refusing to run destructive integrity tests against non-local host "${host}".` };
  }
  if (!APPROVED_DISPOSABLE_DBS.has(database)) {
    return { skip: `Database "${database}" is not an approved disposable validation database.` };
  }
  return { url, database };
}

async function withClient<T>(t: TestContext, run: (c: Client) => Promise<T>): Promise<T | null> {
  const target = resolveDisposableTarget();
  if ("skip" in target) {
    t.skip(target.skip);
    return null;
  }
  const client = new Client({ connectionString: target.url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Runs `fn` inside a transaction that is always rolled back, so the DB is left untouched. */
async function inRollback(client: Client, fn: (c: Client) => Promise<void>): Promise<void> {
  await client.query("BEGIN");
  try {
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
  }
}

let savepointSeq = 0;

/**
 * Assert the database rejects a write, and return the error message.
 *
 * Wrapped in a savepoint: a failed statement aborts the surrounding transaction, so
 * without this every later statement in the same test would fail with "current
 * transaction is aborted" rather than exercising its own constraint.
 */
async function expectRejected(client: Client, sql: string, values: unknown[], why: string): Promise<string> {
  const sp = `sp_${(savepointSeq += 1)}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(sql, values);
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    return error instanceof Error ? error.message : String(error);
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  throw new Error(`Expected the database to reject this write (${why}), but it succeeded.`);
}

/** Minimal object graph the supply/signage constraints need. */
async function seedEventGraph(c: Client) {
  const orgId = randomUUID();
  const userId = randomUUID();
  const eventId = randomUUID();
  const sessionId = randomUUID();
  await c.query(
    `INSERT INTO "Organization"(id,name,slug,"createdAt","updatedAt") VALUES ($1,$2,$3,now(),now())`,
    [orgId, `Org ${orgId.slice(0, 8)}`, `org-${orgId.slice(0, 8)}`],
  );
  await c.query(
    `INSERT INTO "User"(id,"orgId",email,role,"createdAt","updatedAt") VALUES ($1,$2,$3,'MEMBER',now(),now())`,
    [userId, orgId, `u-${userId.slice(0, 8)}@baseline.test`],
  );
  await c.query(
    `INSERT INTO "Event"(id,"orgId",name,"startDate",status,"createdByUserId","createdAt","updatedAt")
     VALUES ($1,$2,$3,CURRENT_DATE,'DRAFT',$4,now(),now())`,
    [eventId, orgId, "Baseline Event", userId],
  );
  await c.query(
    `INSERT INTO "MatrixRow"(id,"eventId","dayDate","sortOrder","createdAt","updatedAt")
     VALUES ($1,$2,CURRENT_DATE,1,now(),now())`,
    [sessionId, eventId],
  );
  return { orgId, userId, eventId, sessionId };
}

// --- Partial unique indexes -----------------------------------------------------

test("partial unique index: seating assignments are unique per event only when unscoped", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const { eventId } = await seedEventGraph(c);
      const attendeeId = randomUUID();
      const planId = randomUUID();
      await c.query(
        `INSERT INTO "SeatingAttendee"(id,"eventId","firstName","lastName","createdAt","updatedAt")
         VALUES ($1,$2,'A','B',now(),now())`,
        [attendeeId, eventId],
      );
      await c.query(
        `INSERT INTO "SeatingPlan"(id,"eventId",name,"createdAt","updatedAt") VALUES ($1,$2,'Plan',now(),now())`,
        [planId, eventId],
      );
      const tableA = randomUUID();
      const tableB = randomUUID();
      for (const [tid, n] of [[tableA, 1], [tableB, 2]] as const) {
        await c.query(
          `INSERT INTO "SeatingTable"(id,"eventId","seatingPlanId",name,capacity,"sortOrder","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,10,1,now(),now())`,
          [tid, eventId, planId, `T${n}`],
        );
      }

      // seatingPlanId IS NULL -> the event-level partial unique applies.
      await c.query(
        `INSERT INTO "SeatingAssignment"(id,"eventId","tableId","attendeeId","seatIndex","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,1,now(),now())`,
        [randomUUID(), eventId, tableA, attendeeId],
      );
      const message = await expectRejected(
        c,
        `INSERT INTO "SeatingAssignment"(id,"eventId","tableId","attendeeId","seatIndex","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,2,now(),now())`,
        [randomUUID(), eventId, tableB, attendeeId],
        "duplicate event-level seating assignment",
      );
      assert.match(message, /SeatingAssignment_event_attendee_event_level_key/);
    });
  });
});

test("partial unique index: the predicate genuinely narrows — plan-scoped rows coexist", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const { eventId } = await seedEventGraph(c);
      const attendeeId = randomUUID();
      await c.query(
        `INSERT INTO "SeatingAttendee"(id,"eventId","firstName","lastName","createdAt","updatedAt")
         VALUES ($1,$2,'A','B',now(),now())`,
        [attendeeId, eventId],
      );
      const planIds = [randomUUID(), randomUUID()];
      const tableIds = [randomUUID(), randomUUID()];
      for (let i = 0; i < 2; i += 1) {
        await c.query(
          `INSERT INTO "SeatingPlan"(id,"eventId",name,"createdAt","updatedAt") VALUES ($1,$2,$3,now(),now())`,
          [planIds[i], eventId, `Plan ${i}`],
        );
        await c.query(
          `INSERT INTO "SeatingTable"(id,"eventId","seatingPlanId",name,capacity,"sortOrder","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,10,1,now(),now())`,
          [tableIds[i], eventId, planIds[i], `T${i}`],
        );
      }
      // Same attendee in two different plans: allowed, because the event-level index
      // only covers rows where seatingPlanId IS NULL. A non-partial unique would reject this.
      for (let i = 0; i < 2; i += 1) {
        await c.query(
          `INSERT INTO "SeatingAssignment"(id,"eventId","tableId","attendeeId","seatingPlanId","seatIndex","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,1,now(),now())`,
          [randomUUID(), eventId, tableIds[i], attendeeId, planIds[i]],
        );
      }
      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM "SeatingAssignment" WHERE "attendeeId"=$1`,
        [attendeeId],
      );
      assert.equal(rows[0].n, 2, "plan-scoped duplicates must be permitted");
    });
  });
});

test("partial unique index: one active team-default dashboard view per event", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const { eventId, orgId, userId } = await seedEventGraph(c);
      const insert = (id: string, isTeamDefault: boolean, archived: boolean) =>
        c.query(
          `INSERT INTO "EventDashboardView"(id,"eventId","organizationId","ownerUserId",name,visibility,
             "isTeamDefault","archivedAt","starterKey",configuration,"createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,'TEAM',$6,${archived ? "now()" : "NULL"},'CUSTOM','{}'::jsonb,now(),now())`,
          [id, eventId, orgId, userId, `V-${id.slice(0, 6)}`, isTeamDefault],
        );

      await insert(randomUUID(), true, false);
      const message = await expectRejected(
        c,
        `INSERT INTO "EventDashboardView"(id,"eventId","organizationId","ownerUserId",name,visibility,
           "isTeamDefault","archivedAt","starterKey",configuration,"createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'Second','TEAM',true,NULL,'CUSTOM','{}'::jsonb,now(),now())`,
        [randomUUID(), eventId, orgId, userId],
        "second active team-default view",
      );
      assert.match(message, /EventDashboardView_one_active_team_default_per_event/);

      // Archived rows fall outside the predicate, so they are allowed.
      await insert(randomUUID(), true, true);
    });
  });
});

// --- Trigger: supply allocations may not cross event boundaries -----------------

test("trigger enforce_supply_event_scope rejects a cross-event supply item", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const a = await seedEventGraph(c);
      const b = await seedEventGraph(c);

      const foreignItemId = randomUUID();
      await c.query(
        `INSERT INTO "SupplyItem"(id,"eventId",name,category,unit,"createdAt","updatedAt")
         VALUES ($1,$2,'Foreign Item','GENERAL','each',now(),now())`,
        [foreignItemId, b.eventId],
      );

      const message = await expectRejected(
        c,
        `INSERT INTO "SessionSupplyAllocation"(id,"eventId","sessionId","supplyItemId",category,unit,"createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'GENERAL','each',now(),now())`,
        [randomUUID(), a.eventId, a.sessionId, foreignItemId],
        "supply item belonging to another event",
      );
      assert.match(message, /event/i);

      // The same shape succeeds when the supply item belongs to the allocation's event.
      const ownItemId = randomUUID();
      await c.query(
        `INSERT INTO "SupplyItem"(id,"eventId",name,category,unit,"createdAt","updatedAt")
         VALUES ($1,$2,'Own Item','GENERAL','each',now(),now())`,
        [ownItemId, a.eventId],
      );
      await c.query(
        `INSERT INTO "SessionSupplyAllocation"(id,"eventId","sessionId","supplyItemId",category,unit,"createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'GENERAL','each',now(),now())`,
        [randomUUID(), a.eventId, a.sessionId, ownItemId],
      );
    });
  });
});

test("trigger enforce_supply_event_scope rejects a session from another event", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const a = await seedEventGraph(c);
      const b = await seedEventGraph(c);
      const message = await expectRejected(
        c,
        `INSERT INTO "SessionSupplyAllocation"(id,"eventId","sessionId","oneOffName",category,unit,"createdAt","updatedAt")
         VALUES ($1,$2,$3,'Ad hoc','GENERAL','each',now(),now())`,
        [randomUUID(), a.eventId, b.sessionId],
        "session belonging to another event",
      );
      assert.match(message, /event/i);
    });
  });
});

// --- Trigger: system supply templates are immutable ------------------------------

test("trigger protect_system_supply_templates blocks update and delete of system rows", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const systemId = randomUUID();
      await c.query(
        `INSERT INTO "SupplyTemplate"(id,"eventId",name,"isSystem",key,"triggerType","createdAt","updatedAt")
         VALUES ($1,NULL,'System Template',true,$2,'MANUAL',now(),now())`,
        [systemId, `sys-${systemId.slice(0, 8)}`],
      );

      const updateMessage = await expectRejected(
        c,
        `UPDATE "SupplyTemplate" SET name='Renamed' WHERE id=$1`,
        [systemId],
        "update of a system supply template",
      );
      assert.match(updateMessage, /system/i);

      const deleteMessage = await expectRejected(
        c,
        `DELETE FROM "SupplyTemplate" WHERE id=$1`,
        [systemId],
        "delete of a system supply template",
      );
      assert.match(deleteMessage, /system/i);
    });
  });
});

test("non-system supply templates remain mutable", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const { eventId } = await seedEventGraph(c);
      const id = randomUUID();
      await c.query(
        `INSERT INTO "SupplyTemplate"(id,"eventId",name,"isSystem",key,"triggerType","createdAt","updatedAt")
         VALUES ($1,$2,'Event Template',false,$3,'MANUAL',now(),now())`,
        [id, eventId, `evt-${id.slice(0, 8)}`],
      );
      await c.query(`UPDATE "SupplyTemplate" SET name='Renamed' WHERE id=$1`, [id]);
      await c.query(`DELETE FROM "SupplyTemplate" WHERE id=$1`, [id]);
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM "SupplyTemplate" WHERE id=$1`, [id]);
      assert.equal(rows[0].n, 0);
    });
  });
});

// --- Check constraints -----------------------------------------------------------

test("check constraints reject invalid supply, signage, show-flow and timeline rows", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const { eventId, sessionId } = await seedEventGraph(c);

      // SessionSupplyAllocation_item_or_name: needs a catalog item or a one-off name.
      const noNameOrItem = await expectRejected(
        c,
        `INSERT INTO "SessionSupplyAllocation"(id,"eventId","sessionId",category,unit,"createdAt","updatedAt")
         VALUES ($1,$2,$3,'GENERAL','each',now(),now())`,
        [randomUUID(), eventId, sessionId],
        "allocation with neither a supply item nor a one-off name",
      );
      assert.match(noNameOrItem, /SessionSupplyAllocation_item_or_name/);

      // SessionSupplyAllocation_nonnegative_quantity
      const negativeQty = await expectRejected(
        c,
        `INSERT INTO "SessionSupplyAllocation"(id,"eventId","sessionId","oneOffName",category,unit,quantity,"createdAt","updatedAt")
         VALUES ($1,$2,$3,'Ad hoc','GENERAL','each',-5,now(),now())`,
        [randomUUID(), eventId, sessionId],
        "negative allocation quantity",
      );
      assert.match(negativeQty, /SessionSupplyAllocation_nonnegative_quantity/);

      // SupplyItem_nonnegative_committed
      const negativeCommitted = await expectRejected(
        c,
        `INSERT INTO "SupplyItem"(id,"eventId",name,category,unit,"committedQuantity","createdAt","updatedAt")
         VALUES ($1,$2,'Item','GENERAL','each',-1,now(),now())`,
        [randomUUID(), eventId],
        "negative committed quantity",
      );
      assert.match(negativeCommitted, /SupplyItem_nonnegative_committed/);

      // SupplyTemplate_system_scope: a system template must not be event-scoped.
      const badSystemScope = await expectRejected(
        c,
        `INSERT INTO "SupplyTemplate"(id,"eventId",name,"isSystem",key,"triggerType","createdAt","updatedAt")
         VALUES ($1,$2,'Bad',true,$3,'MANUAL',now(),now())`,
        [randomUUID(), eventId, `k-${randomUUID().slice(0, 8)}`],
        "event-scoped system template",
      );
      assert.match(badSystemScope, /SupplyTemplate_system_scope/);

      // SignageSign_quantity_positive
      const badSignQty = await expectRejected(
        c,
        `INSERT INTO "SignageSign"(id,"eventId",name,"signType",quantity,"createdAt","updatedAt")
         VALUES ($1,$2,'Sign','DIRECTIONAL',0,now(),now())`,
        [randomUUID(), eventId],
        "signage quantity of zero",
      );
      assert.match(badSignQty, /SignageSign_quantity_positive/);

      // Event_agendaTerm_approved_check: terminology overrides are constrained.
      const badTerm = await expectRejected(
        c,
        `UPDATE "Event" SET "agendaTerm"='Not An Approved Term' WHERE id=$1`,
        [eventId],
        "unapproved agenda terminology",
      );
      assert.match(badTerm, /Event_agendaTerm_approved_check/);

      // TimelineItem_not_needed_evidence_check: a NOT_NEEDED disposition needs evidence.
      const badDisposition = await expectRejected(
        c,
        `INSERT INTO "TimelineItem"(id,"eventId",title,status,"sortOrder",disposition,"createdAt","updatedAt")
         VALUES ($1,$2,'Item','NOT_STARTED',1,'NOT_NEEDED',now(),now())`,
        [randomUUID(), eventId],
        "NOT_NEEDED timeline item without evidence",
      );
      assert.match(badDisposition, /TimelineItem_not_needed_evidence_check/);
    });
  });
});

test("valid rows in the same families are accepted", async (t) => {
  await withClient(t, async (client) => {
    await inRollback(client, async (c) => {
      const { eventId, sessionId } = await seedEventGraph(c);
      await c.query(
        `INSERT INTO "SessionSupplyAllocation"(id,"eventId","sessionId","oneOffName",category,unit,quantity,"createdAt","updatedAt")
         VALUES ($1,$2,$3,'Lanyards','GENERAL','each',50,now(),now())`,
        [randomUUID(), eventId, sessionId],
      );
      await c.query(
        `INSERT INTO "SignageSign"(id,"eventId",name,"signType",quantity,"createdAt","updatedAt")
         VALUES ($1,$2,'Wayfinding','DIRECTIONAL',3,now(),now())`,
        [randomUUID(), eventId],
      );
      await c.query(
        `INSERT INTO "TimelineItem"(id,"eventId",title,status,"sortOrder","createdAt","updatedAt")
         VALUES ($1,$2,'Ordinary item','NOT_STARTED',1,now(),now())`,
        [randomUUID(), eventId],
      );
      const { rows } = await c.query(
        `SELECT (SELECT count(*)::int FROM "SessionSupplyAllocation" WHERE "eventId"=$1) AS supplies,
                (SELECT count(*)::int FROM "SignageSign" WHERE "eventId"=$1) AS signs,
                (SELECT count(*)::int FROM "TimelineItem" WHERE "eventId"=$1) AS timeline`,
        [eventId],
      );
      assert.deepEqual(rows[0], { supplies: 1, signs: 1, timeline: 1 });
    });
  });
});

// --- Referential actions ----------------------------------------------------------

test("live referential actions survive into the baseline", async (t) => {
  await withClient(t, async (client) => {
    const { rows } = await client.query(`
      SELECT c.conname,
             CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                                WHEN 'c' THEN 'CASCADE'  WHEN 'n' THEN 'SET NULL' END AS on_delete,
             CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                                WHEN 'c' THEN 'CASCADE'  WHEN 'n' THEN 'SET NULL' END AS on_update
      FROM pg_constraint c WHERE c.contype='f' AND c.conname = ANY($1)`, [[
        "Event_sessionRequirementTemplateId_fkey",
        "EventActivity_actorUserId_fkey",
        "EventPerson_eventId_fkey",
        "TimelineItem_parentId_fkey",
      ]]);
    const byName = Object.fromEntries(rows.map((r) => [r.conname, `${r.on_delete}/${r.on_update}`]));
    assert.equal(byName["Event_sessionRequirementTemplateId_fkey"], "SET NULL/NO ACTION");
    assert.equal(byName["EventActivity_actorUserId_fkey"], "RESTRICT/CASCADE");
    assert.equal(byName["EventPerson_eventId_fkey"], "CASCADE/NO ACTION");
    assert.equal(byName["TimelineItem_parentId_fkey"], "SET NULL/NO ACTION");
  });
});

test("the baseline database carries the full native object inventory", async (t) => {
  await withClient(t, async (client) => {
    const q = async (sql: string) => Number((await client.query(sql)).rows[0].n);
    assert.equal(
      await q(`SELECT count(*) n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid=c.relnamespace
               WHERE nsp.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations'`),
      124, "application tables",
    );
    assert.equal(
      await q(`SELECT count(*) n FROM pg_type t JOIN pg_namespace nsp ON nsp.oid=t.typnamespace
               WHERE nsp.nspname='public' AND t.typtype='e'`),
      112, "enums",
    );
    assert.equal(
      await q(`SELECT count(*) n FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
               JOIN pg_namespace nsp ON nsp.oid=r.relnamespace WHERE nsp.nspname='public' AND c.contype='c'`),
      27, "check constraints",
    );
    assert.equal(
      await q(`SELECT count(*) n FROM pg_index i JOIN pg_class r ON r.oid=i.indrelid
               JOIN pg_namespace nsp ON nsp.oid=r.relnamespace WHERE nsp.nspname='public' AND i.indpred IS NOT NULL`),
      6, "partial indexes",
    );
    assert.equal(
      await q(`SELECT count(*) n FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace WHERE nsp.nspname='public'`),
      2, "functions",
    );
    assert.equal(
      await q(`SELECT count(*) n FROM pg_trigger tg JOIN pg_class r ON r.oid=tg.tgrelid
               JOIN pg_namespace nsp ON nsp.oid=r.relnamespace WHERE nsp.nspname='public' AND NOT tg.tgisinternal`),
      2, "triggers",
    );
    // Database-side UUID generation must be available for the 34 gen_random_uuid() defaults.
    const { rows } = await client.query(`SELECT gen_random_uuid() AS id`);
    assert.match(String(rows[0].id), /^[0-9a-f-]{36}$/i);
  });
});
