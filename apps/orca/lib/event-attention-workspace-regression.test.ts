import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/events/[eventId]/ai-workspace/page.tsx", "utf8");
const workspaceSource = readFileSync("app/(shell)/events/[eventId]/ai-workspace/_components/event-attention-workspace.tsx", "utf8");

test("AI Workspace is an event-scoped Operations navigation destination", () => {
  assert.equal(shellSource.includes('label: "AI Workspace"'), true);
  assert.equal(shellSource.includes('href: `/events/${eventId}/ai-workspace`'), true);
  assert.equal(shellSource.includes('"ai-workspace"'), true, "event switching must preserve the AI Workspace route");
  assert.equal(pageSource.includes("getEventHeaderById(eventId)"), true);
  assert.equal(pageSource.includes("notFound()"), true);
});

test("workspace consumes the verified attention GET response without changing its read-only contract", () => {
  assert.equal(workspaceSource.includes('fetch(`/api/events/${eventId}/ai-workspace/attention`'), true);
  assert.equal(workspaceSource.includes("isAttentionResult(payload, eventId)"), true);
  assert.equal(workspaceSource.includes("finding.eventId === eventId"), true, "foreign-event findings must be rejected");
  assert.equal(workspaceSource.includes("setData(payload)"), true);
  assert.equal(workspaceSource.includes("attentionRequestSequence"), true, "event changes and retries must reject stale attention responses");
  assert.equal(workspaceSource.includes("requestId !== attentionRequestSequence.current"), true);
  assert.equal(workspaceSource.includes("setData(null)"), true, "a new event load must clear prior event evidence");
  assert.equal(workspaceSource.includes('key={eventId} eventId={eventId}'), true, "question state must remount for the requested event");
  const loadStart = workspaceSource.indexOf("const load = useCallback");
  const loadEnd = workspaceSource.indexOf("useEffect(() =>", loadStart);
  assert.equal(workspaceSource.slice(loadStart, loadEnd).includes("method: \"POST\""), false);
});

test("workspace renders severity summaries and findings without fabricating unsupported findings", () => {
  for (const label of ["Total findings", "Critical", "Warnings", "Informational", "What Needs Attention?"]) {
    assert.equal(workspaceSource.includes(label), true, `missing ${label}`);
  }
  assert.equal(workspaceSource.includes("data.findings.map"), true);
  assert.equal(workspaceSource.includes("CoverageNote support={data.support}"), true);
  assert.equal(workspaceSource.includes("unsupportedChecks.map"), false, "unsupported checks must not become cards");
  assert.equal(workspaceSource.includes("sourceHref(eventId, source)"), true);
  assert.equal(workspaceSource.includes('source.entityType === "matrix_row"'), true);
  assert.equal(workspaceSource.includes("summarizeFindings(data.findings)"), true, "summary cards must be derived from returned findings");
  assert.equal(workspaceSource.includes("findingsByCategory"), true, "findings must be grouped by category");
  assert.equal(workspaceSource.includes("<details key={group.category}"), true, "non-critical finding groups must be collapsible");
  assert.equal(workspaceSource.includes("open={criticalCount > 0}"), true, "critical groups must remain expanded");
  assert.equal(workspaceSource.includes("findings shown"), true, "the current result count must be visible");
});

test("workspace has accessible loading, healthy empty, and recoverable error states", () => {
  assert.equal(workspaceSource.includes("AttentionSkeleton"), true);
  assert.equal(workspaceSource.includes('aria-label="Loading event attention"'), true);
  assert.equal(workspaceSource.includes("EmptyAttentionState"), true);
  assert.equal(workspaceSource.includes("No actionable issues were found"), true);
  assert.equal(workspaceSource.includes("Unable to load event attention"), true);
  assert.equal(workspaceSource.includes("Try again"), true);
  assert.equal(workspaceSource.includes("response.status === 401 || response.status === 403"), true);
  assert.equal(workspaceSource.includes("response.status === 404"), true);
});

