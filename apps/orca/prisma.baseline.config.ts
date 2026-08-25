import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Initialisation config for a BRAND-NEW, EMPTY Orca operational database.
 *
 * This config points at `prisma/baseline`, which contains exactly one migration: the
 * reconciled clean current-state baseline. Use it only against an empty database:
 *
 *   DATABASE_URL=<new-empty-db> \
 *     npx prisma migrate deploy --config prisma.baseline.config.ts
 *
 * Migrations authored after the baseline belong in `prisma/baseline` as well, so the new
 * database has one coherent forward-only chain.
 *
 * `prisma.config.ts` now points at this same baseline, so the two configs are equivalent by
 * design -- there is exactly one active migration source. This file is retained as the
 * explicit, self-documenting entry point named throughout the baseline documentation. The
 * pre-baseline chain lives at `test-fixtures/legacy-orca-migrations/` and is never replayed.
 */
export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/baseline",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
