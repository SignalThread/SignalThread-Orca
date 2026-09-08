import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("redeem route: invite_codes.used_at update runs only after membership + activation loop", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  const idxGrant = src.indexOf("for (const eventId of grantEventIds)");
  const idxUsed = src.indexOf('.from("invite_codes")', idxGrant);
  assert.ok(idxGrant > 0 && idxUsed > idxGrant, "grant loop must precede invite consumption");
  const idxBulk = src.indexOf("additionalConsumeIds");
  assert.ok(idxBulk < 0 || idxBulk > idxUsed, "bulk consume must not precede primary used_at update");
});

test("claim route: invite_codes.used_at update runs only after membership + activation loop", () => {
  const src = read("app/api/invites/claim/route.ts");
  const idxGrant = src.indexOf("for (const eventId of grantEventIds)");
  const idxUsed = src.indexOf('.from("invite_codes")', idxGrant);
  assert.ok(idxGrant > 0 && idxUsed > idxGrant, "grant loop must precede invite consumption");
});

test("redeem and claim: grantEventIds empty guard before users insert", () => {
  const redeemExecute = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(redeemExecute, /InviteRedeemNoEventsError/);
  const grantCheck = redeemExecute.indexOf("grantEventIds.length === 0");
  const userInsert = redeemExecute.indexOf('.from("users").insert');
  assert.ok(
    grantCheck > 0 && userInsert > grantCheck,
    "invite-redeem-execute: expanded grant list empty guard before users insert"
  );

  for (const rel of ["app/api/invites/claim/route.ts"]) {
    const src = read(rel);
    assert.match(src, /InviteRedeemNoEventsError/);
    const g = src.indexOf("grantEventIds.length === 0");
    const u = src.indexOf('.from("users").insert');
    assert.ok(g > 0 && u > g, `${rel}: expanded grant list empty guard before users insert`);
  }
});

test("shared ensureEventMembership verifies insert/update returned a row", () => {
  const src = read("lib/server/invites/invite-redeem-ensure-event-membership.ts");
  assert.match(src, /\.insert\([\s\S]*?\)\s*\.select\("id"\)/);
  assert.match(src, /Failed creating membership \(no row returned\)/);
  assert.match(src, /Failed updating membership scope \(no row matched\)/);
  assert.match(src, /mergeEventUserPermissionsForInviteRedeem/);
  assert.match(src, /Failed updating membership \(no row matched\)\./);
});
