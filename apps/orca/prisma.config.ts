import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env.local" });
loadEnv();

/**
 * The single active Orca Prisma config.
 *
 * `migrations.path` deliberately points at `prisma/baseline`, the one clean current-state
 * baseline, and NOT at the pre-baseline chain. That chain now lives at
 * `test-fixtures/legacy-orca-migrations/` and is historical evidence plus regression
 * fixtures only -- the schema-truth audit established it cannot reliably reconstruct the
 * current schema. It previously sat at `prisma/migrations`, where this config pointed at
 * it, so a plain `prisma migrate deploy` would have replayed it against a database.
 */
export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/baseline",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
