// @lr area=provider-gmail severity=P0 layer=provider category=local-only
/**
 * Gmail MIME contract — plan §46, Tier 1 (see `docs/testing/PROVIDER_TEST_TIERS.md`).
 *
 * §46 insists on testing "the end-to-end truth, not just a `2xx` response". The part that
 * is entirely ours — and therefore Tier 1, deterministic, every commit — is the message we
 * hand to Gmail. If the MIME is wrong, a `2xx` still means a mangled email arrived.
 *
 * Tagged **P0** rather than P1 because two of the properties below are security
 * boundaries: header injection through a subject or address would let a crafted lead name
 * add `Bcc:` recipients to an outbound message.
 *
 * `tests/google-gmail-mime.test.ts` covers 2 cases; these are the §46 properties it does
 * not reach.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGmailMimeMessage } from "../../lib/integrations/google/gmail-mime";

const build = (over: Partial<Parameters<typeof buildGmailMimeMessage>[0]> = {}) =>
  buildGmailMimeMessage({
    senderEmail: "priya@signalthread.ai",
    recipientEmail: "sarah@northwind.example",
    subject: "Following up from IoT World",
    body: "Hi Sarah,\n\nGood speaking with you.\n\nBest,\nPriya",
    ...over,
  });

/**
 * `buildGmailMimeMessage` returns the message **base64url-encoded**, which is the `raw`
 * field Gmail's API expects. Decode it to inspect the actual MIME document.
 */
const raw = (value: unknown): string => Buffer.from(String(value), "base64url").toString("utf8");

const decodeBase64Part = (mime: string, contentType: string): string => {
  const section = mime.split(/--=_signal_thread_[^\r\n]*/).find((s) => s.includes(contentType));
  assert.ok(section, `no ${contentType} part found`);
  const body = section!.split(/\r\n\r\n/).slice(1).join("\r\n\r\n").trim();
  return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
};

// ── identity ───────────────────────────────────────────────────────────────────────

describe("sender and recipient identity (§46)", () => {
  it("sets From to the connected sender", () => {
    assert.match(raw(build()), /From: <priya@signalthread\.ai>/);
  });

  it("sets To to exactly the intended recipient", () => {
    assert.match(raw(build()), /To: <sarah@northwind\.example>/);
  });

  it("emits exactly one From and one To header", () => {
    const mime = raw(build());
    assert.equal((mime.match(/^From:/gm) || []).length, 1);
    assert.equal((mime.match(/^To:/gm) || []).length, 1);
  });

  it("rejects a missing or malformed sender rather than sending anonymously", () => {
    for (const bad of ["", "   ", "not-an-email", "@nolocal.test", "two@@at.test"]) {
      assert.throws(() => build({ senderEmail: bad }), /Sender/i, `${JSON.stringify(bad)} must be rejected`);
    }
  });

  it("rejects a missing or malformed recipient rather than sending nowhere", () => {
    for (const bad of ["", "   ", "not-an-email", "@nolocal.test"]) {
      assert.throws(() => build({ recipientEmail: bad }), /Recipient/i);
    }
  });
});

// ── header injection ───────────────────────────────────────────────────────────────

describe("header injection is impossible (§46, §53)", () => {
  it("a newline in the subject cannot forge a header", () => {
    // A lead-supplied subject fragment reaching an unescaped header would let an attacker
    // add `Bcc:` to a message the exhibitor believes is one-to-one.
    assert.throws(
      () => build({ subject: "Hello\r\nBcc: attacker@evil.test" }),
      /subject/i,
      "a CRLF in the subject must be rejected outright"
    );
  });

  it("a bare newline in the subject is rejected too", () => {
    assert.throws(() => build({ subject: "Hello\nBcc: attacker@evil.test" }), /subject/i);
  });

  it("a newline in an address is rejected", () => {
    assert.throws(() => build({ recipientEmail: "sarah@northwind.example\r\nBcc: evil@x.test" }), /Recipient/i);
  });

  it("no Bcc or Cc header appears in a normal message", () => {
    const mime = raw(build());
    assert.doesNotMatch(mime, /^Bcc:/mi);
    assert.doesNotMatch(mime, /^Cc:/mi);
  });

  it("an empty subject is rejected rather than sent blank", () => {
    assert.throws(() => build({ subject: "" }), /subject/i);
    assert.throws(() => build({ subject: "   " }), /subject/i);
  });

  it("an empty body is rejected rather than sent blank", () => {
    assert.throws(() => build({ body: "" }), /Body/i);
    assert.throws(() => build({ body: "   \n  " }), /Body/i);
  });
});

// ── line-break preservation ────────────────────────────────────────────────────────

