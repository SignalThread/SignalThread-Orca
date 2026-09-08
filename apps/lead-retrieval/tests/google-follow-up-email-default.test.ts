import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultFollowUpEmail } from "../lib/integrations/google/follow-up-email-default";

test("default one-to-one follow-up is complete and uses available real context", () => {
  const body = buildDefaultFollowUpEmail({
    leadName: "Mark Jackson",
    eventName: "Tech Summit",
    senderName: "Ali Kamyab",
    companyName: "SignalThread"
  });
  assert.equal(body, "Hi Mark,\n\nThank you for connecting at Tech Summit. I’d be glad to continue the conversation.\n\nWould you be open to a brief follow-up next week?\n\nBest,\nAli Kamyab\nSignalThread");
});

test("default follow-up has safe fallbacks when lead, event, sender, and company are missing", () => {
  const body = buildDefaultFollowUpEmail({});
  assert.equal(body, "Hi there,\n\nThank you for your time. I’d be glad to continue the conversation.\n\nWould you be open to a brief follow-up next week?\n\nBest,");
  assert.doesNotMatch(body, /undefined|null/);
});