test("workspace layout is responsive and retains semantic labels", () => {
  assert.equal(workspaceSource.includes("grid-cols-2 gap-3 lg:grid-cols-4"), true);
  assert.equal(workspaceSource.includes("min-w-0"), true);
  assert.equal(workspaceSource.includes("aria-label=\"Attention summary\""), true);
  assert.equal(workspaceSource.includes("aria-labelledby=\"attention-findings-heading\""), true);
  assert.equal(workspaceSource.includes("focus:ring-2"), true);
  assert.equal(workspaceSource.includes("rows={2}"), true, "the question input stays multiline while using less vertical space");
  assert.equal(workspaceSource.includes("space-y-4 p-3 sm:p-5"), true, "the event header area must remain compact");
});

test("workspace retrieves and displays deterministic question evidence without a model answer", () => {
  for (const label of [
    "Ask About This Event",
    "Ask a question about this event…",
    "Ask Question",
    "What should I focus on today?",
    "Which sessions are at greatest risk?",
    "What information is still missing?",
    "What deadlines are coming up this week?",
    "Here’s what your event data shows",
    "Based on verified event data",
    "Question type:",
    "Coverage:",
    "Supported",
    "Partially supported",
    "Not currently supported",
    "Relevant evidence",
    "Session evidence",
    "Session F&B status",
    "Sessions with F&B selected",
    "Sessions without required F&B selections",
    "Sessions with unavailable F&B information",
    "Sessions not requiring F&B",
    "Session readiness",
    "Session lookup",
    "F&B selected",
    "F&B not selected",
    "F&B information unavailable",
    "F&B not required",
    "Known limitations",
    "This question is partially supported by the information currently available.",
    "There is not enough verified information to answer this fully.",
    "Supported question categories",
  ]) {
    assert.equal(workspaceSource.includes(label), true, `missing question prompt text: ${label}`);
  }
  assert.equal(workspaceSource.includes("function submitQuestion"), true);
  assert.equal(workspaceSource.includes("event.preventDefault()"), true);
  assert.equal(workspaceSource.includes("setQuestion(example)"), true, "example prompts must populate the input");
  assert.equal(workspaceSource.includes("retrieveQuestionContext(example)"), false, "clicking an example must not submit it");
  assert.equal(workspaceSource.includes("setIsRetrieving(true)"), true, "submission must render a loading state");
  assert.equal(workspaceSource.includes("Retrieving verified event evidence…"), true);
  assert.equal(workspaceSource.includes("setContext(null)"), true, "a repeated submission must replace prior evidence");
  assert.equal(workspaceSource.includes("requestSequence"), true, "stale submissions must not replace newer evidence");
  assert.equal(workspaceSource.includes("new AbortController()"), true, "repeated requests must cancel obsolete retrieval");
  assert.equal(workspaceSource.includes("signal: controller.signal"), true);
  assert.equal(workspaceSource.includes('error.name === "AbortError"'), true, "aborted requests must not surface as errors");
  assert.equal(workspaceSource.includes("activeQuestionRequest.current?.abort()"), true, "in-flight work must be cleaned up");
  assert.equal(workspaceSource.includes("Dismiss question evidence"), true);
  assert.equal(workspaceSource.includes("EventQuestionPrompt key={eventId} eventId={eventId}"), true);
  assert.equal(workspaceSource.includes("w-full resize-y"), true, "question input must fit narrow widths");
  assert.equal(workspaceSource.includes("fetch(`/api/events/${eventId}/ai-workspace/attention`"), true, "existing read-only findings still load");
  const promptStart = workspaceSource.indexOf("function EventQuestionPrompt");
  const promptEnd = workspaceSource.indexOf("function CoverageNote");
  const promptSource = workspaceSource.slice(promptStart, promptEnd);
  assert.equal(promptSource.includes("/api/events/${eventId}/ai-workspace/question-context"), true, "questions must use the read-only context route");
  assert.equal(promptSource.includes('method: "POST"'), true, "questions must submit to the context route");
  assert.equal(promptSource.includes("body: JSON.stringify({ question: questionToSubmit })"), true, "the entered question must be posted");
  assert.equal(promptSource.includes("if (!questionToSubmit.trim()) return"), true, "blank questions must not make a request");
  assert.equal(promptSource.includes("maxLength={1000}"), true, "the client must honor the API question limit");
  assert.equal(promptSource.includes("questionRetrievalErrorMessage(response.status)"), true, "HTTP failures must use safe client copy");
  assert.equal(promptSource.includes("payload.error"), false, "raw server errors must not be exposed");
  assert.equal(promptSource.includes("response.status === 400"), false, "status handling belongs in the safe error mapper");
  assert.equal(promptSource.includes("lastSubmittedQuestion"), true, "failed submissions must be retryable");
  assert.equal(promptSource.includes("void retrieveQuestionContext(lastSubmittedQuestion)"), true);
  assert.equal(promptSource.includes('role="status"'), true);
  assert.equal(promptSource.includes('role="alert"'), true);
  assert.equal(promptSource.includes('aria-live="polite"'), true);
  assert.equal(workspaceSource.includes("finding={finding} showCategory"), true, "retrieved findings must display their category");
  assert.equal(workspaceSource.includes("context.sessions.map"), true, "verified session evidence must render");
  assert.equal(workspaceSource.includes("context.resultSummary"), true, "deterministic session result summaries must render");
  assert.equal(workspaceSource.includes("session.route === `/events/${eventId}/matrix/sessions/${session.sessionId}`"), true, "session links must be event-scoped and verified");
  assert.equal(workspaceSource.includes("session.fnbSelections.join"), true);
  assert.equal(workspaceSource.includes("session.missingFields.join"), true);
  assert.equal(workspaceSource.includes('context.intent === "session_fnb_selected"'), true, "selected questions must use the selected count");
  assert.equal(workspaceSource.includes('context.intent.startsWith("session_fnb_") ? []'), true, "F&B results must not foreground unrelated attention counts");
  assert.equal(promptSource.includes("min-w-0"), true, "question evidence must not overflow narrow viewports");
  assert.equal(promptSource.includes("action="), false, "the question form must not submit to a route");
  assert.equal(promptSource.includes("openai"), false, "the UI must not call a model provider");
});

