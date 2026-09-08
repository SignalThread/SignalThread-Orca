import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConversationStoragePath,
  isValidConversationStoragePath,
} from "@/lib/conversations/conversation-storage-path";

const LEAD = "11111111-1111-1111-1111-111111111111";

describe("conversation storage path — build", () => {
  it("builds a canonical conversations/<leadId>/<timestamp>.m4a path", () => {
    const path = buildConversationStoragePath(LEAD, 1782820800000);
    assert.equal(path, `conversations/${LEAD}/1782820800000.m4a`);
    assert.equal(isValidConversationStoragePath(LEAD, path), true);
  });
});

describe("conversation storage path — validation (upload target security boundary)", () => {
  it("accepts a well-formed path scoped to the lead", () => {
    assert.equal(isValidConversationStoragePath(LEAD, `conversations/${LEAD}/123.m4a`), true);
  });

  it("rejects a path scoped to a different lead", () => {
    const otherLead = "22222222-2222-2222-2222-222222222222";
    assert.equal(isValidConversationStoragePath(LEAD, `conversations/${otherLead}/123.m4a`), false);
  });

  it("rejects a path that does not end in .m4a", () => {
    assert.equal(isValidConversationStoragePath(LEAD, `conversations/${LEAD}/123.wav`), false);
    assert.equal(isValidConversationStoragePath(LEAD, `conversations/${LEAD}/123`), false);
  });

  it("rejects paths outside the conversations prefix", () => {
    assert.equal(isValidConversationStoragePath(LEAD, `documents/${LEAD}/123.m4a`), false);
    assert.equal(isValidConversationStoragePath(LEAD, `/etc/passwd`), false);
    assert.equal(isValidConversationStoragePath(LEAD, ""), false);
  });

  it("rejects a client path that targets another lead's folder even with tricky segments", () => {
    const otherLead = "22222222-2222-2222-2222-222222222222";
    // Prefix guard binds the write to THIS lead; a path anchored under another lead is rejected.
    assert.equal(isValidConversationStoragePath(LEAD, `conversations/${otherLead}/../${LEAD}/x.m4a`), false);
    assert.equal(isValidConversationStoragePath(LEAD, `conversations/${LEAD}-evil/1.m4a`), false);
  });
});
