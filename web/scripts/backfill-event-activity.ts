/**
 * Backfill reliable historical activity into the canonical EventActivity feed.
 *
 * Idempotent: every backfilled row carries a source-record identity
 * (sourceRecordType, sourceRecordId), so the event-scoped @@unique constraint
 * makes re-runs no-ops. Historical createdAt timestamps are preserved. We NEVER
 * invent actors or diffs — changes is null and the actor comes from the source
 * record (system actor when the source has no user).
 *
 * Usage:
 *   npx tsx scripts/backfill-event-activity.ts            # dry run (counts only)
 *   npx tsx scripts/backfill-event-activity.ts --commit   # write the entries
 *   npx tsx scripts/backfill-event-activity.ts --commit --before=2026-07-14T00:00:00Z
 *
 * `--before` (the cutover timestamp) restricts the backfill to records created
 * before canonical writers went live, so it never double-logs a record that the
 * live writers already recorded. Defaults to now.
 */
import { loadPlannerTestEnv } from "@/lib/test-harness/planner-fixtures";
import { getPrisma } from "@/lib/prisma";
import type {
  EventActivityAction,
  EventActivityModule,
  EventActivityType,
  Prisma,
} from "@prisma/client";

loadPlannerTestEnv();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const beforeArg = args.find((a) => a.startsWith("--before="))?.split("=")[1];
const CUTOVER = beforeArg ? new Date(beforeArg) : new Date();

const prisma = getPrisma();

type BackfillRow = {
  eventId: string;
  actorUserId: string | null;
  actorLabel: string;
  module: EventActivityModule;
  actionType: EventActivityAction;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  message: string;
  sourceRecordType: string;
  sourceRecordId: string;
  createdAt: Date;
};

function actorLabel(user: { name: string | null; email: string | null } | null | undefined): {
  actorUserId: string | null;
  label: string;
  isUser: boolean;
} {
  if (!user) return { actorUserId: null, label: "System", isUser: false };
  return { actorUserId: null, label: user.name || user.email || "User", isUser: true };
}

async function upsertRow(row: BackfillRow): Promise<"created" | "skipped"> {
  if (!COMMIT) {
    const existing = await prisma.eventActivity.findUnique({
      where: {
        eventId_sourceRecordType_sourceRecordId: {
          eventId: row.eventId,
          sourceRecordType: row.sourceRecordType,
          sourceRecordId: row.sourceRecordId,
        },
      },
      select: { id: true },
    });
    return existing ? "skipped" : "created";
  }
  const data = {
    eventId: row.eventId,
    actorUserId: row.actorUserId,
    actorKind: row.actorUserId ? ("USER" as const) : ("SYSTEM" as const),
    actorLabel: row.actorLabel,
    module: row.module,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    message: row.message,
    changes: undefined,
    sourceRecordType: row.sourceRecordType,
    sourceRecordId: row.sourceRecordId,
    createdAt: row.createdAt,
  } satisfies Prisma.EventActivityUncheckedCreateInput;
  const result = await prisma.eventActivity.upsert({
    where: {
      eventId_sourceRecordType_sourceRecordId: {
        eventId: row.eventId,
        sourceRecordType: row.sourceRecordType,
        sourceRecordId: row.sourceRecordId,
      },
    },
    create: data,
    update: {}, // idempotent: never overwrite an existing backfilled row
    select: { createdAt: true },
  });
  // upsert cannot tell us created-vs-updated directly; treat matching createdAt as created.
  return result.createdAt.getTime() === row.createdAt.getTime() ? "created" : "skipped";
}

const BUDGET_ACTION: Record<string, EventActivityAction> = {
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REVISED: "UPDATED",
};

