/**
 * Adopt Platform Core canonical ids as Orca product ids.
 *
 * Platform Core mints canonical identifiers. Orca does **not** generate its own organization
 * or event identity and does **not** keep a mapping table: the Platform uuid *is* the Orca
 * primary key.
 *
 *   Platform user_id         -> Orca User.platformUserId  (Orca keeps a local User.id)
 *   Platform organization_id -> Orca Organization.id      (same uuid, no mapping)
 *   Platform event_id        -> Orca Event.id             (same uuid, no mapping)
 *
 * This script consumes ids that Platform Core already minted (see
 * `platform-provision-test-identity.ts`). It never invents an organization or event id: a
 * missing `--organization-id` / `--event-id` is an error, not something to generate.
 *
 * Safety:
 *   - Idempotent. Re-running converges without duplicating rows.
 *   - Refuses to run against any database other than the Orca operational project.
 *   - Never writes to Platform Core.
 *   - Dry run unless `--commit` is passed.
 *
 * Usage:
 *   npx tsx scripts/adopt-platform-canonical-ids.ts \
 *     --platform-user-id <uuid> --organization-id <uuid> --event-id <uuid> \
 *     --email <address> [--org-name <name>] [--event-name <name>] \
 *     [--event-role EVENT_ADMIN|EVENT_EDITOR|EVENT_VIEWER] [--commit]
 */

import { config as loadEnv } from "dotenv";

// Match the app: .env.local first, then .env. Never committed.
loadEnv({ path: ".env.local" });
loadEnv();

import { EventMemberRole, EventStatus, UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const ORCA_PROJECT_REF = "qgxvtgnzptepimuawnku";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Args = {
  platformUserId: string;
  organizationId: string;
  eventId: string;
  email: string;
  orgName: string;
  eventName: string;
  eventRole: EventMemberRole;
  commit: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : null;
  };
  const required = (flag: string): string => {
    const value = get(flag);
    if (!value) throw new Error(`${flag} is required — Platform Core mints it; this script never invents it.`);
    if (!UUID_RE.test(value) && flag !== "--email") throw new Error(`${flag} must be a valid uuid.`);
    return value;
  };
  const roleRaw = (get("--event-role") ?? "EVENT_ADMIN") as EventMemberRole;
  if (!Object.values(EventMemberRole).includes(roleRaw)) {
    throw new Error(`--event-role must be one of ${Object.values(EventMemberRole).join(", ")}`);
  }
  const email = get("--email");
  if (!email) throw new Error("--email is required");
  return {
    platformUserId: required("--platform-user-id"),
    organizationId: required("--organization-id"),
    eventId: required("--event-id"),
    email: email.trim().toLowerCase(),
    orgName: get("--org-name") ?? "SignalThread Test Organization",
    eventName: get("--event-name") ?? "Platform Handoff Test Event",
    eventRole: roleRaw,
    commit: argv.includes("--commit"),
  };
}