test("question retrieval maps every API failure to safe UI text", () => {
  const mapperStart = workspaceSource.indexOf("function questionRetrievalErrorMessage");
  const mapperEnd = workspaceSource.indexOf("function retrievedSourceHref", mapperStart);
  const mapperSource = workspaceSource.slice(mapperStart, mapperEnd);
  for (const status of ["status === 400", "status === 401", "status === 403", "status === 404"]) {
    assert.equal(mapperSource.includes(status), true, `missing safe handling for ${status}`);
  }
  assert.equal(mapperSource.includes("1,000 characters or fewer"), true);
  assert.equal(mapperSource.includes("Unable to retrieve verified event evidence. Please try again."), true);
  assert.equal(mapperSource.includes("Prisma"), false);
  assert.equal(mapperSource.includes("stack"), false);
  assert.equal(workspaceSource.includes('throw new Error("Unable to load event attention. Please try again.")'), true);
  assert.equal(workspaceSource.includes("typeof payload.error"), false, "attention failures must not display raw server error text");
});

test("workspace accepts every deterministic roadmap intent returned by the service", () => {
  for (const intent of ["roadmap_tomorrow", "roadmap_attention"]) {
    assert.equal(workspaceSource.includes(`| "${intent}"`), true, `missing ${intent} response type`);
    assert.equal(workspaceSource.includes(`value === "${intent}"`), true, `missing ${intent} response validator`);
  }
});
