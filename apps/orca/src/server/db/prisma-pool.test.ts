import assert from "node:assert/strict";
import test from "node:test";
import { isPrismaTestRuntime, resolvePrismaPoolMax } from "./prisma";

test("Prisma pool permits bounded local concurrency and preserves the production default", () => {
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "development" } as NodeJS.ProcessEnv), 4);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "test" } as NodeJS.ProcessEnv), 4);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "production" } as NodeJS.ProcessEnv), 1);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "production", DATABASE_POOL_MAX: "3" } as NodeJS.ProcessEnv), 3);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "development", DATABASE_POOL_MAX: "0" } as NodeJS.ProcessEnv), 4);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "development", DATABASE_POOL_MAX: "11" } as NodeJS.ProcessEnv), 4);
});

test("Prisma recognizes Node test workers even when NODE_ENV is unset", () => {
  assert.equal(isPrismaTestRuntime({ NODE_TEST_CONTEXT: "child-v8" } as unknown as NodeJS.ProcessEnv), true);
  assert.equal(isPrismaTestRuntime({ NODE_ENV: "test" } as NodeJS.ProcessEnv), true);
  assert.equal(isPrismaTestRuntime({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
});
