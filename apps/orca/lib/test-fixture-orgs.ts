export type TestFixtureOrganizationLike = Readonly<{
  name: string;
  slug: string;
}>;

export const TEST_FIXTURE_ORG_NAME_PREFIXES = [
  "Fixture Org ",
  "Fixture Other Org ",
  "Browser E2E Org ",
  "Browser Access E2E Org ",
  "Browser Quick Drawer Org ",
  "Browser Quick Resources Org ",
  "Browser Room Set Org ",
  "Browser Docs Org ",
  "Browser Docs Review Org ",
  "Browser Budget Org ",
  "Browser Speakers Org ",
  "Browser Timeline Org ",
  "PF020 Org ",
] as const;

export const TEST_FIXTURE_ORG_SLUG_PREFIXES = [
  "fixture-org-",
  "fixture-other-org-",
  "browser-e2e-org-",
  "browser-access-e2e-org-",
  "browser-quick-drawer-org-",
  "browser-quick-resources-org-",
  "browser-room-set-org-",
  "browser-docs-org-",
  "browser-docs-review-org-",
  "browser-budget-org-",
  "browser-speakers-org-",
  "browser-timeline-org-",
  "pf020-org-",
] as const;

/**
 * Returns true only when both immutable fixture markers agree.  Keep this
 * stricter than `isTestFixtureOrganization`: the latter is intentionally
 * permissive so fixture rows stay out of normal account pickers, while
 * deletion must never be authorized by a display name alone.
 */
export function hasTestFixtureOrganizationIdentity(organization: TestFixtureOrganizationLike): boolean {
  return TEST_FIXTURE_ORG_NAME_PREFIXES.some(
    (namePrefix, index) =>
      organization.name.startsWith(namePrefix) &&
      organization.slug.startsWith(TEST_FIXTURE_ORG_SLUG_PREFIXES[index]),
  );
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function isTestFixtureOrganization(organization: TestFixtureOrganizationLike): boolean {
  return (
    TEST_FIXTURE_ORG_NAME_PREFIXES.some((prefix) => organization.name.startsWith(prefix)) ||
    TEST_FIXTURE_ORG_SLUG_PREFIXES.some((prefix) => organization.slug.startsWith(prefix))
  );
}

export function shouldShowTestFixtureOrganizations(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isTruthyEnv(env.SHOW_TEST_ORGS) ||
    env.NODE_ENV === "test" ||
    isTruthyEnv(env.PW_E2E) ||
    isTruthyEnv(env.PLAYWRIGHT_TEST)
  );
}

export function filterVisibleOrganizations<T extends TestFixtureOrganizationLike>(
  organizations: readonly T[],
  env: NodeJS.ProcessEnv = process.env,
): T[] {
  if (shouldShowTestFixtureOrganizations(env)) {
    return [...organizations];
  }

  return organizations.filter((organization) => !isTestFixtureOrganization(organization));
}
