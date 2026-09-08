/**
 * Seam 6 — request correlation ID threaded UI → API → DB → provider → job
 * (plan §77, §57).
 *
 * Plan §57 assumes a correlation ID already exists. Prompt 1 found it does not: three
 * files mention a `requestId` locally, none propagates one, and no journey can be
 * diagnosed end to end without reproducing it.
 *
 * Unlike the other seams this one is **always active**, because a correlation ID that
 * only exists under a test flag is useless for the thing it is for — diagnosing
 * production. It is nonetheless inert by the standard Prompt 3 means: it adds a header
 * and a log field, changes no control flow, and no code branches on its value.
 *
 * Propagation uses `AsyncLocalStorage`, so a handler does not have to thread the id
 * through every call signature — which would be the broad refactor the brief forbids.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { seamsEnabled } from "./seam-policy";

export const CORRELATION_HEADER = "x-lr-correlation-id";

export type CorrelationContext = {
  correlationId: string;
  /** Where the id came from — an inbound header, or minted here. */
  origin: "inbound" | "generated";
  /** Optional non-sensitive scope for log lines. Never carries PII or tokens. */
  scope?: { companyId?: string; eventId?: string; userId?: string; jobId?: string };
};

const storage = new AsyncLocalStorage<CorrelationContext>();

/** A correlation id is a UUID, or an inbound value that looks like one. */
const ID_SHAPE = /^[a-zA-Z0-9_-]{8,128}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && ID_SHAPE.test(value);
}

/**
 * Adopt an inbound correlation id, or mint one.
 *
 * An inbound value is only trusted for *log correlation*. It is never used for
 * authorization, lookup, or as a database key, so a forged header can at worst group a
 * caller's own log lines together. Prompt 3 constraint: no new auth surface.
 */
export function resolveCorrelationId(inbound: unknown): CorrelationContext {
  if (isValidCorrelationId(inbound)) return { correlationId: inbound, origin: "inbound" };
  return { correlationId: randomUUID(), origin: "generated" };
}

/** Run `fn` inside a correlation context. Every nested await sees the same id. */
export function withCorrelation<T>(context: CorrelationContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Adopt from a request's headers and run. The usual entry point for a route handler. */
export function withCorrelationFromRequest<T>(request: { headers: { get(name: string): string | null } }, fn: () => T): T {
  return withCorrelation(resolveCorrelationId(request.headers.get(CORRELATION_HEADER)), fn);
}

/** The current correlation id, or null outside any context. */
export function currentCorrelationId(): string | null {
  return storage.getStore()?.correlationId ?? null;
}

export function currentCorrelationContext(): CorrelationContext | null {
  return storage.getStore() ?? null;
}

/** Attach non-sensitive scope to the active context, for log lines downstream. */
export function annotateCorrelation(scope: CorrelationContext["scope"]): void {
  const store = storage.getStore();
  if (!store) return;
  store.scope = { ...store.scope, ...scope };
}

/**
 * Headers to propagate outward — to a provider call, a job enqueue, or a response.
 * Always emitted: this is the production diagnostic path, not a test affordance.
 */
export function correlationHeaders(): Record<string, string> {
  const id = currentCorrelationId();
  return id ? { [CORRELATION_HEADER]: id } : {};
}

/** Fields to merge into a structured log line. Never includes PII or tokens. */
export function correlationLogFields(): Record<string, string> {
  const ctx = storage.getStore();
  if (!ctx) return {};
  return {
    correlationId: ctx.correlationId,
    ...(ctx.scope?.companyId ? { companyId: ctx.scope.companyId } : {}),
    ...(ctx.scope?.eventId ? { eventId: ctx.scope.eventId } : {}),
    ...(ctx.scope?.jobId ? { jobId: ctx.scope.jobId } : {}),
  };
}

// ── test-only control ──────────────────────────────────────────────────────────────

/**
 * Pin the correlation id so an end-to-end assertion can follow one known value through
 * every layer. No-op unless seams are enabled — production ids stay unguessable.
 */
export function withFixedCorrelationId<T>(id: string, fn: () => T): T {
  if (!seamsEnabled()) return fn();
  return withCorrelation({ correlationId: id, origin: "generated" }, fn);
}
