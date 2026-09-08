/**
 * node:test custom reporter → NDJSON, one JSON object per completed test.
 *
 * Used as:
 *   node --test --test-reporter=./scripts/testing/reporters/ndjson.mjs \
 *               --test-reporter-destination=<file> \
 *               --test-reporter=spec --test-reporter-destination=stdout
 *
 * so the human stream and the machine stream are produced from the same run rather
 * than from two runs that could disagree.
 *
 * Only leaf tests are emitted. node:test reports suites through the same `test:pass`
 * event, which is why the earlier `grep -c ✔` count over spec output (2,730) exceeded
 * the real leaf-case count (2,327) — suites were being counted as tests.
 */
export default async function* ndjsonReporter(source) {
  for await (const event of source) {
    switch (event.type) {
      case "test:pass":
      case "test:fail": {
        const d = event.data;
        // A node:test "test" with nested subtests is a suite. Skip it; its children
        // are reported individually and counting both double-counts.
        const isSuite = Boolean(d.details?.type === "suite");
        if (isSuite) break;

        const failed = event.type === "test:fail";
        const skipped = Boolean(d.skip);
        const todo = Boolean(d.todo);

        yield JSON.stringify({
          kind: "test",
          name: d.name,
          file: d.file ?? null,
          nesting: d.nesting ?? 0,
          status: skipped ? "skipped" : todo ? "todo" : failed ? "failed" : "passed",
          durationMs: d.details?.duration_ms ?? null,
          // `skip` carries the reason string when given one, which is how
          // KNOWN-DEFECT skips are attributed back to a finding.
          skipReason: typeof d.skip === "string" ? d.skip : null,
          error: failed ? serializeError(d.details?.error) : null,
        }) + "\n";
        break;
      }
      case "test:diagnostic": {
        // node:test emits its own totals as diagnostics; keep them for cross-checking
        // the reporter's arithmetic against the runner's.
        yield JSON.stringify({ kind: "diagnostic", message: event.data.message }) + "\n";
        break;
      }
      default:
        break;
    }
  }
}

function serializeError(error) {
  if (!error) return { message: "unknown failure" };
  const cause = error.cause ?? error;
  return {
    message: String(cause?.message ?? error.message ?? error),
    code: cause?.code ?? null,
    // Truncated hard: source-string assertions in this repo embed entire route files
    // in the expected/actual fields, which produced 4,000-character log lines.
    expected: truncate(cause?.expected),
    actual: truncate(cause?.actual),
    stack: typeof error.stack === "string" ? error.stack.split("\n").slice(0, 6).join("\n") : null,
  };
}

function truncate(value, max = 300) {
  if (value === undefined || value === null) return null;
  const s = typeof value === "string" ? value : safeStringify(value);
  return s.length > max ? `${s.slice(0, max)}… [${s.length} chars truncated]` : s;
}

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}
