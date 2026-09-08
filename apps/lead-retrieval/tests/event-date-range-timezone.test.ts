import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";

/**
 * formatEventDateRange must treat date-only DB values (YYYY-MM-DD) as calendar
 * dates — never shifting a day with the process timezone — while real
 * timestamps keep instant-based local formatting.
 *
 * Deterministic technique: each case runs in an isolated child process with an
 * explicit TZ, so results never depend on this machine's timezone.
 */

const CHILD_SCRIPT = `
const { formatEventDateRange } = require("./lib/data/admin-events.ts");
process.stdout.write(JSON.stringify({
  range: formatEventDateRange("2026-07-18", "2026-07-20"),
  startOnly: formatEventDateRange("2026-07-18", null),
  timestamp: formatEventDateRange("2026-07-18T04:00:00.000Z", null)
}));
`;

function formatInTimeZone(tz: string): { range: string; startOnly: string; timestamp: string } {
  const res = spawnSync(process.execPath, ["--import", "tsx", "--eval", CHILD_SCRIPT], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: tz },
    encoding: "utf8"
  });
  assert.equal(res.status, 0, `child process failed in TZ=${tz}: ${res.stderr}`);
  const out = res.stdout.trim();
  const jsonStart = out.indexOf("{");
  assert.ok(jsonStart >= 0, `no JSON output in TZ=${tz}: ${out}`);
  return JSON.parse(out.slice(jsonStart));
}

describe("formatEventDateRange — date-only values are calendar dates", () => {
  it("2026-07-18 renders as Jul 18 in America/New_York", () => {
    const r = formatInTimeZone("America/New_York");
    assert.equal(r.range, "Jul 18, 2026 – Jul 20, 2026");
    assert.equal(r.startOnly, "Jul 18, 2026 (end TBD)");
  });

  it("2026-07-18 renders as Jul 18 in America/Los_Angeles (no day shift)", () => {
    const r = formatInTimeZone("America/Los_Angeles");
    assert.equal(r.range, "Jul 18, 2026 – Jul 20, 2026");
    assert.equal(r.startOnly, "Jul 18, 2026 (end TBD)");
  });
});

describe("formatEventDateRange — real timestamps keep instant semantics", () => {
  it("2026-07-18T04:00:00Z is Jul 18 at midnight Eastern", () => {
    const r = formatInTimeZone("America/New_York");
    assert.equal(r.timestamp, "Jul 18, 2026 (end TBD)");
  });

  it("2026-07-18T04:00:00Z is still the evening of Jul 17 Pacific", () => {
    const r = formatInTimeZone("America/Los_Angeles");
    assert.equal(r.timestamp, "Jul 17, 2026 (end TBD)");
  });
});
