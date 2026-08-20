import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EventMemberRole, UserRole } from "@prisma/client";
import {
  PlatformAdminAuthError,
  requirePlatformAdminFromContext,
} from "../src/server/auth/platform-admin";
import {
  createPlatformAccountUser,
  createPlatformAccount,
  clearActivePlatformOrgContext,
  getActivePlatformOrgContext,
  grantUserEventAccess,
  listPlatformAccountEventMembers,
  listPlatformAccountEvents,
  listPlatformAccountUsers,
  listPlatformAccounts,
  PLATFORM_CONTEXT_COOKIE_NAME,
  platformContextCookieOptions,
  PlatformAdminServiceError,
  removeUserFromAccount,
  revokeUserEventAccess,
  setActivePlatformOrgContext,
  updatePlatformAccountUserRole,
} from "../src/server/services/platform-admin";

type AuthContext = Parameters<typeof requirePlatformAdminFromContext>[0];

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-02T00:00:00.000Z");
const orgId = "11111111-1111-4111-8111-111111111111";
const alternateOrgId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function superAdminNeedsOrgSelectionContext(): AuthContext {
  return {
    status: "NEEDS_ORG_SELECTION",
    supabaseUserId: "supabase-platform-admin",
    platformUserId: "supabase-platform-admin",
    identityLinkMode: "CANONICAL",
    email: "platform@example.com",
    appUserId: "platform-admin",
    role: UserRole.SUPER_ADMIN,
    memberships: [],
    activeOrgId: null,
    reason: "NEEDS_ORG_SELECTION",
    hint: "Select an organization context to continue.",
    organizations: [],
  };
}

function orgAdminContext(): AuthContext {
  return {
    status: "OK",
    supabaseUserId: "supabase-org-admin",
    platformUserId: "supabase-org-admin",
    identityLinkMode: "CANONICAL",
    email: "org-admin@example.com",
    appUserId: "org-admin",
    role: UserRole.ADMIN,
    memberships: [{ id: "membership-1", orgId: "org-1" }],
    activeOrgId: "org-1",
  };
}

function unauthenticatedContext(): AuthContext {
  return {
    status: "UNAUTHENTICATED",
    supabaseUserId: null,
    platformUserId: null,
    identityLinkMode: null,
    email: null,
    appUserId: null,
    role: null,
    memberships: [],
    activeOrgId: null,
    reason: "MISSING_SUPABASE_SESSION",
    hint: "Sign in first.",
  };
}

test("PlatformAdmin can list accounts without an active account context", async () => {
  const user = requirePlatformAdminFromContext(superAdminNeedsOrgSelectionContext());
  assert.equal(user.id, "platform-admin");
  assert.equal(user.role, UserRole.SUPER_ADMIN);
  assert.equal(user.orgId, null);

  const accounts = await listPlatformAccounts({
    organization: {
      findMany: async () => [
        {
          id: "org-1",
          name: "Acme Events",
          slug: "acme-events",
          createdAt,
          updatedAt,
          _count: {
            users: 2,
            memberships: 3,
            events: 4,
          },
          users: [
            {
              id: "admin-1",
              name: "Admin One",
              email: "admin@example.com",
              role: UserRole.ADMIN,
            },
            {
              id: "owner-1",
              name: "Owner One",
              email: "owner@example.com",
              role: UserRole.OWNER,
            },
          ],
        },
      ],
    },
  } as never);

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.name, "Acme Events");
  assert.equal(accounts[0]?.userCount, 2);
  assert.equal(accounts[0]?.memberCount, 3);
  assert.equal(accounts[0]?.eventCount, 4);
  assert.equal(accounts[0]?.primaryAdmin?.id, "owner-1");
});

test("OrgAdmin cannot list accounts through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(orgAdminContext()),
    (error) =>
      error instanceof PlatformAdminAuthError &&
      error.status === 403 &&
      error.reason === "PLATFORM_ADMIN_REQUIRED",
  );
});

test("Unauthenticated request cannot list accounts through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(unauthenticatedContext()),
    (error) =>
      error instanceof PlatformAdminAuthError &&
      error.status === 401 &&
      error.reason === "MISSING_SUPABASE_SESSION",
  );
});

test("PlatformAdmin can create an account", async () => {
  const user = requirePlatformAdminFromContext(superAdminNeedsOrgSelectionContext());
  assert.equal(user.role, UserRole.SUPER_ADMIN);

  let createdData: unknown = null;
  const account = await createPlatformAccount(
    {
      name: "  Acme   Events  ",
    },
    {
      organization: {
        findUnique: async () => null,
        create: async (args: { data: unknown }) => {
          createdData = args.data;
          return {
            id: "org-1",
            name: "Acme Events",
            slug: "acme-events",
            createdAt,
            updatedAt,
            _count: {
              users: 0,
              memberships: 0,
              events: 0,
            },
            users: [],
          };
        },
      },
    } as never,
  );

  assert.deepEqual(createdData, { name: "Acme Events", slug: "acme-events" });
  assert.equal(account.id, "org-1");
  assert.equal(account.primaryAdmin, null);
});

test("OrgAdmin cannot create an account through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(orgAdminContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 403,
  );
});

