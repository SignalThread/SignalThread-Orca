/**
 * Scoping / ownership assertion helpers for core-journey tests.
 *
 * These prove the two properties the journey suite cares about most:
 * - a record was created by *this* test run (so cleanup can safely target it), and
 * - a record is scoped to the expected company/event.
 */
import assert from "node:assert/strict";
import { journeyNamePrefix } from "./journey-fixtures";

/** True when `name` is tagged for the given test run. */
export function isJourneyTaggedName(name: unknown, testRunId: string): boolean {
  return typeof name === "string" && name.startsWith(journeyNamePrefix(testRunId));
}

/** Assert a record's name field carries this run's deterministic tag. */
export function assertBelongsToTestRun(
  record: Record<string, unknown> | null | undefined,
  testRunId: string,
  field = "full_name"
): void {
  const value = record?.[field];
  assert.ok(
    isJourneyTaggedName(value, testRunId),
    `expected ${field} to be tagged for test run ${testRunId}, got ${
      typeof value === "string" ? JSON.stringify(value) : typeof value
    }`
  );
}

/** Assert a record is scoped to the expected company. */
export function assertScopedToCompany(
  record: Record<string, unknown> | null | undefined,
  companyId: string
): void {
  assert.equal(
    String(record?.company_id ?? ""),
    String(companyId),
    "record company_id scope mismatch"
  );
}

/** Assert a record is scoped to the expected event. */
export function assertScopedToEvent(
  record: Record<string, unknown> | null | undefined,
  eventId: string
): void {
  assert.equal(
    String(record?.event_id ?? ""),
    String(eventId),
    "record event_id scope mismatch"
  );
}
