import assert from "node:assert/strict";
import test from "node:test";
import { resolvePrismaPoolMax } from "./prisma";

test("Prisma pool permits bounded local concurrency and preserves the production default", () => {
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "development" } as NodeJS.ProcessEnv), 4);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "test" } as NodeJS.ProcessEnv), 4);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "production" } as NodeJS.ProcessEnv), 1);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "production", DATABASE_POOL_MAX: "3" } as NodeJS.ProcessEnv), 3);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "development", DATABASE_POOL_MAX: "0" } as NodeJS.ProcessEnv), 4);
  assert.equal(resolvePrismaPoolMax({ NODE_ENV: "development", DATABASE_POOL_MAX: "11" } as NodeJS.ProcessEnv), 4);
});