const DOC_APPROVAL_ACTION: Record<string, EventActivityAction> = {
  IN_REVIEW: "SUBMITTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

/** Only mappings justified by the legacy enum and its original writer are safe. */
const LEGACY_PRESENTATION: Partial<Record<EventActivityType, { module: EventActivityModule; actionType: EventActivityAction }>> = {
  EVENT_CREATED: { module: "EVENT_SETTINGS", actionType: "CREATED" },
  EVENT_UPDATED: { module: "EVENT_DIRECTORY", actionType: "SENT" },
  DEADLINE_CREATED: { module: "ROADMAP", actionType: "CREATED" },
  DEADLINE_UPDATED: { module: "ROADMAP", actionType: "UPDATED" },
  BUDGET_SUBMITTED: { module: "BUDGET", actionType: "SUBMITTED" },
  BUDGET_APPROVED: { module: "BUDGET", actionType: "APPROVED" },
  BUDGET_REJECTED: { module: "BUDGET", actionType: "REJECTED" },
  MATRIX_UPDATED: { module: "RUN_OF_SHOW", actionType: "UPDATED" },
  REPORT_GENERATED: { module: "REPORTS", actionType: "GENERATED" },
  INTEGRATION_SYNCED: { module: "INTEGRATIONS", actionType: "SYNCED" },
  SPEAKER_UPDATED: { module: "SPEAKERS", actionType: "UPDATED" },
};

async function main() {
  const counts = { legacy: 0, legacyUnmapped: 0, budget: 0, docVersion: 0, docApproval: 0, dirImport: 0 };

  // 1. Legacy EventActivity rows (module IS NULL): enrich in place, never duplicate.
  const legacy = await prisma.eventActivity.findMany({
    where: { module: null, createdAt: { lt: CUTOVER } },
    select: { id: true, type: true, actorUser: { select: { name: true, email: true } } },
  });
  for (const row of legacy) {
    const mapped = row.type ? LEGACY_PRESENTATION[row.type] : null;
    if (!mapped) {
      counts.legacyUnmapped += 1;
      continue;
    }
    counts.legacy += 1;
    if (COMMIT) {
      await prisma.eventActivity.update({
        where: { id: row.id },
        // Preserve original messages and leave entity data null: a legacy enum
        // alone cannot safely identify a particular speaker, document, or event.
        data: { ...mapped, actorLabel: row.actorUser?.name || row.actorUser?.email || "System" },
      });
    }
  }

  // 2. BudgetActivity → EventActivity (module BUDGET).
  const budgetActivities = await prisma.budgetActivity.findMany({
    where: { createdAt: { lt: CUTOVER } },
    select: {
      id: true,
      type: true,
      createdAt: true,
      note: true,
      actorUser: { select: { name: true, email: true } },
      actorUserId: true,
      budget: { select: { eventId: true } },
    },
  });
  for (const ba of budgetActivities) {
    const a = actorLabel(ba.actorUserId ? ba.actorUser : null);
    const res = await upsertRow({
      eventId: ba.budget.eventId,
      actorUserId: ba.actorUserId,
      actorLabel: a.label,
      module: "BUDGET",
      actionType: BUDGET_ACTION[ba.type] ?? "UPDATED",
      entityType: "Budget",
      entityId: null,
      entityLabel: "Budget",
      message: `Budget ${ba.type.toLowerCase()}`,
      sourceRecordType: "BudgetActivity",
      sourceRecordId: ba.id,
      createdAt: ba.createdAt,
    });
    if (res === "created") counts.budget += 1;
  }

  // 3. DocumentVersion → module DOCUMENTS / UPLOADED.
  const versions = await prisma.documentVersion.findMany({
    where: { createdAt: { lt: CUTOVER } },
    select: {
      id: true,
      versionNumber: true,
      originalFilename: true,
      createdAt: true,
      uploadedByUserId: true,
      uploadedByUser: { select: { name: true, email: true } },
      document: { select: { eventId: true, title: true } },
    },
  });
  for (const v of versions) {
    if (!v.document.eventId) continue;
    const res = await upsertRow({
      eventId: v.document.eventId,
      actorUserId: v.uploadedByUserId,
      actorLabel: v.uploadedByUser?.name || v.uploadedByUser?.email || "User",
      module: "DOCUMENTS",
      actionType: "UPLOADED",
      entityType: "Document",
      entityId: null,
      entityLabel: v.document.title,
      message: `Uploaded file version v${v.versionNumber} to "${v.document.title}"`,
      sourceRecordType: "DocumentVersion",
      sourceRecordId: v.id,
      createdAt: v.createdAt,
    });
    if (res === "created") counts.docVersion += 1;
  }

  // 4. DocumentApproval → module DOCUMENTS / action from status.
  const approvals = await prisma.documentApproval.findMany({
    where: { actedAt: { lt: CUTOVER } },
    select: {
      id: true,
      status: true,
      actedAt: true,
      actedByUserId: true,
      actedByUser: { select: { name: true, email: true } },
      document: { select: { eventId: true, title: true } },
    },
  });
  for (const ap of approvals) {
    if (!ap.document.eventId) continue;
    const res = await upsertRow({
      eventId: ap.document.eventId,
      actorUserId: ap.actedByUserId,
      actorLabel: ap.actedByUser?.name || ap.actedByUser?.email || "User",
      module: "DOCUMENTS",
      actionType: DOC_APPROVAL_ACTION[ap.status] ?? "UPDATED",
      entityType: "Document",
      entityId: null,
      entityLabel: ap.document.title,
      message: `Document "${ap.document.title}" review ${ap.status.toLowerCase()}`,
      sourceRecordType: "DocumentApproval",
      sourceRecordId: ap.id,
      createdAt: ap.actedAt,
    });
    if (res === "created") counts.docApproval += 1;
  }

  // 5. Event Directory import batches → module EVENT_DIRECTORY / IMPORTED (summary).
  const batches = await prisma.eventDirectoryImportBatch.findMany({
    where: { uploadedAt: { lt: CUTOVER } },
    select: {
      id: true,
      eventId: true,
      sourceLabel: true,
      createdCount: true,
      updatedCount: true,
      uploadedAt: true,
      uploadedByUserId: true,
    },
  });
  const batchUserIds = [...new Set(batches.map((b) => b.uploadedByUserId).filter((v): v is string => Boolean(v)))];
  const batchUsers = batchUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: batchUserIds } }, select: { id: true, name: true, email: true } })
    : [];
  const batchUserLabel = new Map(batchUsers.map((u) => [u.id, u.name || u.email || "User"]));
  for (const b of batches) {
    const res = await upsertRow({
      eventId: b.eventId,
      actorUserId: b.uploadedByUserId,
      actorLabel: (b.uploadedByUserId && batchUserLabel.get(b.uploadedByUserId)) || "System",
      module: "EVENT_DIRECTORY",
      actionType: "IMPORTED",
      entityType: "DirectoryImportBatch",
      entityId: b.id,
      entityLabel: b.sourceLabel ?? "CSV import",
      message: `Imported directory contacts (${b.createdCount} created, ${b.updatedCount} updated)`,
      sourceRecordType: "DirectoryImportBatch",
      sourceRecordId: b.id,
      createdAt: b.uploadedAt,
    });
    if (res === "created") counts.dirImport += 1;
  }

  const mode = COMMIT ? "COMMITTED" : "DRY RUN (no writes)";
  console.info(`[backfill-event-activity] ${mode} — cutover < ${CUTOVER.toISOString()}`);
  console.info(`  Legacy EventActivity enriched: ${counts.legacy}`);
  console.info(`  Legacy EventActivity left as Legacy activity (unmappable): ${counts.legacyUnmapped}`);
  console.info(`  BudgetActivity → EventActivity: ${counts.budget}`);
  console.info(`  DocumentVersion → EventActivity: ${counts.docVersion}`);
  console.info(`  DocumentApproval → EventActivity: ${counts.docApproval}`);
  console.info(`  DirectoryImportBatch → EventActivity: ${counts.dirImport}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfill-event-activity] failed:", error);
    process.exit(1);
  });