/** Refuses to mutate anything that is not the Orca operational database. */
function assertOrcaDatabase(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required.");
  let host = "";
  let database = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, "").split("?")[0] ?? "";
  } catch {
    throw new Error("DATABASE_URL is not parseable.");
  }
  const isOrca = url.includes(ORCA_PROJECT_REF);
  const isLocal = host === "localhost" || host === "127.0.0.1";
  console.info(`[orca] target host    : ${host}`);
  console.info(`[orca] target database: ${database}`);
  if (!isOrca && !isLocal) {
    throw new Error(
      `Refusing to run: DATABASE_URL is neither the Orca project (${ORCA_PROJECT_REF}) nor a local database.`,
    );
  }
  console.info(`[orca] target verified: ${isOrca ? "Orca operational project" : "local database"}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  assertOrcaDatabase();
  const prisma = getPrisma();

  console.info(`[orca] mode                 : ${args.commit ? "COMMIT" : "DRY RUN"}`);
  console.info(`[orca] platform user_id     : ${args.platformUserId}`);
  console.info(`[orca] canonical org id     : ${args.organizationId}`);
  console.info(`[orca] canonical event id   : ${args.eventId}`);

  // Refuse to re-point a canonical id that is already bound to different local state.
  const existingOrg = await prisma.organization.findUnique({ where: { id: args.organizationId } });
  const existingEvent = await prisma.event.findUnique({ where: { id: args.eventId } });
  const existingByPlatformId = await prisma.user.findUnique({ where: { platformUserId: args.platformUserId } });
  const existingByEmail = await prisma.user.findUnique({ where: { email: args.email } });

  if (existingByEmail && existingByPlatformId && existingByEmail.id !== existingByPlatformId.id) {
    throw new Error(
      "Email and platform user id resolve to two different Orca users. Refusing to merge identities.",
    );
  }
  if (existingByEmail?.platformUserId && existingByEmail.platformUserId !== args.platformUserId) {
    throw new Error(
      "That email is already linked to a different Platform user id. Refusing to re-point identity.",
    );
  }
  if (existingEvent && existingEvent.orgId !== args.organizationId) {
    throw new Error("That canonical event id already exists under a different organization.");
  }

  console.info(`[orca] organization exists  : ${existingOrg ? "yes" : "no (will create)"}`);
  console.info(`[orca] event exists         : ${existingEvent ? "yes" : "no (will create)"}`);
  console.info(`[orca] user exists          : ${existingByPlatformId ?? existingByEmail ? "yes" : "no (will create)"}`);

  if (!args.commit) {
    console.info("[orca] dry run complete — nothing was written. Re-run with --commit.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Organization adopts the Platform organization_id as its primary key.
    const organization = await tx.organization.upsert({
      where: { id: args.organizationId },
      update: { name: args.orgName },
      create: {
        id: args.organizationId,
        name: args.orgName,
        slug: `st-${args.organizationId.slice(0, 8)}`,
      },
    });

    // 2. User keeps a local id but is keyed to the canonical Platform user id.
    //    User.orgId remains a required column; it is product-local context, not access truth.
    const user = existingByPlatformId
      ? await tx.user.update({
          where: { id: existingByPlatformId.id },
          data: { email: args.email, orgId: organization.id },
        })
      : existingByEmail
        ? await tx.user.update({
            where: { id: existingByEmail.id },
            data: { platformUserId: args.platformUserId, orgId: organization.id },
          })
        : await tx.user.create({
            data: {
              email: args.email,
              name: args.email.split("@")[0] ?? null,
              role: UserRole.MEMBER,
              orgId: organization.id,
              platformUserId: args.platformUserId,
            },
          });

    // 3. Orca product access: organization membership.
    await tx.membership.upsert({
      where: { orgId_userId: { orgId: organization.id, userId: user.id } },
      update: {},
      create: { orgId: organization.id, userId: user.id },
    });

    // 4. Event adopts the Platform event_id as its primary key.
    const event = await tx.event.upsert({
      where: { id: args.eventId },
      update: { name: args.eventName },
      create: {
        id: args.eventId,
        orgId: organization.id,
        name: args.eventName,
        startDate: new Date(),
        status: EventStatus.ACTIVE,
        createdByUserId: user.id,
      },
    });

    // 5. Orca-specific RBAC. Platform says the user may enter Orca; this says what they may do.
    await tx.eventMember.upsert({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      update: { eventRole: args.eventRole },
      create: { eventId: event.id, userId: user.id, eventRole: args.eventRole },
    });

    return { organization, user, event };
  });

  console.info("[orca] adopted canonical ids:");
  console.info(`[orca]   Organization.id      = ${result.organization.id}`);
  console.info(`[orca]   Event.id             = ${result.event.id}`);
  console.info(`[orca]   User.platformUserId  = ${result.user.platformUserId}`);
  console.info(`[orca]   User.id (local)      = ${result.user.id}`);
  console.info(`[orca]   EventMember role     = ${args.eventRole}`);

  const canonicalOk =
    result.organization.id === args.organizationId &&
    result.event.id === args.eventId &&
    result.user.platformUserId === args.platformUserId;
  console.info(`[orca] canonical id adoption verified: ${canonicalOk}`);
  if (!canonicalOk) process.exitCode = 1;

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[orca] adoption failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
