import { cleanupTestFixtureOrganizations, listTestFixtureOrganizations } from "@/lib/test-harness/fixture-cleanup";
import { loadPlannerTestEnv } from "@/lib/test-harness/planner-fixtures";

type CliOptions = Readonly<{
  execute: boolean;
  testRunId?: string;
  prefix?: string;
  olderThanDays?: number;
}>;

function parseArgs(argv: readonly string[]): CliOptions {
  const options: {
    execute: boolean;
    testRunId?: string;
    prefix?: string;
    olderThanDays?: number;
  } = {
    execute: false,
  };

  for (const arg of argv) {
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg.startsWith("--test-run-id=")) {
      options.testRunId = arg.slice("--test-run-id=".length).trim() || undefined;
      continue;
    }
    if (arg.startsWith("--prefix=")) {
      options.prefix = arg.slice("--prefix=".length).trim() || undefined;
      continue;
    }
    if (arg.startsWith("--older-than-days=")) {
      const parsed = Number(arg.slice("--older-than-days=".length));
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("--older-than-days must be a non-negative number.");
      }
      options.olderThanDays = parsed;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function getOlderThanDate(days: number | undefined): Date | undefined {
  if (days === undefined) return undefined;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  loadPlannerTestEnv();

  const options = parseArgs(process.argv.slice(2));
  const olderThan = getOlderThanDate(options.olderThanDays);

  if (!options.execute) {
    const organizations = await listTestFixtureOrganizations({
      testRunId: options.testRunId,
      prefix: options.prefix,
      olderThan,
    });
    console.log(`Dry run: ${organizations.length} fixture organization(s) would be deleted.`);
    for (const organization of organizations) {
      console.log(`- ${organization.name} (${organization.id}, ${organization.slug})`);
    }
    console.log("Re-run with --execute to delete these fixture organizations.");
    return;
  }

  const result = await cleanupTestFixtureOrganizations({
    testRunId: options.testRunId,
    prefix: options.prefix,
    olderThan,
  });

  console.log(
    `Deleted ${result.deletedOrganizations} fixture organization(s), ${result.deletedEvents} event(s), and ${result.deletedUsers} user(s).`,
  );
  for (const name of result.organizationNames) {
    console.log(`- ${name}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
