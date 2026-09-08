import assert from "node:assert/strict";
import test from "node:test";
import { buildGmailMimeMessage } from "../lib/integrations/google/gmail-mime";

function decodedParts(raw: string) {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const encodedBodies = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)(?=\r\n--)/g)].map((match) => match[1].replace(/\r\n/g, ""));
  return { mime, parts: encodedBodies.map((part) => Buffer.from(part, "base64").toString("utf8")) };
}

test("canonical Gmail MIME preserves the full plain-text body and line breaks in both alternatives", () => {
  const body = "Hi Mark,\n\nThank you for your time.\n\nBest,\nAli";
  const { mime, parts } = decodedParts(buildGmailMimeMessage({ senderEmail: "ali@example.com", recipientEmail: "mark@example.com", subject: "Following up", body }));
  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.equal(parts[0], body.replace(/\n/g, "\r\n"));
  assert.match(parts[1], /Hi Mark,/);
  assert.match(parts[1], /white-space:pre-wrap/);
  assert.match(parts[1], /Thank you for your time\./);
});

test("canonical Gmail MIME preserves recipient address casing", () => {
  const { mime } = decodedParts(buildGmailMimeMessage({
    senderEmail: "Ali@SignalThread.ai",
    recipientEmail: "ali+w@SignalThread.ai",
    subject: "Following up",
    body: "Hello",
  }));

  assert.match(mime, /From: <Ali@SignalThread\.ai>/);
  assert.match(mime, /To: <ali\+w@SignalThread\.ai>/);
});
