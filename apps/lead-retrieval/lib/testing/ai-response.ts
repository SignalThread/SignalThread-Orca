/**
 * Seam 8 — controllable AI response layer (plan §77, §70).
 *
 * Plan §70's highest-severity assertion is not output quality, it is **what data
 * entered the prompt**. Proving that a generated briefing contains only the target
 * lead, its event and its company requires capturing the assembled prompt, which needs
 * a seam at the model boundary.
 *
 * It also makes the §70 failure matrix reachable: refusal, malformed non-JSON
 * response, rate limit, and timeout are all states a real provider produces rarely and
 * unpredictably, and a retry-does-not-double-charge assertion needs them on demand.
 *
 * With seams off, `captureAndMaybeStub` returns undefined and the caller proceeds to
 * the real OpenAI client. Prompt assembly is never altered — only observed.
 */
import { seamsEnabled } from "./seam-policy";

export type CapturedPrompt = {
  /** Which generated artifact this prompt produces, e.g. "campaign-draft". */
  operation: string;
  model: string;
  /** The fully assembled messages, exactly as they would be sent. */
  messages: ReadonlyArray<{ role: string; content: string }>;
  /** Non-sensitive scope, for asserting the prompt stayed inside it. */
  scope?: { companyId?: string; eventId?: string; leadId?: string };
};

export type StubbedResponse =
  | { kind: "content"; content: string }
  | { kind: "refusal"; reason?: string }
  | { kind: "malformed"; body: string }
  | { kind: "rate-limit" }
  | { kind: "timeout" }
  | { kind: "error"; status: number; message?: string };

export class AiStubError extends Error {
  readonly injected = true as const;
  constructor(readonly kind: StubbedResponse["kind"], message: string, readonly status?: number) {
    super(message);
    this.name = "AiStubError";
  }
}

let captured: CapturedPrompt[] = [];
let responses: StubbedResponse[] = [];
let repeatLast = false;

/**
 * Called by the model client immediately before dispatch.
 *
 * Returns a stubbed response to use *instead of* calling the provider, or `undefined`
 * to proceed normally. Capture happens whenever seams are on, even with no stub armed,
 * so prompt-scope assertions can run against real generation.
 */
export function captureAndMaybeStub(prompt: CapturedPrompt): StubbedResponse | undefined {
  if (!seamsEnabled()) return undefined;
  captured.push(prompt);
  if (responses.length === 0) return undefined;
  return responses.length === 1 && repeatLast ? responses[0] : responses.shift();
}

/** Turn a stubbed response into the throw or value the client should produce. */
export function materializeStub(stub: StubbedResponse): string {
  switch (stub.kind) {
    case "content":
      return stub.content;
    case "refusal":
      throw new AiStubError("refusal", stub.reason ?? "The model refused to produce this content.");
    case "malformed":
      return stub.body;
    case "rate-limit":
      throw new AiStubError("rate-limit", "Rate limit exceeded.", 429);
    case "timeout":
      throw new AiStubError("timeout", "The model request timed out.", 504);
    case "error":
      throw new AiStubError("error", stub.message ?? `Model returned ${stub.status}.`, stub.status);
  }
}

// ── test-only controls ─────────────────────────────────────────────────────────────

/** Queue responses, consumed in order. No-op unless seams are enabled. */
export function stubAiResponses(...queued: StubbedResponse[]): () => void {
  if (!seamsEnabled()) return () => {};
  responses = [...queued];
  repeatLast = false;
  return () => { responses = []; };
}

/** Always answer with the same response, e.g. to prove a retry does not double-charge. */
export function stubAiResponseAlways(response: StubbedResponse): () => void {
  if (!seamsEnabled()) return () => {};
  responses = [response];
  repeatLast = true;
  return () => { responses = []; repeatLast = false; };
}

/** Every prompt assembled since the last reset. */
export function capturedPrompts(): readonly CapturedPrompt[] {
  return captured;
}

export function lastPrompt(): CapturedPrompt | null {
  return captured.length ? captured[captured.length - 1] : null;
}

export function resetAiSeam(): void {
  captured = [];
  responses = [];
  repeatLast = false;
}

/** Full prompt text, for scope-leak assertions. */
export function promptText(prompt: CapturedPrompt): string {
  return prompt.messages.map((m) => m.content).join("\n");
}

/**
 * Throw if a prompt contains any forbidden string — another company's name, another
 * event's lead, a token. The core §70 assertion.
 */
export function assertPromptExcludes(prompt: CapturedPrompt, forbidden: readonly string[]): void {
  const text = promptText(prompt).toLowerCase();
  const found = forbidden.filter((f) => f && text.includes(f.toLowerCase()));
  if (found.length) {
    throw new Error(
      `Assembled prompt for "${prompt.operation}" contains ${found.length} out-of-scope value(s): ` +
        found.map((f) => JSON.stringify(f)).join(", ")
    );
  }
}