test("Account creation validates required fields", async () => {
  await assert.rejects(
    () => createPlatformAccount({}, { organization: {} } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 400 &&
      error.reason === "ACCOUNT_NAME_REQUIRED",
  );
});

test("Account creation rejects blank names", async () => {
  await assert.rejects(
    () => createPlatformAccount({ name: "   " }, { organization: {} } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 400 &&
      error.reason === "ACCOUNT_NAME_REQUIRED",
  );
});

test("Account creation rejects invalid explicit slug", async () => {
  await assert.rejects(
    () => createPlatformAccount({ name: "Acme Events", slug: "!!!" }, { organization: {} } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 400 &&
      error.reason === "ACCOUNT_SLUG_REQUIRED",
  );
});

test("Account creation returns stable duplicate slug error", async () => {
  await assert.rejects(
    () => createPlatformAccount({ name: "Acme Events", slug: "acme-events" }, {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 409 &&
      error.reason === "ACCOUNT_SLUG_CONFLICT",
  );
});

test("Account creation does not create dummy events, EventMember rows, or first admin users", async () => {
  let organizationCreateData: unknown = null;
  let eventTouched = false;
  let eventMemberTouched = false;
  let userTouched = false;

  const account = await createPlatformAccount({ name: "  Acme   Events  ", slug: "Acme Events" }, {
    organization: {
      findUnique: async () => null,
      create: async (args: { data: unknown }) => {
        organizationCreateData = args.data;
        return {
          id: orgId,
          name: "Acme Events",
          slug: "acme-events",
          createdAt,
          updatedAt,
          _count: {
            users: 0,
            memberships: 0,
            events: 0,
          },
          users: [],
        };
      },
    },
    event: {
      create: async () => {
        eventTouched = true;
      },
    },
    eventMember: {
      create: async () => {
        eventMemberTouched = true;
      },
    },
    user: {
      create: async () => {
        userTouched = true;
      },
    },
  } as never);

  assert.deepEqual(organizationCreateData, { name: "Acme Events", slug: "acme-events" });
  assert.equal(account.id, orgId);
  assert.equal(account.name, "Acme Events");
  assert.equal(account.slug, "acme-events");
  assert.equal(account.primaryAdmin, null);
  assert.equal(eventTouched, false);
  assert.equal(eventMemberTouched, false);
  assert.equal(userTouched, false);
});

test("Platform account routes use the PlatformAdmin gate and keep handlers thin", () => {
  const accountsRouteSource = readFileSync("app/api/platform/accounts/route.ts", "utf8");
  const meRouteSource = readFileSync("app/api/platform/me/route.ts", "utf8");

  assert.match(accountsRouteSource, /requirePlatformAdmin\(request\)/);
  assert.match(meRouteSource, /requirePlatformAdmin\(request\)/);
  assert.equal(accountsRouteSource.includes("UserRole.SUPER_ADMIN"), false);
  assert.equal(meRouteSource.includes("UserRole.SUPER_ADMIN"), false);
  assert.match(accountsRouteSource, /listPlatformAccountsPage\(/);
  assert.match(accountsRouteSource, /createPlatformAccount\(body\)/);
});

test("Every Platform Admin API route uses the canonical PlatformAdmin gate", () => {
  const routeFiles = [
    "app/api/platform/me/route.ts",
    "app/api/platform/accounts/route.ts",
    "app/api/platform/accounts/[orgId]/users/route.ts",
    "app/api/platform/accounts/[orgId]/users/[userId]/route.ts",
    "app/api/platform/accounts/[orgId]/events/route.ts",
    "app/api/platform/accounts/[orgId]/events/[eventId]/members/route.ts",
    "app/api/platform/accounts/[orgId]/events/[eventId]/members/[userId]/route.ts",
    "app/api/platform/context/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const source = readFileSync(routeFile, "utf8");
    assert.match(source, /requirePlatformAdmin\(request\)/, `${routeFile} must call requirePlatformAdmin(request)`);
    assert.doesNotMatch(source, /UserRole\.SUPER_ADMIN/, `${routeFile} should not duplicate role checks`);
    assert.doesNotMatch(source, /ensureProvisionedUserAndContext/, `${routeFile} should use the platform gate helper`);
  }

  assert.throws(
    () => requirePlatformAdminFromContext(unauthenticatedContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 401,
  );
  assert.throws(
    () => requirePlatformAdminFromContext(orgAdminContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 403,
  );
});

function membershipRow(overrides: Partial<{ role: UserRole; orgId: string; eventAccessCount: number }> = {}) {
  const eventAccessCount = overrides.eventAccessCount ?? 0;
  return {
    id: "membership-1",
    orgId,
    userId,
    createdAt,
    user: {
      id: userId,
      name: "Member One",
      email: "member@example.com",
      role: overrides.role ?? UserRole.MEMBER,
      orgId: overrides.orgId ?? orgId,
      createdAt,
      eventMemberships: Array.from({ length: eventAccessCount }, (_, index) => ({ id: `event-member-${index}` })),
    },
  };
}

test("PlatformAdmin can list account users", async () => {
  const platformUser = requirePlatformAdminFromContext(superAdminNeedsOrgSelectionContext());
  assert.equal(platformUser.role, UserRole.SUPER_ADMIN);

  const users = await listPlatformAccountUsers(orgId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    membership: {
      findMany: async () => [membershipRow()],
    },
  } as never);

  assert.equal(users.length, 1);
  assert.equal(users[0]?.email, "member@example.com");
  assert.equal(users[0]?.membershipStatus, "MEMBER");
  assert.equal(users[0]?.eventAccessStatus, "NO_EVENT_ACCESS_ASSIGNED");
});

test("List account users scopes Membership query to the requested org", async () => {
  let membershipWhere: unknown = null;

  await listPlatformAccountUsers(orgId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    membership: {
      findMany: async (args: { where: unknown }) => {
        membershipWhere = args.where;
        return [membershipRow()];
      },
    },
  } as never);

  assert.deepEqual(membershipWhere, { orgId });
});

test("OrgAdmin cannot list account users through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(orgAdminContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 403,
  );
});

test("Unauthenticated request cannot list account users through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(unauthenticatedContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 401,
  );
});

test("PlatformAdmin can add an existing account user and create Membership", async () => {
  requirePlatformAdminFromContext(superAdminNeedsOrgSelectionContext());

  let userUpdateData: unknown = null;
  let membershipCreated = false;
  let membershipReadCount = 0;
  const result = await createPlatformAccountUser(
    orgId,
    {
      mode: "addExisting",
      email: " MEMBER@EXAMPLE.COM ",
      name: " Member One ",
      role: UserRole.ADMIN,
    },
    {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      user: {
        findUnique: async () => ({ id: userId, role: UserRole.MEMBER }),
        update: async (args: { data: unknown }) => {
          userUpdateData = args.data;
          return { id: userId };
        },
      },
      membership: {
        create: async () => {
          membershipCreated = true;
          return { id: "membership-1" };
        },
        findUnique: async () => {
          membershipReadCount += 1;
          return membershipReadCount > 1 ? membershipRow({ role: UserRole.ADMIN }) : null;
        },
      },
    } as never,
  );

  assert.equal(result.action, "linked");
  assert.equal(result.userId, userId);
  assert.equal(membershipCreated, true);
  assert.deepEqual(userUpdateData, { orgId, role: UserRole.ADMIN, name: "Member One" });
});

test("Account user linking reconciles User.orgId and Membership to the same route org", async () => {
  let userUpdateData: unknown = null;
  let membershipLookupWhere: unknown = null;
  let membershipCreateData: unknown = null;
  let membershipReadCount = 0;

  await createPlatformAccountUser(
    orgId,
    {
      email: "member@example.com",
      role: UserRole.MEMBER,
    },
    {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      user: {
        findUnique: async () => ({ id: userId, role: UserRole.MEMBER }),
        update: async (args: { data: unknown }) => {
          userUpdateData = args.data;
          return { id: userId };
        },
      },
      membership: {
        findUnique: async (args: { where: unknown }) => {
          membershipLookupWhere = args.where;
          membershipReadCount += 1;
          return membershipReadCount > 1 ? membershipRow() : null;
        },
        create: async (args: { data: unknown }) => {
          membershipCreateData = args.data;
          return { id: "membership-1" };
        },
      },
    } as never,
  );

  assert.deepEqual(userUpdateData, { orgId, role: UserRole.MEMBER });
  assert.deepEqual(membershipLookupWhere, { orgId_userId: { orgId, userId } });
  assert.deepEqual(membershipCreateData, { orgId, userId });
});

test("PlatformAdmin can link SUPER_ADMIN to an account without changing platform role", async () => {
  let userUpdated = false;
  let membershipCreateData: unknown = null;
  let membershipReadCount = 0;
  let eventAccessTouched = false;

  const result = await createPlatformAccountUser(
    orgId,
    {
      mode: "addExisting",
      email: "platform@example.com",
      role: UserRole.ADMIN,
    },
    {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      user: {
        findUnique: async () => ({ id: userId, role: UserRole.SUPER_ADMIN }),
        update: async () => {
          userUpdated = true;
          return { id: userId };
        },
      },
      membership: {
        findUnique: async () => {
          membershipReadCount += 1;
          return membershipReadCount > 1
            ? membershipRow({ role: UserRole.SUPER_ADMIN, eventAccessCount: 0 })
            : null;
        },
        create: async (args: { data: unknown }) => {
          membershipCreateData = args.data;
          return { id: "membership-1" };
        },
      },
      eventMember: {
        create: async () => {
          eventAccessTouched = true;
          return { id: "event-member-1" };
        },
        upsert: async () => {
          eventAccessTouched = true;
          return { id: "event-member-1" };
        },
      },
    } as never,
  );

  assert.equal(result.action, "linked");
  assert.equal(result.user?.role, UserRole.SUPER_ADMIN);
  assert.equal(result.user?.eventAccessCount, 0);
  assert.equal(userUpdated, false);
  assert.deepEqual(membershipCreateData, { orgId, userId });
  assert.equal(eventAccessTouched, false);
});

test("Duplicate account membership is rejected cleanly", async () => {
  let userUpdated = false;
  let membershipCreated = false;

  await assert.rejects(
    () =>
      createPlatformAccountUser(
        orgId,
        {
          mode: "addExisting",
          email: "member@example.com",
          role: UserRole.ADMIN,
        },
        {
          organization: {
            findUnique: async () => ({ id: orgId }),
          },
          user: {
            findUnique: async () => ({ id: userId, role: UserRole.MEMBER }),
            update: async () => {
              userUpdated = true;
              return { id: userId };
            },
          },
          membership: {
            findUnique: async () => ({ id: "membership-1" }),
            create: async () => {
              membershipCreated = true;
              return { id: "membership-2" };
            },
          },
        } as never,
      ),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 409 &&
      error.reason === "ACCOUNT_MEMBERSHIP_ALREADY_EXISTS",
  );

  assert.equal(userUpdated, false);
  assert.equal(membershipCreated, false);
});

test("Role update works for allowed account roles", async () => {
  let updatedRole: unknown = null;
  let readCount = 0;

  const result = await updatePlatformAccountUserRole(
    orgId,
    userId,
    { role: UserRole.VIEWER },
    {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      user: {
        update: async (args: { data: { role: UserRole } }) => {
          updatedRole = args.data.role;
          return { id: userId };
        },
      },
      membership: {
        findUnique: async () => {
          readCount += 1;
          return membershipRow({ role: readCount > 1 ? UserRole.VIEWER : UserRole.MEMBER });
        },
      },
    } as never,
  );

  assert.equal(updatedRole, UserRole.VIEWER);
  assert.equal(result.action, "updated");
  assert.equal(result.user?.role, UserRole.VIEWER);
});

test("Account role update is scoped by route org and user id", async () => {
  let membershipLookupWhere: unknown = null;

  await updatePlatformAccountUserRole(
    orgId,
    userId,
    { role: UserRole.ADMIN },
    {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      user: {
        update: async () => ({ id: userId }),
      },
      membership: {
        findUnique: async (args: { where: unknown }) => {
          membershipLookupWhere = args.where;
          return membershipRow({ role: UserRole.ADMIN });
        },
      },
    } as never,
  );

  assert.deepEqual(membershipLookupWhere, { orgId_userId: { orgId, userId } });
});

test("Unsafe PlatformAdmin role escalation is rejected for account users", async () => {
  await assert.rejects(
    () => createPlatformAccountUser(orgId, { email: "member@example.com", role: UserRole.SUPER_ADMIN }, {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 400 &&
      error.reason === "INVALID_ACCOUNT_USER_ROLE",
  );
});

test("Removal validates the expected account membership end state", async () => {
  let deleted = false;
  let readCount = 0;

  const result = await removeUserFromAccount(orgId, userId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    membership: {
      findUnique: async () => {
        readCount += 1;
        return deleted ? null : membershipRow({ orgId: alternateOrgId });
      },
      findFirst: async () => null,
      delete: async () => {
        deleted = true;
        return { id: "membership-1" };
      },
    },
  } as never);

  assert.equal(result.action, "removed");
  assert.equal(deleted, true);
  assert.equal(readCount >= 2, true);
});

test("Removing a user's only account is blocked when User.orgId cannot be safely reassigned", async () => {
  await assert.rejects(
    () => removeUserFromAccount(orgId, userId, {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      membership: {
        findUnique: async () => membershipRow({ orgId }),
        findFirst: async () => null,
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 409 &&
      error.reason === "PRIMARY_ORG_REQUIRES_ALTERNATE_MEMBERSHIP",
  );
});

test("Removing one account from a multi-account user reassigns User.orgId safely", async () => {
  let userUpdateData: unknown = null;
  let membershipDeleteWhere: unknown = null;
  let deleted = false;

  const result = await removeUserFromAccount(orgId, userId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    user: {
      update: async (args: { data: unknown }) => {
        userUpdateData = args.data;
        return { id: userId };
      },
    },
    membership: {
      findUnique: async () => (deleted ? null : membershipRow({ orgId })),
      findFirst: async () => ({ orgId: alternateOrgId }),
      delete: async (args: { where: unknown }) => {
        membershipDeleteWhere = args.where;
        deleted = true;
        return { id: "membership-1" };
      },
    },
  } as never);

  assert.equal(result.action, "removed");
  assert.deepEqual(membershipDeleteWhere, { orgId_userId: { orgId, userId } });
  assert.deepEqual(userUpdateData, { orgId: alternateOrgId });
});

test("Removing a user from org A does not mutate org B membership or event access", async () => {
  let membershipDeleteWhere: unknown = null;
  let eventMemberTouched = false;
  let deleted = false;

  const result = await removeUserFromAccount(orgId, userId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    eventMember: {
      deleteMany: async () => {
        eventMemberTouched = true;
      },
    },
    membership: {
      findUnique: async () => (deleted ? null : membershipRow({ orgId: alternateOrgId })),
      findFirst: async () => null,
      delete: async (args: { where: unknown }) => {
        membershipDeleteWhere = args.where;
        deleted = true;
        return { id: "membership-1" };
      },
    },
  } as never);

  assert.equal(result.action, "removed");
  assert.deepEqual(membershipDeleteWhere, { orgId_userId: { orgId, userId } });
  assert.equal(eventMemberTouched, false);
});

test("Removal blocks when EventMember cleanup is still required", async () => {
  await assert.rejects(
    () => removeUserFromAccount(orgId, userId, {
      organization: {
        findUnique: async () => ({ id: orgId }),
      },
      membership: {
        findUnique: async () => membershipRow({ eventAccessCount: 1 }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 409 &&
      error.reason === "EVENT_ACCESS_CLEANUP_REQUIRED",
  );
});

test("Platform account user routes use the PlatformAdmin gate and service layer", () => {
  const usersRouteSource = readFileSync("app/api/platform/accounts/[orgId]/users/route.ts", "utf8");
  const userRouteSource = readFileSync("app/api/platform/accounts/[orgId]/users/[userId]/route.ts", "utf8");
  const serviceSource = readFileSync("src/server/services/platform-admin.ts", "utf8");

  assert.match(usersRouteSource, /requirePlatformAdmin\(request\)/);
  assert.match(userRouteSource, /requirePlatformAdmin\(request\)/);
  assert.match(usersRouteSource, /listPlatformAccountUsers\(orgId\)/);
  assert.match(usersRouteSource, /createPlatformAccountUser\(orgId, body\)/);
  assert.match(userRouteSource, /updatePlatformAccountUserRole\(orgId, userId, body\)/);
  assert.match(userRouteSource, /removeUserFromAccount\(orgId, userId\)/);
  assert.equal(usersRouteSource.includes("UserRole.SUPER_ADMIN"), false);
  assert.equal(userRouteSource.includes("UserRole.SUPER_ADMIN"), false);
  assert.equal(serviceSource.includes(".eventMember.create("), false);
  assert.equal(serviceSource.includes(".eventMember.createMany"), false);
});

function eventMemberRow(overrides: Partial<{ eventRole: EventMemberRole }> = {}) {
  return {
    id: "event-member-1",
    eventId,
    userId,
    eventRole: overrides.eventRole ?? EventMemberRole.EVENT_VIEWER,
    createdAt,
    user: {
      id: userId,
      name: "Member One",
      email: "member@example.com",
      role: UserRole.MEMBER,
      orgId,
    },
  };
}

test("PlatformAdmin can list account events", async () => {
  requirePlatformAdminFromContext(superAdminNeedsOrgSelectionContext());

  const events = await listPlatformAccountEvents(orgId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    event: {
      findMany: async () => [
        {
          id: eventId,
          orgId,
          name: "Kickoff",
          clientId: "client-1",
          startDate: createdAt,
          endDate: updatedAt,
          status: "ACTIVE",
          client: { id: "client-1", name: "Acme Client" },
          _count: { eventMembers: 2 },
        },
      ],
    },
  } as never);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.name, "Kickoff");
  assert.equal(events[0]?.clientName, "Acme Client");
  assert.equal(events[0]?.eventMemberCount, 2);
});

test("List account events scopes Event query to the requested org", async () => {
  let eventWhere: unknown = null;

  await listPlatformAccountEvents(orgId, {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    event: {
      findMany: async (args: { where: unknown }) => {
        eventWhere = args.where;
        return [];
      },
    },
  } as never);

  assert.deepEqual(eventWhere, { orgId });
});

test("OrgAdmin cannot list account events through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(orgAdminContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 403,
  );
});

test("Unauthenticated request cannot list account events through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(unauthenticatedContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 401,
  );
});

test("PlatformAdmin can list account event members", async () => {
  const members = await listPlatformAccountEventMembers(orgId, eventId, {
    event: {
      findFirst: async () => ({ id: eventId }),
    },
    eventMember: {
      findMany: async () => [eventMemberRow()],
    },
  } as never);

  assert.equal(members.length, 1);
  assert.equal(members[0]?.eventRole, EventMemberRole.EVENT_VIEWER);
  assert.equal(members[0]?.user.email, "member@example.com");
});

test("List event members rejects events outside the requested org", async () => {
  await assert.rejects(
    () => listPlatformAccountEventMembers(orgId, eventId, {
      event: {
        findFirst: async () => null,
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_EVENT_NOT_FOUND",
  );
});

test("List event members filters users to the requested account", async () => {
  let eventMemberWhere: unknown = null;

  await listPlatformAccountEventMembers(orgId, eventId, {
    event: {
      findFirst: async () => ({ id: eventId }),
    },
    eventMember: {
      findMany: async (args: { where: unknown }) => {
        eventMemberWhere = args.where;
        return [eventMemberRow()];
      },
    },
  } as never);

  assert.deepEqual(eventMemberWhere, {
    eventId,
    event: { orgId },
    user: {
      OR: [
        { orgId },
        {
          memberships: {
            some: { orgId },
          },
        },
      ],
    },
  });
});

test("PlatformAdmin can grant user access to an event", async () => {
  let upsertData: unknown = null;
  let userUpdated = false;
  let membershipMutated = false;
  let readCount = 0;

  const result = await grantUserEventAccess(
    orgId,
    eventId,
    userId,
    { eventRole: EventMemberRole.EVENT_EDITOR },
    {
      event: {
        findFirst: async () => ({ id: eventId }),
      },
      user: {
        findUnique: async () => ({ id: userId, orgId, memberships: [] }),
        update: async () => {
          userUpdated = true;
        },
      },
      membership: {
        upsert: async () => {
          membershipMutated = true;
        },
      },
      eventMember: {
        findUnique: async () => {
          readCount += 1;
          return readCount > 1 ? eventMemberRow({ eventRole: EventMemberRole.EVENT_EDITOR }) : null;
        },
        upsert: async (args: { create: unknown; update: unknown }) => {
          upsertData = { create: args.create, update: args.update };
          return { id: "event-member-1" };
        },
      },
    } as never,
  );

  assert.equal(result.action, "granted");
  assert.equal(result.eventMember?.eventRole, EventMemberRole.EVENT_EDITOR);
  assert.deepEqual(upsertData, {
    create: { eventId, userId, eventRole: EventMemberRole.EVENT_EDITOR },
    update: { eventRole: EventMemberRole.EVENT_EDITOR },
  });
  assert.equal(userUpdated, false);
  assert.equal(membershipMutated, false);
});

test("Grant is idempotent and updates existing EventMember access", async () => {
  let upsertCalled = false;
  let readCount = 0;

  const result = await grantUserEventAccess(
    orgId,
    eventId,
    userId,
    { eventRole: EventMemberRole.EVENT_ADMIN },
    {
      event: {
        findFirst: async () => ({ id: eventId }),
      },
      user: {
        findUnique: async () => ({ id: userId, orgId: alternateOrgId, memberships: [{ id: "membership-1" }] }),
      },
      eventMember: {
        findUnique: async () => {
          readCount += 1;
          return readCount > 1
            ? eventMemberRow({ eventRole: EventMemberRole.EVENT_ADMIN })
            : { id: "event-member-1", eventRole: EventMemberRole.EVENT_VIEWER };
        },
        upsert: async () => {
          upsertCalled = true;
          return { id: "event-member-1" };
        },
      },
    } as never,
  );

  assert.equal(result.action, "updated");
  assert.equal(result.eventMember?.eventRole, EventMemberRole.EVENT_ADMIN);
  assert.equal(upsertCalled, true);
});

test("Grant creates no duplicate EventMember rows for the same event and user", async () => {
  const serviceSource = readFileSync("src/server/services/platform-admin.ts", "utf8");
  const grantSource = sourceBetween(
    serviceSource,
    "export async function grantUserEventAccess",
    "export async function revokeUserEventAccess",
  );

  assert.match(grantSource, /eventId_userId/);
  assert.match(grantSource, /db\.eventMember\.upsert/);
  assert.doesNotMatch(grantSource, /db\.eventMember\.create\(/);
  assert.doesNotMatch(grantSource, /db\.eventMember\.createMany/);
});

test("Grant rejects users outside the org", async () => {
  await assert.rejects(
    () => grantUserEventAccess(orgId, eventId, userId, { eventRole: EventMemberRole.EVENT_VIEWER }, {
      event: {
        findFirst: async () => ({ id: eventId }),
      },
      user: {
        findUnique: async () => ({ id: userId, orgId: alternateOrgId, memberships: [] }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_USER_NOT_FOUND",
  );
});

test("Grant rejects events outside the org", async () => {
  await assert.rejects(
    () => grantUserEventAccess(orgId, eventId, userId, { eventRole: EventMemberRole.EVENT_VIEWER }, {
      event: {
        findFirst: async () => null,
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_EVENT_NOT_FOUND",
  );
});

test("Grant rejects user membership even when the event id is valid for another org shape", async () => {
  let eventCheckedBeforeUser = false;

  await assert.rejects(
    () => grantUserEventAccess(orgId, eventId, userId, { eventRole: EventMemberRole.EVENT_VIEWER }, {
      event: {
        findFirst: async (args: { where: unknown }) => {
          assert.deepEqual(args.where, { id: eventId, orgId });
          eventCheckedBeforeUser = true;
          return { id: eventId };
        },
      },
      user: {
        findUnique: async () => ({ id: userId, orgId: alternateOrgId, memberships: [] }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_USER_NOT_FOUND",
  );

  assert.equal(eventCheckedBeforeUser, true);
});

test("PlatformAdmin can revoke user access from an event and validate end state", async () => {
  let deletedWhere: unknown = null;

  const result = await revokeUserEventAccess(orgId, eventId, userId, {
    event: {
      findFirst: async () => ({ id: eventId }),
    },
    user: {
      findUnique: async () => ({ id: userId, orgId, memberships: [] }),
    },
    eventMember: {
      deleteMany: async (args: { where: unknown }) => {
        deletedWhere = args.where;
        return { count: 1 };
      },
      findUnique: async () => null,
    },
  } as never);

  assert.equal(result.action, "revoked");
  assert.deepEqual(deletedWhere, { eventId, userId, event: { orgId } });
});

test("Revoke rejects events outside the org", async () => {
  await assert.rejects(
    () => revokeUserEventAccess(orgId, eventId, userId, {
      event: {
        findFirst: async () => null,
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_EVENT_NOT_FOUND",
  );
});

test("Revoke rejects users outside the org", async () => {
  await assert.rejects(
    () => revokeUserEventAccess(orgId, eventId, userId, {
      event: {
        findFirst: async () => ({ id: eventId }),
      },
      user: {
        findUnique: async () => ({ id: userId, orgId: alternateOrgId, memberships: [] }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_USER_NOT_FOUND",
  );
});

test("Revoke reports failed expected end state", async () => {
  await assert.rejects(
    () => revokeUserEventAccess(orgId, eventId, userId, {
      event: {
        findFirst: async () => ({ id: eventId }),
      },
      user: {
        findUnique: async () => ({ id: userId, orgId, memberships: [] }),
      },
      eventMember: {
        deleteMany: async () => ({ count: 1 }),
        findUnique: async () => ({ id: "event-member-1" }),
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 500 &&
      error.reason === "EVENT_ACCESS_REVOKE_FAILED",
  );
});

test("Platform event access routes use the PlatformAdmin gate and scoped service layer", () => {
  const eventsRouteSource = readFileSync("app/api/platform/accounts/[orgId]/events/route.ts", "utf8");
  const membersRouteSource = readFileSync("app/api/platform/accounts/[orgId]/events/[eventId]/members/route.ts", "utf8");
  const memberRouteSource = readFileSync(
    "app/api/platform/accounts/[orgId]/events/[eventId]/members/[userId]/route.ts",
    "utf8",
  );
  const serviceSource = readFileSync("src/server/services/platform-admin.ts", "utf8");
  const grantSource = serviceSource.slice(
    serviceSource.indexOf("export async function grantUserEventAccess"),
    serviceSource.indexOf("export async function revokeUserEventAccess"),
  );

  assert.match(eventsRouteSource, /requirePlatformAdmin\(request\)/);
  assert.match(membersRouteSource, /requirePlatformAdmin\(request\)/);
  assert.match(memberRouteSource, /requirePlatformAdmin\(request\)/);
  assert.match(eventsRouteSource, /listPlatformAccountEvents\(orgId\)/);
  assert.match(membersRouteSource, /listPlatformAccountEventMembers\(orgId, eventId\)/);
  assert.match(membersRouteSource, /grantUserEventAccess\(orgId, eventId, userId, body\)/);
  assert.match(memberRouteSource, /revokeUserEventAccess\(orgId, eventId, userId\)/);
  assert.match(serviceSource, /eventId_userId/);
  assert.match(serviceSource, /where: \{ id: eventId, orgId \}/);
  assert.match(serviceSource, /event: \{\s+orgId,/);
  assert.doesNotMatch(grantSource, /db\.user\.update/);
  assert.doesNotMatch(grantSource, /db\.membership\.(upsert|create|update)/);
});

test("Revoke-event-access route validates userId with the canonical UUID pattern", () => {
  const memberRoutePath = "app/api/platform/accounts/[orgId]/events/[eventId]/members/[userId]/route.ts";
  const memberRouteSource = readFileSync(memberRoutePath, "utf8");

  // Exercise the exact UUID_REGEX literal the route uses at its validation layer.
  const match = memberRouteSource.match(/const UUID_REGEX = \/(.+)\/i;/);
  if (!match) throw new Error("UUID_REGEX literal not found in revoke-event-access route");
  const uuidRegex = new RegExp(match[1], "i");

  // Valid UUID-shaped ids are accepted. Previously rejected because the 4th group
  // `[0-9a-f]{3}-` was missing, so every real revoke DELETE returned 400 (dead feature).
  for (const id of [
    "550e8400-e29b-41d4-a716-446655440000",
    "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "00000000-0000-1000-8000-000000000000",
  ]) {
    assert.equal(uuidRegex.test(id), true, `expected ${id} to be accepted`);
  }

  // Invalid ids still fail validation → route returns its 400 INVALID_UUID response.
  for (const id of [
    "not-a-uuid",
    "550e8400-e29b-41d4-a716-44665544000", // final group one hex short
    "550e8400e29b41d4a716446655440000", // no dashes
    "550e8400-e29b-41d4-a716446655440000", // missing 4th-group dash (the old bug's shape)
    "",
  ]) {
    assert.equal(uuidRegex.test(id), false, `expected ${id} to be rejected`);
  }

  // Regression guard: never reintroduce the truncated dash-less 13-char group.
  assert.equal(memberRouteSource.includes("[89ab][0-9a-f]{12}$"), false);
  assert.equal(memberRouteSource.includes("if (!UUID_REGEX.test(userId)) return invalidUuidResponse(\"userId\")"), true);

  // Parity: uses the same canonical UUID pattern as sibling platform member route.
  const siblingSource = readFileSync("app/api/platform/accounts/[orgId]/events/[eventId]/members/route.ts", "utf8");
  const siblingMatch = siblingSource.match(/const UUID_REGEX = \/(.+)\/i;/);
  if (!siblingMatch) throw new Error("UUID_REGEX literal not found in sibling members route");
  assert.equal(match[1], siblingMatch[1]);

  // Platform Admin gate + scoped revoke service remain wired ahead of the mutation.
  assert.ok(
    memberRouteSource.indexOf("requirePlatformAdmin(request)") <
      memberRouteSource.indexOf("revokeUserEventAccess(orgId, eventId, userId)"),
    "PlatformAdmin gate must run before revoke",
  );
});

function platformContextRequest(value: string | null) {
  return {
    cookies: {
      get: (name: string) => {
        if (name !== PLATFORM_CONTEXT_COOKIE_NAME || !value) return undefined;
        return { value };
      },
    },
  } as never;
}

test("PlatformAdmin can set active org context", async () => {
  requirePlatformAdminFromContext(superAdminNeedsOrgSelectionContext());

  const context = await setActivePlatformOrgContext(platformContextRequest(null), orgId, {
    organization: {
      findUnique: async () => ({
        id: orgId,
        name: "Acme Events",
        slug: "acme-events",
        createdAt,
        updatedAt,
        _count: {
          users: 1,
          memberships: 1,
          events: 2,
        },
        users: [],
      }),
    },
  } as never);

  assert.equal(context.orgId, orgId);
  assert.equal(context.account.name, "Acme Events");
  assert.equal(context.account.eventCount, 2);
});

test("OrgAdmin cannot set active org context through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(orgAdminContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 403,
  );
});

test("Unauthenticated request cannot set active org context through the PlatformAdmin gate", () => {
  assert.throws(
    () => requirePlatformAdminFromContext(unauthenticatedContext()),
    (error) => error instanceof PlatformAdminAuthError && error.status === 401,
  );
});

test("PlatformAdmin cannot set context to a missing org", async () => {
  await assert.rejects(
    () => setActivePlatformOrgContext(platformContextRequest(null), orgId, {
      organization: {
        findUnique: async () => null,
      },
    } as never),
    (error) =>
      error instanceof PlatformAdminServiceError &&
      error.status === 404 &&
      error.reason === "ACCOUNT_NOT_FOUND",
  );
});

test("PlatformAdmin can read current active platform context", async () => {
  const context = await getActivePlatformOrgContext(platformContextRequest(orgId), {
    organization: {
      findUnique: async () => ({
        id: orgId,
        name: "Acme Events",
        slug: "acme-events",
        createdAt,
        updatedAt,
        _count: {
          users: 0,
          memberships: 0,
          events: 0,
        },
        users: [],
      }),
    },
  } as never);

  assert.equal(context?.orgId, orgId);
  assert.equal(context?.account.slug, "acme-events");
});

test("Malformed platform context cookie fails safely", async () => {
  const context = await getActivePlatformOrgContext(platformContextRequest("not-a-uuid"), {
    organization: {
      findUnique: async () => {
        throw new Error("organization lookup should not run for malformed cookie");
      },
    },
  } as never);

  assert.equal(context, null);
});

test("Deleted or missing platform context org fails safely", async () => {
  const context = await getActivePlatformOrgContext(platformContextRequest(orgId), {
    organization: {
      findUnique: async () => null,
    },
  } as never);

  assert.equal(context, null);
});

test("PlatformAdmin can clear active platform context", async () => {
  const result = await clearActivePlatformOrgContext(platformContextRequest(orgId));
  assert.deepEqual(result, { cleared: true });
});

test("PlatformAdmin can clear context idempotently without a cookie", async () => {
  const result = await clearActivePlatformOrgContext(platformContextRequest(null));
  assert.deepEqual(result, { cleared: true });
});

test("Platform context cookie options are secure and short-lived", () => {
  const options = platformContextCookieOptions();
  const contextRouteSource = readFileSync("app/api/platform/context/route.ts", "utf8");
  const serviceSource = readFileSync("src/server/services/platform-admin.ts", "utf8");

  assert.equal(options.name, PLATFORM_CONTEXT_COOKIE_NAME);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.maxAge, 60 * 60 * 8);
  assert.equal(options.path, "/");
  assert.equal(options.secure, process.env.NODE_ENV === "production");
  assert.match(serviceSource, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(contextRouteSource, /maxAge: 0/);
  assert.match(contextRouteSource, /value: ""/);
});

test("Context stores org/account only, not fake user identity", () => {
  const routeSource = readFileSync("app/api/platform/context/route.ts", "utf8");
  const serviceSource = readFileSync("src/server/services/platform-admin.ts", "utf8");
  const requestUserSource = readFileSync("lib/request-user.ts", "utf8");

  assert.match(routeSource, /requirePlatformAdmin\(request\)/);
  assert.match(routeSource, /setActivePlatformOrgContext\(request, orgId\)/);
  assert.match(routeSource, /getActivePlatformOrgContext\(request\)/);
  assert.match(routeSource, /clearActivePlatformOrgContext\(request\)/);
  assert.match(routeSource, /PLATFORM_CONTEXT_COOKIE_NAME/);
  assert.match(serviceSource, /export const PLATFORM_CONTEXT_COOKIE_NAME = "platformActiveOrgId"/);
  assert.match(serviceSource, /orgId: account\.id/);
  assert.doesNotMatch(serviceSource, /imperson/i);
  assert.doesNotMatch(routeSource, /userId.*cookies\.set/);
  assert.match(requestUserSource, /appUser\.role === UserRole\.SUPER_ADMIN/);
  assert.doesNotMatch(requestUserSource, /PLATFORM_CONTEXT_COOKIE_NAME/);
});

test("Platform context is ignored by normal organization request resolution", () => {
  const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
  const normalUserBranch = sourceBetween(
    requestUserSource,
    "const membershipResult = await ensureMembershipForUser(appUser);",
    "async function resolveFromDevFallback",
  );

  assert.doesNotMatch(requestUserSource, /requestedPlatformOrgId/);
  assert.match(normalUserBranch, /resolveOrganizationSelection\(/);
});

test("Platform context mode does not create EventMember rows or impersonate users", () => {
  const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
  const contextRouteSource = readFileSync("app/api/platform/context/route.ts", "utf8");
  const shellScaffoldSource = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");

  assert.doesNotMatch(requestUserSource, /eventMember\.(create|upsert|createMany)/);
  assert.doesNotMatch(contextRouteSource, /eventMember\.(create|upsert|createMany)/);
  assert.doesNotMatch(contextRouteSource, /imperson/i);
  assert.doesNotMatch(shellScaffoldSource, /imperson/i);
  assert.match(requestUserSource, /appUserId: appUser\.id/);
});

test("normal event lists use the canonical selected account, separate from platform context", () => {
  const eventsServiceSource = readFileSync("lib/events.ts", "utf8");
  const eventsRouteSource = readFileSync("app/api/events/route.ts", "utf8");
  const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
  const visibilityResolverSource = sourceBetween(
    eventsServiceSource,
    "export function resolveEventVisibility",
    "export function resolveActiveEventVisibilityWhere",
  );

  assert.match(requestUserSource, /const selection = resolveOrganizationSelection\(/);
  assert.doesNotMatch(requestUserSource, /requestedPlatformOrgId/);
  assert.match(eventsServiceSource, /role === UserRole\.SUPER_ADMIN/);
  assert.match(visibilityResolverSource, /input\.orgId && canListOrganizationEvents\(input\.role\)/);
  assert.match(visibilityResolverSource, /orgId: input\.orgId/);
  assert.match(eventsRouteSource, /orgId: user\.orgId/);
  assert.match(eventsRouteSource, /applyActiveOrgCookie\(response, user\.activeOrgIdCookieToSet\)/);
});

test("Exiting platform context returns normal users to canonical account selection", () => {
  const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
  const meRouteSource = readFileSync("app/api/me/route.ts", "utf8");
  const normalUserBranch = sourceBetween(
    requestUserSource,
    "const membershipResult = await ensureMembershipForUser(appUser);",
    "async function resolveFromDevFallback",
  );

  assert.match(normalUserBranch, /resolveOrganizationSelection\(/);
  assert.match(normalUserBranch, /selectedOrgId: input\.selectedOrganizationId/);
  assert.doesNotMatch(normalUserBranch, /requestedPlatformOrgId/);
  assert.match(meRouteSource, /PLATFORM_CONTEXT_COOKIE_NAME/);
  assert.match(meRouteSource, /clearPlatformContextCookie\(response\)/);
  assert.match(meRouteSource, /maxAge: 0/);
});

test("EventMember visibility still applies to event-scoped users outside PlatformAdmin mode", () => {
  const eventsServiceSource = readFileSync("lib/events.ts", "utf8");
  const eventScopedBranch = sourceBetween(
    eventsServiceSource,
    "mode: \"EVENT_MEMBER_SCOPED\"",
    "export function resolveActiveEventVisibilityWhere",
  );

  assert.match(eventScopedBranch, /eventMembers/);
  assert.match(eventScopedBranch, /some/);
  assert.match(eventScopedBranch, /userId: input\.userId/);
  assert.match(eventScopedBranch, /orgId: input\.orgId/);
});

test("Existing event-scoped route helpers scope PlatformAdmin to the active account org", () => {
  const eventAccessSource = readFileSync("lib/event-access.ts", "utf8");
  const eventRouteSource = readFileSync("app/api/events/[eventId]/route.ts", "utf8");

  assert.match(eventAccessSource, /canListOrganizationEvents\(user\.role\)/);
  assert.match(eventAccessSource, /user\.orgId !== event\.orgId/);
  assert.match(eventAccessSource, /eventMembers/);
  assert.match(eventRouteSource, /currentUser\.orgId !== event\.orgId/);
  assert.match(eventRouteSource, /currentUser\.role !== UserRole\.SUPER_ADMIN/);
  assert.match(eventRouteSource, /eventMember\.eventRole !== EventMemberRole\.EVENT_ADMIN/);
});
