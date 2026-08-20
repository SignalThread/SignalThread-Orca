import {
  getRequestContext,
  getRequestIdFromHeaders,
  recordRequestError,
  runWithRequestContext,
  type RequestObservabilityContext,
} from "@/lib/observability/request-context";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";

type RouteContext = { params?: Promise<Record<string, string | string[]>> } | undefined;
type RouteHandler<TRequest extends Request, TContext extends RouteContext> = (
  request: TRequest,
  context: TContext,
) => Promise<Response>;
type NoContextRouteHandler<TRequest extends Request> = (request: TRequest) => Promise<Response>;

const SLOW_REQUEST_THRESHOLD_MS = 1500;
const HIGH_QUERY_THRESHOLD = 30;

function logRequestStarted(context: RequestObservabilityContext): void {
  if (shouldQuietE2ERoutineLogs()) return;

  console.info("api.request.started", {
    route: context.route,
    requestId: context.requestId,
    method: context.method,
  });
}

function logRequestCompleted(context: RequestObservabilityContext, status: number): void {
  const durationMs = Date.now() - context.startedAt;
  const failed = status >= 400 || Boolean(context.errorType);
  const slow = durationMs >= SLOW_REQUEST_THRESHOLD_MS;
  const highQueryCount = context.queryCount >= HIGH_QUERY_THRESHOLD;
  const quietRoutineLogs = shouldQuietE2ERoutineLogs();
  const shouldWarn = failed || context.dbErrorClass || (!quietRoutineLogs && (slow || highQueryCount));
  const logLevel = shouldWarn ? "warn" : "info";
  const basePayload = {
    route: context.route,
    requestId: context.requestId,
    method: context.method,
    userId: context.userId,
    status,
    durationMs,
    queryCount: context.queryCount,
    success: !failed,
    slow,
    highQueryCount,
    retryCount: context.retryCount,
    errorType: context.errorType,
    errorMessage: context.errorMessage,
    dbErrorClass: context.dbErrorClass,
  };

  if (logLevel === "warn") {
    console.warn("api.request.completed", basePayload);
  } else if (!quietRoutineLogs) {
    console.info("api.request.completed", basePayload);
  }
}

function withRequestIdHeader(response: Response, requestId: string): Response {
  try {
    response.headers.set("x-request-id", requestId);
  } catch {
    // Ignore header mutation errors.
  }
  return response;
}

// Overload 1: handlers that consume neither `request` nor a route `context` (e.g. disabled
// routes returning a static response). These infer no `TContext`, so the generic form would
// otherwise fall back to `RouteContext` (which includes `undefined`) and produce a second
// parameter that Next 16's generated route validator rejects. Returning a single-argument
// handler keeps the exported route signature valid without altering any call site.
export function withApiRequestLogging<TRequest extends Request = Request>(
  route: string,
  handler: () => Promise<Response>,
): NoContextRouteHandler<TRequest>;
// Overload 2: request(+context) handlers. Dynamic routes infer a concrete
// `{ params: Promise<...> }` context; request-only routes that re-export via
// `handler(request, undefined)` continue to resolve here with `TContext = RouteContext`.
export function withApiRequestLogging<TRequest extends Request, TContext extends RouteContext>(
  route: string,
  handler: RouteHandler<TRequest, TContext>,
): RouteHandler<TRequest, TContext>;
export function withApiRequestLogging<TRequest extends Request, TContext extends RouteContext>(
  route: string,
  handler: (request: TRequest, context?: TContext) => Promise<Response>,
): (request: TRequest, context?: TContext) => Promise<Response> {
  return async (request: TRequest, context?: TContext) => {
    const requestId = getRequestIdFromHeaders(request.headers);
    const ctx: RequestObservabilityContext = {
      requestId,
      route,
      method: request.method || "UNKNOWN",
      startedAt: Date.now(),
      userId: null,
      queryCount: 0,
      retryCount: 0,
      errorType: null,
      errorMessage: null,
      dbErrorClass: null,
    };

    return runWithRequestContext(ctx, async () => {
      logRequestStarted(ctx);

      try {
        const response = await handler(request, context);
        if (response.status >= 400 && !ctx.errorType) {
          recordRequestError(new Error(`HTTP_${response.status}`));
        }
        logRequestCompleted(ctx, response.status);
        return withRequestIdHeader(response, requestId);
      } catch (error) {
        recordRequestError(error);
        logRequestCompleted(getRequestContext() ?? ctx, 500);
        throw error;
      }
    });
  };
}

export function observeHandledRouteError(error: unknown): void {
  recordRequestError(error);
}
