import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PIPEDRIVE_CALLBACK_PATH,
  normalizePipedriveRedirectUri,
  resolvePipedriveDeploymentEnvironment,
  resolvePipedriveOAuthConfigCore as requirePipedriveOAuthConfig
} from "../lib/integrations/pipedrive/oauth-client-core";

const PRODUCTION_REDIRECT_URI = "https://lr.signalthread.ai/api/integrations/pipedrive/callback";

function baseEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    PIPEDRIVE_CLIENT_ID: "client-id",
    PIPEDRIVE_CLIENT_SECRET: "client-secret",
    PIPEDRIVE_REDIRECT_URI: PRODUCTION_REDIRECT_URI,
    ...overrides
  };
}

test("deployment environment prefers VERCEL_ENV and falls back to NODE_ENV", () => {
  assert.equal(resolvePipedriveDeploymentEnvironment({ VERCEL_ENV: "production" }), "production");
  assert.equal(resolvePipedriveDeploymentEnvironment({ VERCEL_ENV: "preview" }), "preview");
  assert.equal(
    resolvePipedriveDeploymentEnvironment({ VERCEL_ENV: "preview", NODE_ENV: "production" }),
    "preview"
  );
  assert.equal(resolvePipedriveDeploymentEnvironment({ NODE_ENV: "production" }), "production");
  assert.equal(resolvePipedriveDeploymentEnvironment({}), "development");
});

test("production builds exactly one canonical Pipedrive callback URI", () => {
  const config = requirePipedriveOAuthConfig(baseEnvironment({ VERCEL_ENV: "production" }));
  assert.equal(config.redirectUri, PRODUCTION_REDIRECT_URI);
  assert.equal(new URL(config.redirectUri).pathname, PIPEDRIVE_CALLBACK_PATH);

  // Trailing slash, query, and fragment drift are the documented causes of
  // Pipedrive's "Redirect URI match failed"; they must never reach the provider.
  for (const drift of [
    `${PRODUCTION_REDIRECT_URI}/`,
    `${PRODUCTION_REDIRECT_URI}?next=1`,
    `${PRODUCTION_REDIRECT_URI}#done`
  ]) {
    assert.throws(
      () => normalizePipedriveRedirectUri({ redirectUri: drift, deployment: "production" }),
      /PIPEDRIVE_REDIRECT_URI/
    );
  }
});

test("production and preview refuse localhost, plaintext, and per-deployment origins", () => {
  for (const deployment of ["production", "preview"] as const) {
    assert.throws(
      () =>
        normalizePipedriveRedirectUri({
          redirectUri: `http://localhost:3000${PIPEDRIVE_CALLBACK_PATH}`,
          deployment
        }),
      /must use HTTPS/
    );
    assert.throws(
      () =>
        normalizePipedriveRedirectUri({
          redirectUri: `https://localhost:3000${PIPEDRIVE_CALLBACK_PATH}`,
          deployment
        }),
      /must not target localhost/
    );
  }

  assert.throws(
    () =>
      normalizePipedriveRedirectUri({
        redirectUri: `https://lr-git-feature.vercel.app${PIPEDRIVE_CALLBACK_PATH}`,
        deployment: "production"
      }),
    /stable production domain/
  );
  // A preview deployment legitimately registers its own stable preview host.
  assert.equal(
    normalizePipedriveRedirectUri({
      redirectUri: `https://lr-preview.example.com${PIPEDRIVE_CALLBACK_PATH}`,
      deployment: "preview"
    }),
    `https://lr-preview.example.com${PIPEDRIVE_CALLBACK_PATH}`
  );
});

test("local development keeps the http localhost callback", () => {
  const config = requirePipedriveOAuthConfig(
    baseEnvironment({ PIPEDRIVE_REDIRECT_URI: `http://localhost:3000${PIPEDRIVE_CALLBACK_PATH}` })
  );
  assert.equal(config.redirectUri, `http://localhost:3000${PIPEDRIVE_CALLBACK_PATH}`);
});

test("missing production configuration fails clearly and names only variables", () => {
  let error: Error | null = null;
  try {
    requirePipedriveOAuthConfig({ VERCEL_ENV: "production", PIPEDRIVE_CLIENT_ID: "client-id" });
  } catch (thrown) {
    error = thrown as Error;
  }
  assert.ok(error, "expected missing production configuration to throw");
  assert.match(error.message, /Pipedrive OAuth is not configured/);
  assert.match(error.message, /PIPEDRIVE_CLIENT_SECRET/);
  assert.match(error.message, /PIPEDRIVE_REDIRECT_URI/);
  assert.equal(error.message.includes("client-id"), false);

  // No silent fallback may substitute a localhost or preview origin.
  assert.throws(
    () => requirePipedriveOAuthConfig({ VERCEL_ENV: "production" }),
    /PIPEDRIVE_REDIRECT_URI/
  );
});

test("wrong callback path and credential-bearing URLs are rejected", () => {
  assert.throws(
    () =>
      normalizePipedriveRedirectUri({
        redirectUri: "https://lr.signalthread.ai/api/integrations/pipedrive/oauth",
        deployment: "production"
      }),
    /path must be exactly/
  );
  assert.throws(
    () =>
      normalizePipedriveRedirectUri({
        redirectUri: `https://user:pass@lr.signalthread.ai${PIPEDRIVE_CALLBACK_PATH}`,
        deployment: "production"
      }),
    /must not embed credentials/
  );
  assert.throws(
    () => normalizePipedriveRedirectUri({ redirectUri: "not-a-url", deployment: "production" }),
    /valid absolute URL/
  );
});

test("documented environment template targets the deployed production host", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, /^PIPEDRIVE_CLIENT_ID=/m);
  assert.match(example, /^PIPEDRIVE_CLIENT_SECRET=/m);
  assert.match(
    example,
    /^PIPEDRIVE_REDIRECT_URI=https:\/\/lr\.signalthread\.ai\/api\/integrations\/pipedrive\/callback$/m
  );
  // lr.signalthread.ai is the deployed app; the apex redirects to marketing.
  assert.equal(
    example.includes("PIPEDRIVE_REDIRECT_URI=https://signalthread.ai/"),
    false
  );
});

test("the callback route path matches the registered redirect URI path", () => {
  const route = readFileSync(
    new URL("../app/api/integrations/pipedrive/callback/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(route, /export async function GET/);
  assert.equal(PIPEDRIVE_CALLBACK_PATH, "/api/integrations/pipedrive/callback");
  // The route file lives at the path Pipedrive is told to call back to.
  assert.equal(route.includes("export async function POST"), false);
});
