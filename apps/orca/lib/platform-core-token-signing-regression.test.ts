/**
 * Platform Core migration, Phase 1 — token/signing safety.
 *
 * Speaker intake/portal links are public, identity-independent HMAC tokens. They used to
 * be signed with `SUPABASE_SERVICE_ROLE_KEY`, which meant repointing authentication at
 * Platform Core would silently invalidate every outstanding link.
 *
 * These tests pin the separation: new tokens are signed with a product-owned secret, and
 * tokens minted under the legacy auth-authority key keep verifying.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ProductTokenSecretError,
  resolveSpeakerIntakeTokenSecrets,
  __resetProductTokenSecretWarnings,
} from "@/src/server/security/product-token-secrets";
import {
  SpeakerIntakeTokenError,
  createSpeakerIntakeToken,
  verifySpeakerIntakeToken,
} from "@/src/server/services/speaker-intake";

const speakerIntakeSource = readFileSync("src/server/services/speaker-intake.ts", "utf8");
const secretsSource = readFileSync("src/server/security/product-token-secrets.ts", "utf8");

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SPEAKER_ID = "22222222-2222-4222-8222-222222222222";

const LEGACY_SERVICE_ROLE_KEY = "legacy-orca-service-role-key";
const PRODUCT_SECRET = "product-owned-speaker-intake-secret";
const UNRELATED_SECRET = "an-unrelated-platform-core-service-role-key";

const MANAGED_KEYS = [
  "SPEAKER_INTAKE_TOKEN_SECRET",
  "SPEAKER_INTAKE_TOKEN_SECRET_PREVIOUS",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function withSecrets<T>(overrides: Partial<Record<(typeof MANAGED_KEYS)[number], string>>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of MANAGED_KEYS) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __resetProductTokenSecretWarnings();
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetProductTokenSecretWarnings();
  }
}

// --- Source-level guarantees --------------------------------------------------

test("speaker intake no longer reads the auth-authority key directly", () => {
  assert.equal(
    speakerIntakeSource.includes("SUPABASE_SERVICE_ROLE_KEY"),
    false,
    "the token service must not reach for the auth-authority key itself",
  );
  assert.equal(speakerIntakeSource.includes("resolveSpeakerIntakeTokenSecrets"), true);
});

test("signing uses exactly one secret while verification accepts legacy secrets", () => {
  assert.equal(
    speakerIntakeSource.includes("return signWith(getSpeakerIntakeSecrets().signing, input);"),
    true,
    "new tokens are signed with the signing secret only",
  );
  assert.equal(
    speakerIntakeSource.includes("verification.some((secret) =>"),
    true,
    "verification sweeps the accepted secrets",
  );
  // The legacy auth-authority key is verification-only in the resolver.
  const resolver = secretsSource.slice(secretsSource.indexOf("export function resolveSpeakerIntakeTokenSecrets"));
  assert.equal(resolver.includes("verification: dedupe([signing, previousSecret, legacyAuthAuthoritySecret])"), true);
});

// --- Secret resolution behaviour ----------------------------------------------

test("the product-owned secret wins over the legacy auth-authority key", () => {
  withSecrets(
    { SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET, SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_ROLE_KEY },
    () => {
      const resolved = resolveSpeakerIntakeTokenSecrets();
      assert.equal(resolved.signing, PRODUCT_SECRET);
      assert.equal(resolved.usesLegacyAuthAuthoritySecret, false);
      assert.deepEqual([...resolved.verification], [PRODUCT_SECRET, LEGACY_SERVICE_ROLE_KEY]);
    },
  );
});

test("without a product secret, signing still works but is flagged as legacy", () => {
  withSecrets({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_ROLE_KEY }, () => {
    const resolved = resolveSpeakerIntakeTokenSecrets();
    assert.equal(resolved.signing, LEGACY_SERVICE_ROLE_KEY);
    assert.equal(resolved.usesLegacyAuthAuthoritySecret, true);
  });
});

test("with no secret at all, token operations fail loudly", () => {
  withSecrets({}, () => {
    assert.throws(() => resolveSpeakerIntakeTokenSecrets(), ProductTokenSecretError);
    assert.throws(
      () => createSpeakerIntakeToken({ eventId: EVENT_ID, speakerId: SPEAKER_ID }),
      SpeakerIntakeTokenError,
    );
  });
});

// --- The behaviour this phase exists to protect --------------------------------

test("links minted under the legacy auth-authority key survive the Platform Core cutover", () => {
  // Before: the only secret was the Orca service-role key.
  const legacyToken = withSecrets({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_ROLE_KEY }, () =>
    createSpeakerIntakeToken({ eventId: EVENT_ID, speakerId: SPEAKER_ID }),
  );

  // After: a product secret is set and the auth authority moved to Platform Core, so the
  // Orca service-role key is no longer the signing secret — but is still accepted.
  withSecrets(
    { SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET, SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_ROLE_KEY },
    () => {
      const payload = verifySpeakerIntakeToken(legacyToken.token);
      assert.equal(payload.eventId, EVENT_ID);
      assert.equal(payload.speakerId, SPEAKER_ID);
    },
  );
});

test("an explicitly rotated-out secret still verifies through the previous slot", () => {
  const oldToken = withSecrets({ SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET }, () =>
    createSpeakerIntakeToken({ eventId: EVENT_ID, speakerId: SPEAKER_ID }),
  );

  withSecrets(
    {
      SPEAKER_INTAKE_TOKEN_SECRET: "rotated-product-secret",
      SPEAKER_INTAKE_TOKEN_SECRET_PREVIOUS: PRODUCT_SECRET,
    },
    () => {
      const payload = verifySpeakerIntakeToken(oldToken.token);
      assert.equal(payload.speakerId, SPEAKER_ID);
    },
  );
});

test("a token signed under an unrelated secret is still rejected", () => {
  const foreignToken = withSecrets({ SPEAKER_INTAKE_TOKEN_SECRET: UNRELATED_SECRET }, () =>
    createSpeakerIntakeToken({ eventId: EVENT_ID, speakerId: SPEAKER_ID }),
  );

  withSecrets(
    { SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET, SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_ROLE_KEY },
    () => {
      assert.throws(() => verifySpeakerIntakeToken(foreignToken.token), SpeakerIntakeTokenError);
    },
  );
});

test("a tampered payload is rejected under every accepted secret", () => {
  withSecrets(
    { SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET, SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_ROLE_KEY },
    () => {
      const { token } = createSpeakerIntakeToken({ eventId: EVENT_ID, speakerId: SPEAKER_ID });
      const [, signature] = token.split(".");
      const forgedPayload = Buffer.from(
        JSON.stringify({
          v: 1,
          eventId: "33333333-3333-4333-8333-333333333333",
          speakerId: SPEAKER_ID,
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      ).toString("base64url");

      assert.throws(() => verifySpeakerIntakeToken(`${forgedPayload}.${signature}`), SpeakerIntakeTokenError);
    },
  );
});

test("round-tripping under the product secret preserves the event and speaker scope", () => {
  withSecrets({ SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET }, () => {
    const { token, expiresAt } = createSpeakerIntakeToken({
      eventId: EVENT_ID,
      speakerId: SPEAKER_ID,
      expiresInSeconds: 3600,
    });
    const payload = verifySpeakerIntakeToken(token);
    assert.equal(payload.eventId, EVENT_ID);
    assert.equal(payload.speakerId, SPEAKER_ID);
    assert.equal(new Date(expiresAt).getTime() > Date.now(), true);
  });
});

test("expired links are rejected even when the signature is valid", () => {
  withSecrets({ SPEAKER_INTAKE_TOKEN_SECRET: PRODUCT_SECRET }, () => {
    const { token } = createSpeakerIntakeToken({
      eventId: EVENT_ID,
      speakerId: SPEAKER_ID,
      expiresInSeconds: -1,
    });
    assert.throws(() => verifySpeakerIntakeToken(token), /expired/i);
  });
});

test("the marketing unsubscribe secret was already independent and stays that way", () => {
  const unsubscribeSource = readFileSync("src/server/services/marketing-unsubscribe.ts", "utf8");
  assert.equal(unsubscribeSource.includes("MARKETING_UNSUBSCRIBE_TOKEN_SECRET"), true);
  assert.equal(unsubscribeSource.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
});
