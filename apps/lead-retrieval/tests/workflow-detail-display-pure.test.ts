import assert from "node:assert/strict";
import test from "node:test";
import {
  extractDraftBodyPreview,
  extractDraftSubjectPreview,
  formatRunTerminalTimestamp,
  isWorkflowApprovalPlaceholderBody,
  stripApprovalRequiredSubjectPrefix
} from "../lib/exhibitor/workflows/workflow-detail-display";
import { isLikelyWorkflowId } from "../lib/exhibitor/workflows/load-workflow-detail";

test("extractDraftSubjectPreview reads subject string", () => {
  assert.equal(extractDraftSubjectPreview({ subject: "Hello" }), "Hello");
  assert.equal(extractDraftSubjectPreview({ subject: "  x  " }), "x");
  assert.equal(
    extractDraftSubjectPreview({ subject: "Approval required: Hi {{first_name}}, quick follow-up" }),
    "Hi {{first_name}}, quick follow-up"
  );
});

test("extractDraftSubjectPreview returns null when missing", () => {
  assert.equal(extractDraftSubjectPreview({}), null);
  assert.equal(extractDraftSubjectPreview(null), null);
});

test("extractDraftBodyPreview reads and bounds body payloads", () => {
  assert.equal(extractDraftBodyPreview({ body_text: " Thanks   for stopping by. " }), "Thanks for stopping by.");
  assert.equal(extractDraftBodyPreview({ body_html: "<p>Hello <strong>there</strong></p>" }), "Hello there");
  assert.equal(extractDraftBodyPreview({}), null);
});

test("workflow approval placeholders are not displayed as draft body", () => {
  const body =
    "This workflow action is waiting for approval. The action will execute only after a reviewer approves it.";
  assert.equal(isWorkflowApprovalPlaceholderBody(body), true);
  assert.equal(extractDraftBodyPreview({ body_text: body }), null);
  assert.equal(stripApprovalRequiredSubjectPrefix("Approval required: Hi Ada"), "Hi Ada");
});

test("formatRunTerminalTimestamp: completed uses completed_at", () => {
  const out = formatRunTerminalTimestamp({
    status: "completed",
    completed_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-02T12:00:00Z"
  });
  assert.equal(out.iso, "2026-05-01T12:00:00Z");
});

test("formatRunTerminalTimestamp: failed falls back to updated_at when no completed_at", () => {
  const out = formatRunTerminalTimestamp({
    status: "failed",
    completed_at: null,
    updated_at: "2026-05-02T12:00:00Z"
  });
  assert.equal(out.label, "Ended (updated)");
  assert.equal(out.iso, "2026-05-02T12:00:00Z");
});

test("formatRunTerminalTimestamp: in-flight run", () => {
  const out = formatRunTerminalTimestamp({
    status: "queued",
    completed_at: null,
    updated_at: "2026-05-02T12:00:00Z"
  });
  assert.equal(out.iso, null);
});

test("isLikelyWorkflowId accepts UUID-like ids", () => {
  assert.equal(isLikelyWorkflowId("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isLikelyWorkflowId("not-a-uuid"), false);
});
