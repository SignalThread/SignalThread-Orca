import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isWorkflowsEnabled } from "../lib/workflows/is-workflows-enabled";

describe("isWorkflowsEnabled", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED;

  function withWorkflowsEnv(value: string | undefined, run: () => void) {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED = value;
    }

    try {
      run();
    } finally {
      if (ORIGINAL === undefined) {
        delete process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED = ORIGINAL;
      }
    }
  }

  it("defaults visible, including production without an explicit env flag", () => {
    withWorkflowsEnv(undefined, () => {
      assert.equal(isWorkflowsEnabled(), true);
    });
  });

  it("keeps the explicit false kill switch", () => {
    withWorkflowsEnv("false", () => {
      assert.equal(isWorkflowsEnabled(), false);
    });
  });
});

describe("emitLeadCaptured runtime gate", () => {
  it("does not contain the removed WORKFLOWS_EMIT_ENABLED gate or disabled result", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/workflows/emit/lead-captured-emit.ts"),
      "utf8"
    );

    assert.equal(source.includes("WORKFLOWS_EMIT_ENABLED"), false);
    assert.equal(source.includes("isWorkflowsEmitEnabledFromEnv"), false);
    assert.equal(source.includes('status: "disabled"'), false);
    assert.equal(source.includes('return { status: "disabled" }'), false);
  });
});
