/**
 * Backfill canonical Platform Core user ids onto Orca `User` rows.
 *
 * Platform Core migration, Phase 1. Orca previously joined the authenticated identity to
 * its own `User` row by email. `User.platformUserId` is the canonical join key; this
 * script links pre-existing rows so the transitional email bridge can be switched off
 * (`PLATFORM_IDENTITY_EMAIL_BRIDGE=false`).
 *
 * Safety properties:
 *   - **Never invents ids.** Every id comes from the configured authentication authority's
 *     `auth.users` listing. A user with no identity there is reported, not linked.
 *   - **Idempotent.** Only rows with `platformUserId IS NULL` are updated, and the write is
 *     conditional on that, so re-runs are no-ops.
 *   - **Non-destructive.** Nothing is deleted, no email or role is rewritten, and a row
 *     already linked to a different id is reported as a conflict and left untouched.
 *   - **Dry run by default.** Pass `--commit` to write.
 *
 * Usage:
 *   npx tsx scripts/backfill-platform-user-ids.ts            # dry run (report only)
 *   npx tsx scripts/backfill-platform-user-ids.ts --commit   # apply the links
 *
 * Requires the authentication-authority env (see src/lib/supabase/auth-authority.ts) and a
 * service-role key for that same project.
 */

import { getPrisma } from "@/lib/prisma";
import { normalizePlatformEmail } from "@/lib/platform/identity";
import { requireAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";
import { getSupabaseAdminClient } from "@/src/lib/supabase/admin";

const AUTH_PAGE_SIZE = 1000;

type AuthIdentity = { id: string; email: string };

type BackfillReport = {
  authIdentities: number;
  orcaUsers: number;
  alreadyLinked: number;
  linked: number;
  missingInAuthAuthority: string[];
  conflicts: Array<{ email: string; existingPlatformUserId: string; authorityUserId: string }>;
  duplicateAuthEmails: string[];
};

async function listAuthorityIdentities(): Promise<AuthIdentity[]> {
  const admin = getSupabaseAdminClient();
  const identities: AuthIdentity[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) {
      throw new Error(`Failed to list authentication-authority users: ${error.message}`);
    }

    const users = data?.users ?? [];
    for (const user of users) {
      if (!user.id || !user.email) continue;
      identities.push({ id: user.id, email: normalizePlatformEmail(user.email) });
    }

    if (users.length < AUTH_PAGE_SIZE) break;
  }

  return identities;
}

async function run(commit: boolean): Promise<BackfillReport> {
  const authority = requireAuthAuthorityConfig();
  console.info(`[backfill] authentication authority: ${authority.source} (${authority.url})`);

  const identities = await listAuthorityIdentities();

  const byEmail = new Map<string, string>();
  const duplicateAuthEmails: string[] = [];
  for (const identity of identities) {
    if (byEmail.has(identity.email)) {
      // Two authority identities share an address. Email cannot disambiguate them, so
      // neither is linked automatically.
      duplicateAuthEmails.push(identity.email);
      continue;
    }
    byEmail.set(identity.email, identity.id);
  }
  for (const email of duplicateAuthEmails) byEmail.delete(email);

  const users = await getPrisma().user.findMany({
    select: { id: true, email: true, platformUserId: true },
    orderBy: { createdAt: "asc" },
  });

  const report: BackfillReport = {
    authIdentities: identities.length,
    orcaUsers: users.length,
    alreadyLinked: 0,
    linked: 0,
    missingInAuthAuthority: [],
    conflicts: [],
    duplicateAuthEmails,
  };

  for (const user of users) {
    const email = normalizePlatformEmail(user.email);
    const authorityUserId = byEmail.get(email);

    if (user.platformUserId) {
      if (authorityUserId && authorityUserId !== user.platformUserId) {
        report.conflicts.push({
          email,
          existingPlatformUserId: user.platformUserId,
          authorityUserId,
        });
      } else {
        report.alreadyLinked += 1;
      }
      continue;
    }

    if (!authorityUserId) {
      report.missingInAuthAuthority.push(email);
      continue;
    }

    if (!commit) {
      report.linked += 1;
      continue;
    }

    try {
      // Conditional on still being unlinked: concurrent logins may have linked it already.
      const result = await getPrisma().user.updateMany({
        where: { id: user.id, platformUserId: null },
        data: { platformUserId: authorityUserId },
      });
      if (result.count > 0) report.linked += 1;
      else report.alreadyLinked += 1;
    } catch (error) {
      report.conflicts.push({
        email,
        existingPlatformUserId: "<unique-index-violation>",
        authorityUserId,
      });
      console.warn(`[backfill] could not link ${email}:`, error instanceof Error ? error.message : error);
    }
  }

  return report;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");

  const report = await run(commit);

  console.info(commit ? "[backfill] COMMITTED" : "[backfill] DRY RUN (pass --commit to write)");
  console.info(`  authority identities:      ${report.authIdentities}`);
  console.info(`  orca users:                ${report.orcaUsers}`);
  console.info(`  already linked:            ${report.alreadyLinked}`);
  console.info(`  ${commit ? "linked" : "would link"}:${commit ? "                   " : "               "}${report.linked}`);
  console.info(`  missing in auth authority: ${report.missingInAuthAuthority.length}`);
  console.info(`  conflicts:                 ${report.conflicts.length}`);
  console.info(`  duplicate authority emails:${report.duplicateAuthEmails.length}`);

  for (const email of report.missingInAuthAuthority) {
    console.warn(`[backfill] no authority identity for ${email} — left unlinked (no id invented)`);
  }
  for (const conflict of report.conflicts) {
    console.error(
      `[backfill] CONFLICT ${conflict.email}: linked to ${conflict.existingPlatformUserId}, authority says ${conflict.authorityUserId} — left untouched`,
    );
  }
  for (const email of report.duplicateAuthEmails) {
    console.error(`[backfill] AMBIGUOUS ${email}: multiple authority identities share this address — skipped`);
  }

  const unresolved = report.missingInAuthAuthority.length + report.conflicts.length + report.duplicateAuthEmails.length;
  if (unresolved > 0) {
    console.warn(
      `[backfill] ${unresolved} user(s) still unresolved. Do NOT set PLATFORM_IDENTITY_EMAIL_BRIDGE=false until this reaches 0.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("[backfill] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
