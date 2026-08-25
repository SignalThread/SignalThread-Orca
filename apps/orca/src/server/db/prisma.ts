import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { classifyDbError, getRequestContext, incrementRequestQueryCount, recordRequestError } from "@/lib/observability/request-context";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";

const globalForPrisma = globalThis as unknown as {
  __plannerWebPrisma?: PrismaClient;
  __plannerWebPrismaAdapter?: PrismaPg;
  __plannerWebPrismaInitLogged?: boolean;
};

function describeDatasource(value: string | undefined): { source: string; host: string | null; database: string | null } {
  const raw = value?.trim();
  if (!raw) {
    return {
      source: "DATABASE_URL_MISSING",
      host: null,
      database: null,
    };
  }

  try {
    const parsed = new URL(raw);
    return {
      source: "DATABASE_URL",
      host: parsed.host || null,
      database: parsed.pathname.replace(/^\//, "") || null,
    };
  } catch {
    return {
      source: "DATABASE_URL_INVALID",
      host: null,
      database: null,
    };
  }
}

function createInstrumentedPrismaClient(adapter: PrismaPg): PrismaClient {
  const client = new PrismaClient({ adapter });
  const extended = client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        incrementRequestQueryCount();
        const startedAt = Date.now();
        try {
          const result = await query(args);
          if (process.env.PRISMA_QUERY_TIMINGS === "1") {
            const context = getRequestContext();
            console.info("db.query.completed", {
              requestId: context?.requestId ?? null,
              route: context?.route ?? null,
              model: model ?? "raw",
              operation,
              durationMs: Date.now() - startedAt,
              queryCount: context?.queryCount ?? null,
            });
          }
          return result;
        } catch (error) {
          recordRequestError(error);
          const context = getRequestContext();
          const dbErrorClass = classifyDbError(error);
          if (context && dbErrorClass) {
            console.error("db.query.failed", {
              requestId: context.requestId,
              route: context.route,
              model: model ?? "raw",
              operation,
              durationMs: Date.now() - startedAt,
              queryCountAtFailure: context.queryCount,
              dbErrorClass,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          throw error;
        }
      },
    },
  });

  return extended as unknown as PrismaClient;
}

export function resolvePrismaPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number.parseInt(env.DATABASE_POOL_MAX?.trim() ?? "", 10);
  if (Number.isFinite(configured) && configured >= 1 && configured <= 10) return configured;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? 4 : 1;
}

function createPrismaAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({
    connectionString,
    // Vercel can keep several warm function instances alive. Keep each instance's
    // production pool intentionally small. Local/test workspaces need bounded
    // concurrency so independent session-module reads do not serialize behind one socket.
    max: resolvePrismaPoolMax(),
  });
}

export function getPrisma(): PrismaClient {
  const hasTimelineDelegates = (client: PrismaClient): boolean =>
    Boolean(
      (client as unknown as Record<string, unknown>).timelineItem &&
        (client as unknown as Record<string, unknown>).timelineDependency,
    );

  if (!globalForPrisma.__plannerWebPrisma) {
    const datasourceUrl = process.env.DATABASE_URL?.trim();
    if (!datasourceUrl) {
      throw new Error("DATABASE_URL is required to initialize PrismaClient at runtime.");
    }

    if (!globalForPrisma.__plannerWebPrismaInitLogged) {
      const descriptor = describeDatasource(datasourceUrl);
      if (!shouldQuietE2ERoutineLogs()) {
        console.info("[prisma/db] initializing PrismaClient", descriptor);
      }
      globalForPrisma.__plannerWebPrismaInitLogged = true;
    }

    const adapter =
      globalForPrisma.__plannerWebPrismaAdapter ??
      createPrismaAdapter(datasourceUrl);
    globalForPrisma.__plannerWebPrismaAdapter = adapter;
    globalForPrisma.__plannerWebPrisma = createInstrumentedPrismaClient(adapter);

    if (!shouldQuietE2ERoutineLogs()) {
      console.info("[prisma/db] prisma delegate availability", {
        timelineItem: hasTimelineDelegates(globalForPrisma.__plannerWebPrisma),
      });
    }
  } else if (!hasTimelineDelegates(globalForPrisma.__plannerWebPrisma)) {
    const datasourceUrl = process.env.DATABASE_URL?.trim();
    if (!datasourceUrl) {
      throw new Error("DATABASE_URL is required to reinitialize PrismaClient at runtime.");
    }

    console.warn(
      "[prisma/db] Reinitializing PrismaClient because timeline delegates are missing on cached instance.",
    );
    const adapter =
      globalForPrisma.__plannerWebPrismaAdapter ??
      createPrismaAdapter(datasourceUrl);
    globalForPrisma.__plannerWebPrismaAdapter = adapter;
    globalForPrisma.__plannerWebPrisma = createInstrumentedPrismaClient(adapter);

    if (!shouldQuietE2ERoutineLogs()) {
      console.info("[prisma/db] prisma delegate availability", {
        timelineItem: hasTimelineDelegates(globalForPrisma.__plannerWebPrisma),
      });
    }
  }
  return globalForPrisma.__plannerWebPrisma;
}
