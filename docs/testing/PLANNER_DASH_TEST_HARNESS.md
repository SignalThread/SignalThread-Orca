# Planner Dash Test Harness

This harness is for deterministic Planner Dash journey, API, and browser E2E tests.

## Location

- Fixture helpers: `web/lib/test-harness/planner-fixtures.ts`
- Harness validation test: `web/lib/test-harness/planner-fixtures.test.ts`

## Canonical Commands

Full local verification:

```bash
npm --prefix web run typecheck
npm --prefix web run test:summary
```

Focused harness and journey validation:

```bash
npm --prefix web run test:harness
npm --prefix web run test:journeys
npm --prefix web run test:journeys:core
npm --prefix web run test:journeys:access
npm --prefix web run test:journeys:lifecycle
```

`test:summary` discovers every `*.test.ts` file outside `node_modules` and `.next`, so it includes the harness validation test and all three journey packs.

Browser E2E validation uses Playwright:

```bash
npm --prefix web run test:e2e:p0
npm --prefix web run test:e2e:budget
```

Normal Playwright commands run in clean e2e logging mode (`PW_E2E=1`, `PW_E2E_VERBOSE_LOGS=0`) so pass/fail output stays readable. To debug app/server diagnostics, set:

```bash
PW_E2E_VERBOSE_LOGS=1 npm --prefix web run test:e2e:p0
```

Clean e2e mode suppresses expected development-auth fallback warnings, successful request lifecycle logs, route-local successful Events/Docs/Matrix logs, Prisma initialization info, Budget debug traces, and notification unread-count debug traces. Failed requests, recorded route exceptions, DB-classified errors, unexpected auth failures, and browser-side errors remain visible.

The helpers use the existing Node/tsx test runner and the existing Prisma client from `@/lib/prisma`. They do not introduce Playwright, a new runner, schema changes, or migrations.

## Environment

The harness loads local env files before initializing Prisma:

- repo `.env.local`
- `web/.env.local`

If `DATABASE_URL` is unavailable, DB-backed validation skips instead of creating accidental state against an unknown database.

The helpers prefer the locked Prisma schema. Two Matrix 2 compatibility paths are harness-only and exist for current test databases that still carry the older staff/person shape:

- `EventPerson` creation maps Prisma enum values to the legacy lowercase check constraint only when the database is missing the `EventPersonRole` enum type.
- `SessionStaffAssignment` creation falls back to the legacy `MatrixRowStaffAssignment` table only when the Prisma table is absent.

## Fixture Style

Use one harness instance per test:

```ts
import test from "node:test";
import { createPlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

test("example API fixture test", async () => {
  const fixtures = createPlannerFixtureHarness({ runLabel: "example" });

  try {
    const roles = await fixtures.createRoleAccessFixture();
    const room = await fixtures.createRoom({ eventId: roles.event.id });
    const session = await fixtures.createMatrixRow({ eventId: roles.event.id, roomId: room.id });

    // Exercise route/service code here.
  } finally {
    await fixtures.cleanup();
  }
});
```

Do not share a harness instance across tests. Each harness owns its generated IDs and cleanup plan.

## Covered Fixture Helpers

The harness can create deterministic rows for:

- `Organization`
- `Client`
- `User`
- `Membership`
- `Event`
- `EventMember`
- `Room`
- `MatrixRow`
- `Speaker`
- `SessionSpeakerAssignment`
- `EventPerson`
- `SessionStaffAssignment`
- `SessionRequirementTemplate`
- `SessionRequirementSection`
- `SessionRequirementItem`
- `SessionRequirementSelection`
- `EventFnbCatalogItem`
- `SessionFnbCatalogAssignment`
- `SeatingPlan`
- `SeatingTable`
- `SeatingAttendee`
- `SeatingAssignment`
- `Budget`
- `BudgetVersion`
- `BudgetLineItem`
- `DocumentCategory`
- `Document`
- `DocumentVersion`
- `TimelineItem`
- `TimelineDependency`

## Role Matrix Helper

`createRoleAccessFixture()` creates:

- `owner`: `UserRole.OWNER`, org member, no `EventMember` needed for event write access
- `admin`: `UserRole.ADMIN`, org member, no `EventMember` needed for event write access
- `member`: `UserRole.MEMBER`, org member, `EventMemberRole.EVENT_EDITOR`
- `viewer`: `UserRole.VIEWER`, org member, `EventMemberRole.EVENT_EDITOR`
- `eventViewer`: `UserRole.MEMBER`, org member, `EventMemberRole.EVENT_VIEWER`
- `unrelatedSameOrgMember`: `UserRole.MEMBER`, org member, no event member
- `unrelatedOtherOrgMember`: `UserRole.MEMBER`, member of another org
- `superAdmin`: `UserRole.SUPER_ADMIN`, member of another org

The returned `accessUser` values are shaped for `assertEventAccessForUser()`.

## Cleanup Strategy

Cleanup is explicit:

```ts
try {
  // Create data and run assertions.
} finally {
  await fixtures.cleanup();
}
```

`cleanup()` deletes tracked rows in reverse dependency order:

1. timeline dependencies and timeline items
2. document versions, documents, and document categories
3. seating assignments, attendees, tables, and plans
4. session F&B, requirement, speaker, and staff links
5. requirement items, sections, and templates
6. F&B catalog items, speakers, event people
7. budget line items, budget versions, and budgets
8. matrix rows and rooms
9. event members and events
10. clients, memberships, users, and organizations

Cleanup is safe for partial setup failures because every create helper records IDs immediately after successful creation.

## What This Is Not

This is not the full Planner journey E2E pack. It only provides deterministic data and role utilities so later API and browser tests can be written without relying on seeded state or shared mutable fixtures.
