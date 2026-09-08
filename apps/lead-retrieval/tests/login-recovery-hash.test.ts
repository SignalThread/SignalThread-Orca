import test from "node:test";
import assert from "node:assert/strict";
import { isRecoveryHash, parseRecoveryHash } from "../app/(public)/login/recovery-hash";

test("parseRecoveryHash returns null for empty/invalid input", () => {
  assert.equal(parseRecoveryHash(""), null);
  assert.equal(parseRecoveryHash(null), null);
  assert.equal(parseRecoveryHash(undefined), null);
  assert.equal(parseRecoveryHash("#"), null);
  assert.equal(parseRecoveryHash("#type=signup&access_token=a&refresh_token=b"), null);
  assert.equal(parseRecoveryHash("?type=recovery&access_token=a&refresh_token=b"), null);
});

test("parseRecoveryHash extracts tokens when type=recovery with leading #", () => {
  const parsed = parseRecoveryHash(
    "#access_token=AT-123&refresh_token=RT-456&type=recovery&expires_in=3600"
  );
  assert.deepEqual(parsed, {
    type: "recovery",
    accessToken: "AT-123",
    refreshToken: "RT-456"
  });
});

test("parseRecoveryHash extracts tokens without leading #", () => {
  const parsed = parseRecoveryHash(
    "type=recovery&access_token=abc.def.ghi&refresh_token=xyz.uvw"
  );
  assert.deepEqual(parsed, {
    type: "recovery",
    accessToken: "abc.def.ghi",
    refreshToken: "xyz.uvw"
  });
});

test("parseRecoveryHash rejects recovery hash with missing tokens", () => {
  assert.equal(parseRecoveryHash("#type=recovery"), null);
  assert.equal(parseRecoveryHash("#type=recovery&access_token=a"), null);
  assert.equal(parseRecoveryHash("#type=recovery&refresh_token=b"), null);
  assert.equal(parseRecoveryHash("#type=recovery&access_token=&refresh_token="), null);
});

test("parseRecoveryHash is case-insensitive for the type param", () => {
  const parsed = parseRecoveryHash(
    "#type=Recovery&access_token=AT&refresh_token=RT"
  );
  assert.deepEqual(parsed, {
    type: "recovery",
    accessToken: "AT",
    refreshToken: "RT"
  });
});

test("parseRecoveryHash handles URL-encoded tokens", () => {
  const parsed = parseRecoveryHash(
    "#type=recovery&access_token=foo%2Bbar&refresh_token=baz%2Fqux"
  );
  assert.deepEqual(parsed, {
    type: "recovery",
    accessToken: "foo+bar",
    refreshToken: "baz/qux"
  });
});

test("isRecoveryHash flags the recovery intent even if tokens are missing", () => {
  assert.equal(isRecoveryHash("#type=recovery"), true);
  assert.equal(isRecoveryHash("type=recovery&access_token=a&refresh_token=b"), true);
  assert.equal(isRecoveryHash("#error=access_denied&error_description=link+expired"), false);
  assert.equal(isRecoveryHash(""), false);
  assert.equal(isRecoveryHash(null), false);
});