describe("body line breaks survive intact (§46)", () => {
  it("normalizes LF to CRLF, as RFC 5322 requires", () => {
    const mime = raw(build({ body: "Line one\nLine two" }));
    const decoded = decodeBase64Part(mime, "text/plain");
    assert.ok(decoded.includes("\r\n"), "the transmitted body must use CRLF");
    assert.ok(!/(?<!\r)\n/.test(decoded), "no bare LF may remain");
  });

  it("preserves paragraph breaks — a blank line stays a blank line", () => {
    // The visible symptom of getting this wrong is an email arriving as one wall of text.
    const decoded = decodeBase64Part(raw(build({ body: "Para one\n\nPara two" })), "text/plain");
    assert.ok(decoded.includes("\r\n\r\n"), "the blank line between paragraphs must survive");
  });

  it("does not collapse a signature block onto one line", () => {
    const decoded = decodeBase64Part(
      raw(build({ body: "Hi Sarah,\n\nThanks.\n\nBest,\nPriya" })),
      "text/plain"
    );
    assert.ok(decoded.endsWith("Best,\r\nPriya"), `signature was mangled: ${JSON.stringify(decoded.slice(-30))}`);
  });

  it("already-CRLF input is not double-converted", () => {
    const decoded = decodeBase64Part(raw(build({ body: "Line one\r\nLine two" })), "text/plain");
    assert.ok(!decoded.includes("\r\r\n"), "CRLF must not become CRCRLF");
  });
});

// ── encoding ───────────────────────────────────────────────────────────────────────

describe("encoding handles real-world content (§46)", () => {
  it("round-trips a Unicode body", () => {
    const body = "Hej Björn,\n\nTack för samtalet. 李明 also joined.\n\nBäst,\nPriya";
    assert.equal(decodeBase64Part(raw(build({ body })), "text/plain"), body.replace(/\n/g, "\r\n"));
  });

  it("base64-encodes the subject so Unicode survives transport", () => {
    const mime = raw(build({ subject: "Uppföljning från IoT World" }));
    assert.match(mime, /^Subject:/m);
    // A raw non-ASCII subject header would be mangled or rejected by strict servers.
    const subjectLine = mime.split(/\r?\n/).find((l) => l.startsWith("Subject:"))!;
    assert.doesNotMatch(subjectLine, /[^\x00-\x7F]/, "the Subject header must be ASCII-safe");
  });

  it("emits both a plain-text and an HTML alternative", () => {
    const mime = raw(build());
    assert.match(mime, /text\/plain/);
    assert.match(mime, /text\/html/);
    assert.match(mime, /multipart\/alternative/);
  });

  it("the HTML alternative carries the same words as the plain text (§46 equivalence)", () => {
    const mime = raw(build({ body: "Hi Sarah,\n\nUNIQUE-CONTENT-MARKER\n\nBest,\nPriya" }));
    assert.ok(decodeBase64Part(mime, "text/plain").includes("UNIQUE-CONTENT-MARKER"));
    assert.ok(decodeBase64Part(mime, "text/html").includes("UNIQUE-CONTENT-MARKER"));
  });

  it("HTML-escapes body content so a lead name cannot inject markup", () => {
    const html = decodeBase64Part(raw(build({ body: "Hi <script>alert(1)</script>,\n\nBest" })), "text/html");
    assert.ok(!html.includes("<script>"), "raw script markup must not reach the HTML part");
  });

  it("wraps base64 lines, since unwrapped long lines are rejected by strict servers", () => {
    const mime = raw(build({ body: "x".repeat(5000) }));
    const longest = Math.max(...mime.split(/\r?\n/).map((l) => l.length));
    assert.ok(longest <= 998, `a line of ${longest} chars exceeds the RFC 5322 limit`);
  });
});

// ── structure ──────────────────────────────────────────────────────────────────────

describe("MIME structure is well-formed", () => {
  it("the boundary is declared and used consistently", () => {
    const mime = raw(build());
    const declared = mime.match(/boundary="?(=_signal_thread_[^"\r\n;]+)"?/)?.[1];
    assert.ok(declared, "a boundary must be declared in the Content-Type header");
    assert.ok(mime.includes(`--${declared}`), "the declared boundary must delimit the parts");
    assert.ok(mime.includes(`--${declared}--`), "the multipart body must be terminated");
  });

  it("the boundary cannot collide with body content", () => {
    // A boundary appearing inside a part would truncate the message.
    const mime = raw(build({ body: "Discussing =_signal_thread_ boundaries\n\nBest" }));
    const declared = mime.match(/boundary="?(=_signal_thread_[^"\r\n;]+)"?/)?.[1];
    assert.equal(decodeBase64Part(mime, "text/plain").includes(declared!), false);
  });

  it("the boundary varies with the participants", () => {
    // MIME only requires a boundary to be unique WITHIN a message, not across messages —
    // so two messages between the same pair sharing a boundary is correct, not a defect.
    // What matters is that it derives from the participants and never collides with
    // content, both asserted here and above.
    const boundaryOf = (mime: string) => mime.match(/boundary="?(=_signal_thread_[^"\r\n;]+)"?/)?.[1];

    const sameParticipants = boundaryOf(raw(build({ subject: "Subject A" })));
    const alsoSameParticipants = boundaryOf(raw(build({ subject: "Subject B" })));
    assert.equal(
      sameParticipants,
      alsoSameParticipants,
      "derived from a 32-char prefix of sender:recipient:subject, so the pair dominates"
    );

    const differentRecipient = boundaryOf(raw(build({ recipientEmail: "marcus@globex.example" })));
    assert.notEqual(sameParticipants, differentRecipient, "a different recipient must change the boundary");
  });

  it("is deterministic for identical input", () => {
    assert.equal(raw(build()), raw(build()), "a retry must produce a byte-identical message");
  });

  it("carries no token, key or credential", () => {
    assert.doesNotMatch(raw(build()), /bearer\s|sk-[a-z0-9]|refresh_token|service_role|api[_-]?key/i);
  });
});
