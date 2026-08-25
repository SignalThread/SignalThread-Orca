import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

export type RequestObservabilityContext = {
  requestId: string;
  route: string;
  method: string;
  startedAt: number;
  userId: string | null;
  queryCount: number;
  retryCount: number;
  errorType: string | null;
  errorMessage: string | null;
  dbErrorClass: string | null;
};

const requestContextStore = new AsyncLocalStorage<RequestObservabilityContext>();

const CONNECTION_ERROR_PATTERNS = [
  /max client connections reached/i,
  /maxclientsinsessionmode/i,
  /too many connections/i,
  /driveradaptererror/i,
  /can't reach database server/i,
  /connection pool/i,
  /connection (was )?terminated/i,
];

function classifyDbMessage(message: string | undefined): string | null {
  if (!message) return null;
  for (const pattern of CONNECTION_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return "db_connection_exhaustion";
    }
  }
  return null;
}

export function classifyDbError(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const byMessage = classifyDbMessage(error.message);
    if (byMessage) return byMessage;
    if (error.code === "P1001") return "db_unreachable";
    if (error.code === "P2024") return "db_pool_timeout";
    return "db_prisma_known_error";
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return classifyDbMessage(error.message) ?? "db_prisma_init_error";
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return "db_prisma_rust_panic";
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return classifyDbMessage(error.message) ?? "db_prisma_unknown_error";
  }

  if (error instanceof Error) {
    return classifyDbMessage(error.message);
  }

  return null;
}

export function getRequestIdFromHeaders(headers: Headers): string {
  const headerRequestId = headers.get("x-request-id")?.trim();
  if (headerRequestId) return headerRequestId;
  return randomUUID();
}

export function runWithRequestContext<T>(context: RequestObservabilityContext, work: () => Promise<T>): Promise<T> {
  return requestContextStore.run(context, work);
}

export function getRequestContext(): RequestObservabilityContext | null {
  return requestContextStore.getStore() ?? null;
}

export function setRequestUserId(userId: string | null): void {
  const context = requestContextStore.getStore();
  if (!context || !userId) return;
  context.userId = userId;
}

export function incrementRequestQueryCount(): void {
  const context = requestContextStore.getStore();
  if (!context) return;
  context.queryCount += 1;
}

export function getRequestQueryCount(): number {
  const context = requestContextStore.getStore();
  return context?.queryCount ?? 0;
}

export function recordRequestError(error: unknown): void {
  const context = requestContextStore.getStore();
  if (!context) return;

  if (error instanceof Error) {
    context.errorType = error.name || "Error";
    context.errorMessage = error.message;
  } else {
    context.errorType = typeof error;
    context.errorMessage = String(error);
  }

  context.dbErrorClass = classifyDbError(error);
}

