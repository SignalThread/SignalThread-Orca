import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { EventPersonRole } from "@prisma/client";
import { directoryRoleForEventPerson } from "@/src/server/services/event-directory-backfill";

const backfill = readFileSync("src/server/services/event-directory-backfill.ts", "utf8");

test("backfill exposes per-module + combined functions", () => {
  for (const fn of [
    "backfillDirectoryFromSpeakers",
    "backfillDirectoryFromSeatingAttendees",
    "backfillDirectoryFromEventPeople",
    "backfillEventDirectoryForEvent",
  ]) {
    assert.match(backfill, new RegExp(`export async function ${fn}`), `${fn} exported`);
  }
});

test("each module maps to the exact directory role + module-link type", () => {
  assert.match(backfill, /module: "SPEAKER",\s*role: "SPEAKER",/);
  assert.match(backfill, /module: "SEATING_ATTENDEE",\s*role: "SEATING_GUEST",/);
  assert.match(backfill, /module: "EVENT_PERSON",\s*role: directoryRoleForEventPerson\(person\.role\),/);
  assert.match(backfill, /"SPEAKER_MODULE", "Speakers module"/);
  assert.match(backfill, /"SEATING_MODULE", "Seating module"/);
  assert.match(backfill, /"STAFFING_MODULE", "Staffing module"/);
});

test("EventPerson roles preserve speaker, staff, and vendor meaning exactly", () => {
  assert.equal(directoryRoleForEventPerson(EventPersonRole.SPEAKER), "SPEAKER");
  assert.equal(directoryRoleForEventPerson(EventPersonRole.STAFF), "STAFF");
  assert.equal(directoryRoleForEventPerson(EventPersonRole.VENDOR), "VENDOR");
});

test("only an exact module link is reused; email similarity never auto-merges", () => {
  const start = backfill.indexOf("async function backfillModuleRecord");
  const body = backfill.slice(start, backfill.indexOf("async function resolveEventScope"));
  assert.match(body, /eventDirectoryModuleLink\.findUnique/);
  assert.match(body, /records were kept distinct for review/);
  assert.match(body, /status: EventDirectoryPersonStatus = possibleDuplicate \? "NEEDS_REVIEW" : "ACTIVE"/);
  assert.doesNotMatch(body, /personId = matched\.id/);
});

test("aggregation is explicit, write-authorized, and never runs from GET", () => {
  assert.match(backfill, /export async function aggregateEventDirectoryForEvent/);
  assert.match(backfill, /assertEventAccessForUser\(args\.eventId, args\.user, "write"\)/);
});

test("backfill never mutates the source module records (read-only on Speaker/Seating/EventPerson)", () => {
  assert.doesNotMatch(backfill, /\.speaker\.(update|create|delete|updateMany|deleteMany)/);
  assert.doesNotMatch(backfill, /\.seatingAttendee\.(update|create|delete|updateMany|deleteMany)/);
  assert.doesNotMatch(backfill, /\.eventPerson\.(update|create|delete|updateMany|deleteMany)/);
  assert.match(backfill, /\.speaker\.findMany/);
  assert.match(backfill, /\.seatingAttendee\.findMany/);
  assert.match(backfill, /\.eventPerson\.findMany/);
});

test("a runnable, repeatable backfill script exists", () => {
  assert.ok(existsSync("scripts/backfill-event-directory.ts"));
  const script = readFileSync("scripts/backfill-event-directory.ts", "utf8");
  assert.match(script, /backfillEventDirectoryForEvent/);
  assert.match(script, /Idempotent/i);
  assert.match(script, /EVENT_ID|ALL_EVENTS/);
});
