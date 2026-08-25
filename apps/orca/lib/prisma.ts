import { getPrisma as getServerPrisma } from "@/src/server/db/prisma";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";

let loggedDatasourceInfo = false;

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

export function getPrisma() {
  if (!loggedDatasourceInfo) {
    if (!shouldQuietE2ERoutineLogs()) {
      console.info("[prisma/lib] getPrisma requested", describeDatasource(process.env.DATABASE_URL));
    }
    loggedDatasourceInfo = true;
  }
  return getServerPrisma();
}
