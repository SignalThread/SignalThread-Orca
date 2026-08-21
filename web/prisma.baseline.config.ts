import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Initialisation config for a BRAND-NEW, EMPTY Orca operational database.
 *
 * `prisma.config.ts` points at `prisma/migrations`, the legacy 84-migration chain. That
 * chain is retained as historical evidence and as fixtures for schema regression tests,
 * but the schema-truth audit established it cannot reliably reconstruct the current
 * schema, so it must never be replayed to build a database.
 *
 * This config points at `prisma/baseline` instead, which contains exactly one migration:
 * the reconciled clean current-state baseline. Use it only against an empty database:
 *
 *   DATABASE_URL=<new-empty-db> \
 *     npx prisma migrate deploy --config prisma.baseline.config.ts
 *
 * Migrations authored after the baseline belong in `prisma/baseline` as well, so the new
 * database has one coherent forward-only chain.
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
